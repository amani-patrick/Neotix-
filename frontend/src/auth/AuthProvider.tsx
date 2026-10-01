import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getCurrentUser, login as loginApi } from "../api/endpoints";
import { onUnauthorized, setAccessToken } from "../api/client";
import type { AuthUser } from "../types/api";

const TOKEN_KEY = "drd.token";
const USER_KEY = "drd.user";

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Set after a 401 so the login page can show the session-expired note. */
  sessionExpired: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: (options?: { expired?: boolean }) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(readStoredUser);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const queryClient = useQueryClient();

  const clearAuth = useCallback(
    (expired: boolean) => {
      setAccessToken(null);
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      setUser(null);
      // Never leak cached server data (possibly another client's) across
      // sessions or after expiry.
      queryClient.clear();
      if (expired) setSessionExpired(true);
    },
    [queryClient],
  );

  useEffect(() => {
    const unsubscribe = onUnauthorized(() => clearAuth(true));
    return unsubscribe;
  }, [clearAuth]);

  // Restore the session from storage: if a token exists, re-fetch /auth/me.
  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }
    setAccessToken(token);
    getCurrentUser()
      .then((me) => {
        setUser(me);
        localStorage.setItem(USER_KEY, JSON.stringify(me));
      })
      .catch(() => clearAuth(false))
      .finally(() => setIsLoading(false));
  }, [clearAuth]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await loginApi(email, password);
      setAccessToken(res.access_token);
      localStorage.setItem(TOKEN_KEY, res.access_token);
      localStorage.setItem(USER_KEY, JSON.stringify(res.user));
      setUser(res.user);
      setSessionExpired(false);
      queryClient.clear(); // fresh cache for the fresh session
    },
    [queryClient],
  );

  const logout = useCallback(() => {
    clearAuth(false);
  }, [clearAuth]);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      sessionExpired,
      login,
      logout,
    }),
    [user, isLoading, sessionExpired, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
