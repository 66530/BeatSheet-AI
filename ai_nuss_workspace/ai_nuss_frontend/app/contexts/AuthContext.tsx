"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";

// ═══════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════

interface AuthState {
  isAuthenticated: boolean;
  username: string | null;
  token: string | null;
  isLoading: boolean;
}

interface AuthContextValue extends AuthState {
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_STORAGE_KEY = "ai_nuss_auth";
const API_BASE = "";  // Use Next.js rewrite proxy

// ═══════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════

function loadAuthFromStorage(): AuthState {
  if (typeof window === "undefined") {
    return { isAuthenticated: false, username: null, token: null, isLoading: true };
  }
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed.token && parsed.username) {
        return {
          isAuthenticated: true,
          username: parsed.username,
          token: parsed.token,
          isLoading: false,
        };
      }
    }
  } catch {
    // Corrupted storage — ignore
  }
  return { isAuthenticated: false, username: null, token: null, isLoading: false };
}

function saveAuthToStorage(username: string, token: string) {
  localStorage.setItem(
    AUTH_STORAGE_KEY,
    JSON.stringify({ username, token })
  );
}

function clearAuthFromStorage() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

// ═══════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>(loadAuthFromStorage);

  // Verify token on mount
  useEffect(() => {
    if (!auth.token) {
      setAuth((prev) => ({ ...prev, isLoading: false }));
      return;
    }
    // Verify token against backend
    fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${auth.token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token invalid");
        return res.json();
      })
      .then(() => {
        setAuth((prev) => ({ ...prev, isAuthenticated: true, isLoading: false }));
      })
      .catch(() => {
        // Token expired or invalid — clear
        clearAuthFromStorage();
        setAuth({ isAuthenticated: false, username: null, token: null, isLoading: false });
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (username: string, password: string) => {
    const res = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "登录失败" }));
      throw new Error(err.detail || "登录失败，请检查用户名和密码");
    }
    const data = await res.json();
    saveAuthToStorage(data.username, data.access_token);
    setAuth({
      isAuthenticated: true,
      username: data.username,
      token: data.access_token,
      isLoading: false,
    });
  }, []);

  const logout = useCallback(() => {
    clearAuthFromStorage();
    setAuth({ isAuthenticated: false, username: null, token: null, isLoading: false });
  }, []);

  return (
    <AuthContext.Provider value={{ ...auth, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
