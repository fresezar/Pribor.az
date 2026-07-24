"use client";

/**
 * MVP değerleme deneyimi — yalnızca gayrimenkul (otomotiv geçici olarak gizli).
 * Duygusal eğri: form → nabız anı (~1.2s) → sonuç sahnesi (odometre, güven
 * aralığı, Qiymət DNT-si, emsal ilanlar, dönüşüm CTA).
 *
 * Emlak tipine göre form dinamikleşir:
 *   - Mənzil: otaq, sahə, bina tipi, mərtəbə, təmir, metro, kupça
 *   - Həyət evi: otaq, tikili sahəsi, torpaq (sot), təmir, metro, kupça
 *   - Torpaq: yalnızca torpaq sahəsi (sot), metro, kupça
 */

import { useCallback, useRef, useState } from "react";
import type {
  RealEstatePropertyType,
  RealEstateValuationInput,
  ValuationResponse,
} from "@pribor/contracts";
import AuthModal from "./AuthModal";
import ListingForm, { type ListingPrefill } from "./ListingForm";
import ValuationResultVisual from "./ValuationResultVisual";
import { useAuth } from "./AuthContext";
import { notifyListingsChanged } from "./listingEvents";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

const DISTRICTS = [
  "Nərimanov", "Nəsimi", "Səbail", "Yasamal", "Xətai", "Nizami",
  "Binəqədi", "Sabunçu", "Suraxanı", "Xəzər", "Qaradağ", "Abşeron",
];
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];

/** Metro varsayılanı bilinçli olarak "Uzaq" — yakınlık pozitif çarpan olarak eklenir. */
const METRO_OPTIONS = [
  { label: "Yaxın · ≤800 m", value: 500 },
  { label: "Orta · ~1.5 km", value: 1500 },
  { label: "Uzaq · 3 km+", value: 3000 },
] as const;
const METRO_DEFAULT = 3000;

const PROPERTY_TABS: { key: RealEstatePropertyType; label: string; icon: string }[] = [
  { key: "apartment", label: "Mənzil", icon: "🏢" },
  { key: "house", label: "Həyət evi", icon: "🏡" },
  { key: "land", label: "Torpaq", icon: "🌳" },
];

const COMPUTE_STEPS = [
  "Bazar məlumatları yüklənir…",
  "Oxşar elanlar müqayisə edilir…",
  "Model qiymət aralığını hesablayır…",
];

type Phase = "form" | "computing" | "result";

export default function ValuationApp() {
  const { user } = useAuth();
  const [propertyType, setPropertyType] = useState<RealEstatePropertyType>("apartment");
  const [phase, setPhase] = useState<Phase>("form");
  const [stepIdx, setStepIdx] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ValuationResponse | null>(null);
  const [querySummary, setQuerySummary] = useState("");

  // İlan verme akışı
  const [authOpen, setAuthOpen] = useState(false);
  const [listingOpen, setListingOpen] = useState(false);
  const [posted, setPosted] = useState<
    { id: string; title: string; refNo: string | null } | null
  >(null);
  const pendingPost = useRef(false);

  // form state
  const [district, setDistrict] = useState("Nərimanov");
  const [areaM2, setAreaM2] = useState(65);
  const [landAreaSot, setLandAreaSot] = useState(4);
  const [rooms, setRooms] = useState(2);
  const [buildingType, setBuildingType] = useState("yeni_tikili");
  const [repairState, setRepairState] = useState(4);
  const [metroDistM, setMetroDistM] = useState<number>(METRO_DEFAULT);
  const [titleDeed, setTitleDeed] = useState(true);
  const [askingPrice, setAskingPrice] = useState<string>("");

  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const isLand = propertyType === "land";
  const isHouse = propertyType === "house";
  const isApartment = propertyType === "apartment";

  const submit = useCallback(async () => {
    setError(null);
    setPosted(null);
    setPhase("computing");
    setStepIdx(0);
    stepTimer.current = setInterval(
      () => setStepIdx((i) => Math.min(i + 1, COMPUTE_STEPS.length - 1)),
      420,
    );

    // Torpaq: ana sahə m² = sot × 100 (model m² üzerinden çalışır)
    const effectiveArea = isLand ? landAreaSot * 100 : areaM2;
    const input: RealEstateValuationInput = {
      vertical: "real_estate",
      propertyType,
      district: district as RealEstateValuationInput["district"],
      areaM2: effectiveArea,
      metroDistM,
      titleDeed,
      ...(isApartment && {
        rooms,
        buildingType: buildingType as RealEstateValuationInput["buildingType"],
        repairState,
      }),
      ...(isHouse && { rooms, repairState, landAreaSot }),
      ...(isLand && { landAreaSot }),
    };

    const typeLabel = PROPERTY_TABS.find((t) => t.key === propertyType)!.label;
    setQuerySummary(
      isLand
        ? `${typeLabel} · ${landAreaSot} sot · ${district}`
        : isHouse
          ? `${typeLabel} · ${areaM2} m² tikili · ${landAreaSot} sot · ${district}`
          : `${rooms} otaqlı ${typeLabel.toLowerCase()} · ${areaM2} m² · ${district} · ${REPAIR_LABELS[repairState]} təmir`,
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
      const data = (await res.json()) as ValuationResponse;
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
  }, [propertyType, isLand, isHouse, isApartment, district, areaM2, landAreaSot,
      rooms, buildingType, repairState, metroDistM, titleDeed]);

  /** Değerleme sonuç alanlarından ilan formu ön-dolgusunu üretir. */
  const buildPrefill = useCallback((): ListingPrefill | null => {
    if (!result) return null;
    return {
      valuationId: result.valuationId,
      propertyType,
      district,
      areaM2: isLand ? landAreaSot * 100 : areaM2,
      landAreaSot: isLand || isHouse ? landAreaSot : undefined,
      rooms: isLand ? undefined : rooms,
      buildingType: isApartment ? buildingType : undefined,
      repairState: isLand ? undefined : repairState,
      titleDeed,
      metroDistM,
      priceAzn: result.p50Azn,
    };
  }, [result, propertyType, district, isLand, isHouse, isApartment, areaM2,
      landAreaSot, rooms, buildingType, repairState, titleDeed, metroDistM]);

  /** "Elan yerləşdir" — giriş yoksa AuthModal, sonra ön-dolu ilan formu. */
  const postListing = useCallback(() => {
    if (!user) {
      pendingPost.current = true;
      setAuthOpen(true);
      return;
    }
    setListingOpen(true);
  }, [user]);

  return (
    <div className="panel" id="qiymetlendir">
      {phase === "form" && (
        <>
          <div className="tabs" role="tablist" aria-label="Əmlak növü">
            {PROPERTY_TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={propertyType === t.key}
                className={propertyType === t.key ? "active" : ""}
                onClick={() => setPropertyType(t.key)}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          <div className="grid">
            <div className="field">
              <label htmlFor="district">Rayon</label>
              <select id="district" value={district} onChange={(e) => setDistrict(e.target.value)}>
                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            {/* Sahə alanı tipe göre değişir */}
            {isLand ? (
              <div className="field">
                <label htmlFor="landsot">Torpaq sahəsi (sot)</label>
                <input id="landsot" type="number" min={1} max={1000} step={0.5}
                  value={landAreaSot} onChange={(e) => setLandAreaSot(Number(e.target.value))} />
                <span className="hint">1 sot = 100 m²</span>
              </div>
            ) : (
              <div className="field">
                <label htmlFor="area">{isHouse ? "Tikili sahəsi (m²)" : "Sahə (m²)"}</label>
                <input id="area" type="number" min={20} max={2000} value={areaM2}
                  onChange={(e) => setAreaM2(Number(e.target.value))} />
              </div>
            )}

            {/* Həyət evi: ayrıca torpaq sahəsi */}
            {isHouse && (
              <div className="field">
                <label htmlFor="hlandsot">Torpaq sahəsi (sot)</label>
                <input id="hlandsot" type="number" min={1} max={200} step={0.5}
                  value={landAreaSot} onChange={(e) => setLandAreaSot(Number(e.target.value))} />
              </div>
            )}

            {/* Otaq — yalnızca mənzil ve həyət evi */}
            {!isLand && (
              <div className="field full">
                <label>Otaq sayı</label>
                <div className="seg">
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <button key={n} className={rooms === n ? "on" : ""}
                      onClick={() => setRooms(n)}>{n}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Bina tipi — yalnızca mənzil */}
            {isApartment && (
              <div className="field">
                <label htmlFor="btype">Bina tipi</label>
                <select id="btype" value={buildingType} onChange={(e) => setBuildingType(e.target.value)}>
                  <option value="yeni_tikili">Yeni tikili</option>
                  <option value="kohne_tikili">Köhnə tikili</option>
                  <option value="stalinka">Stalinka</option>
                </select>
              </div>
            )}

            {/* Metro — tüm tipler */}
            <div className="field">
              <label htmlFor="metro">Metroya məsafə</label>
              <select id="metro" value={String(metroDistM)}
                onChange={(e) => setMetroDistM(Number(e.target.value))}>
                {METRO_OPTIONS.map((o) => (
                  <option key={o.label} value={String(o.value)}>{o.label}</option>
                ))}
              </select>
            </div>

            {/* Təmir — mənzil ve həyət evi */}
            {!isLand && (
              <div className="field full">
                <label>Təmir vəziyyəti</label>
                <div className="seg">
                  {REPAIR_LABELS.map((label, i) => (
                    <button key={label} className={repairState === i ? "on" : ""}
                      onClick={() => setRepairState(i)}>{label}</button>
                  ))}
                </div>
              </div>
            )}

            {/* Kupça — tüm tipler */}
            <div className="field full">
              <button type="button" className="toggle" onClick={() => setTitleDeed(!titleDeed)}
                aria-pressed={titleDeed}>
                <span>Kupça (çıxarış) var
                  <small>Sənədsiz əmlak bazarda ciddi endirimlə satılır</small>
                </span>
                <span className={`switch ${titleDeed ? "on" : ""}`} aria-hidden />
              </button>
            </div>
          </div>

          <div className="field" style={{ marginTop: 16 }}>
            <label htmlFor="asking">Elanda gördüyünüz qiymət (₼, istəyə bağlı)</label>
            <input id="asking" type="number" min={0} placeholder="Bazarla müqayisə üçün"
              value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} />
            <span className="hint">Doldursanız, elanın bazara görə sərfəli olub-olmadığını göstəririk.</span>
          </div>

          <button className="cta cta-ai" onClick={() => void submit()}>
            ✦ Qiyməti hesabla
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
        <ValuationResultVisual
          result={result}
          querySummary={querySummary}
          askingPrice={askingPrice ? Number(askingPrice) : null}
          posted={posted}
          onPostListing={postListing}
          onReset={() => { setPhase("form"); setResult(null); setPosted(null); }}
        />
      )}

      <AuthModal
        open={authOpen}
        onClose={() => { setAuthOpen(false); pendingPost.current = false; }}
        onLoggedIn={() => {
          if (pendingPost.current) { pendingPost.current = false; setListingOpen(true); }
        }}
      />
      <ListingForm
        open={listingOpen}
        prefill={listingOpen ? buildPrefill() : null}
        onClose={() => setListingOpen(false)}
        onCreated={(l) => { setListingOpen(false); setPosted(l); notifyListingsChanged(); }}
      />
    </div>
  );
}
