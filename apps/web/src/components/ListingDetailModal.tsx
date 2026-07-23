"use client";

/**
 * İlan detay modalı — fotoğraf galerisi, tüm özellikler, açıqlama ve
 * əlaqə nömrəsi. Yalnızca oturum açmış kullanıcı açabilir (auth gate hem
 * burada hem sunucuda). Sahip/admin için "Satıldı" ve "Sil" aksiyonları.
 */

import { useCallback, useEffect, useState } from "react";
import type { ListingDetail } from "@pribor/contracts";
import { useAuth } from "./AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

const TYPE_LABEL: Record<string, string> = {
  apartment: "Mənzil", house: "Həyət evi", land: "Torpaq",
};
const TYPE_ICON: Record<string, string> = { apartment: "🏢", house: "🏡", land: "🌳" };
const BUILDING_LABEL: Record<string, string> = {
  yeni_tikili: "Yeni tikili", kohne_tikili: "Köhnə tikili", stalinka: "Stalinka",
};
const REPAIR_LABELS = ["Qara tikili", "Təmirsiz", "Köhnə", "Orta", "Yaxşı", "Əla"];

export default function ListingDetailModal(props: {
  /** Açılacak ilan kimliği (uuid) veya null (kapalı). */
  listingId: string | null;
  /** Doğrudan detay verilmişse (PRB araması) yeniden fetch edilmez. */
  preloaded?: ListingDetail | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { user } = useAuth();
  const [data, setData] = useState<ListingDetail | null>(props.preloaded ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePhoto, setActivePhoto] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const open = props.listingId != null || props.preloaded != null;

  useEffect(() => {
    if (!open) { setData(null); setError(null); setConfirmDelete(false); return; }
    if (props.preloaded) {
      setData(props.preloaded);
      setActivePhoto(props.preloaded.coverPhotoIdx ?? 0);
      return;
    }
    if (!props.listingId || !user) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/v1/listings/${props.listingId}?userId=${user.id}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 401 ? "Daxil olun" : "Elan tapılmadı");
        return r.json() as Promise<ListingDetail>;
      })
      .then((d) => { setData(d); setActivePhoto(d.coverPhotoIdx ?? 0); })
      .catch((e) => setError(e instanceof Error ? e.message : "Xəta"))
      .finally(() => setLoading(false));
  }, [open, props.listingId, props.preloaded, user]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, props]);

  const markSold = useCallback(async () => {
    if (!data || !user) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/v1/listings/${data.id}/sold?userId=${user.id}`, {
        method: "PATCH",
      });
      if (!res.ok) throw new Error();
      setData({ ...data, status: "sold" });
      props.onChanged?.();
    } catch {
      setError("Əməliyyat alınmadı");
    } finally {
      setBusy(false);
    }
  }, [data, user, props]);

  const remove = useCallback(async () => {
    if (!data || !user) return;
    setBusy(true);
    try {
      const res = await fetch(`${API}/v1/listings/${data.id}?userId=${user.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      props.onChanged?.();
      props.onClose();
    } catch {
      setError("Silinmə alınmadı");
    } finally {
      setBusy(false);
    }
  }, [data, user, props]);

  if (!open) return null;

  const specs: Array<[string, string]> = data
    ? ([
        ["Əmlak növü", TYPE_LABEL[data.propertyType ?? ""] ?? "—"],
        ["Rayon", data.district ?? "—"],
        data.rooms != null ? ["Otaq sayı", String(data.rooms)] : null,
        data.areaM2 != null ? ["Sahə", `${Math.round(data.areaM2)} m²`] : null,
        data.landAreaSot != null ? ["Torpaq sahəsi", `${data.landAreaSot} sot`] : null,
        data.buildingType ? ["Bina tipi", BUILDING_LABEL[data.buildingType] ?? data.buildingType] : null,
        data.repairState != null ? ["Təmir", REPAIR_LABELS[data.repairState] ?? "—"] : null,
        data.titleDeed != null ? ["Kupça", data.titleDeed ? "Var" : "Yoxdur"] : null,
        data.metroStation ? ["Metro", data.metroStation] : null,
        data.pricePerM2 != null ? ["m² qiyməti", `${fmt(data.pricePerM2)} ₼`] : null,
      ].filter(Boolean) as Array<[string, string]>)
    : [];

  return (
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal listing-detail" role="dialog" aria-modal="true"
        aria-label="Elan detalları" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>

        {loading && <div className="market-empty">Yüklənir…</div>}
        {error && !data && <div className="err">{error}</div>}

        {data && (
          <>
            <div className="ld-head">
              <span className={`type-badge ${data.propertyType ?? "apartment"}`}>
                {TYPE_ICON[data.propertyType ?? ""] ?? "🏢"}{" "}
                {TYPE_LABEL[data.propertyType ?? ""] ?? "Əmlak"}
              </span>
              {data.refNo && <span className="ref-no">{data.refNo}</span>}
              {data.status === "sold" && <span className="sold-badge">SATILDI</span>}
            </div>

            {data.photos.length > 0 ? (
              <div className="ld-gallery">
                <div className="ld-main-photo">
                  <img src={data.photos[activePhoto] ?? data.photos[0]} alt={data.title} />
                </div>
                {data.photos.length > 1 && (
                  <div className="ld-thumbs">
                    {data.photos.map((p, i) => (
                      <button key={i} className={i === activePhoto ? "on" : ""}
                        onClick={() => setActivePhoto(i)} aria-label={`Foto ${i + 1}`}>
                        <img src={p} alt="" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className={`ld-nophoto ${data.propertyType ?? "apartment"}`}>
                {TYPE_ICON[data.propertyType ?? ""] ?? "🏢"}
              </div>
            )}

            <div className="ld-price">{fmt(data.priceAzn)} ₼</div>
            <h2 className="ld-title">{data.title}</h2>

            <div className="ld-specs">
              {specs.map(([k, v]) => (
                <div className="ld-spec" key={k}>
                  <span className="ld-spec-k">{k}</span>
                  <span className="ld-spec-v">{v}</span>
                </div>
              ))}
            </div>

            {data.description && (
              <div className="ld-desc">
                <h3>Açıqlama</h3>
                <p>{data.description}</p>
              </div>
            )}

            <div className="ld-contact">
              <div className="ld-contact-label">Əlaqə</div>
              {data.contactPhone ? (
                <a className="ld-phone" href={`tel:${data.contactPhone.replace(/\s/g, "")}`}>
                  📞 {data.contactPhone}
                </a>
              ) : (
                <span className="ld-phone muted">Nömrə göstərilməyib</span>
              )}
              {data.contactName && <div className="ld-contact-name">{data.contactName}</div>}
            </div>

            {data.canManage && data.kind === "user" && (
              <div className="ld-actions">
                {data.status !== "sold" && (
                  <button className="ghost" onClick={() => void markSold()} disabled={busy}>
                    ✓ Satıldı olaraq işarələ
                  </button>
                )}
                {!confirmDelete ? (
                  <button className="danger-btn" onClick={() => setConfirmDelete(true)} disabled={busy}>
                    Elanı sil
                  </button>
                ) : (
                  <div className="confirm-row">
                    <span>Əminsiniz?</span>
                    <button className="danger-btn" onClick={() => void remove()} disabled={busy}>
                      Bəli, sil
                    </button>
                    <button className="ghost" onClick={() => setConfirmDelete(false)}>İmtina</button>
                  </div>
                )}
              </div>
            )}

            {error && <div className="err">{error}</div>}
            <div className="model-tag">
              <span>{data.kind === "user" ? "Pribor elanı" : `Bazar məlumatı · ${data.sourceSite}`}</span>
              <span>{new Date(data.createdAt).toLocaleDateString("az-AZ")}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
