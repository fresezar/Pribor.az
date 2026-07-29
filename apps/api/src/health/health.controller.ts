import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { SkipThrottle } from "@nestjs/throttler";
import { db, sql } from "@pribor/db";

@Controller("health")
@SkipThrottle() // Yük dengeleyici probu rate limit'e takılmasın
export class HealthController {
  constructor(private readonly config: ConfigService) {}

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

  /**
   * Uyandırma — web sayfası açılır açılmaz çağırır (bkz. ApiWarmup.tsx).
   *
   * NEDEN: barındırma planı hareketsizlikten sonra servisi uykuya alır. İlk
   * istek konteyner açılışını beklediği için uzun sürer — ve bu, tam da
   * kullanıcının "Qiyməti hesabla" düyməsinə basdığı ana denk gelir. Oysa
   * sayfaya girmesiyle formu doldurup göndermesi arasında onlarca saniye var.
   * O boşluğu kullanıyoruz: kullanıcı formu doldururken servisler uyanıyor.
   *
   * ML AYRI BİR SERVİSTİR ve kendi uykusu var. Değerləmə zinciri
   * web → API → ML olduğundan yalnız API'yi uyandırmak yarım çözüm olurdu.
   * ML buradan tetikleniyor ki adresi tarayıcıya sızmasın.
   *
   * Yanıt HİÇBİR ŞEYİ BEKLEMEZ: amaç bilgi almak değil, konteyneri kaldırmak.
   * Tarayıcıyı bekletmenin faydası yok — sayfa zaten arka planda çağırıyor.
   */
  @Get("warm")
  warm() {
    const mlUrl = this.config.get<string>("ML_SERVICE_URL") ?? "http://localhost:8100";
    void fetch(`${mlUrl}/health`, { signal: AbortSignal.timeout(120_000) }).catch(() => {
      // "En iyi çaba": ML kapalıysa bile sayfa çalışmaya devam eder
    });
    void db.execute(sql`select 1`).catch(() => {});
    return { warming: true };
  }
}
