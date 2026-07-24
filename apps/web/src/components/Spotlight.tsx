"use client";

/**
 * Global spotlight controller — TEK bir pointermove dinleyicisiyle imlecin
 * altındaki kartın `--mx/--my` CSS değişkenlerini günceller. Böylece
 * .panel/.listing/.modal/.pribor-card kenarlarında cursor'u takip eden ışık
 * hüzmesi (spotlight border) her karta ayrı JS bağlamadan çalışır.
 *
 * Performans: rAF ile throttle; yalnızca eşleşen kart varken yazar.
 */

import { useEffect } from "react";

const SELECTOR = ".panel, .listing, .modal, .pribor-card, .glow-border";

export default function Spotlight() {
  useEffect(() => {
    if (window.matchMedia("(pointer: coarse)").matches) return; // dokunmatikte gerek yok

    let raf = 0;
    let pending: { el: HTMLElement; x: number; y: number } | null = null;

    const onMove = (e: PointerEvent) => {
      const target = (e.target as HTMLElement | null)?.closest(SELECTOR) as HTMLElement | null;
      if (!target) return;
      const rect = target.getBoundingClientRect();
      pending = { el: target, x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (!raf) raf = requestAnimationFrame(flush);
    };

    const flush = () => {
      raf = 0;
      if (!pending) return;
      pending.el.style.setProperty("--mx", `${pending.x}px`);
      pending.el.style.setProperty("--my", `${pending.y}px`);
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return null;
}
