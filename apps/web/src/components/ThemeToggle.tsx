"use client";

/**
 * Koyu/Açık tema geçişi. Varsayılan AÇIK; seçim localStorage'da; ilk boyamadan
 * önce layout'taki inline script data-theme'i uyguladığı için tema atlaması olmaz.
 */

import { useEffect, useState } from "react";

type Theme = "dark" | "light";
const KEY = "pribor.theme";

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const current = (document.documentElement.dataset.theme as Theme) ?? "light";
    setTheme(current);
  }, []);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.dataset.theme = next;
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* yoksay */
    }
  };

  return (
    <button className="theme-toggle" onClick={toggle}
      aria-label={theme === "dark" ? "Açıq temaya keç" : "Qaranlıq temaya keç"}
      title={theme === "dark" ? "Açıq tema" : "Qaranlıq tema"}>
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}
