"use client";

/**
 * Mock giriş akışı (Daxil ol) — telefon-OTP öncelikli tasarımın UI taslağı.
 * Ad Soyad + telefon + test rolü (İstifadəçi / Emlakçı-Admin) alınır.
 * Faz 3'te gerçek OTP (SMS gateway + NestJS OTP doğrulama) buraya bağlanır;
 * şimdilik istənilən kod qəbul edilir və kullanıcı DB'ye upsert edilir.
 */

import { useEffect, useState } from "react";
import { useAuth } from "./AuthContext";

export default function AuthModal(props: {
  open: boolean;
  onClose: () => void;
  onLoggedIn?: () => void;
}) {
  const { login } = useAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.open) {
      setStep("phone");
      setName("");
      setPhone("");
      setOtp("");
      setError(null);
    }
  }, [props.open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    if (props.open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props]);

  if (!props.open) return null;

  const normalizedPhone = phone.replace(/[^\d]/g, "");

  const toOtp = () => {
    if (name.trim().length < 2) return setError("Ad və soyadınızı daxil edin");
    if (normalizedPhone.length < 9) return setError("Nömrəni tam daxil edin (məs. 50 123 45 67)");
    setError(null);
    setStep("otp");
  };

  const verify = async () => {
    if (otp.length > 0 && otp.length < 4) return setError("Kod ən azı 4 rəqəm olmalıdır");
    setBusy(true);
    setError(null);
    try {
      await login(normalizedPhone, name.trim());
      props.onClose();
      props.onLoggedIn?.();
    } catch {
      setError("Giriş alınmadı — server işləyirmi?");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Daxil ol"
        onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <div className="modal-brand">PRIBOR<b>.AZ</b></div>

        {step === "phone" ? (
          <>
            <h2 className="modal-h">Daxil ol və ya qeydiyyatdan keç</h2>
            <p className="modal-sub">Telefon nömrənizə birdəfəlik kod göndərəcəyik.</p>

            <div className="field">
              <label htmlFor="nm">Ad və Soyad</label>
              <input id="nm" placeholder="Elvin Məmmədov" autoFocus
                value={name} onChange={(e) => setName(e.target.value)} />
            </div>

            <div className="field" style={{ marginTop: 14 }}>
              <label htmlFor="ph">Telefon nömrəsi</label>
              <div className="phone-input">
                <span className="phone-cc">+994</span>
                <input id="ph" inputMode="tel" placeholder="50 123 45 67"
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && toOtp()} />
              </div>
            </div>

            <p className="modal-note">
              Pulsuz paketlə <b>5 aktiv elan</b> yerləşdirə bilərsiniz.
            </p>

            {error && <div className="err">{error}</div>}
            <button className="cta" onClick={toOtp}>Kod göndər →</button>
          </>
        ) : (
          <>
            <h2 className="modal-h">Kodu daxil edin</h2>
            <p className="modal-sub">
              +994 {normalizedPhone} nömrəsinə göndərilən kodu yazın.
              <br /><small style={{ color: "var(--faint)" }}>(Demo: istənilən kod qəbul edilir)</small>
            </p>
            <div className="field">
              <label htmlFor="otp">Təsdiq kodu</label>
              <input id="otp" inputMode="numeric" placeholder="123456" autoFocus maxLength={6}
                value={otp} onChange={(e) => setOtp(e.target.value.replace(/[^\d]/g, ""))}
                onKeyDown={(e) => e.key === "Enter" && void verify()} />
            </div>
            {error && <div className="err">{error}</div>}
            <button className="cta" onClick={() => void verify()} disabled={busy}>
              {busy ? "Yoxlanılır…" : "Təsdiqlə və daxil ol"}
            </button>
            <button className="link-btn" onClick={() => setStep("phone")}>← Geri</button>
          </>
        )}
      </div>
    </div>
  );
}
