import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { json, urlencoded } from "express";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("v1");
  // Prod'da CORS_ORIGINS (virgülle ayrık) ile kısıtla; yoksa WEB_URL / localhost
  const origins = (process.env.CORS_ORIGINS ?? process.env.WEB_URL ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });
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
