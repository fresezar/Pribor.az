"use client";

/**
 * Mülkiyyətçi lenti — başka saytlarda SAHİBİNİN verdiği son ilanlar.
 *
 * Kartlar pribor.az'da içerik değil, yönlendirmedir: foto ve açıklama yok,
 * tıklayan kaynaktaki asıl ilana (yeni sekmede) gider. "Mülkiyyətçi" görünen
 * emlakçılar toplama aşamasında ayıklanır — bkz. services/scraper/
 * pribor_scraper/owner_feed.py. Başlıktaki "N vasitəçi elanı ayıklandı"
 * sayısı filtrenin işini ziyaretçiye gösterir.
 */

import { useCallback, useEffect, useState } from "react";
import type { OwnerFeedCard, OwnerFeedResponse } from "@pribor/contracts";
import { DEAL_TYPE_LABEL, OWNER_FEED_DAYS } from "@pribor/contracts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const PAGE = 12;

const TYPES = [
  { value: "", label: "Ev və mənzil" },
  { value: "house", label: "Həyət evi" },
  { value: "apartment", label: "Mənzil" },
];
const DEALS = [
  { value: "", label: "Alqı-satqı və kirayə" },
  { value: "sale", label: "Satılır" },
  { value: "rent", label: "Kirayə" },
];
const SORTS = [
  { value: "newest", label: "Ən yeni" },
  { value: "price_asc", label: "Qiymət: ucuzdan" },
  { value: "price_desc", label: "Qiymət: bahadan" },
];
const TYPE_ICON: Record<string, string> = { apartment: "🏢", house: "🏡", land: "🌳" };
const TYPE_NAME: Record<string, string> = {
  apartment: "mənzil", house: "həyət evi", land: "torpaq",
};

function daysAgo(iso: string): string {
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (d <= 0) return "bu gün";
  if (d === 1) return "dünən";
  return `${d} gün əvvəl`;
}

function cardTitle(it: OwnerFeedCard): string {
  const name = TYPE_NAME[it.propertyType] ?? "əmlak";
  if (it.propertyType === "land") return it.landAreaSot ? `Torpaq, ${it.landAreaSot} sot` : "Torpaq";
  return it.rooms ? `${it.rooms} otaqlı ${name}` : name.charAt(0).toUpperCase() + name.slice(1);
}

export default function OwnerFeed() {
  const [dealType, setDealType] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [sort, setSort] = useState("newest");
  const [items, setItems] = useState<OwnerFeedCard[]>([]);
  const [total, setTotal] = useState(0);
  const [hidden, setHidden] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    const params = new URLSearchParams({ sort, limit: String(PAGE), offset: String(offset) });
    if (dealType) params.set("dealType", dealType);
    if (propertyType) params.set("propertyType", propertyType);
    try {
      const res = await fetch(`${API}/v1/owner-feed?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = (await res.json()) as OwnerFeedResponse;
      setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
      setHidden(data.hidden);
      setFailed(false);
    } catch {
      if (offset === 0) { setItems([]); setTotal(0); setFailed(true); }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sort, dealType, propertyType]);

  useEffect(() => { void load(0); }, [load]);

  // Lent boşsa (henüz toplanmadı / servis uyuyor) bölüm hiç görünmesin
  if (!loading && failed) return null;

  return (
    <section className="market owner-feed" id="mulkiyyetci">
      <div className="market-head">
        <div>
          <h2 className="market-title">Vasitəçisiz elanlar · Binə</h2>
          <p className="market-sub">
            {total} mülkiyyətçi elanı · son {OWNER_FEED_DAYS} gün
            {hidden > 0 && <> · <b>{hidden}</b> vasitəçi və təkrar elan ayıklandı</>}
          </p>
        </div>
      </div>
      <p className="owner-note">
        Digər saytlarda sahibinin özünün verdiyi elanlar. Çox elanı olan hesablar,
        agentliklər və eyni evi təkrar verənlər süzülür. Elana toxunanda mənbə saytda açılır.
      </p>

      <div className="market-filters">
        <select value={dealType} onChange={(e) => setDealType(e.target.value)} aria-label="Elan növü">
          {DEALS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
        </select>
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)} aria-label="Əmlak növü">
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sıralama">
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="market-empty">Yüklənir…</div>
      ) : items.length === 0 ? (
        <div className="market-empty">Bu filtrə uyğun mülkiyyətçi elanı tapılmadı.</div>
      ) : (
        <>
          <div className="listing-grid">
            {items.map((it) => <OwnerCard key={it.id} it={it} />)}
          </div>
          {items.length < total && (
            <div className="load-more-row">
              <button className="load-more" disabled={loadingMore}
                onClick={() => void load(items.length)}>
                {loadingMore ? "Yüklənir…" : `Daha çox göstər (${items.length} / ${total})`}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function OwnerCard({ it }: { it: OwnerFeedCard }) {
  const type = it.propertyType;
  const isRent = it.dealType === "rent";
  const chips = [
    it.areaM2 != null && `${Math.round(it.areaM2)} m²`,
    it.landAreaSot != null && type !== "land" && `${it.landAreaSot} sot`,
    it.floor != null && it.totalFloors != null && `${it.floor}/${it.totalFloors} mərtəbə`,
    it.hasRepair === true && "Təmirli",
    it.titleDeed === true && "Kupçalı",
  ].filter(Boolean) as string[];

  return (
    <a className={`listing grid owner-card type-${type}`} href={it.url}
      target="_blank" rel="noopener noreferrer nofollow">
      <div className={`listing-thumb type-${type}`}>
        <span aria-hidden>{TYPE_ICON[type] ?? "🏠"}</span>
        <span className="thumb-owner">Mülkiyyətçi</span>
        <span className={`thumb-deal ${isRent ? "rent" : "sale"}`}>{DEAL_TYPE_LABEL[it.dealType]}</span>
      </div>
      <div className="listing-body">
        <div className="listing-top">
          <div className="listing-price">{fmt(it.priceAzn)} ₼{isRent ? <small>/ay</small> : null}</div>
        </div>
        <div className="listing-title">{cardTitle(it)}</div>
        {chips.length > 0 && (
          <div className="listing-chips">
            {chips.map((c) => <span key={c} className="chip-sm">{c}</span>)}
          </div>
        )}
        <div className="listing-loc">
          <span>{it.settlement ?? it.district ?? "Bakı"} · {daysAgo(it.postedAt)}</span>
          <span className="owner-src">{it.sourceSite} ↗</span>
        </div>
      </div>
    </a>
  );
}
