import {
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  CompListing,
  CreateListingDto,
  formatRefNo,
  ListingCard,
  ListingDetail,
  ListingQuery,
  ListingSort,
  UpdateListingDto,
  UserListing,
  WEEKLY_FREE_LIMIT,
  WEEKLY_LIMIT_CODE,
} from "@pribor/contracts";
import {
  and,
  db,
  desc,
  eq,
  isNull,
  listingReAttrs,
  listings,
  locations,
  priceSnapshots,
  sql,
} from "@pribor/db";
import { AuthService } from "../auth/auth.service";
import { MediaService } from "../media/media.service";

const TYPE_LABEL: Record<string, string> = {
  apartment: "Mənzil", house: "Həyət evi", land: "Torpaq",
};

/**
 * Piyasa (Elanlar) görünümü — scraped_listings üzerinden okur.
 *
 * Fırsat Skoru (dealPct): bir ilanın ₼/m² fiyatının, KENDİ (semt × emlak tipi)
 * medyan ₼/m²'sine göre yüzde sapmasıdır. Negatif = medyanın altında = fırsat.
 * Medyan bilinçli olarak filtreden bağımsız TÜM real_estate seti üzerinden
 * (semt × tip) gruplu hesaplanır; böylece kullanıcı filtre daralttıkça skor
 * kaymaz. Torpaq ve mənzil ₼/m²'si çok farklı olduğundan tip kırılımı şarttır.
 */
@Injectable()
export class ListingsService {
  constructor(
    private readonly auth: AuthService,
    private readonly media: MediaService,
  ) {}

  private orderByClause(sort: ListingSort) {
    switch (sort) {
      case "price_asc":
        return sql`price_azn asc`;
      case "price_desc":
        return sql`price_azn desc`;
      case "deal":
        return sql`deal_pct asc nulls last`;
      case "area_desc":
        return sql`area_m2 desc nulls last`;
      case "newest":
      default:
        return sql`sort_at desc`;
    }
  }

  /**
   * Bazar listesi — platformda verilen ilanlar (listings, PRB no'lu) ile
   * piyasa verisi (scraped_listings) tek akışta birleştirilir. Fırsat skoru
   * her iki kaynak için de scraped medyanına göre hesaplanır (piyasa çıpası).
   */
  async list(q: ListingQuery): Promise<{ items: ListingCard[]; total: number }> {
    // Filtreler birleşik sonuç üzerinde, düz kolonlarda (parametreli)
    const filters = [sql`true`];
    if (q.district) filters.push(sql`district = ${q.district}`);
    if (q.propertyType) filters.push(sql`property_type = ${q.propertyType}`);
    if (q.rooms != null) filters.push(sql`rooms = ${q.rooms}`);
    if (q.dealType) filters.push(sql`deal_type = ${q.dealType}`);
    const where = sql.join(filters, sql` and `);

    const rows = await db.execute(sql`
      with med as (
        select normalized->>'district'      as district,
               normalized->>'property_type' as property_type,
               percentile_cont(0.5) within group (
                 order by price_azn::numeric / nullif((normalized->>'area_m2')::numeric, 0)
               ) as median_ppm2
        from scraped_listings
        where vertical = 'real_estate' and price_azn is not null
          and (normalized->>'area_m2') is not null
        group by 1, 2
      ),
      base as (
        select
          sl.id,
          'scraped'::text                  as kind,
          null::int                        as ref_no,
          'active'::text                   as status,
          'sale'::text                     as deal_type,
          sl.normalized->>'raw_title'      as raw_title,
          sl.normalized->>'district'       as district,
          sl.normalized->>'settlement'     as settlement,
          sl.normalized->>'property_type'  as property_type,
          (sl.normalized->>'rooms')::int   as rooms,
          (sl.normalized->>'area_m2')::numeric as area_m2,
          (sl.normalized->>'repair_state')::int as repair_state,
          sl.normalized->>'building_type'  as building_type,
          (sl.normalized->>'title_deed')::boolean as title_deed,
          sl.normalized->>'metro_station'  as metro_station,
          sl.price_azn                     as price_azn,
          sl.first_seen_at                 as sort_at,
          null::text                       as cover_photo
        from scraped_listings sl
        where sl.vertical = 'real_estate' and sl.price_azn is not null
        union all
        select
          l.id,
          'user'::text,
          l.ref_no,
          l.status::text,
          l.deal_type::text,
          l.title,
          loc.district,
          loc.settlement,
          ra.property_type::text,
          ra.rooms::int,
          ra.area_m2::numeric,
          ra.repair_state::int,
          ra.building_type::text,
          ra.title_deed,
          null::text,
          l.price_azn,
          l.created_at,
          case when jsonb_array_length(l.photos) > 0
               then l.photos->>(least(l.cover_photo_idx, jsonb_array_length(l.photos) - 1))
          end
        from listings l
        left join listing_re_attrs ra on ra.listing_id = l.id
        left join locations loc on loc.id = l.location_id
        where l.vertical = 'real_estate' and l.source = 'user'
          and l.status in ('active', 'sold')
      ),
      joined as (
        select b.*,
          med.median_ppm2,
          case when b.area_m2 > 0
               then round(b.price_azn::numeric / b.area_m2)::int
          end as price_per_m2
        from base b
        left join med
          on med.district = b.district and med.property_type = b.property_type
      )
      select *,
        case when median_ppm2 > 0 and price_per_m2 is not null
             then round(((price_per_m2 - median_ppm2) / median_ppm2 * 100)::numeric, 1)
        end as deal_pct,
        count(*) over() as total_count
      from joined
      where ${where}
      order by ${this.orderByClause(q.sort)}
      limit ${q.limit} offset ${q.offset}
    `);

    const data = rows.rows as Array<Record<string, unknown>>;
    const total = data.length ? Number(data[0]!.total_count) : 0;
    const items = data.map((r) => this.toCard(r));
    return { items, total };
  }

  private toCard(r: Record<string, unknown>): ListingCard {
    const num = (v: unknown) => (v == null ? null : Number(v));
    const propertyType = (r.property_type as string) ?? null;
    const kind = ((r.kind as string) ?? "scraped") as "user" | "scraped";
    return ListingCard.parse({
      id: r.id,
      kind,
      refNo: formatRefNo(r.ref_no == null ? null : Number(r.ref_no)),
      status: (r.status as string) ?? "active",
      dealType: (r.deal_type as string) === "rent" ? "rent" : "sale",
      coverPhoto: (r.cover_photo as string) ?? null,
      title: (r.raw_title as string) || this.fallbackTitle(r),
      district: (r.district as string) ?? null,
      settlement: (r.settlement as string) ?? null,
      propertyType,
      rooms: num(r.rooms),
      areaM2: num(r.area_m2),
      repairState: num(r.repair_state),
      buildingType: (r.building_type as string) ?? null,
      titleDeed: r.title_deed == null ? null : Boolean(r.title_deed),
      metroStation: (r.metro_station as string) ?? null,
      priceAzn: Number(r.price_azn),
      pricePerM2: num(r.price_per_m2),
      dealPct: num(r.deal_pct),
      sourceSite: kind === "user" ? "pribor" : "seed-baku",
      firstSeenAt: new Date(r.sort_at as string).toISOString(),
    });
  }

  private fallbackTitle(r: Record<string, unknown>): string {
    const type =
      { apartment: "Mənzil", house: "Həyət evi", land: "Torpaq" }[
        r.property_type as string
      ] ?? "Əmlak";
    const parts = [type];
    if (r.area_m2) parts.push(`${Math.round(Number(r.area_m2))} m²`);
    if (r.district) parts.push(String(r.district));
    return parts.join(" · ");
  }

  /**
   * Emsal ilanlar (comps) — değerleme sonucu için "kanıt" kartları.
   * Öznitelik yakınlığı: aynı semt + aynı emlak tipi, sahə (ve otaq) farkına
   * göre en yakın ilanlar. deltaPct, emsalin ₼/m²'sinin kullanıcının değerleme
   * ₼/m²'sine (subjectPricePerM2) göre farkıdır (negatif = emsal daha ucuz).
   *
   * Not: scraped ilanlarda geocoded nokta henüz doldurulmadığından PostGIS kNN
   * yerine öznitelik-yakınlığı kullanılıyor; noktalar dolunca ORDER BY'a
   * `point <-> subject_point` mesafe terimi eklenerek gerçek kNN'e geçilir.
   */
  async comps(params: {
    district: string;
    propertyType: string;
    areaM2: number;
    rooms?: number | null;
    subjectPricePerM2: number | null;
    excludeId?: string | null;
    limit?: number;
  }): Promise<CompListing[]> {
    const limit = params.limit ?? 4;
    const rooms = params.rooms ?? null;

    // Öznitelik-yakınlığı sorgusu; sameDistrict=false ise semt kısıtı gevşetilir.
    const query = (sameDistrict: boolean) => db.execute(sql`
      select
        id,
        normalized->>'raw_title'     as raw_title,
        normalized->>'district'      as district,
        normalized->>'property_type' as property_type,
        (normalized->>'rooms')::int  as rooms,
        (normalized->>'area_m2')::numeric as area_m2,
        price_azn,
        case when (normalized->>'area_m2')::numeric > 0
             then round(price_azn::numeric / (normalized->>'area_m2')::numeric)::int
        end as price_per_m2
      from scraped_listings
      where vertical = 'real_estate'
        and price_azn is not null
        and (normalized->>'area_m2') is not null
        and normalized->>'property_type' = ${params.propertyType}
        and (${sameDistrict} = false or normalized->>'district' = ${params.district})
        and (${params.excludeId ?? null}::uuid is null or id <> ${params.excludeId ?? null}::uuid)
      order by
        abs((normalized->>'area_m2')::numeric - ${params.areaM2})
        + coalesce(abs((normalized->>'rooms')::int - ${rooms}), 0) * 8
      limit ${limit}
    `);

    // Önce aynı semt; 2'den az emsal varsa tip-geneli (herhangi semt) fallback.
    let rows = await query(true);
    if (rows.rows.length < 2) rows = await query(false);

    const subj = params.subjectPricePerM2;
    return (rows.rows as Array<Record<string, unknown>>).map((r) => {
      const ppm2 = r.price_per_m2 == null ? null : Number(r.price_per_m2);
      const deltaPct =
        subj && subj > 0 && ppm2 != null
          ? Math.round(((ppm2 - subj) / subj) * 1000) / 10
          : null;
      return CompListing.parse({
        id: r.id,
        title: (r.raw_title as string) || this.fallbackTitle(r),
        district: (r.district as string) ?? null,
        propertyType: (r.property_type as string) ?? null,
        rooms: r.rooms == null ? null : Number(r.rooms),
        areaM2: r.area_m2 == null ? null : Number(r.area_m2),
        priceAzn: Number(r.price_azn),
        pricePerM2: ppm2,
        deltaPct,
        sourceSite: "seed-baku",
      });
    });
  }

  /** Semt × emlak tipi medyan ₼/m² — değerleme ekranındaki "bazar" çıpası. */
  async medianPricePerM2(district: string, propertyType: string): Promise<number | null> {
    const rows = await db.execute(sql`
      select percentile_cont(0.5) within group (
               order by price_azn::numeric / nullif((normalized->>'area_m2')::numeric, 0)
             ) as median_ppm2
      from scraped_listings
      where vertical = 'real_estate' and price_azn is not null
        and (normalized->>'area_m2') is not null
        and normalized->>'district' = ${district}
        and normalized->>'property_type' = ${propertyType}
    `);
    const v = (rows.rows[0] as Record<string, unknown> | undefined)?.median_ppm2;
    return v == null ? null : Math.round(Number(v));
  }

  // -------------------------------------------------------------- kullanıcı ilanı

  /**
   * Kullanıcı ilanı oluşturur — limit kontrolü tek kapı burada.
   * USER (ücretsiz) en fazla 2 aktif ilan; AGENT_ADMIN/PREMIUM sınırsız.
   * Limit aşımında 402 + LISTING_LIMIT_EXCEEDED → frontend upgrade modalı açar.
   */
  async createUserListing(
    dto: CreateListingDto,
  ): Promise<{ id: string; title: string; refNo: string | null }> {
    // Doğrulama girişte (email OTP) yapıldı. Haftalık limit HESAP bazlıdır:
    // giriş yapan her hesap son 7 günde en fazla 3 ilan.
    const bypass =
      (await this.auth.isAdmin(dto.userId)) ||
      (dto.promoCode ? await this.auth.isPromoValid(dto.promoCode) : false);

    if (!bypass) {
      const weekly = await this.auth.weeklyCountByUser(dto.userId);
      if (weekly >= WEEKLY_FREE_LIMIT) {
        throw new HttpException(
          {
            code: WEEKLY_LIMIT_CODE,
            message: "Həftəlik 3 pulsuz elan limitiniz bitmişdir.",
            weeklyCount: weekly,
            weeklyLimit: WEEKLY_FREE_LIMIT,
          },
          HttpStatus.PAYMENT_REQUIRED,
        );
      }
    }

    const title = this.buildListingTitle(dto);
    const areaText = dto.areaM2 != null ? String(dto.areaM2) : null;
    const landText = dto.landAreaSot != null ? String(dto.landAreaSot) : null;
    const locationId = await this.ensureLocation(dto.district, dto.settlement);
    // R2 yapılandırılıysa data URI'lar herkese açık URL'e dönüşür; yoksa no-op.
    const photos = await this.media.uploadPhotos(dto.photos, dto.userId);
    // Kapak indeksi foto sayısını aşmasın (istemci silme sonrası göndermiş olabilir)
    const coverIdx = Math.min(dto.coverPhotoIdx, Math.max(0, photos.length - 1));

    // Ana ilan + dikeye özgü öznitelikler (re_attrs) tek transaction'da
    const listingId = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(listings)
        .values({
          vertical: "real_estate",
          status: "active",
          source: "user",
          dealType: dto.dealType,
          userId: dto.userId,
          locationId,
          title,
          description: dto.description ?? null,
          priceAzn: dto.priceAzn,
          contactName: dto.contactName,
          contactPhone: dto.contactPhone,
          photos,
          coverPhotoIdx: coverIdx,
          valuationId: dto.valuationId ?? null,
          publishedAt: new Date(),
          extra: { created_via: dto.valuationId ? "valuation_flow" : "manual" },
        })
        .returning({ id: listings.id, refNo: listings.refNo });
      if (!row) throw new Error("İlan oluşturulamadı");

      await tx.insert(listingReAttrs).values({
        listingId: row.id,
        propertyType: dto.propertyType,
        areaM2: areaText,
        landAreaSot: landText,
        rooms: dto.rooms ?? null,
        buildingType: dto.buildingType ?? null,
        repairState: dto.repairState ?? null,
        titleDeed: dto.titleDeed ?? null,
      });

      // Değerlemeden geldiyse dönüşümü işaretle (Truva atı funnel metriği)
      if (dto.valuationId) {
        await tx.execute(
          sql`update valuations set converted_listing_id = ${row.id} where id = ${dto.valuationId}::uuid`,
        );
      }

      // İlk fiyat gözlemi — kullanıcı ilanı tarihçesi buradan başlar
      await tx.insert(priceSnapshots).values({
        refKind: "listing",
        refId: row.id,
        observedAt: new Date(),
        priceAzn: dto.priceAzn,
        source: "user",
      });

      return { id: row.id, refNo: row.refNo };
    });

    return {
      id: listingId.id,
      title,
      refNo: formatRefNo(listingId.refNo),
    };
  }

  /** "Mənim elanlarım" — kullanıcının kendi ilanları (foto + açıqlama ile). */
  async myListings(userId: string): Promise<UserListing[]> {
    const rows = await db
      .select({
        id: listings.id,
        refNo: listings.refNo,
        title: listings.title,
        status: listings.status,
        priceAzn: listings.priceAzn,
        dealType: listings.dealType,
        description: listings.description,
        photos: listings.photos,
        coverPhotoIdx: listings.coverPhotoIdx,
        createdAt: listings.createdAt,
        district: locations.district,
        propertyType: listingReAttrs.propertyType,
        buildingType: listingReAttrs.buildingType,
        rooms: listingReAttrs.rooms,
        areaM2: listingReAttrs.areaM2,
      })
      .from(listings)
      .leftJoin(listingReAttrs, eq(listingReAttrs.listingId, listings.id))
      .leftJoin(locations, eq(locations.id, listings.locationId))
      .where(and(eq(listings.userId, userId), eq(listings.source, "user")))
      .orderBy(desc(listings.createdAt))
      .limit(50);

    return rows.map((r) =>
      UserListing.parse({
        id: r.id,
        refNo: formatRefNo(r.refNo),
        title: r.title,
        status: r.status,
        dealType: r.dealType,
        propertyType: r.propertyType ?? null,
        buildingType: r.buildingType ?? null,
        district: r.district ?? null,
        rooms: r.rooms ?? null,
        areaM2: r.areaM2 == null ? null : Number(r.areaM2),
        priceAzn: r.priceAzn,
        description: r.description ?? null,
        coverPhotoIdx: r.coverPhotoIdx ?? 0,
        photos: (r.photos as string[]) ?? [],
        createdAt: new Date(r.createdAt).toISOString(),
      }),
    );
  }

  // ------------------------------------------------------------------ detay

  /**
   * İlan detayı — kullanıcı ilanı veya scraped piyasa kaydı. Herkese açıktır:
   * alıcının ilana bakmak için hesap açması gereksiz sürtünmedir. viewerId
   * yalnızca yönetim yetkisini (canManage) hesaplamak için kullanılır; giriş
   * yoksa null gelir ve ilan salt-okunur görünür.
   */
  async detail(id: string, viewerId: string | null): Promise<ListingDetail> {
    const isAdmin = viewerId ? await this.auth.isAdmin(viewerId) : false;

    const userRows = await db.execute(sql`
      select
        l.id, l.ref_no, l.title, l.status::text as status, l.deal_type::text as deal_type,
        l.description, l.photos, l.cover_photo_idx, l.contact_name, l.contact_phone,
        l.price_azn, l.created_at, l.user_id,
        loc.district, loc.settlement,
        ra.property_type::text as property_type, ra.rooms::int as rooms,
        ra.area_m2::numeric as area_m2, ra.land_area_sot::numeric as land_area_sot,
        ra.building_type::text as building_type, ra.repair_state::int as repair_state,
        ra.title_deed
      from listings l
      left join listing_re_attrs ra on ra.listing_id = l.id
      left join locations loc on loc.id = l.location_id
      where l.id = ${id}::uuid
      limit 1
    `);

    const u = userRows.rows[0] as Record<string, unknown> | undefined;
    if (u) {
      const area = u.area_m2 == null ? null : Number(u.area_m2);
      return ListingDetail.parse({
        id: u.id,
        kind: "user",
        refNo: formatRefNo(u.ref_no == null ? null : Number(u.ref_no)),
        title: u.title,
        status: u.status,
        dealType: (u.deal_type as string) === "rent" ? "rent" : "sale",
        propertyType: (u.property_type as string) ?? null,
        district: (u.district as string) ?? null,
        settlement: (u.settlement as string) ?? null,
        rooms: u.rooms == null ? null : Number(u.rooms),
        areaM2: area,
        landAreaSot: u.land_area_sot == null ? null : Number(u.land_area_sot),
        buildingType: (u.building_type as string) ?? null,
        repairState: u.repair_state == null ? null : Number(u.repair_state),
        titleDeed: u.title_deed == null ? null : Boolean(u.title_deed),
        metroStation: null,
        priceAzn: Number(u.price_azn),
        pricePerM2: area && area > 0 ? Math.round(Number(u.price_azn) / area) : null,
        description: (u.description as string) ?? null,
        photos: (u.photos as string[]) ?? [],
        coverPhotoIdx: Number(u.cover_photo_idx ?? 0),
        contactName: (u.contact_name as string) ?? null,
        contactPhone: (u.contact_phone as string) ?? null,
        createdAt: new Date(u.created_at as string).toISOString(),
        sourceSite: "pribor",
        canManage: isAdmin || (viewerId != null && u.user_id === viewerId),
        priceHistory: await this.priceHistory("listing", u.id as string),
      });
    }

    // Kullanıcı ilanı değilse piyasa (scraped) kaydına bak
    const sRows = await db.execute(sql`
      select id, normalized, price_azn, first_seen_at
      from scraped_listings where id = ${id}::uuid limit 1
    `);
    const s = sRows.rows[0] as Record<string, unknown> | undefined;
    if (!s) throw new NotFoundException("Elan tapılmadı");

    const n = s.normalized as Record<string, unknown>;
    const numOrNull = (v: unknown) => (v == null ? null : Number(v));
    const area = numOrNull(n.area_m2);
    return ListingDetail.parse({
      id: s.id,
      kind: "scraped",
      refNo: null,
      title: (n.raw_title as string) || this.fallbackTitle({
        property_type: n.property_type, area_m2: n.area_m2, district: n.district,
      }),
      status: "active",
      dealType: "sale",
      propertyType: (n.property_type as string) ?? null,
      district: (n.district as string) ?? null,
      settlement: (n.settlement as string) ?? null,
      rooms: numOrNull(n.rooms),
      areaM2: area,
      landAreaSot: numOrNull(n.land_area_sot),
      buildingType: (n.building_type as string) ?? null,
      repairState: numOrNull(n.repair_state),
      titleDeed: n.title_deed == null ? null : Boolean(n.title_deed),
      metroStation: (n.metro_station as string) ?? null,
      priceAzn: Number(s.price_azn),
      pricePerM2: area && area > 0 ? Math.round(Number(s.price_azn) / area) : null,
      description: (n.raw_title as string) ?? null,
      photos: [],
      coverPhotoIdx: 0,
      contactName: null,
      contactPhone: (n.contact_phone as string) ?? null,
      createdAt: new Date(s.first_seen_at as string).toISOString(),
      sourceSite: (n.source_site as string) ?? "seed-baku",
      canManage: isAdmin,
      priceHistory: await this.priceHistory("scraped", s.id as string),
    });
  }

  /** PRB numarasıyla ilan bulma (header/bazar araması). */
  async findByRefNo(refNo: number, viewerId: string | null): Promise<ListingDetail> {
    const rows = await db
      .select({ id: listings.id })
      .from(listings)
      .where(eq(listings.refNo, refNo))
      .limit(1);
    if (!rows[0]) throw new NotFoundException(`№${refNo} nömrəli elan tapılmadı`);
    return this.detail(rows[0].id, viewerId);
  }

  // ------------------------------------------------------- yönetim aksiyonları

  /** Sahip veya admin mi — sil/satıldı için ortak yetki kontrolü. */
  private async assertCanManage(listingId: string, userId: string): Promise<void> {
    const row = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      columns: { id: true, userId: true },
    });
    if (!row) throw new NotFoundException("Elan tapılmadı");
    if (row.userId === userId) return;
    if (await this.auth.isAdmin(userId)) return;
    throw new ForbiddenException("Bu elan üzərində icazəniz yoxdur");
  }

  /**
   * İlan düzenleme (kısmi) — sahip veya admin. Fiyat değiştiyse
   * price_snapshots'a (ref_kind='listing') satır düşer; kart başlığı
   * güncel özniteliklerden yeniden kurulur.
   */
  async updateListing(
    listingId: string,
    dto: UpdateListingDto,
  ): Promise<{ id: string; title: string; refNo: string | null }> {
    await this.assertCanManage(listingId, dto.userId);

    const current = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
    });
    if (!current) throw new NotFoundException("Elan tapılmadı");
    const attrs = await db.query.listingReAttrs.findFirst({
      where: eq(listingReAttrs.listingId, listingId),
    });

    // Birleşik görünüm: gönderilmeyen alan mevcut değerinde kalır
    const merged = {
      propertyType: dto.propertyType ?? attrs?.propertyType ?? "apartment",
      district: dto.district ?? null,
      areaM2: dto.areaM2 ?? (attrs?.areaM2 == null ? undefined : Number(attrs.areaM2)),
      landAreaSot:
        dto.landAreaSot ?? (attrs?.landAreaSot == null ? undefined : Number(attrs.landAreaSot)),
      rooms: dto.rooms ?? attrs?.rooms ?? undefined,
      buildingType: dto.buildingType ?? attrs?.buildingType ?? undefined,
      repairState: dto.repairState ?? attrs?.repairState ?? undefined,
      titleDeed: dto.titleDeed ?? attrs?.titleDeed ?? undefined,
    };

    const newPrice = dto.priceAzn ?? current.priceAzn;
    const priceChanged = newPrice !== current.priceAzn;
    // R2 yapılandırılıysa yeni gelen data URI'lar yüklenir; zaten URL olanlar
    // (değişmeyen fotoğraflar) ve R2 kapalıyken data URI'lar dokunulmadan geçer.
    const rawPhotos = dto.photos ?? (current.photos as string[]);
    const photos = await this.media.uploadPhotos(rawPhotos, dto.userId);
    const coverIdx = Math.min(
      dto.coverPhotoIdx ?? current.coverPhotoIdx,
      Math.max(0, photos.length - 1),
    );

    // Mevcut konum (rayon + qəsəbə) — gönderilmeyen alan korunur
    const currentLoc = current.locationId
      ? await db.query.locations.findFirst({
          where: eq(locations.id, current.locationId),
          columns: { district: true, settlement: true },
        })
      : null;
    const district = dto.district ?? currentLoc?.district ?? "Bakı";
    const settlement = dto.settlement !== undefined ? dto.settlement : currentLoc?.settlement;

    // Rayon ya da qəsəbə değiştiyse locations köprüsünü taşı
    const locationChanged =
      dto.district !== undefined || dto.settlement !== undefined;
    const locationId = locationChanged
      ? await this.ensureLocation(district, settlement)
      : current.locationId;
    const title = this.buildListingTitle({
      ...merged,
      district,
      priceAzn: newPrice,
      userId: dto.userId,
      photos,
      coverPhotoIdx: coverIdx,
    } as CreateListingDto);

    const result = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(listings)
        .set({
          title,
          priceAzn: newPrice,
          dealType: dto.dealType ?? current.dealType,
          description: dto.description !== undefined ? dto.description : current.description,
          contactPhone: dto.contactPhone ?? current.contactPhone,
          photos,
          coverPhotoIdx: coverIdx,
          locationId,
          updatedAt: new Date(),
        })
        .where(eq(listings.id, listingId))
        .returning({ id: listings.id, refNo: listings.refNo });
      if (!row) throw new NotFoundException("Elan tapılmadı");

      await tx
        .update(listingReAttrs)
        .set({
          propertyType: merged.propertyType,
          areaM2: merged.areaM2 != null ? String(merged.areaM2) : null,
          landAreaSot: merged.landAreaSot != null ? String(merged.landAreaSot) : null,
          rooms: merged.rooms ?? null,
          buildingType: merged.buildingType ?? null,
          repairState: merged.repairState ?? null,
          titleDeed: merged.titleDeed ?? null,
        })
        .where(eq(listingReAttrs.listingId, listingId));

      if (priceChanged) {
        await tx.insert(priceSnapshots).values({
          refKind: "listing",
          refId: listingId,
          observedAt: new Date(),
          priceAzn: newPrice,
          source: "user",
        });
      }
      return row;
    });

    // Düzenlemede çıkarılan fotoğraflar R2'de sahipsiz kalmasın (best-effort)
    const removed = (current.photos as string[]).filter((p) => !photos.includes(p));
    await this.media.deletePhotos(removed);

    return { id: result.id, title, refNo: formatRefNo(result.refNo) };
  }

  /** Detay için fiyat gözlemleri (kullanıcı ilanı veya scraped). */
  private async priceHistory(
    refKind: "listing" | "scraped",
    refId: string,
  ): Promise<Array<{ at: string; priceAzn: number }>> {
    const rows = await db.execute(sql`
      select observed_at, price_azn from price_snapshots
      where ref_kind = ${refKind} and ref_id = ${refId}::uuid
      order by observed_at asc limit 20
    `);
    return (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      at: new Date(r.observed_at as string).toISOString(),
      priceAzn: Number(r.price_azn),
    }));
  }

  async deleteListing(listingId: string, userId: string): Promise<{ deleted: true }> {
    await this.assertCanManage(listingId, userId);
    // Fotoğraf adreslerini silmeden ÖNCE oku — sonra R2'deki dosyalar sahipsiz
    // kalmasın diye temizle (best-effort; başarısızlığı silmeyi engellemez).
    const row = await db.query.listings.findFirst({
      where: eq(listings.id, listingId),
      columns: { photos: true },
    });
    await db.delete(listings).where(eq(listings.id, listingId));
    await this.media.deletePhotos((row?.photos as string[]) ?? []);
    return { deleted: true };
  }

  /** "Satıldı" işaretleme — ilan pasife çekilir, limit sayımından da düşer. */
  async markSold(listingId: string, userId: string): Promise<{ id: string; status: string }> {
    await this.assertCanManage(listingId, userId);
    const [row] = await db
      .update(listings)
      .set({ status: "sold", updatedAt: new Date() })
      .where(eq(listings.id, listingId))
      .returning({ id: listings.id, status: listings.status });
    if (!row) throw new NotFoundException("Elan tapılmadı");
    return { id: row.id, status: row.status };
  }

  /**
   * Bakı rayonu (+ varsa qəsəbə) için locations satırını bulur/oluşturur.
   * Qəsəbə ayrı bir satırdır: "Sabunçu" ile "Sabunçu · Ramana" farklı yerlerdir.
   */
  private async ensureLocation(district: string, settlement?: string | null): Promise<string> {
    const s = settlement?.trim() || null;
    const found = await db
      .select({ id: locations.id })
      .from(locations)
      .where(
        and(
          eq(locations.city, "Bakı"),
          eq(locations.district, district),
          s == null ? isNull(locations.settlement) : eq(locations.settlement, s),
        ),
      )
      .limit(1);
    if (found[0]) return found[0].id;
    const [row] = await db
      .insert(locations)
      .values({ city: "Bakı", district, settlement: s })
      .returning({ id: locations.id });
    if (!row) throw new Error("Location oluşturulamadı");
    return row.id;
  }

  private buildListingTitle(dto: CreateListingDto): string {
    const type = TYPE_LABEL[dto.propertyType] ?? "Əmlak";
    if (dto.propertyType === "land") {
      return `${type} · ${dto.landAreaSot ?? "?"} sot · ${dto.district}`;
    }
    const parts = [dto.rooms ? `${dto.rooms} otaqlı ${type.toLowerCase()}` : type];
    if (dto.areaM2) parts.push(`${dto.areaM2} m²`);
    parts.push(dto.district);
    return parts.join(" · ");
  }
}
