import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";

/**
 * Kimlik + yetki (entitlement) modülü. Faz 3'te OTP + JWT ile gerçekleşir;
 * MVP'de mock giriş + rol/abonelik tabanlı ilan limiti. AuthService,
 * entitlement çözümleyici olarak ListingsModule tarafından da kullanılır.
 */
@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
