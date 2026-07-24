"use client";

/** APK indirme onay modalı — dosya doğrudan inmez, önce kullanıcı onaylar. */

import Portal from "./Portal";

export default function ApkDownloadModal(props: {
  open: boolean;
  onClose: () => void;
}) {
  if (!props.open) return null;

  const download = () => {
    const a = document.createElement("a");
    a.href = "/download/pribor-demo.apk";
    a.download = "pribor-demo.apk";
    document.body.appendChild(a);
    a.click();
    a.remove();
    props.onClose();
  };

  return (
    <Portal>
    <div className="modal-overlay" onMouseDown={props.onClose}>
      <div className="modal apk-modal" role="dialog" aria-modal="true"
        aria-label="Tətbiqi endir" onMouseDown={(e) => e.stopPropagation()}>
        <button className="modal-x" onClick={props.onClose} aria-label="Bağla">✕</button>
        <div className="apk-hero" aria-hidden>🤖</div>
        <h2 className="modal-h">Android tətbiqini endirmək istədiyinizdən əminsiniz?</h2>
        <p className="modal-sub">
          Fayl cihazınıza yüklənəcək. Quraşdırmaq üçün “naməlum mənbələrə” icazə
          vermək lazım ola bilər.
          <br />
          <small style={{ color: "var(--faint)" }}>
            Demo mərhələsi — imzalanmış buraxılış Faz 3-də təqdim olunacaq.
          </small>
        </p>
        <button className="cta" onClick={download}>Bəli, endir ↓</button>
        <button className="link-btn" onClick={props.onClose}>İmtina</button>
      </div>
    </div>
    </Portal>
  );
}
