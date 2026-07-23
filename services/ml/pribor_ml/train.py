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


def make_synthetic(n: int, seed: int = 42) -> pd.DataFrame:
    """Bakü pazarının bilinen etki yönlerini taşıyan sentetik eğitim seti.

    Amaç gerçekçi fiyat üretmek değil; boru hattını (eğitim → artifact →
    servis → SHAP) uçtan uca doğrulamak ve gerçek veri gelene kadar makul
    davranış sergilemektir.
    """
    rng = np.random.default_rng(seed)
    districts = list(_DISTRICT_SQM)
    d = rng.choice(districts, size=n, p=_dirichlet_weights(len(districts), rng))
    rooms = rng.choice([1, 2, 3, 4, 5], size=n, p=[0.15, 0.38, 0.30, 0.13, 0.04])
    area = np.clip(rooms * 32 + rng.normal(8, 14, n), 25, 400).round(0)
    building = rng.choice(["yeni_tikili", "kohne_tikili", "stalinka"], size=n,
                          p=[0.55, 0.38, 0.07])
    repair = rng.choice([0, 1, 2, 3, 4, 5], size=n,
                        p=[0.03, 0.07, 0.12, 0.28, 0.30, 0.20])
    total_floors = rng.integers(4, 25, n)
    floor = np.minimum(rng.integers(1, 25, n), total_floors)
    metro = np.clip(rng.lognormal(6.6, 0.8, n), 60, 8000).round(0)  # ~740 m medyan
    title_deed = rng.random(n) < 0.85

    base = np.array([_DISTRICT_SQM[x] for x in d], dtype=float)
    price = base * area
    price *= 1 + (repair - 3) * 0.06                    # təmir basamağı ±%6
    price *= np.where(building == "yeni_tikili", 1.05,
             np.where(building == "stalinka", 1.08, 0.97))
    price *= np.where(metro < 800, 1.07, np.where(metro > 3000, 0.96, 1.0))
    price *= np.where(title_deed, 1.0, 0.88)            # kupçasız iskonto ~%12
    price *= np.where((floor == 1) | (floor == total_floors), 0.965, 1.0)
    price *= rng.lognormal(0, 0.10, n)                  # piyasa gürültüsü

    df = build_frame([
        {
            "district": d[i], "property_type": "apartment",
            "building_type": building[i], "area_m2": area[i],
            "rooms": rooms[i], "floor": floor[i], "total_floors": total_floors[i],
            "repair_state": repair[i], "title_deed": bool(title_deed[i]),
            "metro_dist_m": metro[i],
        }
        for i in range(n)
    ])
    df["price_azn"] = np.round(price, -2)
    return df


def _dirichlet_weights(k: int, rng: np.random.Generator) -> np.ndarray:
    w = rng.dirichlet(np.full(k, 3.0))
    return w / w.sum()


# ------------------------------------------------------------------- gerçek veri

def load_from_db() -> pd.DataFrame:
    """scraped_listings'ten eğitim seti çeker (aktif + delist edilmiş hepsi —
    delist edilmiş kayıtların son fiyatı 'gerçekleşmiş piyasa' sinyalidir)."""
    import psycopg

    from .settings_db import database_url

    with psycopg.connect(database_url) as conn:
        rows = conn.execute(
            """
            SELECT normalized, price_azn
            FROM scraped_listings
            WHERE vertical = 'real_estate'
              AND price_azn IS NOT NULL
              AND (normalized->>'area_m2') IS NOT NULL
            """
        ).fetchall()
    records = []
    for normalized, price in rows:
        rec = dict(normalized)
        rec["price_azn"] = price
        records.append(rec)
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
            "n_train": int(mask.sum()),
            "n_valid": int((~mask).sum()),
        },
        "trained_at": datetime.now(timezone.utc).isoformat(),
    }
    (out_dir / "metadata.json").write_text(
        json.dumps(metadata, indent=2, ensure_ascii=False), encoding="utf-8")
    return metadata


def main(
    synthetic: bool = typer.Option(True, help="Sentetik veri (DB'siz) / --no-synthetic: DB'den"),
    n: int = typer.Option(20_000, help="Sentetik örnek sayısı"),
    iterations: int = typer.Option(600, help="CatBoost iterasyon üst sınırı"),
    out: Path = typer.Option(ARTIFACTS_DIR, help="Artifact çıktı klasörü"),
) -> None:
    df = make_synthetic(n) if synthetic else load_from_db()
    if len(df) < 500:
        typer.echo(f"Yetersiz eğitim verisi: {len(df)} satır (min 500)")
        raise typer.Exit(1)
    typer.echo(f"Eğitim seti: {len(df)} satır · kaynak: {'sentetik' if synthetic else 'DB'}")
    meta = train(df, out, iterations)
    m = meta["metrics"]
    typer.echo(
        f"✔ {meta['tag']} → {out}\n"
        f"  MAPE(P50): %{m['mape_p50'] * 100:.1f} · "
        f"P10–P90 kapsama: %{m['coverage_p10_p90'] * 100:.1f} · "
        f"n_train: {m['n_train']}"
    )
    # Kalite kapısı hatırlatması (Faz 0 çıkış kriteri: gerçek veride MAPE < %12)
    if not synthetic and m["mape_p50"] > 0.12:
        typer.echo("⚠ MAPE eşiği aşıldı — model prod'a alınmadan incelenmeli")


if __name__ == "__main__":
    typer.run(main)
