"""CatBoost quantile baseline eğitimi — gayrimenkul (Bakü).

Kullanım (services/ml içinde, .venv aktifken):
    # Sentetik veriyle (DB'siz, ilk gün çalışır):
    python -m pribor_ml.train --synthetic --n 20000

    # Gerçek veriyle (scraped_listings dolmaya başlayınca):
    python -m pribor_ml.train --no-synthetic

Çıktılar (services/ml/artifacts/ — gitignore'da):
    q10.cbm, q50.cbm, q90.cbm  — üç quantile modeli
    metadata.json              — sürüm etiketi, feature sırası, metrikler

Neden 3 ayrı Quantile modeli (MultiQuantile değil)? SHAP değerlerini CatBoost'un
native ShapValues'u ile P50 modelinden alıyoruz; MultiQuantile kaybında native
SHAP desteklenmez. Üç küçük model, açıklanabilirlik için ödenen makul bedeldir.
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# Windows konsolu cp1252 açılabilir — Türkçe/AZ karakterler için UTF-8'e zorla
if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

import numpy as np
import pandas as pd
import typer
from catboost import CatBoostRegressor, Pool

from .features import CAT_FEATURES, FEATURE_ORDER, build_frame

ARTIFACTS_DIR = Path(__file__).resolve().parents[1] / "artifacts"

QUANTILES = (0.10, 0.50, 0.90)

# ------------------------------------------------------------------ sentetik

# Semt bazlı taban ₼/m² — sentetik evren; gerçek model bunu veriden öğrenir
_DISTRICT_SQM = {
    "Nərimanov": 2600, "Nəsimi": 2500, "Səbail": 3100, "Yasamal": 2300,
    "Xətai": 2000, "Nizami": 1850, "Binəqədi": 1600, "Sabunçu": 1300,
    "Suraxanı": 1200, "Xəzər": 1250, "Qaradağ": 1000, "Abşeron": 1100,
}
# Torpaq (arsa) ₼/m² tabanı — apartment ₼/m²'nin küçük bir oranı (ham arazi)
_LAND_SQM_FACTOR = 0.28


def _make_apartment(rng, d, base):
    rooms = int(rng.choice([1, 2, 3, 4, 5], p=[0.15, 0.38, 0.30, 0.13, 0.04]))
    area = float(np.clip(rooms * 32 + rng.normal(8, 14), 25, 400).round(0))
    building = str(rng.choice(["yeni_tikili", "kohne_tikili", "stalinka"],
                              p=[0.55, 0.38, 0.07]))
    repair = int(rng.choice([0, 1, 2, 3, 4, 5], p=[0.03, 0.07, 0.12, 0.28, 0.30, 0.20]))
    total_floors = int(rng.integers(4, 25))
    floor = int(min(rng.integers(1, 25), total_floors))
    metro = float(np.clip(rng.lognormal(6.6, 0.8), 60, 8000).round(0))
    title_deed = bool(rng.random() < 0.85)

    price = base * area
    price *= 1 + (repair - 3) * 0.06
    price *= 1.05 if building == "yeni_tikili" else (1.08 if building == "stalinka" else 0.97)
    price *= 1.07 if metro < 800 else (0.96 if metro > 3000 else 1.0)
    price *= 1.0 if title_deed else 0.88
    price *= 0.965 if (floor == 1 or floor == total_floors) else 1.0
    price *= rng.lognormal(0, 0.10)

    rec = {
        "district": d, "property_type": "apartment", "building_type": building,
        "area_m2": area, "rooms": rooms, "floor": floor, "total_floors": total_floors,
        "repair_state": repair, "title_deed": title_deed, "metro_dist_m": metro,
    }
    return rec, price


def _make_house(rng, d, base):
    # Həyət evi: tikili sahəsi büyük, torpaq (sot) belirleyici; bina tipi yok
    rooms = int(rng.choice([3, 4, 5, 6, 7], p=[0.18, 0.30, 0.28, 0.16, 0.08]))
    build_area = float(np.clip(rooms * 45 + rng.normal(20, 40), 80, 900).round(0))
    land_sot = float(np.clip(rng.lognormal(1.6, 0.5), 1.5, 40).round(1))  # ~5 sot medyan
    repair = int(rng.choice([1, 2, 3, 4, 5], p=[0.12, 0.18, 0.30, 0.28, 0.12]))
    metro = float(np.clip(rng.lognormal(7.4, 0.7), 200, 12000).round(0))  # evler daha uzak
    title_deed = bool(rng.random() < 0.80)

    # Fiyat: hem tikili hem torpaq katkısı; ev ₼/m² apartment'tan biraz düşük
    price = base * 0.85 * build_area + base * _LAND_SQM_FACTOR * (land_sot * 100)
    price *= 1 + (repair - 3) * 0.05
    price *= 1.06 if metro < 1000 else 1.0
    price *= 1.0 if title_deed else 0.85            # evlerde sənədsizlik daha sert
    price *= rng.lognormal(0, 0.13)

    rec = {
        "district": d, "property_type": "house", "building_type": None,
        "area_m2": build_area, "land_area_sot": land_sot, "rooms": rooms,
        "repair_state": repair, "title_deed": title_deed, "metro_dist_m": metro,
    }
    return rec, price


def _make_land(rng, d, base):
    # Torpaq: yalnızca sahə + kupça + konum; bina/otaq/təmir yok
    land_sot = float(np.clip(rng.lognormal(2.0, 0.7), 1.0, 100).round(1))  # ~7 sot medyan
    area_m2 = land_sot * 100
    metro = float(np.clip(rng.lognormal(7.8, 0.8), 300, 20000).round(0))
    title_deed = bool(rng.random() < 0.75)

    price = base * _LAND_SQM_FACTOR * area_m2
    price *= 1.08 if metro < 1500 else (0.94 if metro > 6000 else 1.0)
    price *= 1.0 if title_deed else 0.80            # arsada kupça kritik
    price *= rng.lognormal(0, 0.16)                 # arsa fiyatı en gürültülü

    rec = {
        "district": d, "property_type": "land", "building_type": None,
        "area_m2": area_m2, "land_area_sot": land_sot,
        "title_deed": title_deed, "metro_dist_m": metro,
    }
    return rec, price


def make_synthetic(n: int, seed: int = 42) -> pd.DataFrame:
    """Bakü pazarının bilinen etki yönlerini taşıyan sentetik eğitim seti.

    Üç emlak tipi: apartment (~%74), house/həyət evi (~%18), land/torpaq (~%8).
    Amaç gerçekçi fiyat üretmek değil; boru hattını (eğitim → artifact → servis
    → SHAP) uçtan uca doğrulamak ve tipe göre doğru feature davranışını
    (land'de otaq/təmir yok, torpaq sahəsi belirleyici) modele öğretmektir.
    """
    rng = np.random.default_rng(seed)
    districts = list(_DISTRICT_SQM)
    weights = _dirichlet_weights(len(districts), rng)

    records: list[dict] = []
    prices: list[float] = []
    for _ in range(n):
        d = str(rng.choice(districts, p=weights))
        base = float(_DISTRICT_SQM[d])
        kind = rng.choice(["apartment", "house", "land"], p=[0.74, 0.18, 0.08])
        if kind == "apartment":
            rec, price = _make_apartment(rng, d, base)
        elif kind == "house":
            rec, price = _make_house(rng, d, base)
        else:
            rec, price = _make_land(rng, d, base)
        records.append(rec)
        prices.append(price)

    df = build_frame(records)
    df["price_azn"] = np.round(np.array(prices), -2)
    return df


def _dirichlet_weights(k: int, rng: np.random.Generator) -> np.ndarray:
    w = rng.dirichlet(np.full(k, 3.0))
    return w / w.sum()


# ------------------------------------------------------------------- gerçek veri

# Motorun değerlediği tipler: mənzil, torpaq, həyət evi. Obyekt/ofis ve qaraj
# ayrı bir piyasadır (getiriye göre fiyatlanır, m² ile değil) — aynı modele
# konursa ikisini de bozar.
TRAINABLE_TYPES = ("apartment", "house", "land")

# Eğitim seti sağlık filtreleri. Kaynakta 3 AZN'lik "torpaq" ve 37 milyonluk
# ilanlar var: ilki dikkat çekmek için konmuş sahte fiyat, ikincisi tek örneklik
# lüks. İkisi de birer kayıttan fazlasını bozar çünkü quantile kaybı uçlara
# duyarlıdır. Sınırlar geniş tutuldu — amaç veri giriş hatasını elemek,
# piyasayı kırpmak değil.
MIN_PRICE_AZN, MAX_PRICE_AZN = 5_000, 5_000_000
MIN_AREA_M2, MAX_AREA_M2 = 15, 20_000


def _frame_from_records(records: list[dict[str, Any]]) -> pd.DataFrame:
    if not records:
        return pd.DataFrame()
    df = build_frame(records)
    df["price_azn"] = [r["price_azn"] for r in records]
    return df


def _keep(rec: dict[str, Any]) -> bool:
    """Eğitim seti sağlık filtresi — load_from_db'deki SQL koşullarının aynısı.

    Tek yerde tanımlı olması şart: dosyadan ve DB'den eğitim aynı evreni
    görmezse iki model karşılaştırılamaz hale gelir.
    """
    price, area = rec.get("price_azn"), rec.get("area_m2")
    if price is None or area is None:
        return False
    if not (MIN_PRICE_AZN <= price <= MAX_PRICE_AZN):
        return False
    if not (MIN_AREA_M2 <= area <= MAX_AREA_M2):
        return False
    if rec.get("district") is None:
        return False
    if rec.get("property_type") not in TRAINABLE_TYPES:
        return False
    return (rec.get("listing_kind") or "sale") != "rent"


def load_from_files(paths: list[Path]) -> pd.DataFrame:
    """Scraper'ın normalize çıktısından (.normalized.jsonl) eğitim seti kurar.

    DB'siz eğitim yolu: veri kümesi dosyada durduğu için koşu tekrarlanabilir
    ve model, ingest'ten bağımsız olarak yeniden üretilebilir. Aynı ilan birden
    çok dosyada geçerse SONRA gelen kazanır — zenginleştirilmiş kayıtlar
    (sahə/otaq dolu) liste kayıtlarının üzerine yazsın diye.
    """
    merged: dict[str, dict[str, Any]] = {}
    for path in paths:
        with path.open(encoding="utf-8") as fh:
            for line in fh:
                line = line.strip()
                if not line:
                    continue
                rec = json.loads(line)
                key = f"{rec.get('source_site')}:{rec.get('source_ext_id')}"
                merged[key] = rec
    return _frame_from_records([r for r in merged.values() if _keep(r)])


def load_from_db() -> pd.DataFrame:
    """scraped_listings'ten eğitim seti çeker (aktif + delist edilmiş hepsi —
    delist edilmiş kayıtların son fiyatı 'gerçekleşmiş piyasa' sinyalidir).

    Filtreler, her biri gerçek veride ölçülmüş bir bozulmayı önler:

    listing_kind <> 'rent'  Kategoriler kiralık ilanları da döndürüyordu;
        mənzillərin %36'sı kiralıktı (medyan 550 ₼ / 140.000 ₼). Kaynakta
        filtreleniyor ama eski kayıtlar da bu tablodan geçiyor.
    district IS NOT NULL    Rayon sözlüğü yalnız Bakı rayonlarını tanır;
        boş olması ilanın Bakı dışı olduğu (Qusar, Şəki) ya da konumun
        okunamadığı anlamına gelir. İkisi de Bakı modelini kirletir.
    property_type           Yalnız değerlediğimiz üç tip.
    fiyat/sahə aralığı      Veri giriş hatalarını eler.
    """
    import psycopg

    from .settings_db import database_url

    with psycopg.connect(database_url) as conn:
        rows = conn.execute(
            """
            SELECT normalized, price_azn
            FROM scraped_listings
            WHERE vertical = 'real_estate'
              AND price_azn BETWEEN %(pmin)s AND %(pmax)s
              AND (normalized->>'area_m2')::float BETWEEN %(amin)s AND %(amax)s
              AND normalized->>'district' IS NOT NULL
              AND normalized->>'property_type' = ANY(%(types)s)
              AND coalesce(normalized->>'listing_kind', 'sale') <> 'rent'
            """,
            {
                "pmin": MIN_PRICE_AZN, "pmax": MAX_PRICE_AZN,
                "amin": MIN_AREA_M2, "amax": MAX_AREA_M2,
                "types": list(TRAINABLE_TYPES),
            },
        ).fetchall()
    records = []
    for normalized, price in rows:
        rec = dict(normalized)
        rec["price_azn"] = price
        records.append(rec)
    if not records:
        return pd.DataFrame()
    df = build_frame(records)
    df["price_azn"] = [r["price_azn"] for r in records]
    return df


# ---------------------------------------------------------------------- eğitim

def train(df: pd.DataFrame, out_dir: Path, iterations: int, seed: int = 42) -> dict:
    # Aşırı uçları kırp — veri giriş hatası ve lüks segment gürültüsü
    lo, hi = df["price_azn"].quantile([0.005, 0.995])
    df = df[(df["price_azn"] >= lo) & (df["price_azn"] <= hi)].reset_index(drop=True)

    rng = np.random.default_rng(seed)
    mask = rng.random(len(df)) < 0.85
    X_cols = FEATURE_ORDER
    train_pool = Pool(df.loc[mask, X_cols], df.loc[mask, "price_azn"],
                      cat_features=CAT_FEATURES)
    valid_pool = Pool(df.loc[~mask, X_cols], df.loc[~mask, "price_azn"],
                      cat_features=CAT_FEATURES)

    out_dir.mkdir(parents=True, exist_ok=True)
    preds: dict[float, np.ndarray] = {}
    for q in QUANTILES:
        model = CatBoostRegressor(
            loss_function=f"Quantile:alpha={q}",
            iterations=iterations,
            learning_rate=0.08,
            depth=8,
            random_seed=seed,
            verbose=False,
            allow_writing_files=False,
        )
        model.fit(train_pool, eval_set=valid_pool,
                  early_stopping_rounds=50, use_best_model=True)
        model.save_model(str(out_dir / f"q{int(q * 100)}.cbm"))
        preds[q] = model.predict(valid_pool)
        print(f"  q{q:.2f}: {model.tree_count_} ağaç")

    y = df.loc[~mask, "price_azn"].to_numpy()
    # Quantile crossing düzeltmesi değerlendirmede de uygulanır (servisle tutarlı)
    stacked = np.sort(np.vstack([preds[q] for q in QUANTILES]), axis=0)
    p10, p50, p90 = stacked
    mape = float(np.mean(np.abs(p50 - y) / y))
    coverage = float(np.mean((y >= p10) & (y <= p90)))

    # --- aralık genişliği: ürün hedefi P10–P90 bandının dar olması ---
    # Bandı zorla daraltmıyoruz (kalibrasyon bozulur, coverage düşer); ne kadar
    # dar OLDUĞUNU ölçüp raporluyoruz. Hedef: bandın P50'ye oranı ≤ %10 —
    # yaygın segmentlerde ulaşılabilir, nadir segmentlerde dürüstçe genişler.
    rel_width = (p90 - p10) / np.maximum(p50, 1)
    band_within_10pct = float(np.mean(rel_width <= 0.10))
    band_azn = p90 - p10

    # --- tip bazında doğruluk ---
    # Toplam MAPE yanıltıcıdır: üç emlak tipi tek sayıya karıştığında zayıf
    # segment güçlüsünü gizler ya da tersi. Torpaq ₼/m²'si mənzilin 1/20'si
    # ve kendi içinde 400 kat yayılıyor; ortalama mutlak yüzde hata birkaç
    # ucuz arsada patlayıp toplamı ele geçiriyor. O yüzden hem ORTALAMA hem
    # MEDYAN yüzde hata, tip kırılımıyla birlikte raporlanıyor — hangi
    # segmentin ürüne konulabilir olduğuna bakarak karar veriyoruz.
    ape = np.abs(p50 - y) / y
    types = df.loc[~mask, "property_type"].to_numpy()
    per_type: dict[str, dict[str, float]] = {}
    for pt in np.unique(types):
        i = types == pt
        per_type[str(pt)] = {
            "n": int(i.sum()),
            "mape": round(float(np.mean(ape[i])), 4),
            "mdape": round(float(np.median(ape[i])), 4),
            "coverage": round(float(np.mean((y[i] >= p10[i]) & (y[i] <= p90[i]))), 4),
            "band_rel_median": round(float(np.median(rel_width[i])), 4),
            "band_azn_median": int(np.median(band_azn[i])),
        }

    tag = f"re-catboost-q-{datetime.now(timezone.utc).strftime('%Y.%m.%d')}"
    metadata = {
        "tag": tag,
        "vertical": "real_estate",
        "algo": "catboost_quantile",
        "quantiles": list(QUANTILES),
        "feature_order": FEATURE_ORDER,
        "cat_features": CAT_FEATURES,
        "metrics": {
            "mape_p50": round(mape, 4),
            "coverage_p10_p90": round(coverage, 4),
            # Ürün hedefi: aralık P50'nin %10'unu aşmasın (bkz. yukarıdaki not)
            "band_rel_median": round(float(np.median(rel_width)), 4),
            "band_within_10pct": round(band_within_10pct, 4),
            "band_azn_median": int(np.median(band_azn)),
            "mdape_p50": round(float(np.median(ape)), 4),
            "n_train": int(mask.sum()),
            "n_valid": int((~mask).sum()),
        },
        "metrics_by_type": per_type,
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return metadata


def main(
    synthetic: bool = typer.Option(True, help="Sentetik veri (DB'siz) / --no-synthetic: DB'den"),
    files: list[Path] = typer.Option(
        [], "--file",
        help="Normalize JSONL (.normalized.jsonl) — DB yerine dosyadan eğit. "
             "Birden çok verilebilir; sonraki dosya öncekini ezer."),
    n: int = typer.Option(20_000, help="Sentetik örnek sayısı"),
    iterations: int = typer.Option(600, help="CatBoost iterasyon üst sınırı"),
    out: Path = typer.Option(ARTIFACTS_DIR, help="Artifact çıktı klasörü"),
) -> None:
    if files:
        df, source = load_from_files(files), f"dosya ({len(files)})"
    elif synthetic:
        df, source = make_synthetic(n), "sentetik"
    else:
        df, source = load_from_db(), "DB"
    synthetic = source == "sentetik"
    if len(df) < 500:
        typer.echo(f"Yetersiz eğitim verisi: {len(df)} satır (min 500)")
        raise typer.Exit(1)
    typer.echo(f"Eğitim seti: {len(df)} satır · kaynak: {source}")
    meta = train(df, out, iterations)
    m = meta["metrics"]
    typer.echo(
        f"✔ {meta['tag']} → {out}\n"
        f"  MAPE(P50): %{m['mape_p50'] * 100:.1f} · "
        f"medyan hata: %{m['mdape_p50'] * 100:.1f} · "
        f"P10–P90 kapsama: %{m['coverage_p10_p90'] * 100:.1f} · "
        f"n_train: {m['n_train']}"
    )
    typer.echo(f"  {'tip':<12}{'n':>6}{'medyan hata':>13}{'ort. hata':>11}"
               f"{'kapsama':>9}{'band/P50':>10}")
    for pt, s in sorted(meta["metrics_by_type"].items(), key=lambda kv: -kv[1]["n"]):
        typer.echo(f"  {pt:<12}{s['n']:>6}{s['mdape'] * 100:>12.1f}%"
                   f"{s['mape'] * 100:>10.1f}%{s['coverage'] * 100:>8.1f}%"
                   f"{s['band_rel_median'] * 100:>9.1f}%")
    # Kalite kapısı hatırlatması (Faz 0 çıkış kriteri: gerçek veride MAPE < %12)
    if not synthetic and m["mape_p50"] > 0.12:
        typer.echo("⚠ MAPE eşiği aşıldı — model prod'a alınmadan incelenmeli")


if __name__ == "__main__":
    typer.run(main)
