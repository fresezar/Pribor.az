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
  const [inDistrict, setInDistrict] = useState("");

  /**
   * Qəsəbə siyahısı RAYONA GÖRƏ süzülür.
   *
   * Əvvəl bütün qəsəbələr bir yığın halında göstərilirdi: istifadəçi 52 sətrin
   * içində öz rayonunun qəsəbəsini tapa bilmirdi və siyahıda görünməyənlərin
   * niyə olmadığı da bilinmirdi. İndi əvvəlcə "hansı rayonun qəsəbələri?"
   * soruşulur; yalnız o rayonunkular, sahəyə görə sıralı gəlir.
   *
   * Rayonda kifayət qədər elanı olan qəsəbə yoxdursa siyahı boş qalır və bunu
   * açıq deyirik — səbəbi gizlətmirik.
   */
  const districtsWithSettlements = useMemo(() => {
    const set = new Set(
      MARKET_BY_SETTLEMENT.filter((s) => s.type === kind && s.district)
        .map((s) => s.district as string),
    );
    return [...set].sort((a, b) => a.localeCompare(b, "az"));
  }, [kind]);

  // Növ dəyişəndə seçili rayon o növdə mövcud olmaya bilər
  const activeDistrict = districtsWithSettlements.includes(inDistrict)
    ? inDistrict
    : (districtsWithSettlements[0] ?? "");

  const rows = useMemo(() => {
    const table =
      scope === "district"
        ? MARKET_BY_DISTRICT
        : MARKET_BY_SETTLEMENT.filter((s) => s.district === activeDistrict);
    return table
      .filter((s) => s.type === kind)
      .map((s) => ({ ...s, area: budget / s.sqmSale }))
      .sort((a, b) => b.area - a.area);
  }, [budget, kind, scope, activeDistrict]);

  /*
    `.at()` KULLANILMIYOR: Array.prototype.at yalnız Safari 15.4+ və Chrome 92+
    ilə gəlir. iOS 15.3 və daha köhnə telefonda `rows.at is not a function`
    atılır, React render çöküb səhifə tamamilə ağarır ("istemci tarafında bir
    hata oluştu"). Azərbaycanda köhnə cihaz payı yüksəkdir — bir neçə hərflik
    rahatlıq üçün ödəniləcək bədəl deyil.
  */
  const best = rows.length > 0 ? rows[0] : undefined;
  const worst = rows.length > 0 ? rows[rows.length - 1] : undefined;
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

          {scope === "settlement" && (
            <>
              <label htmlFor="afford-in" style={{ marginTop: 12 }}>
                Hansı rayonun qəsəbələri?
              </label>
              <select id="afford-in" value={activeDistrict}
                onChange={(e) => setInDistrict(e.target.value)}>
                {districtsWithSettlements.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </>
          )}
        </div>
      </div>

      {!best || !worst ? (
        <NoData>
          {scope === "settlement" ? (
            <><b>{activeDistrict || "Bu rayonda"}</b> üçün kifayət qədər elanı olan
              qəsəbə yoxdur. Başqa rayon seçin və ya <b>Rayon</b> bölgüsünə keçin.</>
          ) : (
            <>Bu bölgü üçün kifayət qədər elan yoxdur.</>
          )}
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
            {scope === "settlement" && <><b>{activeDistrict}</b> qəsəbələri · </>}
            Medyan elan qiymətlərinə əsaslanır — bazarlıq payı daxil deyil.
            Hər sətir ən azı {scope === "district" ? 40 : 25} elandan hesablanıb;
            bundan az elanı olan {scope === "district" ? "rayon" : "qəsəbə"} siyahıya
            girmir.
          </p>
        </>
      )}
    </div>
  );
}
