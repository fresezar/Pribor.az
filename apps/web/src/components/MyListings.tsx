"use client";

/** "Mənim elanlarım" — kullanıcının kendi ilanları (foto + açıqlama). */

import { useEffect, useState } from "react";
import type { UserListing } from "@pribor/contracts";
import { useAuth } from "./AuthContext";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const fmt = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const STATUS_LABEL: Record<string, string> = {
  active: "Aktiv", draft: "Qaralama", pending_review: "Yoxlanılır",
  sold: "Satıldı", expired: "Vaxtı bitib", removed: "Silinib",
};

export default function MyListings(props: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const [items, setItems] = useState<UserListing[] | null>(null);

  useEffect(() => {
    if (!props.open || !user) return;
    setItems(null);
    fetch(`${API}/v1/listings/mine/${user.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setItems(data as UserListing[]))
      .catch(() => setItems([]));
  }, [props.open, user]);

  if (!props.open) return null;

  return (
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal my-listings" role="dialog" aria-modal="true" aria-label="Mənim elanlarım"
        onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <h2 className="modal-h">Mənim elanlarım</h2>
        <p className="modal-sub">
          {user?.entitlements.unlimited
            ? "Sərhədsiz paket · istədiyiniz qədər elan"
            : `Pulsuz paket · ${items?.length ?? 0}/${user?.entitlements.maxActiveListings ?? 2} aktiv elan`}
        </p>

        {items === null ? (
          <div className="market-empty">Yüklənir…</div>
        ) : items.length === 0 ? (
          <div className="market-empty">Hələ elanınız yoxdur. Dəyərləndirmədən sonra “Elan yerləşdir”.</div>
        ) : (
          <div className="my-list">
            {items.map((it) => (
              <div className="my-item" key={it.id}>
                <div className="my-thumb">
                  {it.photos[0] ? <img src={it.photos[0]} alt={it.title} /> : <span>🏠</span>}
                </div>
                <div className="my-body">
                  <div className="my-price">{fmt(it.priceAzn)} ₼
                    <span className={`my-status ${it.status}`}>{STATUS_LABEL[it.status] ?? it.status}</span>
                  </div>
                  <div className="my-title">{it.title}</div>
                  {it.description && <div className="my-desc">{it.description}</div>}
                  {it.photos.length > 1 && <div className="my-photos">📷 {it.photos.length} foto</div>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
