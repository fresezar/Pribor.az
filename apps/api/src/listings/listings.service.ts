import { Injectable } from "@nestjs/common";
import { CompListing, ListingCard, ListingQuery, ListingSort } from "@pribor/contracts";
import { db, sql } from "@pribor/db";

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
        return sql`first_seen_at desc`;
    }
  }

  async list(q: ListingQuery): Promise<{ items: ListingCard[]; total: number }> {
    // Filtre parçaları — hepsi parametreli (enjeksiyon yok)
    const filters = [sql`vertical = 'real_estate'`, sql`price_azn is not null`];
    if (q.district) filters.push(sql`normalized->>'district' = ${q.district}`);
    if (q.propertyType) filters.push(sql`normalized->>'property_type' = ${q.propertyType}`);
    if (q.rooms != null) filters.push(sql`(normalized->>'rooms')::int = ${q.rooms}`);
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
          sl.price_azn,
          sl.first_seen_at,
          case when (sl.normalized->>'area_m2')::numeric > 0
               then round(sl.price_azn::numeric / (sl.normalized->>'area_m2')::numeric)::int
          end as price_per_m2,
          med.median_ppm2
        from scraped_listings sl
        left join med
          on med.district = sl.normalized->>'district'
         and med.property_type = sl.normalized->>'property_type'
        where ${where}
      )
      select *,
        case when median_ppm2 > 0 and price_per_m2 is not null
             then round(((price_per_m2 - median_ppm2) / median_ppm2 * 100)::numeric, 1)
        end as deal_pct,
        count(*) over() as total_count
      from base
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
    return ListingCard.parse({
      id: r.id,
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
      sourceSite: "seed-baku",
      firstSeenAt: new Date(r.first_seen_at as string).toISOString(),
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
}
