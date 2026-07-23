import SiteHeader from "@/components/SiteHeader";
import ValuationApp from "@/components/ValuationApp";
import MarketView from "@/components/MarketView";
import { SupportFab, SupportLine } from "@/components/SupportCorner";

export default function HomePage() {
  return (
    <div className="shell">
      <SiteHeader />

      <section className="hero">
        <h1>
          Bazar dəyərini <span className="flame">10 saniyədə</span> öyrən
        </h1>
        <p>
          Mənzil, həyət evi və ya torpağınızın xüsusiyyətlərini daxil edin — süni
          intellekt Bakı bazarının real məlumatları əsasında ədalətli qiymət
          aralığını hesablasın.
        </p>
      </section>

      <ValuationApp />

      <MarketView />

      <footer className="note">
        <SupportLine />
        Qiymətləndirmə statistik modelə əsaslanır və rəsmi ekspertiza deyil ·
        Pribor MVP · Bakı, 2026
      </footer>

      <SupportFab />
    </div>
  );
}
