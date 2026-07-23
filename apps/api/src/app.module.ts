import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuthModule } from "./auth/auth.module";
import { HealthModule } from "./health/health.module";
import { ListingsModule } from "./listings/listings.module";
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
    AuthModule,
    HealthModule,
    ListingsModule,
    ValuationsModule,
  ],
})
export class AppModule {}
