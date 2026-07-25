"use client";

/**
 * Oturum durumu — mock kimlik. Kullanıcı (id + rol + entitlements) hem
 * React context'te hem localStorage'da tutulur; sayfa yenilense de kalır.
 * Faz 3'te gerçek OTP + JWT bu context'in arkasına geçer, arayüz değişmez.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { AuthUser } from "@pribor/contracts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const STORAGE_KEY = "pribor.user";

type AuthContextValue = {
  user: AuthUser | null;
  /** Telefona OTP gönderir; non-prod'da devCode döner (arayüz gösterir). */
  requestOtp: (phone: string) => Promise<{ devCode?: string }>;
  /** OTP ile giriş: kod doğrulanırsa hesap açılır. Rol sunucuda belirlenir. */
  login: (phone: string, name: string, code: string) => Promise<AuthUser>;
  logout: () => void;
  upgrade: () => Promise<AuthUser>;
  refresh: () => Promise<void>;
  setUser: (u: AuthUser | null) => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setUserState(JSON.parse(raw) as AuthUser);
    } catch {
      /* yoksay */
    }
  }, []);

  const setUser = useCallback((u: AuthUser | null) => {
    setUserState(u);
    try {
      if (u) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(u));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* yoksay */
    }
  }, []);

  const requestOtp = useCallback(async (phone: string) => {
    const res = await fetch(`${API}/v1/auth/otp/request`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    if (!res.ok) throw new Error("Kod göndərilə bilmədi");
    return (await res.json()) as { devCode?: string };
  }, []);

  const login = useCallback(
    async (phone: string, name: string, code: string) => {
      const res = await fetch(`${API}/v1/auth/verify-login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone, name, code }),
      });
      if (res.status === 401) throw new Error("Kod yanlış və ya vaxtı bitib");
      if (!res.ok) throw new Error("Giriş alınmadı");
      const u = (await res.json()) as AuthUser;
      setUser(u);
      return u;
    },
    [setUser],
  );

  const upgrade = useCallback(async () => {
    if (!user) throw new Error("Əvvəlcə daxil olun");
    const res = await fetch(`${API}/v1/auth/upgrade`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: user.id }),
    });
    if (!res.ok) throw new Error("Yükseltme alınmadı");
    const u = (await res.json()) as AuthUser;
    setUser(u);
    return u;
  }, [user, setUser]);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`${API}/v1/auth/${user.id}`);
      if (res.ok) setUser((await res.json()) as AuthUser);
    } catch {
      /* yoksay */
    }
  }, [user, setUser]);

  const logout = useCallback(() => setUser(null), [setUser]);

  const value = useMemo(
    () => ({ user, requestOtp, login, logout, upgrade, refresh, setUser }),
    [user, requestOtp, login, logout, upgrade, refresh, setUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth AuthProvider içinde kullanılmalı");
  return ctx;
}
