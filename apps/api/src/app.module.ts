import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
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
    // IP başına dakikada 120 istek — kaba kötüye kullanım freni.
    // OTP/SMS açıldığında auth uçlarına daha sıkı özel limit eklenecek.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    HealthModule,
    ListingsModule,
    ValuationsModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
