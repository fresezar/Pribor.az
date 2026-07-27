"""Detay zenginleştirme — liste görünümünde olmayan yapılandırılmış alanlar.

NEDEN AYRI BİR ADIM
-------------------
Liste sorgusu ilan başına ~0 ek maliyetle 24 kayıt döndürür ama `properties`
alanını BOŞ verir; o alan yalnız detay sorgusunda dolu gelir. Yani her kayıt
için bir istek demektir — pahalı. Bu maliyet yalnız gerçekten gerekli olduğu
yerde ödenmelidir:

    mənzil   sahə %100, otaq %100  (başlıkta yazıyor)   → detaya GEREK YOK
    torpaq   sahə  %99             ("6 sot torpaq…")    → detaya GEREK YOK
    həyət evi sahə %10, otaq %54                        → DETAY ŞART

Həyət evi ilanlarında sahə başlıkta yazmaz, elan mətnində de çoğunlukla yoktur
(%67'sinde hiçbir ölçü geçmiyor). Sahəsiz bir ev kaydı fiyat modeline neredeyse
hiçbir şey öğretmez — tahmin semtin medyanına çöker. Detay sorgusu bunu
yapılandırılmış ve kesin biçimde veriyor:

    Sahə, м²      = '150'        Otaq sayı  = '3'
    Əmlakın növü  = 'Həyət evi'  Elan növü  = 'Satış'

TASARIM
-------
Ham katman append-only'dir (bkz. storage.py): var olan dosya DEĞİŞTİRİLMEZ,
zenginleştirilmiş kayıtlar yeni bir koşu dosyasına yazılır. Aynı (site, ext_id)
için ingest upsert yaptığından sonra işlenen dosya kazanır — önce liste
dosyasını, sonra zenginleştirilmiş dosyayı ingest etmek yeterlidir.

Yarıda kesilen koşu güvenlidir: yazılan kayıtlar geçerlidir, tekrar
çalıştırmak kalan kayıtları toplar (`--skip-complete` ile).
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from .models import RawListing
from .sources import REGISTRY
from .storage import make_sink


def _iter_raw(path: Path) -> Iterator[dict[str, Any]]:
    with path.open(encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


def _has_structured_size(payload: dict[str, Any]) -> bool:
    """Bu kayıt zaten yapılandırılmış sahə taşıyor mu (yeniden çekmeye gerek yok)."""
    props = payload.get("props") or {}
    return any("sah" in k.lower() for k in props)


def enrich_run_file(
    raw_file: Path,
    source: str,
    types: tuple[str, ...] = ("house",),
    skip_complete: bool = True,
) -> dict[str, int]:
    """`raw_file`'daki seçili tipleri detay sorgusuyla zenginleştirip yeni
    ham dosyaya yazar. Döndürür: sayaçlar."""
    scraper_cls = REGISTRY[source]
    scraper = scraper_cls(mode="full")  # type: ignore[arg-type]
    fetch = getattr(scraper, "fetch_properties", None)
    if fetch is None:
        raise RuntimeError(f"{source} detay zenginleştirmeyi desteklemiyor")

    stats = {"aday": 0, "zenginleşti": 0, "atlandı": 0, "boş": 0, "hata": 0}
    sink = make_sink(source, scraper.run_id)
    try:
        for doc in _iter_raw(raw_file):
            payload = doc.get("payload") or {}
            if payload.get("property_type_hint") not in types:
                continue
            stats["aday"] += 1
            if skip_complete and _has_structured_size(payload):
                stats["atlandı"] += 1
                continue
            try:
                props = fetch(doc["source_ext_id"])
            except Exception as err:  # ağ/şema hatası tek kaydı düşürsün
                stats["hata"] += 1
                if stats["hata"] <= 5:
                    print(f"[{source}] detay hatası {doc['source_ext_id']}: {err}")
                continue
            if not props:
                stats["boş"] += 1
                continue
            # props normalize hattının beklediği anahtar ("Sahə, м²" → PROP_KEYS_AREA)
            sink.write(RawListing(**{**doc, "payload": {**payload, "props": props}}))
            stats["zenginleşti"] += 1
            if stats["zenginleşti"] % 250 == 0:
                print(f"[{source}] zenginleştirilen: {stats['zenginleşti']}/{stats['aday']}")
    finally:
        sink.close()
        scraper.client.close()
    print(f"[{source}] yeni ham dosya: {sink.rel_key}")
    return stats
