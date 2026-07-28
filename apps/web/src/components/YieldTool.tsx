"use client";

/**
 * "Kirayə gəlirliliyi" — alsam, kirayə versəm nə qazanaram?
 *
 * İllik gəlirlilik = (aylıq kirayə × 12) ÷ alış qiyməti. Sayının kendisi basit;
 * değerli olan Bakı'da satış ve kira medyanlarının aynı yerde birleştirilmiş
 * olması — başka yerde yayınlanmıyor.
 *
 * ÇIKAN İÇGÖRÜ: en pahalı rayon en kötü getiriyi veriyor. Nəsimi'de m² 3 100 ₼
 * ama getiri %3,9; Abşeron'da m² 1 466 ₼ ve getiri %5,6. Kira fiyatları satış
 * fiyatları kadar ayrışmıyor. Aracın asıl sattığı şey bu.
 *
 * DÜRÜSTLÜK: kira örneklemi satıştan çok daha ince. Yeterli örneği olmayan
 * bölge tabloya hiç girmiyor (bkz. scripts/build_market_stats.py) — burada da
 * "məlumat azdır" diyoruz, tahmin uydurmuyoruz.
 */

import { useMemo, useState } from "react";
import {
  annualYield,
  MARKET_BY_DISTRICT,
  MARKET_BY_SETTLEMENT,
  type MarketStat,
} from "@pribor/contracts";
import NumberField from "./NumberField";
import { fmt, NoData, RankList, Ticker, type RankRow } from "./toolBits";

type Scope = "district" | "settlement";

export default function YieldTool() {
  const [scope, setScope] = useState<Scope>("district");
  const [area, setArea] = useState(65);

  const table = scope === "district" ? MARKET_BY_DISTRICT : MARKET_BY_SETTLEMENT;

  /** Yalnız kirayə örnəkləmi güvənli olan bölgələr — qalanları hesablana bilməz. */
  const withRent = useMemo(
    () =>
      table
        .filter((s): s is MarketStat & { sqmRent: number } => s.sqmRent != null)
        .map((s) => ({ ...s, y: annualYield(s)! }))
        .sort((a, b) => b.y - a.y),
    [table],
  );

  const [name, setName] = useState("Abşeron");
  const sel = withRent.find((s) => s.name === name) ?? withRent[0];

  const rankRows: RankRow[] = withRent.map((s) => ({
    key: `${s.name}-${s.type}`,
    name: s.name,
    value: `${s.y.toFixed(1).replace(".", ",")}%`,
    sub: `${fmt(s.sqmSale)} ₼/m²`,
    ratio: s.y / (withRent[0]?.y || 1),
    active: sel != null && s.name === sel.name,
  }));

  if (!sel) {
    return (
      <div className="tool">
        <NoData>Bu bölgü üçün kirayə məlumatı kifayət etmir.</NoData>
      </div>
    );
  }

  const price = sel.sqmSale * area;
  const rent = sel.sqmRent * area;
  const payback = 100 / sel.y;

  return (
    <div className="tool">
      <div className="tool-controls">
        <div className="field">
          <label htmlFor="yield-place">Bölgə</label>
          <select
            id="yield-place"
            value={sel.name}
            onChange={(e) => setName(e.target.value)}
          >
            {withRent.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>

          <label style={{ marginTop: 12 }}>Bölgü</label>
          <div className="seg">
            <button type="button" className={scope === "district" ? "on" : ""}
              onClick={() => { setScope("district"); setName(""); }}>Rayon</button>
            <button type="button" className={scope === "settlement" ? "on" : ""}
              onClick={() => { setScope("settlement"); setName(""); }}>Qəsəbə</button>
          </div>
        </div>

        <div className="field">
          <label htmlFor="yield-area">Sahə (m²)</label>
          <NumberField
            id="yield-area"
            value={area}
            min={20}
            max={600}
            step={5}
            onChange={(v) => setArea(Number(v) || 0)}
          />
          <div className="tool-mini">
            <div><span>Alış</span><b>{fmt(price)} ₼</b></div>
            <div><span>Aylıq kirayə</span><b>{fmt(rent)} ₼</b></div>
          </div>
        </div>
      </div>

      <div className="tool-headline teal">
        <div className="th-num">
          <Ticker value={sel.y} decimals={1} /> <span className="th-unit">%</span>
        </div>
        <div className="th-cap">
          illik gəlirlilik — <b>{sel.name}</b>
          <br />
          özünü <b>{Math.round(payback)} ilə</b> ödəyir
        </div>
      </div>

      <RankList rows={rankRows} tone="teal" />

      <p className="tool-foot">
        {withRent.length} bölgə üçün hesablana bilir — qalanlarda aylıq kirayə
        elanı kifayət qədər deyil. Mövsümi (yaylıq) icarələr kənarlaşdırılıb;
        onlar yay ayları üçün qiymətlənir və gəlirliliyi süni şəkildə qaldırır.
      </p>
    </div>
  );
}
