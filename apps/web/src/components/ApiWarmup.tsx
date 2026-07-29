"use client";

/**
 * ApiWarmup — sayfa açılır açılmaz API'yi (ve onun üzerinden ML'i) uyandırır.
 *
 * SORUN: barındırma planı hareketsizlikten sonra servisleri uykuya alıyor.
 * İlk istek konteyner açılışını beklediği için uzun sürüyor ve bu gecikme tam
 * da kullanıcının "Qiyməti hesabla" düyməsinə basdığı ana denk geliyor —
 * yəni ürünün en kritik anına.
 *
 * FİKİR: kullanıcının sayfaya girmesiyle formu doldurup göndermesi arasında
 * onlarca saniye var. Web Vercel'de, her zaman hazır. O boşlukta servisleri
 * uyandırırsak kullanıcı beklemeyi hiç görmez.
 *
 * SESSİZ OLMALI: hata yutulur, kullanıcıya hiçbir şey gösterilmez. Uyandırma
 * başarısız olsa bile sayfa normal çalışır, sadece ilk hesaplama yavaş olur —
 * yani şu ankinden kötü değil.
 *
 * SEKME GERİ GELİNCE TEKRAR: kullanıcı sekmeyi açık bırakıp yarım saat sonra
 * dönerse servis yeniden uyumuş olur. `visibilitychange` ucuz bir sigorta.
 */

import { useEffect } from "react";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/** Aynı sekmede gereksiz tekrarı önler — 5 dakikadan sık uyandırmanın anlamı yok */
const MIN_GAP_MS = 5 * 60 * 1000;
let lastWarmAt = 0;

function warm(): void {
  const now = Date.now();
  if (now - lastWarmAt < MIN_GAP_MS) return;
  lastWarmAt = now;
  void fetch(`${API}/v1/health/warm`, {
    cache: "no-store",
    // Sayfa kapanırken de tamamlanabilsin
    keepalive: true,
  }).catch(() => {
    // Sessiz: uyandırma "en iyi çaba"dır
  });
}

export default function ApiWarmup() {
  useEffect(() => {
    warm();
    const onVisible = () => {
      if (document.visibilityState === "visible") warm();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return null;
}
