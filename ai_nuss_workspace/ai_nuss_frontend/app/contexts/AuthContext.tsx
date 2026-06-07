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

// ═══════════════════════════════════════════════════════════
// Helpers (仅在客户端调用)
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
  if (typeof window === "undefined") return;
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ username, token }));
}

function clearAuthFromStorage() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

// ═══════════════════════════════════════════════════════════
// 初始状态 — 服务端和客户端必须完全一致以避免 Hydration 错误
// ═══════════════════════════════════════════════════════════

const INITIAL_AUTH_STATE: AuthState = {
  isAuthenticated: false,
  username: null,
  token: null,
  isLoading: true, // 服务端和水合时统一为 loading，避免 DOM 不一致
};

// ═══════════════════════════════════════════════════════════
// Provider
// ═══════════════════════════════════════════════════════════

export function AuthProvider({ children }: { children: ReactNode }) {
  // 关键修复：服务端和客户端使用相同的初始状态
  const [auth, setAuth] = useState<AuthState>(INITIAL_AUTH_STATE);

  // 水合完成后（仅客户端），从 localStorage 恢复登录态
  useEffect(() => {
    const stored = loadAuthFromStorage();
    if (stored.token && stored.username) {
      // 验证 token 有效性
      fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${stored.token}` },
      })
        .then((res) => {
          if (!res.ok) throw new Error("Token invalid");
          return res.json();
        })
        .then(() => {
          setAuth({
            isAuthenticated: true,
            username: stored.username,
            token: stored.token,
            isLoading: false,
          });
        })
        .catch(() => {
          // Token 过期或无效 — 清除
          clearAuthFromStorage();
          setAuth({ isAuthenticated: false, username: null, token: null, isLoading: false });
        });
    } else {
      setAuth({ isAuthenticated: false, username: null, token: null, isLoading: false });
    }
  }, []);

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
