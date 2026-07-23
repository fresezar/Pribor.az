import ValuationApp from "@/components/ValuationApp";

export default function HomePage() {
  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">PRIBOR<b>.AZ</b></span>
        <span className="beta">MVP · BETA</span>
      </header>

      <section className="hero">
        <h1>
          Bazar dəyərini <span className="flame">10 saniyədə</span> öyrən
        </h1>
        <p>
          Mənzil və ya avtomobilinizin xüsusiyyətlərini daxil edin — süni intellekt
          Bakı bazarının real məlumatları əsasında ədalətli qiymət aralığını hesablasın.
        </p>
      </section>

      <ValuationApp />

      <footer className="note">
        Qiymətləndirmə statistik modelə əsaslanır və rəsmi ekspertiza deyil ·
        Pribor MVP · Bakı, 2026
      </footer>
    </div>
  );
}
