/**
 * Faz 0 yer tutucusu. Faz 1'de buraya gelecekler:
 *  - Sihirbaz akışı (ekran başına tek soru) → POST /v1/valuations
 *  - "Wow" sonuç ekranı: odometre sayaç, Qiymət DNT-si, comps, semt trendi
 *  - Tasarım sistemi packages/ui altına taşınır (Tailwind + Motion)
 */
export default function HomePage() {
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        background: "#0A161D",
        color: "#E6EFF2",
        textAlign: "center",
        padding: 24,
      }}
    >
      <div>
        <p style={{ letterSpacing: "0.2em", fontSize: 13, color: "#2BA69E" }}>PRIBOR.AZ</p>
        <h1 style={{ fontSize: 40, margin: "8px 0", letterSpacing: "-0.02em" }}>
          Bazar dəyərini <span style={{ color: "#E8603A" }}>10 saniyədə</span> öyrən
        </h1>
        <p style={{ color: "#8FA6AE", maxWidth: 480, margin: "0 auto" }}>
          Faz 0 iskeleti çalışıyor. Değerleme sihirbazı ve sonuç ekranı Faz 1&apos;de bu
          sayfanın yerini alacak.
        </p>
      </div>
    </main>
  );
}
