"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import AuthModal from "./AuthModal";
import BrandLogo from "./BrandLogo";
import ListingForm from "./ListingForm";
import MyListings from "./MyListings";
import ThemeToggle from "./ThemeToggle";
import { useAuth } from "./AuthContext";
import { NEW_LISTING, notifyListingsChanged } from "./listingEvents";

const ROLE_BADGE: Record<string, { label: string; cls: string } | null> = {
  AGENT_ADMIN: { label: "Rəsmi Emlakçı", cls: "agent" },
  PREMIUM_USER: { label: "Pro", cls: "pro" },
  USER: null,
};

/** Üst çubuk: marka + Bazar + tema + Elan yerləşdir + Daxil ol / profil. */
export default function SiteHeader() {
  const { user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [myOpen, setMyOpen] = useState(false);
  const [postOpen, setPostOpen] = useState(false);
  const pendingPost = useRef(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // "Elan yerləşdir" — giriş yoksa önce AuthModal, sonra boş ilan formu.
  const startPost = useCallback(() => {
    if (!user) {
      pendingPost.current = true;
      setAuthOpen(true);
      return;
    }
    setPostOpen(true);
  }, [user]);

  // Herhangi bir yerden (bazar başlığı vb.) tetiklenen "yeni ilan" olayı
  useEffect(() => {
    const handler = () => startPost();
    window.addEventListener(NEW_LISTING, handler);
    return () => window.removeEventListener(NEW_LISTING, handler);
  }, [startPost]);

  const initials = user
    ? user.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()
    : "";
  const badge = user ? ROLE_BADGE[user.role] : null;

  return (
    <header className="topbar">
      <a href="/" className="brand" style={{ textDecoration: "none" }} aria-label="PriborƏmlak ana səhifə">
        <BrandLogo size={30} />
      </a>

      <div className="topbar-right">
        <a className="nav-link" href="#bazar">Bazar</a>
        <ThemeToggle />
        <button className="post-btn" onClick={startPost}>+ Elan yerləşdir</button>

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
                  <div className="pm-phone">{user.email}</div>
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

      <AuthModal open={authOpen}
        onClose={() => { setAuthOpen(false); pendingPost.current = false; }}
        onLoggedIn={() => {
          if (pendingPost.current) { pendingPost.current = false; setPostOpen(true); }
        }} />
      <ListingForm
        open={postOpen}
        prefill={null}
        onClose={() => setPostOpen(false)}
        onCreated={() => {
          setPostOpen(false);
          notifyListingsChanged();
          setMyOpen(true); // yeni ilanı hemen göster
        }}
      />
      <MyListings open={myOpen} onClose={() => setMyOpen(false)} />
    </header>
  );
}
