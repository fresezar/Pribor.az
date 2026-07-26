import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { MediaModule } from "../media/media.module";
import { ListingsController } from "./listings.controller";
import { ListingsService } from "./listings.service";

/**
 * Piyasa/İlan görünümü modülü (Elanlar). Faz 2'de kullanıcı ilanları
 * (listings tablosu) ve moderasyon akışıyla birleşir; şimdilik salt-okunur
 * scraped_listings piyasa görünümü.
 */
@Module({
  imports: [AuthModule, MediaModule],
  controllers: [ListingsController],
  providers: [ListingsService],
  exports: [ListingsService],
})
export class ListingsModule {}
