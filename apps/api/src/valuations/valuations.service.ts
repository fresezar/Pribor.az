import { Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { CreateValuationDto, ValuationResult } from "@pribor/contracts";

@Injectable()
export class ValuationsService {
  private readonly logger = new Logger(ValuationsService.name);

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

    // TODO(Faz 0 sonu): sonucu `valuations` tablosuna yaz (db.insert(valuations)...)
    // ve anonim kullanıcı için session bağla. Şimdilik yalnızca geçiriyoruz.

    return result;
  }
}
