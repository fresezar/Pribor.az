/**
 * Azərbaycan Respublikasının Dövlət bayrağı — inline SVG.
 *
 * NEDEN BU KADAR DİKKATLİ: devlet bayrağının kullanımı qanunla tənzimlənir.
 * Oranı (1:2), renk sırası ve aypara-ulduz yerleşimi standarda uygun çizilmiştir;
 * bozulmuş, renklendirilmiş ya da üstüne bir şey konmuş bayrak kullanılamaz.
 * Bu yüzden:
 *   · en-boy oranı sabit (1:2) — kap ne olursa olsun esnemez
 *   · renkler resmi değerlerdir, tema renklerine uyarlanmaz
 *   · dekoratif doku olarak TEKRARLANMAZ; tek yerde, menşe işareti olarak durur
 *
 * Səkkizguşəli ulduz nöqtələri prosedurla üretilir — elle yazılmış path'te
 * simetri kolayca kayar ve düzensiz bir ulduz standarda uymaz.
 */

const BLUE = "#00B5E2";
const RED = "#EF3340";
const GREEN = "#509E2F";

/** Səkkizguşəli ulduz — 8 uc, 16 təpə nöqtəsi. */
function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner;
    // −90° başlanğıc: bir uc yuxarı baxsın
    const a = (Math.PI / 8) * i - Math.PI / 2;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${pts.join("L")}Z`;
}

export default function AzFlag({ height = 14 }: { height?: number }) {
  const w = 400;
  const h = 200;
  const band = h / 3;

  return (
    <svg
      width={height * 2}
      height={height}
      viewBox={`0 0 ${w} ${h}`}
      role="img"
      aria-label="Azərbaycan bayrağı"
      className="az-flag"
    >
      <rect width={w} y={0} height={band} fill={BLUE} />
      <rect width={w} y={band} height={band} fill={RED} />
      <rect width={w} y={band * 2} height={band} fill={GREEN} />

      {/* Aypara: dolu dairədən kiçik dairə çıxarılır (even-odd deyil, maska ilə —
          şəffaf fon üzərində də düzgün görünsün) */}
      <mask id="az-crescent">
        <rect width={w} height={h} fill="black" />
        <circle cx={186} cy={100} r={34} fill="white" />
        <circle cx={200} cy={100} r={28} fill="black" />
      </mask>
      <rect width={w} height={h} fill="#fff" mask="url(#az-crescent)" />

      <path d={starPath(236, 100, 25, 10)} fill="#fff" />
    </svg>
  );
}
