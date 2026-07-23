"use client";

import { useEffect, useRef, useState } from "react";
import ApkDownloadModal from "./ApkDownloadModal";
import AuthModal from "./AuthModal";
import MyListings from "./MyListings";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "./AuthContext";

const ROLE_BADGE: Record<string, { label: string; cls: string } | null> = {
  AGENT_ADMIN: { label: "Rəsmi Emlakçı", cls: "agent" },
  PREMIUM_USER: { label: "Pro", cls: "pro" },
  USER: null,
};

/** Üst çubuk: marka + Bazar + tema + APK + Daxil ol / profil menüsü. */
export default function SiteHeader() {
  const { user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [myOpen, setMyOpen] = useState(false);
  const [apkOpen, setApkOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const initials = user
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "";
  const badge = user ? ROLE_BADGE[user.role] : null;

  return (
    <header className="topbar">
      <a href="/" className="brand" style={{ textDecoration: "none" }}>PRIBOR<b>.AZ</b></a>

      <div className="topbar-right">
        <a className="nav-link" href="#bazar">Bazar</a>
        <ThemeToggle />
        <button className="apk-btn" onClick={() => setApkOpen(true)}
          title="Android tətbiqini yüklə">
          <span className="apk-ico">▲</span>
          <span className="apk-txt">Android<br /><b>.APK yüklə</b></span>
        </button>

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
                  <div className="pm-name">
                    {user.name}
                    {badge && <span className={`role-badge ${badge.cls}`}>{badge.label}</span>}
                  </div>
                  <div className="pm-phone">{user.phone}</div>
                </div>
                <button role="menuitem" className="pm-item"
                  onClick={() => { setMenuOpen(false); setMyOpen(true); }}>
                  Mənim elanlarım
                </button>
                <button role="menuitem" className="pm-item danger" onClick={logout}>Çıxış</button>
              </div>
            )}
          </div>
        )}
      </div>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
      <MyListings open={myOpen} onClose={() => setMyOpen(false)} />
      <ApkDownloadModal open={apkOpen} onClose={() => setApkOpen(false)} />
    </header>
  );
}
