"use client";

/**
 * Alətlerin paylaştığı küçük parçalar.
 *
 * Bir yerde toplanmalarının sebebi tutarlılık: iki alət de aynı sıralı liste
 * biçimini kullanıyor ve rakamlar aynı ritimde canlanıyor. Ayrı ayrı yazılsalar
 * zamanla birbirinden ayrışır, aynı panelde iki farklı ürün gibi görünürlerdi.
 */

import { useEffect } from "react";
import { motion, useReducedMotion, useSpring, useTransform } from "framer-motion";

export const EASE = [0.22, 1, 0.36, 1] as const;

export const fmt = (n: number) =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Değer değişince yumuşak sayan rakam — hesabın "canlı" hissini veren şey. */
export function Ticker({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const reduce = useReducedMotion();
  const sp = useSpring(value, { stiffness: 90, damping: 20, mass: 0.7 });
  const text = useTransform(sp, (v) =>
    decimals > 0 ? v.toFixed(decimals).replace(".", ",") : fmt(v),
  );
  useEffect(() => {
    if (reduce) sp.jump(value);
    else sp.set(value);
  }, [value, sp, reduce]);
  return <motion.span>{text}</motion.span>;
}

export type RankRow = {
  key: string;
  name: string;
  /** Sağda görünen ana değer (hazır biçimlenmiş) */
  value: string;
  /** Ana değerin altındaki küçük açıklama */
  sub?: string;
  /** 0..1 — çubuğun dolulukları */
  ratio: number;
  active?: boolean;
};

/**
 * Sıralı karşılaştırma listesi.
 *
 * Çubuk şart: tek başına "1 466 ₼/m²" bir sayıdır, yan yana çubuklarla birlikte
 * bir CEVAPTIR — kullanıcı rayonların birbirine göre nerede durduğunu okumak
 * için tabloyu zihninde sıralamak zorunda kalmaz.
 */
export function RankList({ rows, tone = "teal" }: { rows: RankRow[]; tone?: "teal" | "gold" }) {
  const reduce = useReducedMotion();
  return (
    <ul className="rank-list">
      {rows.map((r, i) => (
        <motion.li
          key={r.key}
          className={`rank-row${r.active ? " on" : ""}`}
          initial={reduce ? false : { opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.32, ease: EASE, delay: reduce ? 0 : 0.02 * i }}
        >
          <span className="rank-name">{r.name}</span>
          <span className="rank-rail" aria-hidden>
            <motion.span
              className={`rank-fill ${tone}`}
              initial={reduce ? false : { width: 0 }}
              animate={{ width: `${Math.max(2, Math.min(100, r.ratio * 100))}%` }}
              transition={{ duration: reduce ? 0 : 0.6, ease: EASE, delay: reduce ? 0 : 0.02 * i }}
            />
          </span>
          <span className="rank-val">
            {r.value}
            {r.sub && <em>{r.sub}</em>}
          </span>
        </motion.li>
      ))}
    </ul>
  );
}

/** Örnəklem yetersizse dürüst boşluk — uydurma sayı yerine sebebini söyler. */
export function NoData({ children }: { children: React.ReactNode }) {
  return <div className="tool-nodata">{children}</div>;
}
