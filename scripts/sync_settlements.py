# -*- coding: utf-8 -*-
"""Qəsəbə profil tablosunu scraper → ML paketine üretir.

NEDEN: scraper ve ML ayrı servisler olarak deploy edilir, ortak bir Python
paketi paylaşamazlar. Tablo ikisinde de bulunmak zorunda. Elle kopyalanırsa
eğitim ile servis farklı değerler üretir ve model sessizce saçmalar — bu
betik tek kaynaktan (scraper) üretir.

Kullanım (repo kökünde):
    python scripts/sync_settlements.py

Qəsəbə eklerken/değiştirirken YALNIZCA şurayı düzenle:
    services/scraper/pribor_scraper/normalize/settlements.py
sonra bu betiği çalıştır.
"""

from __future__ import annotations

import io
import sys
from pathlib import Path

if sys.platform == "win32" and hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "services" / "scraper"))

from pribor_scraper.normalize.settlements import ALIASES, SETTLEMENTS  # noqa: E402

TARGET = REPO / "services" / "ml" / "pribor_ml" / "settlements_data.py"

HEADER = '''"""Qəsəbə coğrafi profilleri — OTOMATİK ÜRETİLDİ, elle düzenleme.

Kaynak : services/scraper/pribor_scraper/normalize/settlements.py
Üretim : python scripts/sync_settlements.py

ML servisi ile scraper ayrı deploy edilir; tablo ikisinde de bulunmalı.
Eğitim ve servis aynı değerleri üretmezse model sessizce saçmalar.
"""

from __future__ import annotations

# qəsəbə → (rayon, mərkəzə km, dənizə km, xarakter)
SETTLEMENT_PROFILES: dict[str, tuple[str, float, float, str]] = {
'''


def main() -> None:
    lines = [HEADER]
    for name, p in SETTLEMENTS.items():
        lines.append(f"    {name!r}: ({p.district!r}, {p.center_km}, {p.sea_km}, {p.character!r}),\n")
    lines.append("}\n\nALIASES: dict[str, str] = {\n")
    for alias, target in ALIASES.items():
        lines.append(f"    {alias!r}: {target!r},\n")
    lines.append("}\n")

    TARGET.write_text("".join(lines), encoding="utf-8")
    print(f"✔ {TARGET.relative_to(REPO)} — {len(SETTLEMENTS)} qəsəbə, {len(ALIASES)} alias")


if __name__ == "__main__":
    main()
