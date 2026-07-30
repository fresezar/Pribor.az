"use client";

/**
 * ToolsPanel — iki alətin ortak kabuğu, açılıb-yığıla bilən.
 *
 *   Qiymətləndirmə · Nə ala bilərəm?
 *
 * NEDEN AÇILIR-YIĞILIR: panel açıqkən masaüstündə 857px, mobildə 1115px yer
 * tutur; bazar elanları 1394px (mobildə 1651px) aşağıda başlayır. Saytı ikinci
 * dəfə açan istifadəçi elanlara çatmaq üçün hər dəfə uzun bir formu keçmək
 * məcburiyyətində qalırdı.
 *
 * İLK ZİYARƏT AÇIQ, sonrakılar yığılı. Alət yeni gələnin GÖRMƏSİ lazım olan
 * şeydir; qayıdan isə nə istədiyini onsuz da bilir.
 *
 * MODAL DEYİL, YERİNDƏ AÇILIR. Qiymətləndirmə nəticəsi uzundur, sürüşdürülür və
 * "Elan yerləşdir" axınına bağlanır — modal içində o axın sıxışır, mobildə isə
 * modal üstünə modal yığılır. Yerində açılma səhifənin axınını pozmur.
 *
 * YIĞILI HALDA DA NƏ OLDUĞU BİLİNİR: sadəcə "Alətləri aç" düyməsi deyil, hər
 * alətin SUALI görünür. Bir toxunuşla birbaşa istənilən alət açılır — həm nə
 * olduğunu göstərir, həm iki addımı bir addıma endirir.
 *
 * GEÇİŞ: gösterge `layoutId` ile kayar (paylaşılan layout animasyonu), içerik
 * ise YÖNE DUYARLI kayar — sağdaki sekmeye geçerken sağdan, soldakine geçerken
 * soldan gelir. Yön bilgisi olmadan geçiş "bir şey değişti" der ama "nereye
 * gittin" demez; kullanıcı sekme sırasını zihninde kuramaz.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ValuationApp from "./ValuationApp";
import AffordabilityTool from "./AffordabilityTool";

/**
 * `short` — dar ekranda görünen etiket.
 *
 * Ölçüldü: tam adlar 355px yer istiyor, 320px telefonda çubuk 238px. Fark
 * kaydırma çubuğuyla kapatılıyordu; kullanıcı ikinci aləti görmek için yana
 * kaydırmak zorundaydı, yani var olduğunu bilmiyorsa hiç bulamıyordu.
 *
 * `blurb` yalnız yığılı görünüşdə — alətin nə etdiyini bir cümlə ilə deyir.
 */
const TOOLS = [
  {
    key: "valuation",
    label: "Qiymətləndirmə",
    short: "Qiymət",
    hint: "Əmlakınız nə qədər edər?",
    blurb: "Rayon, sahə və otaq sayını yazın — qiymət aralığını göstərək",
  },
  {
    key: "afford",
    label: "Nə ala bilərəm?",
    short: "Büdcə",
    hint: "Büdcənizə nə düşür?",
    blurb: "Büdcənizi sürüşdürün — hansı rayonda neçə m² düşür, görün",
  },
] as const;

type ToolKey = (typeof TOOLS)[number]["key"];

const EASE = [0.22, 1, 0.36, 1] as const;
const SEEN_KEY = "pribor.tools.seen";

export default function ToolsPanel() {
  const [active, setActive] = useState<ToolKey>("valuation");
  const [dir, setDir] = useState(0);
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  /** İlk qurulma istifadəçi hərəkəti deyil — onu animasiyasız edirik */
  const byUser = useRef(false);
  const [lockedH, setLockedH] = useState<number | null>(null);

  /*
    localStorage YALNIZ montajdan sonra oxunur. Render zamanı oxunsaydı server
    və brauzer fərqli nəticə verər, Next hidrasyon uyğunsuzluğu atardı.
  */
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // gizli rejim / bloklanmış storage — ilk ziyarət kimi davran
    }
    if (!seen) {
      setOpen(true);
      try {
        localStorage.setItem(SEEN_KEY, "1");
      } catch {
        /* yazıla bilmirsə hər dəfə açıq gələr — pis davranış deyil */
      }
    }
  }, []);

  const openWith = useCallback((key: ToolKey) => {
    byUser.current = true;
    setActive(key);
    setOpen(true);
    // Açılan içerik ekranın altında qalmasın
    requestAnimationFrame(() =>
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }, []);

  const collapse = useCallback(() => {
    byUser.current = true;
    setOpen(false);
    panelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, []);

  const select = useCallback((key: ToolKey, el?: HTMLElement) => {
    if (key === active) return;
    const from = TOOLS.findIndex((t) => t.key === active);
    const to = TOOLS.findIndex((t) => t.key === key);
    setLockedH(bodyRef.current?.offsetHeight ?? null);
    setDir(to > from ? 1 : -1);
    setActive(key);
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [active]);

  useEffect(() => {
    if (lockedH == null) return;
    const t = setTimeout(() => setLockedH(null), 420);
    return () => clearTimeout(t);
  }, [lockedH, active]);

  const slide = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : {
        initial: { opacity: 0, x: dir * 34, filter: "blur(5px)" },
        animate: { opacity: 1, x: 0, filter: "blur(0px)" },
        exit: { opacity: 0, x: dir * -34, filter: "blur(5px)" },
      };

  return (
    <div
      className={`panel tools-panel${open ? " is-open" : " is-shut"}`}
      id="qiymetlendir"
      ref={panelRef}
    >
      <AnimatePresence initial={false} mode="wait">
        {!open ? (
          /* ---------- YIĞILI: hər alətin sualı görünür ---------- */
          <motion.div
            key="launcher"
            className="tool-launcher"
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
            transition={{ duration: reduce ? 0 : 0.22 }}
          >
            <span className="tl-eyebrow">Pulsuz alətlər</span>
            <div className="tl-cards">
              {TOOLS.map((t, i) => (
                <motion.button
                  key={t.key}
                  type="button"
                  className="tl-card"
                  aria-expanded={false}
                  aria-controls="tool-body"
                  onClick={() => openWith(t.key)}
                  initial={reduce ? false : { opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: reduce ? 0 : 0.32, ease: EASE, delay: reduce ? 0 : i * 0.06 }}
                >
                  <span className="tl-q">{t.hint}</span>
                  <span className="tl-b">{t.blurb}</span>
                  <span className="tl-go" aria-hidden>
                    {t.label}
                    <svg viewBox="0 0 16 16" width="13" height="13">
                      <path d="M6 3l5 5-5 5" fill="none" stroke="currentColor"
                        strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        ) : (
          /* ---------- AÇIQ: sekmələr + gövdə ---------- */
          <motion.div
            key="open"
            initial={reduce || !byUser.current ? false : { height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={reduce ? { opacity: 0 } : { height: 0, opacity: 0 }}
            transition={reduce || !byUser.current ? { duration: 0 } : { duration: 0.42, ease: EASE }}
            style={{ overflow: "hidden" }}
          >
            <div className="tool-bar">
              <div className="tool-tabs" role="tablist" aria-label="Alətlər">
                {TOOLS.map((t) => {
                  const on = t.key === active;
                  return (
                    <button
                      key={t.key}
                      role="tab"
                      aria-selected={on}
                      className={`tool-tab${on ? " on" : ""}`}
                      onClick={(e) => select(t.key, e.currentTarget)}
                    >
                      {on && (
                        <motion.span
                          layoutId="tool-tab-pill"
                          className="tool-tab-pill"
                          aria-hidden
                          transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
                        />
                      )}
                      <span className="tool-tab-label">
                        <span className="tt-full">{t.label}</span>
                        <span className="tt-short">{t.short}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <button type="button" className="tool-shut" onClick={collapse}
                aria-expanded aria-controls="tool-body" title="Alətləri yığ">
                <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden>
                  <path d="M3 10l5-5 5 5" fill="none" stroke="currentColor"
                    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>Yığ</span>
              </button>
            </div>

            <motion.p
              className="tool-hint"
              key={`hint-${active}`}
              initial={reduce ? false : { opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: EASE }}
            >
              {TOOLS.find((t) => t.key === active)!.hint}
            </motion.p>

            <motion.div
              className="tool-body"
              id="tool-body"
              ref={bodyRef}
              animate={lockedH != null ? { minHeight: lockedH } : { minHeight: 0 }}
              transition={{ duration: 0.36, ease: EASE }}
            >
              <AnimatePresence mode="wait" initial={false}>
                <motion.div
                  key={active}
                  initial={slide.initial}
                  animate={slide.animate}
                  exit={slide.exit}
                  transition={{ duration: reduce ? 0.12 : 0.34, ease: EASE }}
                >
                  {active === "valuation" && <ValuationApp scrollTargetRef={panelRef} />}
                  {active === "afford" && <AffordabilityTool />}
                </motion.div>
              </AnimatePresence>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
