"use client";

/**
 * MVP değerleme deneyimi — blueprint'teki duygusal eğri:
 *   form (sohbet hissi) → nabız anı (~1.2s sahnelenmiş hesap) → sonuç sahnesi
 *   (odometre count-up → güven aralığı bandı → Qiymət DNT-si → dönüşüm CTA)
 * Faz 2'de sihirbaz akışına (ekran başına tek soru) evrilir; MVP tek panel.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  RealEstateValuationInput,
  ValuationRequest,
  ValuationResult,
} from "@pribor/contracts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const DISTRICTS = [
  "Nərimanov", "Nəsimi", "Səbail", "Yasamal", "Xətai", "Nizami",
  "Binəqədi", "Sabunçu", "Suraxanı", "Xəzər", "Qaradağ", "Abşeron",
];
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];
const METRO_OPTIONS = [
  { label: "5 dəq piyada (≤500 m)", value: 400 },
  { label: "10-15 dəq (≈1 km)", value: 1000 },
  { label: "Uzaq (2 km+)", value: 2500 },
  { label: "Bilmirəm", value: undefined },
] as const;

const COMPUTE_STEPS = [
  "Bazar məlumatları yüklənir…",
  "Oxşar elanlar müqayisə edilir…",
  "Model qiymət aralığını hesablayır…",
];

const fmt = (n: number) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Odometre: easeOutExpo ile hedefe sayan rakam. */
function useCountUp(target: number | null, durationMs = 1300): number {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target == null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setValue(target);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min((t - t0) / durationMs, 1);
      const e = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
      setValue(target * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

type Phase = "form" | "computing" | "result";
type Vertical = "real_estate" | "vehicle";

export default function ValuationApp() {
  const [vertical, setVertical] = useState<Vertical>("real_estate");
  const [phase, setPhase] = useState<Phase>("form");
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValuationResult | null>(null);
  const [converted, setConverted] = useState<{ listingId: string; title: string } | null>(null);
  const [querySummary, setQuerySummary] = useState("");

  // --- form state: gayrimenkul ---
  const [district, setDistrict] = useState("Nərimanov");
  const [areaM2, setAreaM2] = useState(65);
  const [rooms, setRooms] = useState(2);
  const [buildingType, setBuildingType] = useState("yeni_tikili");
  const [repairState, setRepairState] = useState(4);
  const [metroDistM, setMetroDistM] = useState<number | undefined>(400);
  const [titleDeed, setTitleDeed] = useState(true);

  // --- form state: otomotiv ---
  const [make, setMake] = useState("Toyota");
  const [model, setModel] = useState("Prius");
  const [year, setYear] = useState(2019);
  const [mileageKm, setMileageKm] = useState(150_000);
  const [accidentFree, setAccidentFree] = useState(true);
  const [customsCleared, setCustomsCleared] = useState(true);

  // --- opsiyonel: piyasa kıyası için ilan fiyatı ---
  const [askingPrice, setAskingPrice] = useState<string>("");

  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const submit = useCallback(async () => {
    setError(null);
    setConverted(null);
    setPhase("computing");
    setStepIdx(0);
    stepTimer.current = setInterval(
      () => setStepIdx((i) => Math.min(i + 1, COMPUTE_STEPS.length - 1)),
      420,
    );

    const input: ValuationRequest =
      vertical === "real_estate"
        ? {
            vertical, propertyType: "apartment",
            district: district as RealEstateValuationInput["district"],
            areaM2, rooms,
            buildingType: buildingType as RealEstateValuationInput["buildingType"],
            repairState, titleDeed, metroDistM,
          }
        : { vertical, make, model, year, mileageKm, accidentFree, customsCleared };

    setQuerySummary(
      vertical === "real_estate"
        ? `${rooms} otaqlı mənzil · ${areaM2} m² · ${district} · ${REPAIR_LABELS[repairState]} təmir`
        : `${make} ${model} · ${year} · ${fmt(mileageKm)} km`,
    );

    const started = performance.now();
    try {
      const res = await fetch(`${API}/v1/valuations`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input, channel: "web" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Server xətası (${res.status})`);
      }
      const data = (await res.json()) as ValuationResult;
      // Nabız anı en az 1.2 sn sürsün — beklenti ödülü büyütür
      const elapsed = performance.now() - started;
      await new Promise((r) => setTimeout(r, Math.max(0, 1200 - elapsed)));
      setResult(data);
      setPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gözlənilməz xəta");
      setPhase("form");
    } finally {
      if (stepTimer.current) clearInterval(stepTimer.current);
    }
  }, [vertical, district, areaM2, rooms, buildingType, repairState, metroDistM,
      titleDeed, make, model, year, mileageKm, accidentFree, customsCleared]);

  const convert = useCallback(async () => {
    if (!result) return;
    try {
      const res = await fetch(`${API}/v1/valuations/${result.valuationId}/convert`, {
        method: "POST",
      });
      if (!res.ok) throw new Error(`Server xətası (${res.status})`);
      setConverted((await res.json()) as { listingId: string; title: string });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Elan yaradıla bilmədi");
    }
  }, [result]);

  return (
    <div className="panel">
      {phase === "form" && (
        <>
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={vertical === "real_estate"}
              className={vertical === "real_estate" ? "active" : ""}
              onClick={() => setVertical("real_estate")}>🏠 Mənzil</button>
            <button role="tab" aria-selected={vertical === "vehicle"}
              className={vertical === "vehicle" ? "active" : ""}
              onClick={() => setVertical("vehicle")}>🚗 Avtomobil</button>
          </div>

          {vertical === "real_estate" ? (
            <div className="grid">
              <div className="field">
                <label htmlFor="district">Rayon</label>
                <select id="district" value={district} onChange={(e) => setDistrict(e.target.value)}>
                  {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
              <div className="field">
                <label htmlFor="area">Sahə (m²)</label>
                <input id="area" type="number" min={20} max={1000} value={areaM2}
                  onChange={(e) => setAreaM2(Number(e.target.value))} />
              </div>
              <div className="field full">
                <label>Otaq sayı</label>
                <div className="seg">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button key={n} className={rooms === n ? "on" : ""}
                      onClick={() => setRooms(n)}>{n}</button>
                  ))}
                </div>
              </div>
              <div className="field">
                <label htmlFor="btype">Bina tipi</label>
                <select id="btype" value={buildingType} onChange={(e) => setBuildingType(e.target.value)}>
                  <option value="yeni_tikili">Yeni tikili</option>
                  <option value="kohne_tikili">Köhnə tikili</option>
                  <option value="stalinka">Stalinka</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="metro">Metroya məsafə</label>
                <select id="metro" value={String(metroDistM)}
                  onChange={(e) => setMetroDistM(e.target.value === "undefined" ? undefined : Number(e.target.value))}>
                  {METRO_OPTIONS.map((o) => (
                    <option key={o.label} value={String(o.value)}>{o.label}</option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label>Təmir vəziyyəti</label>
                <div className="seg">
                  {REPAIR_LABELS.map((label, i) => (
                    <button key={label} className={repairState === i ? "on" : ""}
                      onClick={() => setRepairState(i)}>{label}</button>
                  ))}
                </div>
              </div>
              <div className="field full">
                <button type="button" className="toggle" onClick={() => setTitleDeed(!titleDeed)}
                  aria-pressed={titleDeed}>
                  <span>Kupça (çıxarış) var
                    <small>Sənədsiz mənzillər bazarda ciddi endirimlə satılır</small>
                  </span>
                  <span className={`switch ${titleDeed ? "on" : ""}`} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid">
              <div className="field">
                <label htmlFor="make">Marka</label>
                <input id="make" value={make} onChange={(e) => setMake(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="model">Model</label>
                <input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div className="field">
                <label htmlFor="year">Buraxılış ili</label>
                <input id="year" type="number" min={1980} max={2026} value={year}
                  onChange={(e) => setYear(Number(e.target.value))} />
              </div>
              <div className="field">
                <label htmlFor="km">Yürüş (km)</label>
                <input id="km" type="number" min={0} step={1000} value={mileageKm}
                  onChange={(e) => setMileageKm(Number(e.target.value))} />
              </div>
              <div className="field full">
                <button type="button" className="toggle" onClick={() => setAccidentFree(!accidentFree)}
                  aria-pressed={accidentFree}>
                  <span>Vuruğu yoxdur<small>Qəzasız, rənglənməyib</small></span>
                  <span className={`switch ${accidentFree ? "on" : ""}`} aria-hidden />
                </button>
              </div>
              <div className="field full">
                <button type="button" className="toggle" onClick={() => setCustomsCleared(!customsCleared)}
                  aria-pressed={customsCleared}>
                  <span>Gömrükdən keçib<small>Rüsumlar tam ödənilib</small></span>
                  <span className={`switch ${customsCleared ? "on" : ""}`} aria-hidden />
                </button>
              </div>
            </div>
          )}

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="asking">Elanda gördüyünüz qiymət (₼, istəyə bağlı)</label>
            <input id="asking" type="number" min={0} placeholder="Bazarla müqayisə üçün"
              value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
            <span className="hint">Doldursanız, elanın bazara görə sərfəli olub-olmadığını göstəririk.</span>
          </div>

          <button className="cta" onClick={() => void submit()}>
            Qiyməti hesabla →
          </button>
          {error && <div className="err" role="alert">{error}</div>}
        </>
      )}

      {phase === "computing" && (
        <div className="computing" aria-live="polite">
          <div className="pulse" aria-hidden />
          <div className="step" key={stepIdx}>{COMPUTE_STEPS[stepIdx]}</div>
        </div>
      )}

      {phase === "result" && result && (
        <ResultCard
          result={result}
          querySummary={querySummary}
          askingPrice={askingPrice ? Number(askingPrice) : null}
          converted={converted}
          onConvert={() => void convert()}
          onReset={() => { setPhase("form"); setResult(null); setConverted(null); }}
        />
      )}
    </div>
  );
}

function ResultCard(props: {
  result: ValuationResult;
  querySummary: string;
  askingPrice: number | null;
  converted: { listingId: string; title: string } | null;
  onConvert: () => void;
  onReset: () => void;
}) {
  const { result, querySummary, askingPrice, converted } = props;
  const animated = useCountUp(result.p50Azn);
  const [reveal, setReveal] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReveal(true), 250);
    return () => clearTimeout(t);
  }, []);

  // Aralık bandı konumları: p10..p90 penceresini %12 kenar payıyla ölçekle
  const span = Math.max(result.p90Azn - result.p10Azn, 1);
  const lo = result.p10Azn - span * 0.18;
  const hi = result.p90Azn + span * 0.18;
  const pct = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;

  // Piyasa kıyası — kullanıcı ilan fiyatı girdiyse
  let deal: { cls: string; text: string } | null = null;
  if (askingPrice && askingPrice > 0) {
    const delta = ((askingPrice - result.p50Azn) / result.p50Azn) * 100;
    if (delta <= -3) deal = { cls: "good", text: `✓ Elan bazar dəyərindən ${Math.abs(delta).toFixed(0)}% sərfəli` };
    else if (delta >= 3) deal = { cls: "bad", text: `⚠ Elan bazar dəyərindən ${delta.toFixed(0)}% bahadır` };
    else deal = { cls: "neutral", text: "≈ Elan bazar qiymətinə uyğundur" };
  }

  const maxAbs = Math.max(...result.shapTop.map((s) => Math.abs(s.contributionAzn)), 1);

  return (
    <div className="result">
      <div className="eyebrow">Qiymət analizi · nəticə</div>
      <div className="query"><b>{querySummary}</b></div>

      <div className="price-row">
        <div className="price">{fmt(animated)}<span className="cur">₼</span></div>
        <div className="conf">güvən {(Number(result.confidence) * 100).toFixed(0)}%</div>
      </div>

      <div className="range">
        <div className="track">
          <div className="band" style={reveal
            ? { left: pct(result.p10Azn), right: `calc(100% - ${pct(result.p90Azn)})` }
            : { left: pct(result.p50Azn), right: `calc(100% - ${pct(result.p50Azn)})` }} />
          <div className="dot" style={{ left: pct(result.p50Azn) }} />
        </div>
        <div className="labels">
          <span>{fmt(result.p10Azn)} ₼</span>
          <span>etibarlılıq aralığı</span>
          <span>{fmt(result.p90Azn)} ₼</span>
        </div>
      </div>

      {deal && <div className={`deal ${deal.cls}`}>{deal.text}</div>}

      {result.shapTop.length > 0 && (
        <div className="dna">
          <h3>Qiymət DNT-si — nə üçün bu qiymət?</h3>
          {result.shapTop.slice(0, 6).map((s, i) => (
            <div className="row" key={s.feature}>
              <span className="lbl">{s.label}</span>
              <div className="track">
                <div
                  className={`fill ${s.contributionAzn >= 0 ? "pos" : "neg"}`}
                  style={{
                    width: reveal ? `${(Math.abs(s.contributionAzn) / maxAbs) * 100}%` : 0,
                    transitionDelay: `${0.55 + i * 0.12}s`,
                  }}
                />
              </div>
              <span className="val">
                {s.contributionAzn >= 0 ? "+" : "−"}{fmt(Math.abs(s.contributionAzn))} ₼
              </span>
            </div>
          ))}
        </div>
      )}

      {!converted ? (
        <div className="convert">
          <button className="primary" onClick={props.onConvert}>
            Bu qiymətlə elan yerləşdir →
          </button>
          <button className="ghost" onClick={props.onReset}>Yeni hesablama</button>
        </div>
      ) : (
        <>
          <div className="converted">
            ✓ Elan layihəsi yaradıldı: <b>{converted.title}</b>
            <br /><code>id: {converted.listingId}</code> — dərc axını Faz 2-də açılır
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
    </div>
  );
}
