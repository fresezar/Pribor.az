"use client";

import type { CompListing } from "@pribor/contracts";

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const TYPE_ICON: Record<string, string> = {
  apartment: "🏢", house: "🏡", land: "🌳",
};

/**
 * Emsal ilanlar — değerlemenin "kanıtı". Her kart, aynı semt/tipteki gerçek
 * bir ilanın ₼/m²'sini ve kullanıcının değerlemesine göre farkını gösterir
 * (deltaPct negatif = emsal daha ucuz → yeşil "sərfəli" rozeti).
 */
export default function CompsCards({ comps }: { comps: CompListing[] }) {
  return (
    <div className="comps">
      <h3>Oxşar elanlar — dəyərləndirmənin dayağı</h3>
      <div className="comps-grid">
        {comps.map((c) => {
          const badge =
            c.deltaPct == null
              ? null
              : c.deltaPct <= -3
                ? { cls: "good", text: `${Math.abs(c.deltaPct).toFixed(0)}% ucuz` }
                : c.deltaPct >= 3
                  ? { cls: "bad", text: `${c.deltaPct.toFixed(0)}% baha` }
                  : { cls: "neutral", text: "bazara uyğun" };
          return (
            <div className="comp" key={c.id}>
              <div className="comp-thumb" aria-hidden>
                {TYPE_ICON[c.propertyType ?? ""] ?? "🏢"}
              </div>
              <div className="comp-body">
                <div className="comp-price">
                  {fmt(c.priceAzn)} ₼
                  {badge && <span className={`comp-badge ${badge.cls}`}>{badge.text}</span>}
                </div>
                <div className="comp-meta">
                  {c.pricePerM2 != null && <span>{fmt(c.pricePerM2)} ₼/m²</span>}
                  {c.rooms != null && <span>{c.rooms} otaq</span>}
                  {c.areaM2 != null && <span>{Math.round(c.areaM2)} m²</span>}
                </div>
                <div className="comp-loc">{c.district ?? "Bakı"}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
