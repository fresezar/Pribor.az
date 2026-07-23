"""DB bağlantı ayarı — yalnızca eğitimde (train.py --no-synthetic) kullanılır.
Servis (main.py) DB'ye dokunmaz; kalıcılık NestJS katmanının işidir."""

from __future__ import annotations

import os

database_url: str = os.environ.get(
    "DATABASE_URL", "postgres://pribor:pribor_dev@localhost:5432/pribor"
)
