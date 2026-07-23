import {
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CreateValuationDto, ValuationResult } from "@pribor/contracts";
import { db, eq, listings, modelVersions, valuations } from "@pribor/db";

@Injectable()
export class ValuationsService {
  private readonly logger = new Logger(ValuationsService.name);
  /** tag → model_versions.id — her istekte SELECT atmamak için süreç içi cache */
  private readonly modelVersionCache = new Map<string, string>();

  constructor(private readonly config: ConfigService) {}

  async create(dto: CreateValuationDto): Promise<ValuationResult> {
    const mlUrl = this.config.get<string>("ML_SERVICE_URL") ?? "http://localhost:8100";

    let res: Response;
    try {
      res = await fetch(`${mlUrl}/v1/valuations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dto),
        signal: AbortSignal.timeout(5_000),
      });
    } catch (err) {
      this.logger.error(`ML servisine ulaşılamadı: ${String(err)}`);
      throw new ServiceUnavailableException("Değerleme servisi geçici olarak kapalı");
    }

    if (!res.ok) {
      this.logger.error(`ML servisi ${res.status} döndü`);
      throw new ServiceUnavailableException("Değerleme şu an üretilemiyor");
    }

    // ML çıktısı da sözleşmeyle doğrulanır — servisler arası sınırda tip güveni
    const result = ValuationResult.parse(await res.json());

    // Her değerleme kalıcı bir olaydır (funnel + model izleme + sertifika).
    // Kalıcılık hatası kullanıcı deneyimini düşürmesin: logla, sonucu yine döndür.
    try {
      await this.persist(dto, result);
    } catch (err) {
      this.logger.error(`Değerleme kalıcı yazılamadı: ${String(err)}`);
    }

    return result;
  }

  private async persist(dto: CreateValuationDto, result: ValuationResult): Promise<void> {
    const modelVersionId = await this.ensureModelVersion(result.modelVersion, result.vertical);
    await db.insert(valuations).values({
      // ML'in ürettiği id'yi PK olarak kullan — istemci, sonuç ve DB satırı aynı kimlikte
      id: result.valuationId,
      vertical: result.vertical,
      channel: dto.channel,
      inputFeatures: dto.input as unknown as Record<string, unknown>,
      modelVersionId,
      p10Azn: result.p10Azn,
      p50Azn: result.p50Azn,
      p90Azn: result.p90Azn,
      confidence: result.confidence.toFixed(3),
      shapTop: result.shapTop as unknown as Array<Record<string, unknown>>,
    });
  }

  /** ML'den dönen model tag'ini model_versions'a idempotent kaydeder. */
  private async ensureModelVersion(
    tag: string,
    vertical: "real_estate" | "vehicle",
  ): Promise<string> {
    const cached = this.modelVersionCache.get(tag);
    if (cached) return cached;

    const [inserted] = await db
      .insert(modelVersions)
      .values({
        tag,
        vertical,
        algo: tag.includes("catboost") ? "catboost_quantile" : "heuristic",
        status: "production",
        trainedAt: new Date(),
      })
      .onConflictDoNothing({ target: modelVersions.tag })
      .returning({ id: modelVersions.id });

    const id =
      inserted?.id ??
      (await db.query.modelVersions.findFirst({
        where: eq(modelVersions.tag, tag),
        columns: { id: true },
      }))?.id;

    if (!id) throw new Error(`model_versions kaydı çözülemedi: ${tag}`);
    this.modelVersionCache.set(tag, id);
    return id;
  }

  /**
   * Truva atı köprüsü: değerlemeden tek dokunuşla taslak ilan üretir ve
   * valuations.converted_listing_id'yi işaretler — funnel'ın ana metriği.
   * (Tam ilan akışı Faz 2'de ListingsModule'e taşınır; taslak burada doğar.)
   */
  async convertToListing(valuationId: string): Promise<{ listingId: string; title: string }> {
    const val = await db.query.valuations.findFirst({
      where: eq(valuations.id, valuationId),
    });
    if (!val) throw new NotFoundException("Değerleme bulunamadı");
    if (val.convertedListingId) {
      // İdempotent: aynı değerlemeden ikinci kez ilan üretilmez
      const existing = await db.query.listings.findFirst({
        where: eq(listings.id, val.convertedListingId),
        columns: { id: true, title: true },
      });
      if (existing) return { listingId: existing.id, title: existing.title };
    }

    const input = val.inputFeatures as Record<string, unknown>;
    const title =
      val.vertical === "real_estate"
        ? `${input.rooms ?? "?"} otaqlı mənzil · ${input.areaM2 ?? "?"} m² · ${input.district ?? "Bakı"}`
        : `${input.make ?? ""} ${input.model ?? ""} · ${input.year ?? ""}`.trim();

    const [listing] = await db
      .insert(listings)
      .values({
        vertical: val.vertical,
        status: "draft",
        source: "user",
        title,
        priceAzn: val.p50Azn,
        valuationId: val.id,
        extra: { created_via: "valuation_convert" },
      })
      .returning({ id: listings.id, title: listings.title });
    if (!listing) throw new Error("İlan taslağı oluşturulamadı");

    await db
      .update(valuations)
      .set({ convertedListingId: listing.id })
      .where(eq(valuations.id, val.id));

    this.logger.log(`Değerleme → ilan dönüşümü: ${val.id} → ${listing.id}`);
    return { listingId: listing.id, title: listing.title };
  }
}
