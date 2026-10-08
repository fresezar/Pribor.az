import { BadRequestException, Controller, Get, Query } from "@nestjs/common";
import {
  OWNER_FEED_DAYS,
  OwnerFeedCard,
  OwnerFeedQuery,
  OwnerFeedResponse,
} from "@pribor/contracts";
import { db, sql } from "@pribor/db";

/**
 * GET /v1/owner-feed — başka sitelerde sahibinin verdiği son ilanlar.
 *
 * Yalnız verdict='owner', kaynakta hâlâ yayında (delisted_at null) ve son
 * OWNER_FEED_DAYS günde açılmış ilanlar döner. Gizlenenlerin sayısı da
 * döner: "N emlakçı ilanı ayıklandı" ziyaretçiye filtrenin işini gösterir.
 */
@Controller("owner-feed")
export class OwnerFeedController {
  @Get()
  async list(@Query() query: Record<string, string>): Promise<OwnerFeedResponse> {
    const parsed = OwnerFeedQuery.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Geçersiz sorgu parametresi",
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const q = parsed.data;

    const filters = [
      sql`delisted_at is null`,
      sql`posted_at >= now() - make_interval(days => ${OWNER_FEED_DAYS})`,
    ];
    if (q.settlement) filters.push(sql`settlement = ${q.settlement}`);
    if (q.dealType) filters.push(sql`deal_type = ${q.dealType}`);
    if (q.propertyType) filters.push(sql`property_type = ${q.propertyType}`);
    const where = sql.join(filters, sql` and `);
    const order =
      q.sort === "price_asc" ? sql`price_azn asc`
        : q.sort === "price_desc" ? sql`price_azn desc`
          : sql`posted_at desc, first_seen_at desc`;

    const [rows, meta] = await Promise.all([
      db.execute(sql`
        select *, count(*) over() as total_count
        from owner_feed
        where ${where} and verdict = 'owner'
        order by ${order}
        limit ${q.limit} offset ${q.offset}
      `),
      db.execute(sql`
        select count(*) filter (where verdict <> 'owner') as hidden,
               max(last_seen_at) as updated_at
        from owner_feed
        where ${where}
      `),
    ]);

    const data = rows.rows as Array<Record<string, unknown>>;
    const m = (meta.rows[0] ?? {}) as Record<string, unknown>;
    const num = (v: unknown) => (v == null ? null : Number(v));
    // Ham sql`` sorgusunda pg timestamptz'yi metin döndürüyor ("… 01:00:00+01")
    const iso = (v: unknown) => new Date(v as string | Date).toISOString();
    const items: OwnerFeedCard[] = data.map((r) => ({
      id: r.id as string,
      sourceSite: r.source_site as string,
      url: r.url as string,
      dealType: r.deal_type as OwnerFeedCard["dealType"],
      propertyType: r.property_type as string,
      rooms: num(r.rooms),
      areaM2: num(r.area_m2),
      landAreaSot: num(r.land_area_sot),
      floor: num(r.floor),
      totalFloors: num(r.total_floors),
      priceAzn: Number(r.price_azn),
      district: (r.district as string) ?? null,
      settlement: (r.settlement as string) ?? null,
      hasRepair: (r.has_repair as boolean) ?? null,
      titleDeed: (r.title_deed as boolean) ?? null,
      postedAt: iso(r.posted_at),
    }));
    return {
      items,
      total: data.length ? Number(data[0]!.total_count) : 0,
      hidden: Number(m.hidden ?? 0),
      updatedAt: m.updated_at ? iso(m.updated_at) : null,
    };
  }
}
