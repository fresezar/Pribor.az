/**
 * Pribor marka işareti — inline SVG (çatı + iç içe kemer + merkez lens).
 * Zümrüt→gold gradient logonun kimliğini taşır; lens "AI değerleme gözü" olarak
 * yumuşakça nabız atar. Vektörel olduğundan her ölçekte keskin, iki temada da net.
 *
 * withWord=false → yalnız işaret (favicon/kompakt). Wordmark "PriborƏmlak",
 * gradient; aria-label ile birlikte markayı taşır.
 */
export default function BrandLogo({
  size = 30,
  withWord = true,
}: {
  size?: number;
  withWord?: boolean;
}) {
  return (
    <span className="brand-logo">
      <svg
        width={size}
        height={size}
        viewBox="0 0 48 48"
        fill="none"
        role="img"
        aria-label="PriborƏmlak"
        className="brand-mark"
      >
        <defs>
          {/* Marka renkleri temadan bağımsızdır (kimlik sabit) — sabit hex */}
          <linearGradient id="pbGrad" x1="6" y1="26" x2="42" y2="22" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#10b981" />
            <stop offset="0.55" stopColor="#57d1a6" />
            <stop offset="1" stopColor="#f5b84b" />
          </linearGradient>
          <radialGradient id="pbLens" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.35" stopColor="#f5b84b" />
            <stop offset="1" stopColor="#f5b84b" stopOpacity="0" />
          </radialGradient>
        </defs>
        <g
          stroke="url(#pbGrad)"
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* çatı */}
          <path d="M6.5 19.5 24 6 41.5 19.5" />
          {/* dış kemer + ayaklar */}
          <path d="M8 40 H13 V24.5 A11 11 0 0 1 35 24.5 V40 H40" />
          {/* iç kemer */}
          <path d="M18.5 40 V26 A5.5 5.5 0 0 1 29.5 26 V40" />
          {/* merkez destek çizgisi */}
          <path d="M24 8.5 V21.5" />
        </g>
        {/* lens haresi (glow) + çekirdek */}
        <circle className="brand-lens-glow" cx="24" cy="25" r="6" fill="url(#pbLens)" />
        <circle className="brand-lens" cx="24" cy="25" r="2.4" fill="#f5b84b" />
        <circle cx="24" cy="25" r="1" fill="#ffffff" />
      </svg>
      {withWord && (
        <span className="brand-word">Pribor<b>Əmlak</b></span>
      )}
    </span>
  );
}
