"use client";

/**
 * Admin / emlakçı destek köşesi — sabit WhatsApp butonu (sağ alt) + footer
 * satırı. Numara .env'den (NEXT_PUBLIC_SUPPORT_PHONE) gelir.
 */

const RAW = process.env.NEXT_PUBLIC_SUPPORT_PHONE ?? "+994508046966";
const DIGITS = RAW.replace(/[^\d]/g, "");

/** +994555000001 → +994 55 500 00 01 */
function pretty(phone: string): string {
  const d = phone.replace(/[^\d]/g, "");
  if (d.length !== 12) return phone;
  return `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}`;
}

export function SupportFab() {
  return (
    <a className="support-fab" href={`https://wa.me/${DIGITS}`} target="_blank"
      rel="noopener noreferrer" aria-label="WhatsApp ilə dəstək">
      <span className="sf-ico" aria-hidden>✆</span>
      <span className="sf-txt">Dəstək</span>
    </a>
  );
}

export function SupportLine() {
  return (
    <div className="support-line">
      <span>Emlakçı / dəstək:</span>
      <a href={`tel:${RAW}`}>{pretty(RAW)}</a>
      <span className="dot">·</span>
      <a href={`https://wa.me/${DIGITS}`} target="_blank" rel="noopener noreferrer">
        WhatsApp
      </a>
    </div>
  );
}
