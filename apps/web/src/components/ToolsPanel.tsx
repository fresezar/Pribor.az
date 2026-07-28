"use client";

/**
 * ToolsPanel — üç alətin ortak kabuğu.
 *
 *   Qiymətləndirmə · Nə ala bilərəm? · Kirayə gəlirliliyi
 *
 * NEDEN TEK PANEL: üçü de aynı soruyu farklı yönlerden soruyor ("bu əmlak nə
 * qədər edər / bu pula nə düşər / bu əmlak nə qazandırar"). Ayrı sayfalara
 * bölmek kullanıcıyı gezinmeye zorlardı; sekme, aralarında gidip gelmeyi
 * bedavaya indiriyor.
 *
 * GEÇİŞ: gösterge `layoutId` ile kayar (paylaşılan layout animasyonu), içerik
 * ise YÖNE DUYARLI kayar — sağdaki sekmeye geçerken sağdan, soldakine geçerken
 * soldan gelir. Yön bilgisi olmadan geçiş "bir şey değişti" der ama "nereye
 * gittin" demez; kullanıcı sekme sırasını zihninde kuramaz.
 *
 * Panel yüksekliği de animasyonlu: alətlerin içerik boyu çok farklı, ölçmeden
 * geçiş yapılırsa sayfa zıplar ve altındaki bölüm yerinden oynar.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import ValuationApp from "./ValuationApp";
import AffordabilityTool from "./AffordabilityTool";
import YieldTool from "./YieldTool";

const TOOLS = [
  { key: "valuation", label: "Qiymətləndirmə", hint: "Əmlakınız nə qədər edər?" },
  { key: "afford", label: "Nə ala bilərəm?", hint: "Büdcənizə nə düşür?" },
  { key: "yield", label: "Kirayə gəlirliliyi", hint: "Kirayə versəniz nə qazanarsınız?" },
] as const;

type ToolKey = (typeof TOOLS)[number]["key"];

const EASE = [0.22, 1, 0.36, 1] as const;

export default function ToolsPanel() {
  const [active, setActive] = useState<ToolKey>("valuation");
  const [dir, setDir] = useState(0);
  const reduce = useReducedMotion();

  const panelRef = useRef<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Geçiş sırasında yükseklik sıçramasın: çıkan içeriğin boyu kilitlenir,
  // gireni ölçülüp aradaki fark yumuşatılır.
  const [lockedH, setLockedH] = useState<number | null>(null);

  const select = useCallback((key: ToolKey, el?: HTMLElement) => {
    if (key === active) return;
    const from = TOOLS.findIndex((t) => t.key === active);
    const to = TOOLS.findIndex((t) => t.key === key);
    setLockedH(bodyRef.current?.offsetHeight ?? null);
    setDir(to > from ? 1 : -1);
    setActive(key);
    // Dar ekranda sekme çubuğu yatay kayıyor; seçilen sekme yarı kırpık kalırsa
    // kullanıcı hangi alətte olduğunu okuyamaz.
    el?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [active]);

  // Yeni içerik yerleştikten sonra kilidi bırak — bundan sonrası doğal akış
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
    <div className="panel tools-panel" id="qiymetlendir" ref={panelRef}>
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
              <span className="tool-tab-label">{t.label}</span>
            </button>
          );
        })}
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
            {active === "yield" && <YieldTool />}
          </motion.div>
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
