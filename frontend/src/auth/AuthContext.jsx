import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const AuthContext = createContext(null);

const TOKEN_KEY = 'bazi_token';
const USER_KEY = 'bazi_user';
const LAST_ACTIVITY_KEY = 'bazi_last_activity';
const SESSION_IDLE_MS = 30 * 60 * 1000;

export function AuthProvider({ children }) {
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  });
  const idleTimeoutRef = useRef(null);

  const clearIdleTimeout = useCallback(() => {
    if (idleTimeoutRef.current) {
      clearTimeout(idleTimeoutRef.current);
      idleTimeoutRef.current = null;
    }
  }, []);

  const clearSessionState = useCallback(() => {
    clearIdleTimeout();
    setToken(null);
    setUser(null);
  }, [clearIdleTimeout]);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    sessionStorage.clear();
    clearSessionState();
  }, [clearSessionState]);

  const scheduleIdleTimeout = useCallback(
    (remainingMs) => {
      clearIdleTimeout();
      idleTimeoutRef.current = setTimeout(() => {
        logout();
      }, remainingMs);
    },
    [clearIdleTimeout, logout]
  );

  const recordActivity = useCallback(
    (remainingMs = SESSION_IDLE_MS) => {
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      scheduleIdleTimeout(remainingMs);
    },
    [scheduleIdleTimeout]
  );

  const readErrorMessage = async (response, fallback) => {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return parsed?.error || parsed?.message || fallback;
    } catch {
      return text;
    }
  };

  const login = async (email, password = 'password') => {
    // Determine if we are in "demo" mode or real mode. 
    // For now, we try to hit the API. If the API fails (e.g. user not found), we fall back?
    // No, let's Stick to the plan: Real API.

    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const message = await readErrorMessage(res, 'Login failed');
        throw new Error(message);
      }

      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      setToken(data.token);
      setUser(data.user);
      recordActivity();
      return true;
    } catch (error) {
      console.error("Login error:", error);
      // Optional: Revert to mock for resilience if backend is down? 
      // For this task, we want to prove the backend works. So throw.
      const message =
        error instanceof Error && error.message
          ? error.message
          : 'Network error. Please check your connection and try again.';
      throw new Error(message);
    }
  };

  useEffect(() => {
    if (!token) {
      clearIdleTimeout();
      return;
    }

    const lastActivityRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : Date.now();
    const elapsed = Date.now() - lastActivity;
    if (elapsed >= SESSION_IDLE_MS) {
      logout();
      return;
    }

    scheduleIdleTimeout(SESSION_IDLE_MS - elapsed);

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    const handleActivity = () => recordActivity();
    events.forEach((eventName) =>
      window.addEventListener(eventName, handleActivity, { passive: true })
    );

    return () => {
      events.forEach((eventName) => window.removeEventListener(eventName, handleActivity));
      clearIdleTimeout();
    };
  }, [token, clearIdleTimeout, logout, recordActivity, scheduleIdleTimeout]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.storageArea !== localStorage) return;
      if (![TOKEN_KEY, USER_KEY, LAST_ACTIVITY_KEY].includes(event.key)) return;

      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedUserRaw = localStorage.getItem(USER_KEY);
      const storedUser = storedUserRaw ? JSON.parse(storedUserRaw) : null;

      if (!storedToken) {
        clearSessionState();
        return;
      }

      if (storedToken !== token) {
        setToken(storedToken);
      }
      setUser(storedUser);

      const lastActivityRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
      const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : Date.now();
      const elapsed = Date.now() - lastActivity;
      if (elapsed >= SESSION_IDLE_MS) {
        logout();
        return;
      }
      scheduleIdleTimeout(SESSION_IDLE_MS - elapsed);
    };

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, [clearSessionState, logout, scheduleIdleTimeout, token]);

  const value = useMemo(
    () => ({ token, user, isAuthenticated: Boolean(token), login, logout }),
    [token, user, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
