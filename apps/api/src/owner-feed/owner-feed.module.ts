import { Module } from "@nestjs/common";
import { OwnerFeedController } from "./owner-feed.controller";

/** Mülkiyyətçi lenti — salt-okunur; yazıcı services/scraper (owner-feed komutu). */
@Module({ controllers: [OwnerFeedController] })
export class OwnerFeedModule {}
