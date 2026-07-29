import SiteHeader from "@/components/SiteHeader";
import ToolsPanel from "@/components/ToolsPanel";
import MarketView from "@/components/MarketView";
import BrandLogo from "@/components/BrandLogo";
import BakuSkyline from "@/components/BakuSkyline";
import AzFlag from "@/components/AzFlag";
import { SupportFab, SupportLine } from "@/components/SupportCorner";

export default function HomePage() {
  return (
    <div className="shell">
      <SiteHeader />

      <section className="hero">
        <BakuSkyline />
        <span className="hero-badge"><span className="dot" aria-hidden /> Süni intellekt · Bakı bazarı</span>
        <h1>
          Bazar dəyərini <span className="flame">10 saniyədə</span> öyrən
        </h1>
        <p>
          Mənzil, həyət evi və ya torpağınızın xüsusiyyətlərini daxil edin — süni
          intellekt Bakı bazarının real məlumatları əsasında ədalətli qiymət
          aralığını hesablasın.
        </p>
      </section>

      <ToolsPanel />

      <MarketView />

      <footer className="note">
        <div className="footer-brand"><BrandLogo size={26} /></div>
        <SupportLine />
        Qiymətləndirmə statistik modelə əsaslanır və rəsmi ekspertiza deyil
        {/* Bayraq bir yerdə, mənşə işarəsi kimi — bozulmadan, tək nüsxə */}
        <span className="origin"><AzFlag height={13} /> Bakı, Azərbaycan · 2026</span>
      </footer>

      <SupportFab />
    </div>
  );
}
