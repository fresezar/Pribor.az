import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Docker imajı için kendi kendine yeten çıktı (server.js + minimal node_modules)
  output: "standalone",
  // Monorepo: dosya izleme kökü depo kökü — standalone doğru bağımlılıkları toplasın
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Faz 2'de: i18n (az/ru/en) app-router segment stratejisiyle, ISR ile semt sayfaları
};

export default nextConfig;
