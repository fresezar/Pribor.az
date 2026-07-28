"use client";

/**
 * "Nə ala bilərəm?" — büdcədən sahəyə.
 *
 * Kullanıcı bütçesini girer, her rayonda (ya da qəsəbədə) kaç m² alabileceğini
 * görür. Hesap tek satır: büdcə ÷ medyan ₼/m². Değerin tamamı hesapta değil,
 * KARŞILAŞTIRMADA: aynı 150 000 ₼ Abşeron'da 102 m², Nəsimi'de 48 m² — iki kat
 * fark. Tek bir rayona bakan kullanıcı bunu asla göremez.
 *
 * Sayılar derlenmiş tabloda (market-stats.ts) gömülü olduğu için her tuş
 * vuruşunda anında cevap verir; sunucuya gitmez.
 */

import { useMemo, useState } from "react";
import {
  MARKET_BY_DISTRICT,
  MARKET_BY_SETTLEMENT,
  type MarketStat,
} from "@pribor/contracts";
import { fmt, NoData, RankList, Ticker, type RankRow } from "./toolBits";

type Scope = "district" | "settlement";
type Kind = MarketStat["type"];

const PRESETS = [80_000, 150_000, 250_000, 400_000];

export default function AffordabilityTool() {
  const [budget, setBudget] = useState(150_000);
  const [kind, setKind] = useState<Kind>("apartment");
  const [scope, setScope] = useState<Scope>("district");

  const rows = useMemo(() => {
    const table = scope === "district" ? MARKET_BY_DISTRICT : MARKET_BY_SETTLEMENT;
    return table
      .filter((s) => s.type === kind)
      .map((s) => ({ ...s, area: budget / s.sqmSale }))
      .sort((a, b) => b.area - a.area);
  }, [budget, kind, scope]);

  const best = rows.at(0);
  const worst = rows.at(-1);
  const maxArea = best?.area ?? 1;

  const rankRows: RankRow[] = rows.map((r) => ({
    key: `${r.name}-${r.type}`,
    name: r.name,
    value: `${fmt(r.area)} m²`,
    sub: `${fmt(r.sqmSale)} ₼/m²`,
    ratio: r.area / maxArea,
  }));

  return (
    <div className="tool">
      <div className="tool-controls">
        <div className="field">
          <label htmlFor="afford-budget">Büdcəniz</label>
          {/*
            Sürgü asıl giriş: sürüklerken sıralama canlı olarak yeniden dizilir
            ve kullanıcı "bir az da artırsam nə dəyişir" sorusunu yazmadan,
            hiss edərək cavablandırır. Dəqiq rəqəm üçün altdakı qutu qalır.
          */}
          <div className="budget-value">
            <Ticker value={budget} /> <span>₼</span>
          </div>
          <input
            id="afford-budget"
            className="slider"
            type="range"
            min={30_000}
            max={600_000}
            step={5_000}
            value={Math.min(600_000, Math.max(30_000, budget))}
            onChange={(e) => setBudget(Number(e.target.value))}
            aria-label="Büdcəniz, manat"
          />
          <div className="chip-row">
            {PRESETS.map((p) => (
              <button
                key={p}
                type="button"
                className={`chip${budget === p ? " on" : ""}`}
                onClick={() => setBudget(p)}
              >
                {fmt(p)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Əmlak növü</label>
          <div className="seg">
            <button type="button" className={kind === "apartment" ? "on" : ""}
              onClick={() => setKind("apartment")}>Mənzil</button>
            <button type="button" className={kind === "house" ? "on" : ""}
              onClick={() => setKind("house")}>Həyət evi</button>
          </div>

          <label style={{ marginTop: 12 }}>Bölgü</label>
          <div className="seg">
            <button type="button" className={scope === "district" ? "on" : ""}
              onClick={() => setScope("district")}>Rayon</button>
            <button type="button" className={scope === "settlement" ? "on" : ""}
              onClick={() => setScope("settlement")}>Qəsəbə</button>
          </div>
        </div>
      </div>

      {!best || !worst ? (
        <NoData>
          Bu bölgü üçün kifayət qədər elan yoxdur. <b>Qəsəbə</b> əvəzinə{" "}
          <b>rayon</b> seçin.
        </NoData>
      ) : (
        <>
          <div className="tool-headline">
            <div className="th-num">
              <Ticker value={best.area} /> <span className="th-unit">m²</span>
            </div>
            <div className="th-cap">
              ən böyük sahə — <b>{best.name}</b>
              <br />
              ən kiçik <b>{fmt(worst.area)} m²</b> — {worst.name}
              {worst.area > 0 && (
                <> · fərq <b>{(best.area / worst.area).toFixed(1)} qat</b></>
              )}
            </div>
          </div>

          <RankList rows={rankRows} tone="gold" />

          <p className="tool-foot">
            Medyan elan qiymətlərinə əsaslanır — bazarlıq payı daxil deyil.
            Hər sətir ən azı {scope === "district" ? 40 : 25} elandan hesablanıb.
          </p>
        </>
      )}
    </div>
  );
}
