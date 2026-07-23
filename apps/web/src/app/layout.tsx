import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pribor — Bazar dəyərini 10 saniyədə öyrən",
  description:
    "Mənzil və avtomobiliniz üçün süni intellekt ilə ədalətli bazar qiyməti. Bakı bazarının real məlumatları əsasında.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="az">
      <body>{children}</body>
    </html>
  );
}
