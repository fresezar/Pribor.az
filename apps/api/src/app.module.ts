import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import { ClientIpThrottlerGuard } from "./common/client-ip.guard";
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
    // Sıkı özel limitler dekoratörle: bkz. listings.controller.ts (əlaqə ucu).
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    AuthModule,
    HealthModule,
    ListingsModule,
    ValuationsModule,
  ],
  /*
    Standart ThrottlerGuard yerinə ClientIpThrottlerGuard: `req.ip` proksi
    arxasında Render-in balanslayıcısını göstərir, yəni bütün ziyarətçilər tək
    səbətdə sayılırdı. Səbəb üçün bax: common/client-ip.guard.ts.
  */
  providers: [{ provide: APP_GUARD, useClass: ClientIpThrottlerGuard }],
})
export class AppModule {}
