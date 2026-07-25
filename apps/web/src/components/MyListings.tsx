"use client";

/** "Mənim elanlarım" — kendi ilanları; tıklanınca detay modalı açılır. */

import { useCallback, useEffect, useState } from "react";
import type { UserListing } from "@pribor/contracts";
import ListingDetailModal from "./ListingDetailModal";
import Portal from "./Portal";
import { useAuth } from "./AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv", draft: "Qaralama", pending_review: "Yoxlanılır",
  sold: "Satıldı", expired: "Vaxtı bitib", removed: "Silinib",
};
const TYPE_ICON: Record<string, string> = { apartment: "🏢", house: "🏡", land: "🌳" };

export default function MyListings(props: { open: boolean; onClose: () => void }) {
  const { user, refresh } = useAuth();
  const [items, setItems] = useState<UserListing[] | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    setItems(null);
    fetch(`${API}/v1/listings/mine/${user.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(data as UserListing[]))
      .catch(() => setItems([]));
  }, [user]);

  useEffect(() => { if (props.open) load(); }, [props.open, load]);

  if (!props.open) return null;

  const activeCount = items?.filter((i) => i.status !== "sold" && i.status !== "removed").length ?? 0;

  return (
    <>
      <Portal>
      <div className="modal-overlay" onMouseDown={props.onClose}>
        <div className="modal my-listings" role="dialog" aria-modal="true"
          aria-label="Mənim elanlarım" onMouseDown={(e) => e.stopPropagation()}>
          <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
          <h2 className="modal-h">Mənim elanlarım</h2>
          <p className="modal-sub">
            {user?.entitlements.unlimited
              ? `Sərhədsiz paylaşım · ${activeCount} aktiv elan`
              : `Həftədə 3 pulsuz elan · ${activeCount} aktiv`}
          </p>

          {items === null ? (
            <div className="market-empty">Yüklənir…</div>
          ) : items.length === 0 ? (
            <div className="market-empty">
              Hələ elanınız yoxdur. Dəyərləndirmədən sonra “Elan yerləşdir”.
            </div>
          ) : (
            <div className="my-list">
              {items.map((it) => {
                const cover = it.photos[it.coverPhotoIdx] ?? it.photos[0];
                return (
                  <div className={`my-item ${it.status === "sold" ? "is-sold" : ""}`} key={it.id}
                    onClick={() => setDetailId(it.id)} role="button" tabIndex={0}
                    onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setDetailId(it.id)}>
                    <div className={`my-thumb type-${it.propertyType ?? "apartment"}`}>
                      {cover
                        ? <img src={cover} alt={it.title} />
                        : <span>{TYPE_ICON[it.propertyType ?? ""] ?? "🏠"}</span>}
                    </div>
                    <div className="my-body">
                      <div className="my-price">{fmt(it.priceAzn)} ₼
                        <span className={`my-status ${it.status}`}>
                          {STATUS_LABEL[it.status] ?? it.status}
                        </span>
                      </div>
                      <div className="my-title">{it.title}</div>
                      {it.description && <div className="my-desc">{it.description}</div>}
                      <div className="my-meta">
                        {it.refNo && <span className="card-ref">{it.refNo}</span>}
                        {it.photos.length > 0 && <span>📷 {it.photos.length}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </Portal>

      <ListingDetailModal
        listingId={detailId}
        onClose={() => setDetailId(null)}
        onChanged={() => { load(); void refresh(); }}
      />
    </>
  );
}
