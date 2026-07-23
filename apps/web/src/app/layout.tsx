import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/components/AuthContext";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pribor — Bazar dəyərini 10 saniyədə öyrən",
  description:
    "Mənzil, həyət evi və torpaq üçün süni intellekt ilə ədalətli bazar qiyməti. Bakı bazarının real məlumatları əsasında.",
};

/**
 * Tema ilk boyamadan ÖNCE uygulanır — aksi halde koyu tema bir kare
 * görünüp açık temaya atlar (flash of wrong theme).
 */
const THEME_INIT = `try{var t=localStorage.getItem("pribor.theme");if(t)document.documentElement.dataset.theme=t;}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="az" data-theme="dark">
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
