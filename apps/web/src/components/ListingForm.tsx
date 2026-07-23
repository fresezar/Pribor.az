"use client";

/**
 * İlan verme formu — "Elan yerləşdir" akışı.
 * Değerlemeden gelen alanlar (rayon, sahə, otaq…) ön-doldurulur ve salt-okunur
 * özet olarak gösterilir; kullanıcı FİYATI düzenleyebilir (varsayılan P50),
 * açıqlama yazar ve en fazla 5 foto ekler. Limit aşımında UpgradeModal açılır.
 */

import { useCallback, useRef, useState } from "react";
import type { CreateListingDto } from "@pribor/contracts";
import { useAuth } from "./AuthContext";
import UpgradeModal from "./UpgradeModal";
import { fileToResizedDataUri } from "./imageResize";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const MAX_PHOTOS = 5;

const TYPE_LABEL: Record<string, string> = {
  apartment: "Mənzil", house: "Həyət evi", land: "Torpaq",
};
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];

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
  onCreated: (listing: { id: string; title: string }) => void;
}) {
  const { user } = useAuth();
  const { prefill } = props;
  const [price, setPrice] = useState<number>(prefill?.priceAzn ?? 0);
  const [description, setDescription] = useState("");
  const [photos, setPhotos] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Prefill değişince fiyatı tazele (yeni değerleme açıldığında)
  const lastPrefillPrice = useRef<number | null>(null);
  if (prefill && lastPrefillPrice.current !== prefill.priceAzn) {
    lastPrefillPrice.current = prefill.priceAzn;
    if (price === 0) setPrice(prefill.priceAzn);
  }

  const addPhotos = useCallback(async (files: FileList | null) => {
    if (!files) return;
    setError(null);
    const room = MAX_PHOTOS - photos.length;
    const picked = Array.from(files).slice(0, room);
    try {
      const uris = await Promise.all(picked.map((f) => fileToResizedDataUri(f)));
      setPhotos((prev) => [...prev, ...uris].slice(0, MAX_PHOTOS));
    } catch {
      setError("Foto yüklənmədi — başqa şəkil seçin");
    }
    if (fileRef.current) fileRef.current.value = "";
  }, [photos.length]);

  const submit = useCallback(async () => {
    if (!user || !prefill) return;
    if (!price || price <= 0) return setError("Qiymət daxil edin");
    setBusy(true);
    setError(null);

    const dto: CreateListingDto = {
      userId: user.id,
      valuationId: prefill.valuationId,
      propertyType: prefill.propertyType,
      district: prefill.district as CreateListingDto["district"],
      areaM2: prefill.areaM2,
      landAreaSot: prefill.landAreaSot,
      rooms: prefill.rooms,
      buildingType: prefill.buildingType as CreateListingDto["buildingType"],
      repairState: prefill.repairState,
      titleDeed: prefill.titleDeed,
      metroDistM: prefill.metroDistM,
      priceAzn: price,
      description: description.trim() || undefined,
      photos,
      contactName: user.name,
      contactPhone: user.phone,
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
      const created = (await res.json()) as { id: string; title: string };
      props.onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Elan yaradıla bilmədi");
    } finally {
      setBusy(false);
    }
  }, [user, prefill, price, description, photos, props]);

  if (!props.open || !prefill) return null;

  const summary = [
    TYPE_LABEL[prefill.propertyType],
    prefill.rooms != null && `${prefill.rooms} otaq`,
    prefill.areaM2 != null && `${prefill.areaM2} m²`,
    prefill.landAreaSot != null && `${prefill.landAreaSot} sot`,
    prefill.repairState != null && REPAIR_LABELS[prefill.repairState],
    prefill.titleDeed === true && "Kupçalı",
  ].filter(Boolean) as string[];

  return (
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal listing-form" role="dialog" aria-modal="true" aria-label="Elan yerləşdir"
        onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <h2 className="modal-h">Elan yerləşdir</h2>
        <p className="modal-sub">
          {prefill.district} · dəyərləndirmə əsasında dolduruldu. Qiyməti istədiyiniz
          kimi dəyişə bilərsiniz.
        </p>

        <div className="lf-summary">
          {summary.map((s) => <span key={s} className="chip-sm">{s}</span>)}
        </div>

        <div className="field">
          <label htmlFor="lf-price">Qiymət (₼) — düzəldilə bilər</label>
          <input id="lf-price" type="number" min={1} value={price}
            onChange={(e) => setPrice(Number(e.target.value))} />
          <span className="hint">Pribor təxmini: {fmt(prefill.priceAzn)} ₼ · öz qiymətinizi qoya bilərsiniz</span>
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
              <div className="photo-thumb" key={i}>
                <img src={src} alt={`foto ${i + 1}`} />
                <button type="button" className="photo-x"
                  onClick={() => setPhotos((p) => p.filter((_, j) => j !== i))}>✕</button>
              </div>
            ))}
            {photos.length < MAX_PHOTOS && (
              <button type="button" className="photo-add" onClick={() => fileRef.current?.click()}>
                + Foto
              </button>
            )}
          </div>
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
