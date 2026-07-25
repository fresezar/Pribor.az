"use client";

/**
 * İlan verme formu — "Elan yerləşdir" akışı.
 *
 * Kategori-tabanlı: 7 emlak kategorisi (Yeni tikili … Obyekt) + ilan növü
 * (Satılır / Kirayə). Görünen alanlar kategoriye göre dinamikleşir
 * (categories.ts config). Kategori submit'te propertyType + buildingType'a
 * eşlenir (categoryToType). Değerleme/düzenleme verisi ön-doldurulur.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateListingDto,
  DealType,
  ListingDetail,
  ReCategory,
  UpdateListingDto,
} from "@pribor/contracts";
import { categoryToType, DEAL_TYPE_LABEL, typeToCategory } from "@pribor/contracts";
import Portal from "./Portal";
import { useAuth } from "./AuthContext";
import UpgradeModal from "./UpgradeModal";
import { CATEGORIES, CATEGORY_BY_KEY } from "./categories";
import { fileToResizedDataUri } from "./imageResize";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const MAX_PHOTOS = 5;

const DISTRICTS = [
  "Nərimanov", "Nəsimi", "Səbail", "Yasamal", "Xətai", "Nizami",
  "Binəqədi", "Sabunçu", "Suraxanı", "Xəzər", "Qaradağ", "Abşeron",
];
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];

export type ListingPrefill = {
  valuationId?: string;
  /** Tam emlak tipi (7 kategoriyi kapsar); kategori typeToCategory ile türetilir. */
  propertyType: string;
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
  editing?: ListingDetail | null;
  onClose: () => void;
  onCreated: (listing: { id: string; title: string; refNo: string | null }) => void;
}) {
  const { user } = useAuth();
  const { prefill, editing } = props;
  const isEdit = editing != null;
  const isManual = !isEdit && prefill == null;

  const [category, setCategory] = useState<ReCategory>("yeni_tikili");
  const [dealType, setDealType] = useState<DealType>("sale");
  const [district, setDistrict] = useState(DISTRICTS[0]!);
  const [areaM2, setAreaM2] = useState<number>(0);
  const [landAreaSot, setLandAreaSot] = useState<number>(0);
  const [rooms, setRooms] = useState<number>(2);
  const [repairState, setRepairState] = useState(3);
  const [titleDeed, setTitleDeed] = useState(true);
  const [price, setPrice] = useState<number>(0);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [coverIdx, setCoverIdx] = useState(0);

  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const cfg = CATEGORY_BY_KEY[category];
  const digits = (s: string) => s.replace(/\D/g, "");

  useEffect(() => {
    if (!props.open) return;
    setContactName(editing?.contactName ?? user?.name ?? "");
    setContactPhone(editing?.contactPhone ?? "");
    if (editing) {
      setCategory(typeToCategory(editing.propertyType, editing.buildingType));
      setDealType(editing.dealType);
      setDistrict(editing.district ?? DISTRICTS[0]!);
      setAreaM2(editing.areaM2 ?? 0);
      setLandAreaSot(editing.landAreaSot ?? 0);
      setRooms(editing.rooms ?? 2);
      setRepairState(editing.repairState ?? 3);
      setTitleDeed(editing.titleDeed ?? true);
      setPrice(editing.priceAzn);
      setDescription(editing.description ?? "");
      setPhotos(editing.photos);
      setCoverIdx(editing.coverPhotoIdx ?? 0);
      setError(null);
      return;
    }
    setDealType("sale");
    setError(null);
    if (!prefill) {
      setCategory("yeni_tikili");
      setDistrict(DISTRICTS[0]!);
      setAreaM2(0); setLandAreaSot(0); setRooms(2); setRepairState(3);
      setTitleDeed(true); setPrice(0); setDescription(""); setPhotos([]); setCoverIdx(0);
      return;
    }
    setCategory(typeToCategory(prefill.propertyType, prefill.buildingType));
    setDistrict(prefill.district);
    setAreaM2(prefill.areaM2 ?? 0);
    setLandAreaSot(prefill.landAreaSot ?? 0);
    setRooms(prefill.rooms ?? 2);
    setRepairState(prefill.repairState ?? 3);
    setTitleDeed(prefill.titleDeed ?? true);
    setPrice(prefill.priceAzn);
    setDescription(""); setPhotos([]); setCoverIdx(0);
  }, [props.open, prefill, editing, user?.name]);

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
    setCoverIdx((c) => (i === c ? 0 : i < c ? c - 1 : c));
  }, []);

  const submit = useCallback(async () => {
    if (!user) return;
    if (!price || price <= 0) return setError("Qiymət daxil edin");
    if (cfg.areaM2 && (!areaM2 || areaM2 <= 0)) return setError("Sahə daxil edin");
    if (cfg.landSot && (!landAreaSot || landAreaSot <= 0)) {
      return setError("Torpaq sahəsini daxil edin (sot)");
    }
    if (!isEdit) {
      if (contactName.trim().length < 2) return setError("Əlaqə adını daxil edin");
      if (digits(contactPhone).length < 7) return setError("Əlaqə nömrəsini daxil edin");
    }
    setBusy(true);
    setError(null);

    const { propertyType, buildingType } = categoryToType(category);
    // Torpaqda ana sahə (m²) = sot × 100 (model m² üzerinden çalışır)
    const effArea = cfg.areaM2 ? areaM2 : cfg.landSot ? landAreaSot * 100 : undefined;

    const fields = {
      userId: user.id,
      propertyType,
      dealType,
      buildingType: buildingType as CreateListingDto["buildingType"],
      district: district as CreateListingDto["district"],
      areaM2: effArea,
      landAreaSot: cfg.landSot ? landAreaSot : undefined,
      rooms: cfg.rooms ? rooms : undefined,
      repairState: cfg.repair ? repairState : undefined,
      titleDeed,
      priceAzn: price,
      description: description.trim() || undefined,
      photos,
      coverPhotoIdx: coverIdx,
      contactName: contactName.trim() || user.name,
      contactPhone: contactPhone.trim(),
    };

    try {
      let res: Response;
      if (isEdit && editing) {
        const dto: UpdateListingDto = fields;
        res = await fetch(`${API}/v1/listings/${editing.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dto),
        });
      } else {
        const dto: CreateListingDto = { ...fields, valuationId: prefill?.valuationId, metroDistM: prefill?.metroDistM };
        res = await fetch(`${API}/v1/listings`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(dto),
        });
      }
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const code = body?.code as string | undefined;
        if (code === "WEEKLY_LIMIT_EXCEEDED") { setError(body?.message ?? "Həftəlik limit doldu"); return; }
        if (code === "LISTING_LIMIT_EXCEEDED") { setShowUpgrade(true); return; }
        throw new Error(body?.message ?? `Server xətası (${res.status})`);
      }
      props.onCreated(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Elan yadda saxlanıla bilmədi");
    } finally {
      setBusy(false);
    }
  }, [user, prefill, editing, isEdit, category, cfg, dealType, district, areaM2,
      landAreaSot, rooms, repairState, titleDeed, price, description, contactName,
      contactPhone, photos, coverIdx, props]);

  if (!props.open) return null;

  return (
    <Portal>
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal listing-form" role="dialog" aria-modal="true" aria-label="Elan yerləşdir"
        onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <h2 className="modal-h">{isEdit ? "Elanı redaktə et" : "Pulsuz elan yerləşdir"}</h2>
        <p className="modal-sub">
          {isEdit
            ? <>Dəyişikliklər dərhal dərc olunur.{editing?.refNo && <> · <span className="card-ref">{editing.refNo}</span></>}</>
            : isManual
              ? "Əmlak məlumatlarını daxil edin — elan dərhal və pulsuz dərc olunur."
              : "Dəyərləndirmə məlumatları dolduruldu — hamısını dəyişə bilərsiniz."}
        </p>

        {/* İlan növü: Satılır / Kirayə */}
        <div className="field">
          <label>İlan növü</label>
          <div className="seg deal-seg">
            {(["sale", "rent"] as DealType[]).map((d) => (
              <button type="button" key={d} className={dealType === d ? "on" : ""}
                onClick={() => setDealType(d)}>{DEAL_TYPE_LABEL[d]}</button>
            ))}
          </div>
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="lf-cat">Əmlak növü</label>
            <select id="lf-cat" value={category}
              onChange={(e) => setCategory(e.target.value as ReCategory)}>
              {CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lf-district">Rayon</label>
            <select id="lf-district" value={district} onChange={(e) => setDistrict(e.target.value)}>
              {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          {cfg.areaM2 && (
            <div className="field">
              <label htmlFor="lf-area">{cfg.areaLabel}</label>
              <input id="lf-area" type="number" min={1} value={areaM2 || ""}
                onChange={(e) => setAreaM2(Number(e.target.value))} />
            </div>
          )}
          {cfg.landSot && (
            <div className="field">
              <label htmlFor="lf-land">Torpaq sahəsi (sot)</label>
              <input id="lf-land" type="number" min={0.1} step={0.1} value={landAreaSot || ""}
                onChange={(e) => setLandAreaSot(Number(e.target.value))} />
              <span className="hint">1 sot = 100 m²</span>
            </div>
          )}

          {cfg.rooms && (
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
          {cfg.repair && (
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
          <label htmlFor="lf-price">Qiymət (₼){dealType === "rent" ? " / ay" : ""}</label>
          <input id="lf-price" type="number" min={1} value={price || ""}
            onChange={(e) => setPrice(Number(e.target.value))} />
          {isEdit && editing && price !== editing.priceAzn && price > 0 && (
            <span className="hint">
              {fmt(editing.priceAzn)} ₼ → {fmt(price)} ₼ · dəyişiklik qiymət tarixçəsinə yazılacaq
            </span>
          )}
          {!isEdit && prefill && (
            <span className="hint">
              Pribor təxmini: {fmt(prefill.priceAzn)} ₼ · öz qiymətinizi qoya bilərsiniz
            </span>
          )}
        </div>

        <div className="grid" style={{ marginTop: 14 }}>
          <div className="field">
            <label htmlFor="lf-cname">Əlaqə adı</label>
            <input id="lf-cname" placeholder="Ad / ünvan"
              value={contactName} onChange={(e) => setContactName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="lf-phone">Əlaqə nömrəsi</label>
            <input id="lf-phone" inputMode="tel" placeholder="+994 50 123 45 67"
              value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} />
            <span className="hint">Elanda bu nömrə görünəcək.</span>
          </div>
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
          {busy ? "Yadda saxlanılır…" : isEdit ? "Yadda saxla" : "Elanı dərc et →"}
        </button>
      </div>

      <UpgradeModal
        open={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        onUpgraded={() => { setShowUpgrade(false); void submit(); }}
      />
    </div>
    </Portal>
  );
}
