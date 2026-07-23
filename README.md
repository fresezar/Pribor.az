# Pribor — AI Değerleme & İlan Platformu (Faz 0)

Bakü pazarı için gayrimenkul + otomotiv değerleme motoru ve ilan platformunun monorepo'su.
Mimari rehber: bkz. proje artifact'i ("Pribor — Mimari & Ürün Rehberi").

## Yapı

```
pribor/
├── apps/
│   ├── api/          NestJS modüler monolit (Core API)  → :3001/v1
│   └── web/          Next.js 15 (App Router)            → :3000
├── packages/
│   ├── config/       Paylaşılan tsconfig preset'leri
│   ├── contracts/    Zod tip sözleşmeleri (API ↔ web ↔ mobil ↔ ML)
│   └── db/           Drizzle ORM şeması + migration'lar (PostGIS + Timescale)
├── services/
│   ├── ml/           FastAPI değerleme servisi (Faz 0: stub) → :8100
│   └── scraper/      Python veri toplama + AZ/RU normalizasyon
├── infra/db/init/    Docker ilk açılış SQL'i (uzantılar)
└── docker-compose.yml  Postgres(+PostGIS+Timescale) · Redis · Meilisearch · MinIO
```

## Kurulum (ilk kez)

```powershell
# 1. pnpm (Node 20+ ile corepack üzerinden)
corepack enable
corepack prepare pnpm@10.6.0 --activate

# 2. Bağımlılıklar
pnpm install

# 3. Ortam değişkenleri
copy .env.example .env

# 4. Altyapı (Docker Desktop açıkken)
docker compose up -d

# 4-alternatif. Docker YOKSA — taşınabilir Postgres (bu makinede kurulu durumda):
#   .pgdev\pgsql altında PostgreSQL 16.4 + PostGIS 3.6 (gitignore'da, admin gerektirmez)
#   Başlat:  .pgdev\pgsql\bin\pg_ctl.exe -D .pgdev\data -l .pgdev\pg.log start
#   Durdur:  .pgdev\pgsql\bin\pg_ctl.exe -D .pgdev\data stop
#   Not: TimescaleDB bu kurulumda yok → price_snapshots düz tablo olarak çalışır
#   (işlevsel olarak aynı; hypertable optimizasyonu Docker/prod'da uygulanır).

# 5. DB şeması
pnpm db:generate     # Drizzle şemasından SQL migration üretir
pnpm db:migrate      # Migration'ları uygular
# Timescale hypertable (bir kez, migration'lardan SONRA):
docker compose exec -T db psql -U pribor -d pribor -f - < packages/db/sql/timescale.sql

# 6. Geliştirme sunucuları (web :3000 + api :3001)
pnpm dev
```

### Python servisleri

```powershell
# ML stub (:8100)
cd services/ml
python -m venv .venv; .venv\Scripts\activate
pip install -e .
uvicorn pribor_ml.main:app --port 8100 --reload

# Scraper
cd services/scraper
python -m venv .venv; .venv\Scripts\activate
pip install -e .
pribor-scraper sources
pribor-scraper scrape example-site --mode delta
pribor-scraper normalize data/raw/example-site/<tarih>/<run>.jsonl   # dosyaya (DB'siz)
pribor-scraper ingest data/raw/example-site/<tarih>/<run>.jsonl      # PostgreSQL'e
# full koşularda: --run-type full → görünmeyen kayıtlar delist edilir ("satıldı" sinyali)

# MVP demo verisi: 150 sentetik Bakü ilanı, GERÇEK ingest hattından geçer
pribor-scraper seed --n 150
```

### Model eğitimi (CatBoost quantile baseline)

```powershell
cd services/ml
.venv\Scripts\activate
python -m pribor_ml.train --synthetic --n 20000    # sentetik veriyle (DB'siz)
python -m pribor_ml.train --no-synthetic           # scraped_listings'ten (pip install -e ".[db]")
# Çıktı: artifacts/q10.cbm q50.cbm q90.cbm metadata.json
# FastAPI açılışta artifact'i otomatik yükler; yoksa heuristik stub'a düşer.
```

## Uçtan uca duman testi

Üç süreç ayakta iken (db, api, ml):

```powershell
curl http://localhost:3001/v1/health
curl -X POST http://localhost:3001/v1/valuations -H "content-type: application/json" -d "{\"input\":{\"vertical\":\"real_estate\",\"propertyType\":\"apartment\",\"district\":\"Nərimanov\",\"areaM2\":65,\"rooms\":2,\"buildingType\":\"yeni_tikili\",\"repairState\":5,\"metroDistM\":450},\"channel\":\"web\"}"
```

Beklenen: p10/p50/p90 + SHAP benzeri "Qiymət DNT-si" katkıları içeren JSON.

## Mimari ilkeler (kısa)

1. **Ham veri kutsaldır** — scraper çıktısı süzülmeden, immutable JSONL olarak
   saklanır (lokalde `services/scraper/data/raw`, prod'da R2). Normalizasyon
   ayrı aşamadır; sözlük geliştikçe tarih yeniden işlenir.
2. **Modül = gelecekteki servis** — NestJS modülleri (billing, reviews uykuda)
   sınırları ilk günden çizer; `plans.entitlements` JSONB'si sayesinde yeni
   paket tanımlamak kod değil veri işidir.
3. **Sözleşme tek yerde** — `@pribor/contracts` (Zod). NestJS girdi VE ML
   çıktısını aynı şemayla doğrular; web/mobil aynı tipleri import eder.
   `packages/db/src/schema/enums.ts` ile enum'lar el ile senkron tutulur.
4. **Her değerleme bir olaydır** — `valuations` tablosu funnel, model izleme
   ve Qiymət Sertifikatı'nın ham maddesidir; `converted_listing_id` Truva atı
   stratejisinin ölçüm noktasıdır.

## Hukuki not (scraping)

`services/scraper` yalnızca kalıp göstermek için kurgusal bir kaynak içerir.
Gerçek bir siteye yöneltmeden önce: kullanım şartları + yerel mevzuat için
hukuk görüşü alın, hız limitlerine ve robots.txt'e uyun, yalnızca kamuya açık
veriyi toplayın. Stratejik hedef, kaynaklarla resmi veri ortaklığıdır.

## Faz 0 çıkış kriterleri

- [ ] 2 gerçek kaynak için scraper + normalizasyon (sözlük kapsama raporuyla)
- [ ] 50K+ temiz ilan `scraped_listings`'te, fiyat geçmişi `price_snapshots`'ta
- [ ] Dedup kümeleme (telefon + MinHash + pHash) çalışır durumda
- [x] İlk CatBoost quantile modeli eğitildi, stub'ın yerini aldı
      (sentetik veride MAPE %8.6 — gerçek veri hedefi < %12)
- [x] Ingest hattı: raw JSONL → raw_dumps → scraped_listings upsert →
      fiyat değişiminde price_snapshots (idempotent, delist tespitli)
- [ ] `valuations` kalıcı yazımı + model_versions seed'i
