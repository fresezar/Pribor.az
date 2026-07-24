"use client";

/**
 * PriborCard — cam + derinlik + hareket taşıyan premium kart.
 *
 * · Glassmorphism: backdrop-blur + iç highlight (globals .glass / spotlight ::after)
 * · Spotlight border: imleci takip eden radyal ışık (global Spotlight controller
 *   --mx/--my günceller; burada ayrıca yerel olarak da güncelleriz ki wrap edilen
 *   herhangi bir yerde çalışsın)
 * · 3D tilt: pointer'a göre spring fizikli hafif eğim + yükselme
 *
 * Kullanım:
 *   <PriborCard spot="var(--gold)"> ... </PriborCard>
 */

import {
  motion,
  useMotionTemplate,
  useMotionValue,
  useSpring,
} from "framer-motion";
import type { CSSProperties, ReactNode } from "react";
import { useRef } from "react";

type Props = {
  children: ReactNode;
  className?: string;
  /** Spotlight border rengi (CSS renk/değişken). Varsayılan emerald. */
  spot?: string;
  /** 3D tilt açısı (derece). 0 = tilt kapalı. */
  tilt?: number;
  style?: CSSProperties;
};

const SPRING = { stiffness: 220, damping: 22, mass: 0.6 };

export default function PriborCard({
  children,
  className = "",
  spot,
  tilt = 6,
  style,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // Tilt için yay-yumuşatmalı hareket değerleri
  const rx = useSpring(useMotionValue(0), SPRING);
  const ry = useSpring(useMotionValue(0), SPRING);
  const lift = useSpring(useMotionValue(0), SPRING);
  const transform = useMotionTemplate`perspective(1000px) rotateX(${rx}deg) rotateY(${ry}deg) translateY(${lift}px)`;

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const px = e.clientX - r.left;
    const py = e.clientY - r.top;
    // Spotlight konumu (global controller da yazar; burada anında tepki için)
    el.style.setProperty("--mx", `${px}px`);
    el.style.setProperty("--my", `${py}px`);
    if (tilt > 0) {
      const nx = px / r.width - 0.5; // -0.5..0.5
      const ny = py / r.height - 0.5;
      ry.set(nx * tilt * 2);
      rx.set(-ny * tilt * 2);
    }
  };

  const onLeave = () => {
    rx.set(0);
    ry.set(0);
    lift.set(0);
  };
  const onEnter = () => lift.set(-6);

  return (
    <motion.div
      ref={ref}
      className={`pribor-card glass ${className}`}
      onPointerMove={onMove}
      onPointerEnter={onEnter}
      onPointerLeave={onLeave}
      style={{
        transform,
        transformStyle: "preserve-3d",
        ...(spot ? ({ ["--spot" as string]: spot } as CSSProperties) : null),
        ...style,
      }}
    >
      {children}
    </motion.div>
  );
}
