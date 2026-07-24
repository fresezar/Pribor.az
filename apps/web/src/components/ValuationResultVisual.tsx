"use client";

/**
 * ValuationResultVisual — AI değerleme sonucunun "showcase" ekranı.
 *
 * · Number Ticker: p50 spring fizikle 0'dan tıkırdayarak yükselir
 * · Güven aralığı: p10–p90 bandı yayılarak açılır, p50 işareti gold glow
 * · Qiymət DNT-si: SHAP katkıları staggered delay ile kayarak + shimmer ile girer
 * · Güven halkası (conic ring) + bazar çıpası + emsal ilanlar + dönüşüm CTA
 *
 * ResultCard'ın yerini alır; aynı prop sözleşmesini kullanır.
 */

import { useEffect } from "react";
import {
  motion,
  useReducedMotion,
  useSpring,
  useTransform,
} from "framer-motion";
import type { ValuationResponse } from "@pribor/contracts";
import CompsCards from "./CompsCards";

const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const EASE = [0.22, 1, 0.36, 1] as const;

export default function ValuationResultVisual(props: {
  result: ValuationResponse;
  querySummary: string;
  askingPrice: number | null;
  posted: { id: string; title: string; refNo: string | null } | null;
  onPostListing: () => void;
  onReset: () => void;
}) {
  const { result, querySummary, askingPrice, posted } = props;
  const reduce = useReducedMotion();

  // ---- Number ticker (p50) ----
  const p50 = useSpring(0, { stiffness: 55, damping: 18, mass: 1 });
  const p50Text = useTransform(p50, (v) => fmt(v));
  useEffect(() => {
    if (reduce) p50.jump(result.p50Azn);
    else p50.set(result.p50Azn);
  }, [result.p50Azn, p50, reduce]);

  // ---- Aralık konumları (%'lik) ----
  const span = Math.max(result.p90Azn - result.p10Azn, 1);
  const lo = result.p10Azn - span * 0.18;
  const hi = result.p90Azn + span * 0.18;
  const pos = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const p10p = pos(result.p10Azn);
  const p50p = pos(result.p50Azn);
  const p90p = pos(result.p90Azn);

  const confPct = Math.round(Number(result.confidence) * 100);

  // ---- Piyasa kıyası ----
  let deal: { cls: string; text: string } | null = null;
  if (askingPrice && askingPrice > 0) {
    const d = ((askingPrice - result.p50Azn) / result.p50Azn) * 100;
    if (d <= -3) deal = { cls: "good", text: `✓ Elan bazardan ${Math.abs(d).toFixed(0)}% sərfəli` };
    else if (d >= 3) deal = { cls: "bad", text: `⚠ Elan bazardan ${d.toFixed(0)}% bahadır` };
    else deal = { cls: "neutral", text: "≈ Elan bazar qiymətinə uyğundur" };
  }

  const shap = result.shapTop.slice(0, 6);
  const maxAbs = Math.max(...shap.map((s) => Math.abs(s.contributionAzn)), 1);

  return (
    <motion.div
      className="vrv"
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
    >
      <div className="vrv-eyebrow"><span className="spark" aria-hidden /> AI qiymət analizi</div>
      <div className="vrv-query"><b>{querySummary}</b></div>

      <div className="vrv-price-wrap">
        <div className="vrv-price" aria-label={`${fmt(result.p50Azn)} manat`}>
          <motion.span>{p50Text}</motion.span>
          <span className="cur">₼</span>
        </div>
        <div className="vrv-conf">
          <span className="ring" style={{ ["--p" as string]: confPct }} />
          güvən %{confPct}
        </div>
      </div>

      {/* Güven aralığı */}
      <div className="vrv-range">
        <div className="vrv-track">
          <motion.div
            className="vrv-band"
            initial={reduce ? false : { left: `${p50p}%`, right: `${100 - p50p}%` }}
            animate={{ left: `${p10p}%`, right: `${100 - p90p}%` }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.15 }}
          />
          <motion.div
            className="vrv-dot"
            initial={reduce ? false : { left: `${p50p}%`, scale: 0 }}
            animate={{ left: `${p50p}%`, scale: 1 }}
            transition={{ duration: 0.5, ease: EASE, delay: 0.5 }}
          />
        </div>
        <div className="vrv-labels">
          <span>{fmt(result.p10Azn)} ₼</span>
          <span className="mid">etibarlılıq aralığı</span>
          <span>{fmt(result.p90Azn)} ₼</span>
        </div>
      </div>

      {deal && <div className={`vrv-deal ${deal.cls}`}>{deal.text}</div>}

      {result.marketMedianPricePerM2 != null && (
        <div className="vrv-anchor">
          Bu rayonda orta bazar qiyməti: <b>{fmt(result.marketMedianPricePerM2)} ₼/m²</b>
        </div>
      )}

      {/* Qiymət DNT-si */}
      {shap.length > 0 && (
        <div className="vrv-dna">
          <h3>Qiymət DNT-si — nə üçün bu qiymət?</h3>
          {shap.map((s, i) => {
            const positive = s.contributionAzn >= 0;
            const width = `${(Math.abs(s.contributionAzn) / maxAbs) * 100}%`;
            const delay = 0.35 + i * 0.09;
            return (
              <motion.div
                className="vrv-bar"
                key={s.feature}
                initial={reduce ? false : { opacity: 0, x: -14 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, ease: EASE, delay }}
              >
                <span className="lbl">{s.label}</span>
                <div className="rail">
                  <motion.div
                    className={`fill ${positive ? "pos" : "neg"}`}
                    initial={reduce ? false : { width: 0 }}
                    animate={{ width }}
                    transition={{ duration: 0.75, ease: EASE, delay: delay + 0.05 }}
                  />
                </div>
                <span className={`val ${positive ? "pos" : "neg"}`}>
                  {positive ? "+" : "−"}{fmt(Math.abs(s.contributionAzn))} ₼
                </span>
              </motion.div>
            );
          })}
        </div>
      )}

      {result.comps.length > 0 && <CompsCards comps={result.comps} />}

      {!posted ? (
        <div className="convert">
          <button className="primary" onClick={props.onPostListing}>Elan yerləşdir →</button>
          <button className="ghost" onClick={props.onReset}>Yeni hesablama</button>
        </div>
      ) : (
        <>
          <div className="converted">
            ✓ Elanınız dərc edildi: <b>{posted.title}</b>
            {posted.refNo && <> · <span className="card-ref">{posted.refNo}</span></>}
            <br /><small>“Mənim elanlarım” bölməsində görə bilərsiniz.</small>
          </div>
          <div className="convert">
            <button className="ghost" onClick={props.onReset}>Yeni hesablama</button>
          </div>
        </>
      )}

      <div className="model-tag">
        <span>model: {result.modelVersion}</span>
        <span>id: {result.valuationId.slice(0, 8)}</span>
      </div>
    </motion.div>
  );
}
