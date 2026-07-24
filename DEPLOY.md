# Pribor — Deploy Hazırlık Durumu & Rehberi

Bu dosya iki soruyu dürüstçe yanıtlar: **(1) şu an deploy edilebilir mi?**
ve **(2) gerçek kullanıcıya açmadan önce ne yapılmalı?**

## Kısa cevap

**Teknik olarak deploy edilebilir bir demo/beta durumundayız — ama "canlı
ürün" (para toplayan, gerçek kullanıcı verisi tutan) için HENÜZ HAZIR DEĞİL.**

Uçtan uca akış çalışıyor (web → API → ML → Postgres), prod build'ler geçiyor,
Docker paketlemesi ve rate limit hazır. Ancak kimlik doğrulama hâlâ **mock**
(gerçek OTP yok) ve ödeme **demo** (gerçek tahsilat yok). Bu ikisi olmadan
"beta demo" olarak yayınlanır, "ödeme alan platform" olarak yayınlanamaz.

---

## ✅ Hazır olanlar

- **Uçtan uca çalışan akış** — değerleme, ilan verme/düzenleme, comps,
  bazar, arama, roller, limitler; hepsi entegrasyon testleriyle doğrulandı.
- **Prod build'ler geçiyor** — `next build` (standalone çıktı) ve `nest build`
  temiz; web ilk yük ~117 kB.
- **Docker paketleme** — `apps/api/Dockerfile`, `apps/web/Dockerfile`
  (standalone), `services/ml/Dockerfile` + `docker-compose.prod.yml` tek
  komutla tüm yığını ayağa kaldırır.
- **DB göçleri** — Drizzle migration'ları (0000–0002) + PostGIS/Timescale
  init SQL'i. `pnpm db:migrate` idempotent.
- **Rate limit** — IP başına 60 sn'de 120 istek (health muaf). Test edildi:
  121. istek 429.
- **CORS** — `CORS_ORIGINS` ile prod'da kısıtlanabilir.
- **Gizli admin** — rol istemciden alınmıyor; yalnızca `ADMIN_PHONES`.

## ⚠️ Canlıya çıkmadan ÖNCE gerekenler (öncelik sırası)

1. **Gerçek kimlik doğrulama (ZORUNLU).** Şu an `mock-login` herhangi bir
   telefonu doğrulamadan kabul ediyor ve `userId` istemciden geliyor —
   yani biri başkasının userId'siyle onun ilanını silebilir. Gerekli:
   - SMS OTP sağlayıcısı (AZ: Lsim/Atlas SMS vb.) + `otp_codes` akışının
     bağlanması (tablo ve hash mantığı Faz 0'dan hazır).
   - JWT/oturum + NestJS guard; `userId`'nin token'dan alınması (query
     param'dan DEĞİL). Controller'lardaki `requireUser` bu guard'la değişecek.
2. **Gerçek ödeme (para topluyorsak ZORUNLU).** `upgrade` şu an mock.
   Azerbaycan PSP'si (Payriff/Epoint) + webhook imza doğrulaması + `payments`
   tablosuna mutabakat. Şema hazır, entegrasyon yok.
3. **Sırlar & yapılandırma.** `POSTGRES_PASSWORD`, `MEILI_MASTER_KEY`,
   `S3_*` prod değerleri; `.env` asla commit edilmez (gitignore'da).
   Güçlü DB şifresi zorunlu (compose `:?` ile boşsa açılmıyor).
4. **HTTPS + reverse proxy.** Caddy/Nginx ile TLS (Let's Encrypt), web ve
   API'yi tek domain altında (`pribor.az`, `api.pribor.az`).
5. **Yasal (scraping & KVKK).** Kaynak sitelerin şartları + kişisel veri
   (telefon numaraları) için hukuk görüşü. Şu an DB'de yalnızca sentetik
   seed verisi var — gerçek scraping açılmadan bu netleşmeli.
6. **Yedekleme & gözlemlenebilirlik.** Postgres otomatik yedek (pg_dump/WAL),
   hata izleme (Sentry), uptime probu (`/v1/health` hazır).
7. **Fotoğraf depolama.** Şu an ilan fotoğrafları DB'de data URI (jsonb) —
   demo için yeterli, ölçekte R2/MinIO'ya taşınmalı (media tablosu + storage
   key altyapısı hazır, yükleme yolu bağlanacak).

## Deploy adımları (tek VPS, Docker)

```bash
# 1. Sunucuda: Docker + Docker Compose kurulu olmalı
git clone <repo> && cd Pribor_az
cp .env.example .env
#    .env'i DÜZENLE: POSTGRES_PASSWORD, ADMIN_PHONES,
#    NEXT_PUBLIC_API_URL=https://api.pribor.az,
#    CORS_ORIGINS=https://pribor.az

# 2. Tüm yığını kur + başlat (web NEXT_PUBLIC_API_URL'i build'de gömer)
docker compose -f docker-compose.prod.yml up -d --build

# 3. DB göçlerini uygula (ilk kurulumda bir kez)
docker compose -f docker-compose.prod.yml exec api node -e "require('child_process')"
#    veya host'tan:  DATABASE_URL=... pnpm db:migrate
#    (Timescale hypertable için: packages/db/sql/timescale.sql — opsiyonel)

# 4. (Opsiyonel) Model eğit + artifact'i ml volume'una koy; yoksa stub çalışır
# 5. Sağlık kontrolü
curl https://api.pribor.az/v1/health
```

## ⚠️ Bu makinede DOĞRULANMADI

Docker bu geliştirme makinesinde kurulu olmadığından, Dockerfile'lar ve
`docker-compose.prod.yml` **yazıldı ama gerçek imaj build'i ile test EDİLMEDİ**.
İlk sunucu kurulumunda küçük düzeltmeler (COPY yolları, pnpm deploy davranışı)
gerekebilir. Node/pnpm ile yerel prod build'ler (`next build`, `nest build`)
ise başarıyla doğrulandı.

## Özet tablo

| Alan | Durum |
|------|-------|
| Uçtan uca işlevsellik | ✅ Çalışıyor, test edildi |
| Prod build (web/api) | ✅ Geçiyor |
| Docker paketleme | ⚠️ Yazıldı, imaj build'i test edilmedi |
| Rate limit / CORS | ✅ Hazır, test edildi |
| Gerçek kimlik (OTP+JWT) | ❌ Mock — canlı öncesi zorunlu |
| Gerçek ödeme | ❌ Demo — para topluyorsak zorunlu |
| HTTPS / domain / yedek | ❌ Altyapı kurulumu bekliyor |
| Yasal (scraping/KVKK) | ❌ Görüş bekliyor |

**Sonuç:** Kapalı beta / yatırımcı demosu için **bugün** yayınlanabilir.
Gerçek kullanıcıya açık, ödeme alan ürün için yukarıdaki 1–2. maddeler
tamamlanmadan **açılmamalı**.
