import { Module } from "@nestjs/common";
import { ValuationsController } from "./valuations.controller";
import { ValuationsService } from "./valuations.service";

/**
 * Değerleme modülü — akış:
 *   1. Zod ile girdi doğrulama (@pribor/contracts — web/mobil ile aynı şema)
 *   2. ML servisine (FastAPI) proxy
 *   3. Sonucu `valuations` tablosuna kalıcı yazma (her tahmin bir olaydır)
 * Faz 0'da (3) TODO'dur; model_versions seed'i ile birlikte açılır.
 */
@Module({
  controllers: [ValuationsController],
  providers: [ValuationsService],
})
export class ValuationsModule {}
