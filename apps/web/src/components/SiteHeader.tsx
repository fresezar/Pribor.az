"use client";

import { useEffect, useRef, useState } from "react";
import AuthModal, { loadUser, saveUser, type PriborUser } from "./AuthModal";

/** Üst çubuk: marka + "Daxil ol" veya giriş yapılmışsa profil menüsü. */
export default function SiteHeader() {
  const [user, setUser] = useState<PriborUser | null>(null);
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setUser(loadUser()), []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const login = (u: PriborUser) => {
    saveUser(u);
    setUser(u);
  };
  const logout = () => {
    saveUser(null);
    setUser(null);
    setMenuOpen(false);
  };

  const initials = user
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "";

  return (
    <header className="topbar">
      <a href="/" className="brand" style={{ textDecoration: "none" }}>
        PRIBOR<b>.AZ</b>
      </a>

      <div className="topbar-right">
        <a className="nav-link" href="#bazar">Bazar</a>
        {!user ? (
          <button className="login-btn" onClick={() => setAuthOpen(true)}>Daxil ol</button>
        ) : (
          <div className="profile" ref={menuRef}>
            <button className="avatar" onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu" aria-expanded={menuOpen} aria-label="Profil menyusu">
              {initials}
            </button>
            {menuOpen && (
              <div className="profile-menu" role="menu">
                <div className="pm-head">
                  <div className="pm-name">{user.name}</div>
                  <div className="pm-phone">{user.phone}</div>
                </div>
                <button role="menuitem" className="pm-item">Mənim elanlarım</button>
                <button role="menuitem" className="pm-item">Qiymətləndirmələrim</button>
                <button role="menuitem" className="pm-item">Deal Radar</button>
                <button role="menuitem" className="pm-item danger" onClick={logout}>Çıxış</button>
              </div>
            )}
          </div>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} onLogin={login} />
    </header>
  );
}
