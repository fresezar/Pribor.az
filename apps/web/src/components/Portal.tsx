"use client";

/**
 * Portal — çocukları doğrudan <body>'ye render eder.
 *
 * Neden gerekli: modallar `backdrop-filter`/`transform` taşıyan cam
 * kapsayıcıların (.panel, .topbar, motion kartları) içinden açılıyor. Bu
 * özellikler yeni bir "containing block" oluşturduğu için içteki
 * `position: fixed` overlay ekrana değil o kapsayıcıya göre konumlanır —
 * modal yukarı kayar/yarısı ekran dışında kalır. Portal ile modal DOM
 * ağacında body'nin altına taşınır ve fixed yeniden viewport'a bağlanır.
 */

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { ReactNode } from "react";

export default function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}
