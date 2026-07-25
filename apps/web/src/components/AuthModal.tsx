"use client";

/**
 * Giriş akışı (Daxil ol) — telefon + OTP. Doğrulama SADECE burada yapılır;
 * giriş yapan her hesap = doğrulanmış telefon. İlan formunda tekrar OTP yok.
 *
 * OTP mekanizması gerçek (hash'li, süreli, tek kullanımlık); yalnızca SMS
 * göndericisi mock — non-prod'da kod arayüzde gösterilir. Gerçek gateway
 * takıldığında sadece gönderici değişir.
 */

import { useEffect, useState } from "react";
import BrandLogo from "./BrandLogo";
import Portal from "./Portal";
import { useAuth } from "./AuthContext";

export default function AuthModal(props: {
  open: boolean;
  onClose: () => void;
  onLoggedIn?: () => void;
}) {
  const { requestOtp, login } = useAuth();
  const [step, setStep] = useState<"phone" | "otp">("phone");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [devCode, setDevCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (props.open) {
      setStep("phone");
      setName("");
      setPhone("");
      setOtp("");
      setDevCode(null);
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

  // Adım 1 → kodu GÖNDER, sonra kod adımına geç
  const sendCode = async () => {
    if (name.trim().length < 2) return setError("Ad və soyadınızı daxil edin");
    if (normalizedPhone.length < 9) return setError("Nömrəni tam daxil edin (məs. 50 123 45 67)");
    setBusy(true);
    setError(null);
    try {
      const { devCode } = await requestOtp(normalizedPhone);
      setDevCode(devCode ?? null);
      setStep("otp");
    } catch {
      setError("Kod göndərilə bilmədi — server işləyirmi?");
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (otp.trim().length < 4) return setError("Kodu tam daxil edin");
    setBusy(true);
    setError(null);
    try {
      await login(normalizedPhone, name.trim(), otp.trim());
      props.onClose();
      props.onLoggedIn?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Giriş alınmadı");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Portal>
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Daxil ol"
        onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <div className="modal-brand"><BrandLogo size={34} /></div>

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
                  onKeyDown={(e) => e.key === "Enter" && void sendCode()} />
              </div>
            </div>

            <p className="modal-note">
              Hər hesab həftədə <b>3 pulsuz elan</b> yerləşdirə bilər.
            </p>

            {error && <div className="err">{error}</div>}
            <button className="cta" onClick={() => void sendCode()} disabled={busy}>
              {busy ? "Göndərilir…" : "Kod göndər →"}
            </button>
          </>
        ) : (
          <>
            <h2 className="modal-h">Kodu daxil edin</h2>
            <p className="modal-sub">
              +994 {normalizedPhone} nömrəsinə göndərilən kodu yazın.
              {devCode && (
                <><br /><small style={{ color: "var(--faint)" }}>Demo kodu: <b>{devCode}</b></small></>
              )}
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
            <button className="link-btn" onClick={() => { setStep("phone"); setOtp(""); setError(null); }}>
              ← Geri
            </button>
          </>
        )}
      </div>
    </div>
    </Portal>
  );
}
