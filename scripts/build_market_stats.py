"""Toplanan ilanlardan TOPLU piyasa istatistiği üretir (ilan DEĞİL, medyan).

    python scripts/build_market_stats.py

Girdi : services/scraper/data/raw/tap.az/<tarih>/*.jsonl
Çıktı : packages/contracts/src/market-stats.ts

NEDEN BÖYLE: `Nə ala bilərəm?` ve `Kirayə gəlirliliyi` alətlərinin ihtiyacı olan
tek şey rayon/qəsəbə bazında medyan ₼/m² değeridir — tek tek ilanlar değil.
Toplanan ilanlar üründe hiçbir yerde gösterilmiyor (bkz. listings.service.ts);
bu betik o veriden yalnız istatistik damıtır. İstatistik yayınlamak başka,
başkasının ilanını yayınlamak başka.

TASARIM KARARLARI
  · Tablo derlenmiş dosyaya gömülür (~40 satır) — alətler anında cevap verir,
    her tuş vuruşunda API'ye gidilmez, motor da dışa bağımlı kalmaz.
  · MIN_SAMPLE altındaki kırılımlar TABLOYA HİÇ GİRMEZ. Kira örneklemi satıştan
    çok daha ince (Suraxanı 27, Abşeron 76); 12 ilandan rayon medyanı üretmek
    kullanıcıyı yanıltır. Az örnekli yerde alət "məlumat azdır" demeli.
  · Günlük kiralanan bağ evleri elenir — aylık kira ile karıştırılırsa getiri
    hesabı on kat şişer.
"""

from __future__ import annotations

import glob
import json
import os
import re
import statistics
import sys
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "services" / "scraper"))

from pribor_scraper.models import RawListing  # noqa: E402
from pribor_scraper.normalize.real_estate import normalize_real_estate  # noqa: E402

OUT = REPO / "packages" / "contracts" / "src" / "market-stats.ts"

# Bir kırılımın tabloya girmesi için gereken en az ilan sayısı.
# Satışta bol, kirada kıt olduğu için ayrı eşikler.
MIN_SALE, MIN_RENT = 40, 25
MIN_SALE_SET, MIN_RENT_SET = 25, 12

TYPES = ("apartment", "house")
# "Günlük", "sutkalıq" kiralar aylık değildir — getiri hesabını bozar
DAILY_RE = re.compile(r"g[üu]nl[üu]k|sutka|posutochno|günü", re.I)

# MÖVSÜMİ (yazlıq) icarə — Abşeron sahilindeki bağ evleri yaz ayları için aylık
# fiyatlanır ve yıl boyu kiraya göre 5-7 kat pahalıdır ("İyun, iyul, avqust
# 1 ayı 5200"). Uzun dönem kira sayılırsa Xəzər həyət evi getirisi %20 çıkıyordu
# — emlakta imkânsız bir rakam ve aracın güvenilirliğini bitirir.
SEASONAL_RE = re.compile(
    r"iyun|iyul|avqust|sentyabr|mövsüm|movsum|istirahət|istirahet"
    r"|hovuz|basseyn|бассейн|villa\s*(icar|kiray)|premium\s*(bağ|bag)",
    re.I,
)

# Gerçekçilik bandı — son savunma hattı. Yaşayış əmlakında illik gəlirlilik
# dünyada da %2–8 aralığındadır; bizim rayonlarımız %3,8–5,6 arasında çıkıyor.
# Bu bandın dışına çıkan bir kırılım, kira örnekleminin satışla KIYASLANABİLİR
# OLMADIĞINI söyler (mövsümi, ticari ya da yanlış fiyatlanmış). Rakamı düzeltmek
# yerine kira tarafını hiç yayınlamıyoruz — uydurma sayı, eksik sayıdan kötüdür.
YIELD_MIN, YIELD_MAX = 1.5, 9.0


def collect() -> tuple[dict, dict, dict, dict, str]:
    dates = sorted(glob.glob(str(REPO / "services/scraper/data/raw/tap.az/*")))
    if not dates:
        raise SystemExit("Ham veri bulunamadı — önce `pribor-scraper scrape tap.az` koşun")
    latest = dates[-1]
    rows: dict[str, dict] = {}
    for f in sorted(glob.glob(os.path.join(latest, "*.jsonl")), key=os.path.getmtime):
        with open(f, encoding="utf-8") as fh:
            for line in fh:
                r = json.loads(line)
                rows[r["source_ext_id"]] = r

    sale_d, rent_d = defaultdict(list), defaultdict(list)
    sale_s, rent_s = defaultdict(list), defaultdict(list)
    for r in rows.values():
        p = r["payload"]
        if p.get("region") != "Bakı":
            continue
        raw = RawListing(**{k: r[k] for k in
                            ("source_site", "source_ext_id", "url", "vertical_hint", "payload")})
        n = normalize_real_estate(raw)
        d, t, a, price = n.district, n.property_type, n.area_m2, n.price_azn
        if not d or not a or not price or t not in TYPES:
            continue
        if n.listing_kind == "rent":
            text = (p.get("title") or "") + " " + (p.get("description") or "")
            if DAILY_RE.search(text) or SEASONAL_RE.search(text):
                continue
            if not (50 <= price <= 20_000) or not (20 <= a <= 600):
                continue
            rent_d[(d, t)].append(price / a)
            if n.settlement:
                rent_s[(n.settlement, t)].append(price / a)
        else:
            if not (20_000 <= price <= 5_000_000) or not (20 <= a <= 1000):
                continue
            sale_d[(d, t)].append(price / a)
            if n.settlement:
                sale_s[(n.settlement, t)].append(price / a)
    return sale_d, rent_d, sale_s, rent_s, os.path.basename(latest)


def rows_for(sale, rent, min_sale, min_rent, label: str) -> list[dict]:
    out = []
    for (name, t), sv in sale.items():
        if len(sv) < min_sale:
            continue
        rv = rent.get((name, t), [])
        entry = {
            "name": name, "type": t,
            "sqmSale": round(statistics.median(sv)),
            "nSale": len(sv),
        }
        # Kira tarafı ayrı eşikte: satışı yeterli ama kirası az olan yerler
        # tabloda kalır, yalnız gəlirlilik alanı boş gelir.
        if len(rv) >= min_rent:
            sqm_rent = round(statistics.median(rv), 1)
            y = sqm_rent * 12 / entry["sqmSale"] * 100
            if YIELD_MIN <= y <= YIELD_MAX:
                entry["sqmRent"] = sqm_rent
                entry["nRent"] = len(rv)
            else:
                # Bandın dışı = kira örneklemi satışla kıyaslanabilir değil.
                print(f"  ⚠ {label} {name} ({t}): gəlirlilik %{y:.1f} — "
                      f"bandın dışında, kirayə yayımlanmır (n={len(rv)})")
        out.append(entry)
    return sorted(out, key=lambda e: (e["type"], -e["nSale"]))


def ts_literal(e: dict) -> str:
    parts = [f'name: {json.dumps(e["name"], ensure_ascii=False)}',
             f'type: "{e["type"]}"',
             f'sqmSale: {e["sqmSale"]}', f'nSale: {e["nSale"]}']
    if "sqmRent" in e:
        parts += [f'sqmRent: {e["sqmRent"]}', f'nRent: {e["nRent"]}']
    return "  { " + ", ".join(parts) + " },"


def main() -> None:
    sale_d, rent_d, sale_s, rent_s, date = collect()
    districts = rows_for(sale_d, rent_d, MIN_SALE, MIN_RENT, "rayon")
    settlements = rows_for(sale_s, rent_s, MIN_SALE_SET, MIN_RENT_SET, "qəsəbə")

    body = f'''/**
 * Bakı bazar statistikası — OTOMATİK ÜRETİLDİ, elle düzenlemeyin.
 *
 * Üretim : python scripts/build_market_stats.py
 * Kaynak : {date} tarixli Bakı taraması (tap.az)
 * Üretildi: {datetime.now(timezone.utc).strftime("%Y-%m-%d")}
 *
 * Bunlar İLAN DEĞİL, medyan istatistiktir. Toplanan ilanlar üründe hiçbir yerde
 * gösterilmez; bu tablo o veriden damıtılmış toplu değerlerdir.
 *
 * Örneklemi yetersiz kırılımlar tabloya HİÇ girmez — 12 ilandan rayon medyanı
 * üretmek kullanıcıyı yanıltır. `sqmRent` yoksa o bölgede aylıq kirayə örneği
 * güvenilir sayıda değildir ve gəlirlilik hesaplanamaz.
 *
 * Qiymətlər İSTƏNİLƏN qiymətlərdir (elan qiyməti), satılan qiymət deyil.
 */

export type MarketStat = {{
  /** Rayon və ya qəsəbə adı */
  name: string;
  type: "apartment" | "house";
  /** Medyan satış qiyməti, ₼/m² */
  sqmSale: number;
  nSale: number;
  /** Medyan aylıq kirayə, ₼/m² — örnəklem azdırsa yoxdur */
  sqmRent?: number;
  nRent?: number;
}};

export const MARKET_BY_DISTRICT: MarketStat[] = [
{chr(10).join(ts_literal(e) for e in districts)}
];

export const MARKET_BY_SETTLEMENT: MarketStat[] = [
{chr(10).join(ts_literal(e) for e in settlements)}
];

/** İllik kirayə gəlirliliyi, %. Kirayə örnəkləmi yoxdursa null. */
export function annualYield(s: MarketStat): number | null {{
  if (s.sqmRent == null) return null;
  return (s.sqmRent * 12) / s.sqmSale * 100;
}}

/** Bir bölgə üçün statistika; tapılmazsa undefined. */
export function statFor(
  name: string,
  type: MarketStat["type"],
  scope: "district" | "settlement" = "district",
): MarketStat | undefined {{
  const table = scope === "district" ? MARKET_BY_DISTRICT : MARKET_BY_SETTLEMENT;
  return table.find((s) => s.name === name && s.type === type);
}}
'''
    OUT.write_text(body, encoding="utf-8")
    nd_rent = sum(1 for e in districts if "sqmRent" in e)
    ns_rent = sum(1 for e in settlements if "sqmRent" in e)
    print(f"✔ {OUT.relative_to(REPO)}")
    print(f"  rayon    : {len(districts)} sətir ({nd_rent}-də kirayə var)")
    print(f"  qəsəbə   : {len(settlements)} sətir ({ns_rent}-də kirayə var)")


if __name__ == "__main__":
    main()
