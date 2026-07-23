"use client";

/**
 * Mock giriş akışı (Daxil ol) — telefon-OTP öncelikli tasarımın UI taslağı.
 * Faz 3'te gerçek OTP (SMS gateway + NestJS AuthModule) buraya bağlanır;
 * şimdilik "123456" veya boş kod kabul edilir ve kullanıcı localStorage'a yazılır.
 */

import { useEffect, useRef, useState } from "react";

export type PriborUser = { phone: string; name: string };

const STORAGE_KEY = "pribor.user";

export function loadUser(): PriborUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PriborUser) : null;
  } catch {
    return null;
  }
}

export function saveUser(u: PriborUser | null) {
  if (typeof window === "undefined") return;
  if (u) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
  else window.localStorage.removeItem(STORAGE_KEY);
}

export default function AuthModal(props: {
  open: boolean;
  onClose: () => void;
  onLogin: (u: PriborUser) => void;
}) {
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (props.open) {
      setStep("phone");
      setPhone("");
      setOtp("");
      setError(null);
    }
  }, [props.open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") props.onClose();
    };
    if (props.open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.open, props]);

  if (!props.open) return null;

  const normalizedPhone = phone.replace(/[^\d]/g, "");

  const sendOtp = () => {
    if (normalizedPhone.length < 9) {
      setError("Nömrəni tam daxil edin (məs. 050 123 45 67)");
      return;
    }
    setError(null);
    setStep("otp");
  };

  const verify = () => {
    // Mock: hər hansı 4-6 rəqəmli kod (və ya boş) qəbul edilir
    if (otp.length > 0 && otp.length < 4) {
      setError("Kod ən azı 4 rəqəm olmalıdır");
      return;
    }
    const suffix = normalizedPhone.slice(-4);
    props.onLogin({ phone: `+994${normalizedPhone}`, name: `İstifadəçi ${suffix}` });
    props.onClose();
  };

  return (
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal" ref={dialogRef} role="dialog" aria-modal="true"
        aria-label="Daxil ol" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <div className="modal-brand">PRIBOR<b>.AZ</b></div>

        {step === "phone" ? (
          <>
            <h2 className="modal-h">Daxil ol və ya qeydiyyatdan keç</h2>
            <p className="modal-sub">Telefon nömrənizə birdəfəlik kod göndərəcəyik.</p>
            <div className="field">
              <label htmlFor="ph">Telefon nömrəsi</label>
              <div className="phone-input">
                <span className="phone-cc">+994</span>
                <input id="ph" inputMode="tel" placeholder="50 123 45 67" autoFocus
                  value={phone} onChange={(e) => setPhone(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && sendOtp()} />
              </div>
            </div>
            {error && <div className="err">{error}</div>}
            <button className="cta" onClick={sendOtp}>Kod göndər →</button>
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
                onKeyDown={(e) => e.key === "Enter" && verify()} />
            </div>
            {error && <div className="err">{error}</div>}
            <button className="cta" onClick={verify}>Təsdiqlə və daxil ol</button>
            <button className="link-btn" onClick={() => setStep("phone")}>← Nömrəni dəyiş</button>
          </>
        )}
      </div>
    </div>
  );
}
