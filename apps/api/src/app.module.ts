import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { HealthModule } from "./health/health.module";
import { ValuationsModule } from "./valuations/valuations.module";

/**
 * Modüler monolit: her modül gelecekteki bir servisin sınırıdır.
 * Faz planına göre eklenecek modüller:
 *   AuthModule (OTP)  · ListingsModule · SearchModule (Meilisearch)
 *   BillingModule (uykuda) · ReviewsModule (uykuda) · NotificationsModule
 * Yeni modül: `pnpm --filter @pribor/api exec nest g module <ad>`
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ["../../.env", ".env"] }),
    HealthModule,
    ValuationsModule,
  ],
})
export class AppModule {}
