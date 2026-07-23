"use client";

/**
 * İlan limiti aşıldığında açılan abonelik/paket modalı.
 * MVP: gerçek ödeme sağlayıcı yok — "Kartla Ödə (Demo)" mock ödeme adımıyla
 * kullanıcı pro pakete yükseltilir (AuthService.upgrade → sınırsız ilan).
 */

import { useState } from "react";
import { useAuth } from "./AuthContext";

export default function UpgradeModal(props: {
  open: boolean;
  onClose: () => void;
  onUpgraded: () => void;
}) {
  const { upgrade } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!props.open) return null;

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      // Mock ödeme gecikmesi — gerçek PSP çağrısının yerini tutar
      await new Promise((r) => setTimeout(r, 900));
      await upgrade();
      props.onUpgraded();
    } catch {
      setError("Ödəniş alınmadı — yenidən cəhd edin");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal upgrade" role="dialog" aria-modal="true" aria-label="Paket yüksəlt"
        onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <div className="up-badge">Limiti keçdiniz</div>
        <h2 className="modal-h">Sərhədsiz elan üçün paketi yüksəldin</h2>
        <p className="modal-sub">
          Pulsuz paketdə maksimum 2 aktiv elan mümkündür. Sərhədsiz elan və
          əlavə imkanlar üçün Pro abunəliyə keçin.
        </p>

        <div className="plan-card">
          <div className="plan-top">
            <div>
              <div className="plan-name">Pro · Sərhədsiz</div>
              <div className="plan-feat">✓ Sərhədsiz aktiv elan</div>
              <div className="plan-feat">✓ Deal Radar bildirişləri</div>
              <div className="plan-feat">✓ Rəsmi Emlakçı rozeti</div>
            </div>
            <div className="plan-price">
              <span className="pp-num">29</span>
              <span className="pp-cur">₼<small>/ay</small></span>
            </div>
          </div>
        </div>

        {error && <div className="err">{error}</div>}
        <button className="cta" onClick={() => void pay()} disabled={busy}>
          {busy ? "Ödəniş emal olunur…" : "💳 Kartla Ödə (Demo)"}
        </button>
        <button className="link-btn" onClick={props.onClose}>İndi yox, sonra</button>
      </div>
    </div>
  );
}
