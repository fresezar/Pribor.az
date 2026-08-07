import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";
import type { Request } from "express";

/**
 * Sürət limitini GERÇƏK istifadəçiyə görə sayan guard.
 *
 * TAPILAN PROBLEM: standart ThrottlerGuard `req.ip` istifadə edir. Express-də
 * `trust proxy` qapalı olduqda (bizdə belədir) `req.ip` soketin qarşı tərəfidir
 * — Render-in yük balanslayıcısı. Yəni saytа girən BÜTÜN istifadəçilər tək bir
 * səbətdə sayılırdı: dəqiqədə 10 nömrə limiti "hər istifadəçi üçün 10" yox,
 * "bütün sayt üçün 10" demək olardı. Onbirinci ziyarətçi nömrəni görə bilməzdi.
 *
 * Bu, əlaqə ucu əlavə edilməmişdən əvvəl də mövcud idi (ümumi 120/dəq limiti
 * eyni şəkildə saytа bütövlükdə tətbiq olunurdu) — sadəcə say az olduğu üçün
 * heç kim hiss etməmişdi. Limit sıxıldıqca səhv görünən hala gəlirdi.
 *
 * NİYƏ ƏN SAĞDAKI: `X-Forwarded-For` başlığını istəyən hər kəs yaza bilər.
 * Ancaq Render-in proksisi öz gördüyü ünvanı siyahının SONUNA əlavə edir; yəni
 * müştəri "1.1.1.1, 2.2.2.2" göndərsə, sunucuya "1.1.1.1, 2.2.2.2, gerçəkIP"
 * çatır. Ən soldakını götürmək limiti tamamilə işlədən çıxarardı — hər istəkdə
 * uydurma bir ünvan yazıb yeni səbət açmaq olardı. Ən sağdakı isə proksinin
 * özünün yazdığıdır və saxtalaşdırıla bilməz.
 *
 * `TRUSTED_PROXY_HOPS` proksi zənciri uzanarsa (məsələn API-nin qarşısına
 * Cloudflare qoyulsa) sondan neçə addım geriyə gedəcəyimizi deyir. Səhv qoyulsa
 * limit ya çox boş, ya çox sıx olar — ona görə susmuruq, başlanğıcda loga
 * hansı dəyərin işlədiyini yazırıq.
 */
const HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? 1));

/** "1.1.1.1, 2.2.2.2, 3.3.3.3" + hops=1 → "3.3.3.3" */
export function clientIpFrom(req: Request): string {
  const raw = req.headers["x-forwarded-for"];
  const chain = (Array.isArray(raw) ? raw.join(",") : (raw ?? ""))
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (chain.length > 0) {
    const idx = Math.max(0, chain.length - HOPS);
    return chain[idx] as string;
  }
  // Başlıq yoxdursa istək proksidən keçməyib — yerli inkişaf və ya birbaşa
  // əlaqə. Soket ünvanı burada gerçək müştəridir.
  return req.ip ?? req.socket?.remoteAddress ?? "unknown";
}

@Injectable()
export class ClientIpThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Request): Promise<string> {
    return Promise.resolve(clientIpFrom(req));
  }
}
