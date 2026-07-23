"use client";

/**
 * Bazar / Elanlar görünümü — scraped_listings piyasa verisini gösterir.
 * Grid/List görünümü + sıralama (Ən yeni, Qiymət, Pribor Fırsat Skoru, Sahə)
 * + semt/otaq/tip filtresi. Fırsat Skoru (dealPct) semt×tip medyanına göre
 * hesaplanır; negatif = fırsat (medyanın altında).
 */

import { useCallback, useEffect, useState } from "react";
import type { ListingCard, ListingSort } from "@pribor/contracts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const SORTS: { value: ListingSort; label: string }[] = [
  { value: "newest", label: "Ən yeni" },
  { value: "deal", label: "Dəyərindən ucuz ⚡" },
  { value: "price_asc", label: "Qiymət: ucuzdan" },
  { value: "price_desc", label: "Qiymət: bahadan" },
  { value: "area_desc", label: "Sahəyə görə" },
];

const DISTRICTS = [
  "Nərimanov", "Nəsimi", "Səbail", "Yasamal", "Xətai", "Nizami",
  "Binəqədi", "Sabunçu", "Suraxanı", "Xəzər", "Qaradağ", "Abşeron",
];
const TYPES: { value: string; label: string }[] = [
  { value: "", label: "Bütün növlər" },
  { value: "apartment", label: "Mənzil" },
  { value: "house", label: "Həyət evi" },
  { value: "land", label: "Torpaq" },
];
const TYPE_ICON: Record<string, string> = { apartment: "🏢", house: "🏡", land: "🌳" };
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];

export default function MarketView() {
  const [sort, setSort] = useState<ListingSort>("newest");
  const [district, setDistrict] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [items, setItems] = useState<ListingCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ sort, limit: "12" });
    if (district) params.set("district", district);
    if (propertyType) params.set("propertyType", propertyType);
    try {
      const res = await fetch(`${API}/v1/listings?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    } catch {
      setItems([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [sort, district, propertyType]);

  useEffect(() => { void load(); }, [load]);

  return (
    <section className="market" id="bazar">
      <div className="market-head">
        <div>
          <h2 className="market-title">Bazar · Elanlar</h2>
          <p className="market-sub">
            Bakı bazarından {total} elan · Pribor dəyərləndirməsi ilə müqayisəli
          </p>
        </div>
        <div className="view-toggle">
          <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}
            aria-label="Izgara görünüş">▦</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}
            aria-label="Siyahı görünüş">☰</button>
        </div>
      </div>

      <div className="market-filters">
        <select value={sort} onChange={(e) => setSort(e.target.value as ListingSort)}>
          {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <select value={district} onChange={(e) => setDistrict(e.target.value)}>
          <option value="">Bütün rayonlar</option>
          {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
        <select value={propertyType} onChange={(e) => setPropertyType(e.target.value)}>
          {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </div>

      {loading ? (
        <div className="market-empty">Yüklənir…</div>
      ) : items.length === 0 ? (
        <div className="market-empty">Bu filtrə uyğun elan tapılmadı.</div>
      ) : (
        <div className={view === "grid" ? "listing-grid" : "listing-list"}>
          {items.map((it) => <ListingCardView key={it.id} it={it} view={view} />)}
        </div>
      )}
    </section>
  );
}

function ListingCardView({ it, view }: { it: ListingCard; view: "grid" | "list" }) {
  const deal =
    it.dealPct == null
      ? null
      : it.dealPct <= -5
        ? { cls: "good", text: `Fırsat · ${Math.abs(it.dealPct).toFixed(0)}% ucuz` }
        : it.dealPct >= 5
          ? { cls: "bad", text: `${it.dealPct.toFixed(0)}% baha` }
          : { cls: "neutral", text: "Bazara uyğun" };

  const chips = [
    it.rooms != null && `${it.rooms} otaq`,
    it.areaM2 != null && `${Math.round(it.areaM2)} m²`,
    it.repairState != null && REPAIR_LABELS[it.repairState],
    it.titleDeed === true && "Kupçalı",
    it.metroStation && `m. ${it.metroStation}`,
  ].filter(Boolean) as string[];

  return (
    <article className={`listing ${view}`}>
      <div className="listing-thumb" aria-hidden>{TYPE_ICON[it.propertyType ?? ""] ?? "🏢"}</div>
      <div className="listing-body">
        <div className="listing-top">
          <div className="listing-price">{fmt(it.priceAzn)} ₼</div>
          {deal && <span className={`listing-deal ${deal.cls}`}>{deal.text}</span>}
        </div>
        {it.pricePerM2 != null && (
          <div className="listing-ppm2">{fmt(it.pricePerM2)} ₼/m²</div>
        )}
        <div className="listing-title">{it.title}</div>
        <div className="listing-chips">
          {chips.map((c) => <span key={c} className="chip-sm">{c}</span>)}
        </div>
        <div className="listing-loc">{it.district ?? "Bakı"}{it.settlement ? ` · ${it.settlement}` : ""}</div>
      </div>
    </article>
  );
}
