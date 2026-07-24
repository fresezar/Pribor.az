import { Controller, Get } from "@nestjs/common";
import { SkipThrottle } from "@nestjs/throttler";
import { db, sql } from "@pribor/db";

@Controller("health")
@SkipThrottle() // Yük dengeleyici probu rate limit'e takılmasın
export class HealthController {
  @Get()
  async check() {
    let dbStatus = "down";
    try {
      await db.execute(sql`select 1`);
      dbStatus = "up";
    } catch {
      // db kapalıyken health endpoint yine 200 döner; durum gövdede raporlanır
    }
    return {
      status: "ok",
      db: dbStatus,
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
