"use client";

/**
 * İlan verme formu — "Elan yerləşdir" akışı.
 *
 * Değerlemeden gelen tüm alanlar ön-doldurulur ve TAMAMI düzenlenebilir:
 * kullanıcı rayon/sahə/otaq/təmir gibi değerleri formda değiştirebilir.
 * Fiyat serbesttir (varsayılan P50), əlaqə nömrəsi profilden gelir ama
 * ilana özel değiştirilebilir. En fazla 5 foto + örtük şəkli seçimi.
 * Limit aşımında (402) UpgradeModal açılır.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { CreateListingDto } from "@pribor/contracts";
import { useAuth } from "./AuthContext";
import UpgradeModal from "./UpgradeModal";
import { fileToResizedDataUri } from "./imageResize";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const MAX_PHOTOS = 5;

const DISTRICTS = [
  "Nərimanov", "Nəsimi", "Səbail", "Yasamal", "Xətai", "Nizami",
  "Binəqədi", "Sabunçu", "Suraxanı", "Xəzər", "Qaradağ", "Abşeron",
];
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];
const TYPES = [
  { value: "apartment", label: "Mənzil" },
  { value: "house", label: "Həyət evi" },
  { value: "land", label: "Torpaq" },
] as const;

export type ListingPrefill = {
  valuationId?: string;
  propertyType: "apartment" | "house" | "land";
  district: string;
  areaM2?: number;
  landAreaSot?: number;
  rooms?: number;
  buildingType?: string;
  repairState?: number;
  titleDeed?: boolean;
  metroDistM?: number;
  priceAzn: number;
};

export default function ListingForm(props: {
  open: boolean;
  prefill: ListingPrefill | null;
  onClose: () => void;
  onCreated: (listing: { id: string; title: string; refNo: string | null }) => void;
}) {
  const { user } = useAuth();
  const { prefill } = props;

  // Düzenlenebilir form durumu — prefill yalnızca başlangıç değeridir
  const [propertyType, setPropertyType] = useState<"apartment" | "house" | "land">("apartment");
  const [district, setDistrict] = useState(DISTRICTS[0]!);
  const [areaM2, setAreaM2] = useState<number>(0);
  const [landAreaSot, setLandAreaSot] = useState<number>(0);
  const [rooms, setRooms] = useState<number>(2);
  const [buildingType, setBuildingType] = useState("yeni_tikili");
  const [repairState, setRepairState] = useState(3);
  const [titleDeed, setTitleDeed] = useState(true);
  const [price, setPrice] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [coverIdx, setCoverIdx] = useState(0);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const isLand = propertyType === "land";
  const isHouse = propertyType === "house";
  const isApartment = propertyType === "apartment";

  // Form her açılışta değerleme verisiyle tazelenir
  useEffect(() => {
    if (!props.open || !prefill) return;
    setPropertyType(prefill.propertyType);
    setDistrict(prefill.district);
    setAreaM2(prefill.areaM2 ?? 0);
    setLandAreaSot(prefill.landAreaSot ?? 0);
    setRooms(prefill.rooms ?? 2);
    setBuildingType(prefill.buildingType ?? "yeni_tikili");
    setRepairState(prefill.repairState ?? 3);
    setTitleDeed(prefill.titleDeed ?? true);
    setPrice(prefill.priceAzn);
    setDescription("");
    setPhotos([]);
    setCoverIdx(0);
    setError(null);
    setContactPhone(user?.phone ?? "");
  }, [props.open, prefill, user?.phone]);

  const addPhotos = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return setError(`Ən çox ${MAX_PHOTOS} foto əlavə edə bilərsiniz`);
    try {
      const uris = await Promise.all(
        Array.from(files).slice(0, room).map((f) => fileToResizedDataUri(f)),
      );
      setPhotos((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
    } catch {
      setError("Foto yüklənmədi — başqa şəkil seçin");
    }
    if (fileRef.current) fileRef.current.value = "";
  }, [photos.length]);

  const removePhoto = useCallback((i: number) => {
    setPhotos((prev) => prev.filter((_, j) => j !== i));
    // Kapak silinen fotoğrafın gerisine kaymasın
    setCoverIdx((c) => (i === c ? 0 : i < c ? c - 1 : c));
  }, []);

  const submit = useCallback(async () => {
    if (!user) return;
    if (!price || price <= 0) return setError("Qiymət daxil edin");
    if (!isLand && (!areaM2 || areaM2 <= 0)) return setError("Sahə daxil edin");
    if ((isLand || isHouse) && (!landAreaSot || landAreaSot <= 0)) {
      return setError("Torpaq sahəsini daxil edin (sot)");
    }
    setBusy(true);
    setError(null);

    const dto: CreateListingDto = {
      userId: user.id,
      valuationId: prefill?.valuationId,
      propertyType,
      district: district as CreateListingDto["district"],
      areaM2: isLand ? landAreaSot * 100 : areaM2,
      landAreaSot: isLand || isHouse ? landAreaSot : undefined,
      rooms: isLand ? undefined : rooms,
      buildingType: isApartment
        ? (buildingType as CreateListingDto["buildingType"])
        : undefined,
      repairState: isLand ? undefined : repairState,
      titleDeed,
      metroDistM: prefill?.metroDistM,
      priceAzn: price,
      description: description.trim() || undefined,
      photos,
      coverPhotoIdx: coverIdx,
      contactName: user.name,
      contactPhone: contactPhone.trim() || user.phone,
    };

    try {
      const res = await fetch(`${API}/v1/listings`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(dto),
      });
      if (res.status === 402) {
        setShowUpgrade(true);
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.message ?? `Server xətası (${res.status})`);
      }
      props.onCreated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Elan yaradıla bilmədi");
    } finally {
      setBusy(false);
    }
  }, [user, prefill, propertyType, district, areaM2, landAreaSot, rooms, buildingType,
      repairState, titleDeed, price, description, contactPhone, photos, coverIdx,
      isLand, isHouse, isApartment, props]);

  if (!props.open) return null;

  return (
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal listing-form" role="dialog" aria-modal="true" aria-label="Elan yerləşdir"
        onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <h2 className="modal-h">Elan yerləşdir</h2>
        <p className="modal-sub">
          Dəyərləndirmə məlumatları dolduruldu — hamısını dəyişə bilərsiniz.
        </p>

        <div className="grid">
          <div className="field">
            <label htmlFor="lf-type">Əmlak növü</label>
            <select id="lf-type" value={propertyType}
              onChange={(e) => setPropertyType(e.target.value as typeof propertyType)}>
              {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lf-district">Rayon</label>
            <select id="lf-district" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {!isLand && (
            <div className="field">
              <label htmlFor="lf-area">{isHouse ? "Tikili sahəsi (m²)" : "Sahə (m²)"}</label>
              <input id="lf-area" type="number" min={1} value={areaM2 || ""}
                onChange={(e) => setAreaM2(Number(e.target.value))} />
            </div>
          )}
          {(isLand || isHouse) && (
            <div className="field">
              <label htmlFor="lf-land">Torpaq sahəsi (sot)</label>
              <input id="lf-land" type="number" min={0.1} step={0.1} value={landAreaSot || ""}
                onChange={(e) => setLandAreaSot(Number(e.target.value))} />
            </div>
          )}
          {isApartment && (
            <div className="field">
              <label htmlFor="lf-btype">Bina tipi</label>
              <select id="lf-btype" value={buildingType}
                onChange={(e) => setBuildingType(e.target.value)}>
                <option value="yeni_tikili">Yeni tikili</option>
                <option value="kohne_tikili">Köhnə tikili</option>
                <option value="stalinka">Stalinka</option>
              </select>
            </div>
          )}

          {!isLand && (
            <div className="field full">
              <label>Otaq sayı</label>
              <div className="seg">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <button type="button" key={n} className={rooms === n ? "on" : ""}
                    onClick={() => setRooms(n)}>{n}</button>
                ))}
              </div>
            </div>
          )}
          {!isLand && (
            <div className="field full">
              <label>Təmir vəziyyəti</label>
              <div className="seg">
                {REPAIR_LABELS.map((label, i) => (
                  <button type="button" key={label} className={repairState === i ? "on" : ""}
                    onClick={() => setRepairState(i)}>{label}</button>
                ))}
              </div>
            </div>
          )}

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
          <label htmlFor="lf-price">Qiymət (₼)</label>
          <input id="lf-price" type="number" min={1} value={price || ""}
            onChange={(e) => setPrice(Number(e.target.value))} />
          {prefill && (
            <span className="hint">
              Pribor təxmini: {fmt(prefill.priceAzn)} ₼ · öz qiymətinizi qoya bilərsiniz
            </span>
          )}
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="lf-phone">Əlaqə nömrəsi</label>
          <input id="lf-phone" inputMode="tel" placeholder="+994 50 123 45 67"
            value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
          <span className="hint">Elanda bu nömrə görünəcək.</span>
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label htmlFor="lf-desc">Açıqlama</label>
          <textarea id="lf-desc" rows={4} placeholder="Əmlak haqqında ətraflı məlumat…"
            value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>

        <div className="field" style={{ marginTop: 14 }}>
          <label>Fotoşəkillər ({photos.length}/{MAX_PHOTOS})</label>
          <div className="photo-grid">
            {photos.map((src, i) => (
              <div className={`photo-thumb ${i === coverIdx ? "cover" : ""}`} key={i}>
                <img src={src} alt={`foto ${i + 1}`} />
                <button type="button" className="photo-x" onClick={() => removePhoto(i)}
                  aria-label="Fotonu sil">✕</button>
                <button type="button" className="photo-cover-btn" onClick={() => setCoverIdx(i)}>
                  {i === coverIdx ? "★ Örtük" : "Örtük et"}
                </button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
                + Foto
              </button>
            )}
          </div>
          {photos.length > 0 && (
            <span className="hint">★ işarəli foto elan kartlarında örtük şəkli olacaq.</span>
          )}
          <input ref={fileRef} type="file" accept="image/*" multiple hidden
            onChange={(e) => void addPhotos(e.target.files)} />
        </div>

        {error && <div className="err">{error}</div>}
        <button className="cta" onClick={() => void submit()} disabled={busy}>
          {busy ? "Yerləşdirilir…" : "Elanı dərc et →"}
        </button>
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgraded={() => { setShowUpgrade(false); void submit(); }}
      />
    </div>
  );
}
