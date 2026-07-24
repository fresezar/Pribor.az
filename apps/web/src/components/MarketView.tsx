"use client";

/**
 * Bazar / Elanlar görünümü — platformda verilen ilanlar (PRB no'lu) ile
 * piyasa verisi tek listede. Grid/List görünümü + sıralama + filtre + PRB
 * numarasıyla arama. Kartlar emlak tipine göre renk kodlu.
 *
 * Auth gate: giriş yapmamış kullanıcı karta tıklayınca detay yerine
 * AuthModal açılır (sunucu da detay ucunu 401 ile korur).
 */

import { useCallback, useEffect, useState } from "react";
import type { ListingCard, ListingDetail, ListingSort } from "@pribor/contracts";
import AuthModal from "./AuthModal";
import ListingDetailModal from "./ListingDetailModal";
import { useAuth } from "./AuthContext";

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
const TYPE_LABEL: Record<string, string> = {
  apartment: "Mənzil", house: "Həyət evi", land: "Torpaq",
};
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];

export default function MarketView() {
  const { user } = useAuth();
  const [sort, setSort] = useState<ListingSort>("newest");
  const [district, setDistrict] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [items, setItems] = useState<ListingCard[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const PAGE = 12;

  // Arama + detay + auth
  const [search, setSearch] = useState("");
  const [searchMsg, setSearchMsg] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detailPreloaded, setDetailPreloaded] = useState<ListingDetail | null>(null);
  const [authOpen, setAuthOpen] = useState(false);

  /** offset=0 → listeyi değiştir; offset>0 → sona ekle (Daha çox göstər). */
  const load = useCallback(async (offset = 0) => {
    if (offset === 0) setLoading(true);
    else setLoadingMore(true);
    const params = new URLSearchParams({
      sort, limit: String(PAGE), offset: String(offset),
    });
    if (district) params.set("district", district);
    if (propertyType) params.set("propertyType", propertyType);
    try {
      const res = await fetch(`${API}/v1/listings?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setItems((prev) => (offset === 0 ? data.items : [...prev, ...data.items]));
      setTotal(data.total);
    } catch {
      if (offset === 0) { setItems([]); setTotal(0); }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [sort, district, propertyType]);

  useEffect(() => { void load(0); }, [load]);
  const hasMore = items.length < total;

  /** Karta tıklama — giriş yoksa AuthModal, varsa detay. */
  const openDetail = useCallback((id: string) => {
    if (!user) { setAuthOpen(true); return; }
    setDetailPreloaded(null);
    setDetailId(id);
  }, [user]);

  /** PRB numarasıyla arama. */
  const runSearch = useCallback(async () => {
    const q = search.trim();
    if (!q) return;
    if (!user) { setAuthOpen(true); return; }
    setSearchMsg(null);
    try {
      const res = await fetch(
        `${API}/v1/listings/by-ref/${encodeURIComponent(q)}?userId=${user.id}`,
      );
      if (res.status === 404) {
        setSearchMsg(`“${q}” nömrəli elan tapılmadı`);
        return;
      }
      if (!res.ok) throw new Error();
      const detail = (await res.json()) as ListingDetail;
      setDetailId(null);
      setDetailPreloaded(detail);
    } catch {
      setSearchMsg("Axtarış alınmadı");
    }
  }, [search, user]);

  return (
    <section className="market" id="bazar">
      <div className="market-head">
        <div>
          <h2 className="market-title">Bazar · Elanlar</h2>
          <p className="market-sub">
            {total} elan · Pribor dəyərləndirməsi ilə müqayisəli
          </p>
        </div>
        <div className="view-toggle">
          <button className={view === "grid" ? "on" : ""} onClick={() => setView("grid")}
            aria-label="Izgara görünüş">▦</button>
          <button className={view === "list" ? "on" : ""} onClick={() => setView("list")}
            aria-label="Siyahı görünüş">☰</button>
        </div>
      </div>

      <div className="market-search">
        <input
          placeholder="Elan nömrəsi ilə axtar — məs. PRB-10042"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setSearchMsg(null); }}
          onKeyDown={(e) => e.key === "Enter" && void runSearch()}
          aria-label="Elan nömrəsi ilə axtarış"
        />
        <button onClick={() => void runSearch()}>Axtar</button>
      </div>
      {searchMsg && <div className="search-msg">{searchMsg}</div>}

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
        <>
          <div className={view === "grid" ? "listing-grid" : "listing-list"}>
            {items.map((it) => (
              <ListingCardView key={it.id} it={it} view={view}
                onOpen={() => openDetail(it.id)} />
            ))}
          </div>
          {hasMore && (
            <div className="load-more-row">
              <button className="load-more" disabled={loadingMore}
                onClick={() => void load(items.length)}>
                {loadingMore
                  ? "Yüklənir…"
                  : `Daha çox göstər (${items.length} / ${total})`}
              </button>
            </div>
          )}
        </>
      )}

      <ListingDetailModal
        listingId={detailId}
        preloaded={detailPreloaded}
        onClose={() => { setDetailId(null); setDetailPreloaded(null); }}
        onChanged={() => void load()}
      />
      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </section>
  );
}

function ListingCardView({
  it, view, onOpen,
}: { it: ListingCard; view: "grid" | "list"; onOpen: () => void }) {
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

  const type = it.propertyType ?? "apartment";

  return (
    <article className={`listing ${view} type-${type} ${it.status === "sold" ? "is-sold" : ""}`}
      onClick={onOpen} role="button" tabIndex={0}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}>
      <div className={`listing-thumb type-${type}`}>
        {it.coverPhoto
          ? <img src={it.coverPhoto} alt={it.title} />
          : <span aria-hidden>{TYPE_ICON[type] ?? "🏢"}</span>}
        <span className="thumb-type">{TYPE_LABEL[type] ?? "Əmlak"}</span>
        {it.status === "sold" && <span className="thumb-sold">SATILDI</span>}
      </div>
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
        <div className="listing-loc">
          {it.district ?? "Bakı"}{it.settlement ? ` · ${it.settlement}` : ""}
          {it.refNo && <span className="card-ref">{it.refNo}</span>}
        </div>
      </div>
    </article>
  );
}
