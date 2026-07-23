import { NestFactory } from "@nestjs/core";
import { Logger } from "@nestjs/common";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix("v1");
  app.enableCors({ origin: process.env.WEB_URL ?? "http://localhost:3000" });
  app.enableShutdownHooks();

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  new Logger("Bootstrap").log(`Pribor API hazır → http://localhost:${port}/v1`);
}

void bootstrap();
