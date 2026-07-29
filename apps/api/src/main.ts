import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

/**
 * İzin verilen origin'ler.
 *
 * NEDEN DESEN, NEDEN SADECE LİSTE DEĞİL: origin'ler yalnız CORS_ORIGINS
 * ortam değişkeninden okunuyordu. pribor.app alan adı bağlandığında o değişken
 * hâlâ eski Vercel adresini taşıdığı için yeni alan adından gelen HER istek
 * tarayıcıda engellendi — kullanıcı "kod göndərilə bilmədi, server işləyirmi?"
 * hatası aldı, oysa sunucu sağlamdı ve istek ona hiç ulaşmamıştı.
 *
 * Kendi alan adımızın alt alanları ve Vercel önizleme dağıtımları artık
 * kendiliğinden kabul ediliyor: yeni bir alt alan adı açmak, bir ortam
 * değişkenini güncellemeyi hatırlamayı gerektirmiyor.
 *
 * CORS_ORIGINS yine de okunuyor — açık listeyle genişletmek mümkün.
 */
const ALLOWED_HOST_RE =
  /^(([a-z0-9-]+\.)*pribor\.(app|az)|pribor-az-web(-[a-z0-9-]+)?\.vercel\.app|localhost(:\d+)?|127\.0\.0\.1(:\d+)?)$/i;

const EXTRA_ORIGINS = (process.env.CORS_ORIGINS ?? process.env.WEB_URL ?? "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

function corsOrigin(
  origin: string | undefined,
  cb: (err: Error | null, allow?: boolean) => void,
): void {
  // Origin başlığı yok = tarayıcı dışı istemci (curl, mobil, sunucu-sunucu).
  // CORS bir TARAYICI korumasıdır; başlıksız isteği reddetmek kimseyi korumaz.
  if (!origin) return cb(null, true);
  if (EXTRA_ORIGINS.includes(origin)) return cb(null, true);
  try {
    cb(null, ALLOWED_HOST_RE.test(new URL(origin).host));
  } catch {
    cb(null, false);
  }
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("v1");
  app.enableCors({ origin: corsOrigin });
  // İlan fotoğrafları data URI olarak gelir (MVP) — varsayılan 100kb limiti yetmez
  app.use(json({ limit: "16mb" }));
  app.use(urlencoded({ limit: "16mb", extended: true }));
  app.enableShutdownHooks();

  // Render/Railway/Fly gibi platformlar PORT enjekte eder; 0.0.0.0'a bağlan.
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 3001);
  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`Pribor API hazır → :${port}/v1`);
}

void bootstrap();
