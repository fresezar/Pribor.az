/**
 * Bakı silüeti — hero'nun alt kenarında, çok katmanlı vektör panorama.
 *
 * NEDEN FOTOĞRAF DEĞİL: panel bu katmanın üstünde oturuyor (fotoğrafta kontrast
 * öngörülemez olur), tüm JS'imiz 103 KB (fotoğraf 300 KB–1 MB gelir) ve telif
 * gerekir. Vektör üçünü de çözüyor.
 *
 * GEOMETRİ ÜRETİLİYOR, elle yazılmıyor: mazgal dişleri, dolap parmakları ve
 * kabinler döngüyle çiziliyor. Elle yazılan uzun path'te ritim kayar ve simetri
 * bozulur.
 *
 * SOLDAN SAĞA: İçərişəhər surları · Qız Qalası · minarəli məscid · üç Alov
 * Qülləsi · Bakı Gözü · Dövlət Bayrağı Meydanı · Heydər Əliyev Mərkəzi ·
 * Xalça Muzeyi · TV qülləsi.
 *
 * ALOV QÜLLƏLƏRİNİN ŞƏKLİ: gövde düz bir damla değil — tepe yana eğilip
 * KIVRILIR ve altında içbükey bir çentik bırakır. İlk sürümde bu kıvrım yoktu,
 * kuleler simetrik "yaprak" gibi duruyordu ve Bakı'yı söylemiyordu.
 */

const W = 1500;
const H = 360;
const G = H; // yer çizgisi

/** Tohumlu üreteç — SSR ve istemci aynı sonucu üretmeli (hidrasyon). */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

/** Mazgallı duvar üstü — surların tanınmasını sağlayan asıl detay. */
function merlons(x0: number, x1: number, y: number, step = 17, h = 9): string {
  let d = `M${x0} ${y}`;
  for (let x = x0; x < x1; x += step) {
    const w = Math.min(x + step * 0.55, x1);
    d += `L${x} ${y - h}L${w} ${y - h}L${w} ${y}`;
  }
  return d;
}

/**
 * Alov Qülləsi: öndeki kenar dışbükey yükselir, tepe yana kıvrılır, kıvrımın
 * altında içbükey çentik kalır, arka kenar aşağı süzülür.
 */
function flame(cx: number, w: number, h: number, lean: number): string {
  const l = cx - w / 2;
  const r = cx + w / 2;
  const tip = cx + lean;
  return (
    `M${l} ${G}` +
    `C${l - w * 0.06} ${G - h * 0.46}, ${cx - w * 0.42} ${G - h * 0.84}, ${tip} ${G - h}` +
    `C${tip + w * 0.13} ${G - h * 0.93}, ${cx + w * 0.1} ${G - h * 0.84}, ${cx + w * 0.3} ${G - h * 0.6}` +
    `C${r} ${G - h * 0.34}, ${r} ${G - h * 0.14}, ${r} ${G}Z`
  );
}

/** Səkkizguşəli ulduz — 8 uc, 16 təpə. */
function starPath(cx: number, cy: number, outer: number, inner: number): string {
  const p: string[] = [];
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI / 8) * i - Math.PI / 2;
    p.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `M${p.join("L")}Z`;
}

/**
 * Dalğalanan bayraq — düzbucaqlı, üç zolaq dalğanın konturunu izləyir.
 *
 * SADƏ SAXLANILIR: qırışların kölgəsi çıxarıldı və nişan kiçildildi. Parça
 * effekti gözəl idi, amma qalan silüet nazik konturdan ibarətdir — detallı
 * bayraq onların yanında şəkil kimi görünüb diqqəti oğurlayırdı. Fon fon
 * olaraq qalmalıdır.
 *
 * NİŞANIN ÖLÇÜSÜ TƏSADÜFİ DEYİL: aypara qırmızı zolağın hündürlüyündən
 * (fh/3) kənara çıxmamalıdır, ona görə radius fh/6-dan böyük ola bilməz.
 *
 * Dalğa şəkli: dirəkdə sıfır, sərbəst kənara doğru böyüyən sinus. Amplitud
 * sabit olsaydı bayraq dirəkdən qopmuş kimi görünürdü — əsl bayraq dirəyə
 * bağlı kənarda tərpənmir.
 *
 * Aypara və ulduz həmin nöqtədəki YAMACA görə döndürülür; düz qoyulsaydı
 * zolaqlar dalğalanıb nişan sabit qalır, kağızdan kəsilib yapışdırılmış kimi
 * durur.
 */
function wavingFlag(x0: number, y0: number, fw: number, fh: number) {
  const N = 26;
  const amp = fh * 0.19;
  const off = (t: number) =>
    amp * Math.sin(t * Math.PI * 2 * 1.12 + 0.5) * (0.12 + 0.88 * t);

  const edge = (frac: number) => {
    const pts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      pts.push(`${(x0 + t * fw).toFixed(1)} ${(y0 + frac * fh + off(t)).toFixed(1)}`);
    }
    return pts;
  };

  const bands: string[] = [];
  for (let k = 0; k < 3; k++) {
    const top = edge(k / 3);
    const bot = edge((k + 1) / 3).reverse();
    bands.push(`M${top.join("L")}L${bot.join("L")}Z`);
  }

  /**
   * Aypara və ulduz AYRI-AYRI yerləşdirilir, hər biri ÖZ x-indəki dalğaya görə.
   *
   * Əvvəl ikisi bir nöqtə ətrafında birlikdə döndürülürdü; dalğanın yamacı
   * ulduzu yuxarı itələyib mavi zolağa çıxarırdı. Parça dalğalandıqda nişanın
   * hər hissəsi öz altındakı səthlə birlikdə tərpənir.
   */
  const at = (t: number) => {
    const d = 0.02;
    const slope = (off(t + d) - off(t - d)) / (2 * d * fw);
    return {
      x: x0 + t * fw,
      y: y0 + fh / 2 + off(t),
      a: (Math.atan(slope) * 180) / Math.PI,
    };
  };

  return { bands, crescent: at(0.44), star: at(0.6), r: fh * 0.15 };
}

export default function BakuSkyline() {
  const rnd = seeded(20260729);

  // Dövlət Bayrağı Meydanı — dirək + dalğalanan bayraq
  const FLAG = wavingFlag(924, 158, 62, 34);

  // ---- Bakı Gözü ----
  const wx = 806;
  const wy = 244;
  const wr = 50;
  const spokes: string[] = [];
  const cabins: Array<{ x: number; y: number }> = [];
  for (let i = 0; i < 16; i++) {
    const a = (Math.PI / 8) * i;
    const px = wx + wr * Math.cos(a);
    const py = wy + wr * Math.sin(a);
    spokes.push(`M${wx} ${wy}L${px.toFixed(1)} ${py.toFixed(1)}`);
    cabins.push({ x: wx + (wr + 5) * Math.cos(a), y: wy + (wr + 5) * Math.sin(a) });
  }

  // ---- arka plan bina kütlesi: iki sıra, derinlik için ----
  const back: string[] = [];
  for (let x = -20; x < W + 20; x += 44) {
    const h = 54 + rnd() * 76;
    const w = 28 + rnd() * 18;
    back.push(`M${x} ${G}L${x} ${G - h}L${x + w} ${G - h}L${x + w} ${G}Z`);
  }
  const mid: string[] = [];
  for (let x = -30; x < W + 30; x += 74) {
    const h = 32 + rnd() * 46;
    const w = 50 + rnd() * 24;
    mid.push(`M${x} ${G}L${x} ${G - h}L${x + w} ${G - h}L${x + w} ${G}Z`);
  }

  // ---- Heydər Əliyev Mərkəzi pəncərə şəbəkəsi ----
  const hacGrid: string[] = [];
  for (let i = 0; i < 7; i++) {
    const x = 1074 + i * 20;
    hacGrid.push(`M${x} ${G - 8}L${x} ${G - 74 - i * 5}`);
  }

  return (
    <div className="skyline" aria-hidden="true">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice">
        <defs>
          {/* Mavi saat — üstte derin lacivert, ufukta sıcak şehir parıltısı */}
          <linearGradient id="sky-dusk" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0b2a4a" stopOpacity="0" />
            <stop offset="46%" stopColor="#123b63" stopOpacity="0.55" />
            <stop offset="78%" stopColor="#2b5e7d" stopOpacity="0.7" />
            <stop offset="100%" stopColor="#c88a3e" stopOpacity="0.55" />
          </linearGradient>
          <radialGradient id="sky-glow" cx="52%" cy="96%" r="62%">
            <stop offset="0%" stopColor="#f5b84b" stopOpacity="0.4" />
            <stop offset="60%" stopColor="#f97316" stopOpacity="0.11" />
            <stop offset="100%" stopColor="#f97316" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g className="sky-color">
          <rect width={W} height={H} fill="url(#sky-dusk)" />
          <rect width={W} height={H} fill="url(#sky-glow)" />
        </g>

        <path className="sky-back" d={back.join(" ")} />
        <path className="sky-mid" d={mid.join(" ")} />

        <g className="sky-near">
          {/* ---- İçərişəhər surları ---- */}
          <path d={`M40 ${G}L40 268L352 268L352 ${G}`} />
          <path d={merlons(40, 352, 268)} />
          {[84, 172, 310].map((x) => (
            <g key={x}>
              <path d={`M${x} ${G}L${x} 244q0-13 17-13t17 13L${x + 34} ${G}`} />
              <path d={merlons(x, x + 34, 244, 11, 7)} />
            </g>
          ))}

          {/* ---- Qız Qalası ---- */}
          <path d={`M232 ${G}L232 184q0-21 23-21t23 21L278 ${G}`} />
          <path d={`M278 220q31-4 31 35L309 ${G}`} />
          <path d={merlons(230, 280, 184, 12, 8)} />

          {/* ---- minarəli məscid ---- */}
          <path d={`M392 ${G}L392 262L468 262L468 ${G}`} />
          <path d="M400 262q30-46 60 0" />
          <path d="M430 216L430 202" />
          <path d={`M382 ${G}L382 206q0-8 7-8t7 8L396 ${G}`} />
          <path d="M380 206q9-16 18 0" />
          <path d="M389 190L389 178" />
          <path d={`M464 ${G}L464 206q0-8 7-8t7 8L478 ${G}`} />
          <path d="M462 206q9-16 18 0" />
          <path d="M471 190L471 178" />

          {/* ---- Alov Qüllələri ---- */}
          <path d={flame(546, 64, 172, 11)} />
          <path d={flame(622, 72, 212, -13)} />
          <path d={flame(700, 60, 154, 10)} />

          {/* ---- Bakı Gözü ---- */}
          <circle cx={wx} cy={wy} r={wr + 5} />
          <circle cx={wx} cy={wy} r={wr} />
          <circle cx={wx} cy={wy} r={9} />
          <path d={spokes.join("")} />
          <path d={`M${wx - 34} ${G}L${wx - 6} ${wy + 8}M${wx + 34} ${G}L${wx + 6} ${wy + 8}`} />
          <path d={`M${wx - 40} ${G}L${wx + 40} ${G}`} />

          {/* ---- Dövlət Bayrağı Meydanı: dirək + pilləli meydan ---- */}
          <path d={`M918 ${G}L918 152`} />
          <circle cx={918} cy={149} r={3} />
          <path d={`M886 ${G}L892 ${G - 20}L946 ${G - 20}L952 ${G}`} />
          <path d={`M898 ${G - 20}L902 ${G - 34}L936 ${G - 34}L940 ${G - 20}`} />

          {/* ---- Heydər Əliyev Mərkəzi ---- */}
          <path
            d={`M1006 ${G}q4-66 60-88q54-22 86 20q22-52 76-40q56 13 62 108`}
          />
          <path d="M1064 250q46-20 84 20" />
          <path d={hacGrid.join("")} />

          {/* ---- Xalça Muzeyi: bükülü xalça ---- */}
          <path d={`M1272 ${G}L1272 268q0-30 34-30q34 0 34 30L1340 ${G}`} />
          <path d={`M1340 ${G}L1340 286L1408 286L1408 ${G}`} />
          <circle cx={1306} cy={268} r={13} />
          <circle cx={1306} cy={268} r={5} />

          {/* ---- TV qülləsi ---- */}
          <path d={`M1444 ${G}L1452 224M1482 ${G}L1474 224`} />
          <path d="M1446 224q17-26 34 0q-17 13-34 0Z" />
          <path d="M1463 196L1463 104M1463 104L1463 60" />
          <path d="M1454 196q9-15 18 0" />
        </g>

        {/* Bayraq silüetin TƏK rəngli nöqtəsidir — qəsdən. Ayrı qatdadır ki,
            silüetin çizgi rəngi ona təsir etməsin. */}
        <g className="sky-flag">
          <mask id="sky-flag-crescent">
            <rect x={906} y={136} width={110} height={86} fill="black" />
            <circle cx={FLAG.crescent.x} cy={FLAG.crescent.y} r={FLAG.r} fill="white" />
            <circle
              cx={FLAG.crescent.x + FLAG.r * 0.3}
              cy={FLAG.crescent.y}
              r={FLAG.r * 0.8}
              fill="black"
              transform={`rotate(${FLAG.crescent.a} ${FLAG.crescent.x} ${FLAG.crescent.y})`}
            />
          </mask>
          <path d={FLAG.bands[0]} fill="#00B5E2" />
          <path d={FLAG.bands[1]} fill="#EF3340" />
          <path d={FLAG.bands[2]} fill="#509E2F" />
          <rect x={906} y={136} width={110} height={86} fill="#fff" mask="url(#sky-flag-crescent)" />
          <path
            d={starPath(FLAG.star.x, FLAG.star.y, FLAG.r * 0.72, FLAG.r * 0.29)}
            fill="#fff"
            transform={`rotate(${FLAG.star.a} ${FLAG.star.x} ${FLAG.star.y})`}
          />
        </g>

        <g className="sky-cabin">
          {cabins.map((c, i) => (
            <circle key={i} cx={c.x.toFixed(1)} cy={c.y.toFixed(1)} r={3.4} />
          ))}
        </g>
      </svg>
    </div>
  );
}
