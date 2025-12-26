import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { readApiErrorMessage } from '../utils/apiError.js';

const AuthContext = createContext(null);

const TOKEN_KEY = 'bazi_token';
const USER_KEY = 'bazi_user';
const LAST_ACTIVITY_KEY = 'bazi_last_activity';
const TOKEN_ORIGIN_KEY = 'bazi_token_origin';
const RETRY_ACTION_KEY = 'bazi_retry_action';
const SESSION_EXPIRED_KEY = 'bazi_session_expired';
const PROFILE_NAME_KEY = 'bazi_profile_name';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const isBackendToken = (value) =>
  typeof value === 'string' && /^token_\d+_\d+_[A-Za-z0-9]+$/.test(value);
const safeParseUser = (raw) => {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      localStorage.removeItem(USER_KEY);
    } catch {
      // Ignore storage failures.
    }
    return null;
  }
};

export function AuthProvider({ children }) {
  const { t } = useTranslation();
  const [token, setToken] = useState(localStorage.getItem(TOKEN_KEY));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem(USER_KEY);
    return safeParseUser(raw);
  });
  const [profileName, setProfileNameState] = useState(() => {
    const stored = localStorage.getItem(PROFILE_NAME_KEY);
    return stored ? stored.trim() : '';
  });
  const idleTimeoutRef = useRef(null);

  const setRetryAction = useCallback((action) => {
    if (!action) return;
    try {
      const payload = { ...action, createdAt: Date.now() };
      localStorage.setItem(RETRY_ACTION_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures (private mode).
    }
  }, []);

  const getRetryAction = useCallback(() => {
    try {
      const raw = localStorage.getItem(RETRY_ACTION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.action) return null;
      return parsed;
    } catch {
      return null;
    }
  }, []);

  const clearRetryAction = useCallback(() => {
    try {
      localStorage.removeItem(RETRY_ACTION_KEY);
    } catch {
      // Ignore storage failures.
    }
  }, []);

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

  const logout = useCallback(({ preserveRetry = false } = {}) => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    if (storedToken) {
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${storedToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: storedToken })
      }).catch(() => {
        // Ignore logout network errors.
      });
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_ORIGIN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem('bazi_session_expired');
    localStorage.removeItem(PROFILE_NAME_KEY);
    sessionStorage.clear();
    if (!preserveRetry) {
      clearRetryAction();
    }
    clearSessionState();
  }, [clearRetryAction, clearSessionState]);

  const setProfileName = useCallback((value) => {
    const next = typeof value === 'string' ? value.trim() : '';
    if (next) {
      localStorage.setItem(PROFILE_NAME_KEY, next);
    } else {
      localStorage.removeItem(PROFILE_NAME_KEY);
    }
    setProfileNameState(next);
  }, []);

  const expireSession = useCallback(() => {
    try {
      localStorage.setItem(SESSION_EXPIRED_KEY, '1');
    } catch {
      // Ignore storage failures.
    }
    logout();
    if (typeof window !== 'undefined') {
      const redirectPath = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
      const params = new URLSearchParams({ reason: 'session_expired' });
      if (redirectPath && redirectPath !== '/login') {
        params.set('next', redirectPath);
      }
      window.location.assign(`/login?${params.toString()}`);
    }
  }, [logout]);

  const scheduleIdleTimeout = useCallback(
    (remainingMs) => {
      clearIdleTimeout();
      idleTimeoutRef.current = setTimeout(() => {
        expireSession();
      }, remainingMs);
    },
    [clearIdleTimeout, expireSession]
  );

  const recordActivity = useCallback(
    (remainingMs = SESSION_IDLE_MS) => {
      const now = Date.now();
      localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      scheduleIdleTimeout(remainingMs);
    },
    [scheduleIdleTimeout]
  );

  const refreshUser = useCallback(async () => {
    const storedToken = token || localStorage.getItem(TOKEN_KEY);
    if (!storedToken) return null;
    const storedOrigin = localStorage.getItem(TOKEN_ORIGIN_KEY);
    const shouldEnforceAuth = storedOrigin === 'backend' || isBackendToken(storedToken);
    try {
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${storedToken}` },
        cache: 'no-store',
      });
      if (res.status === 401) {
        if (shouldEnforceAuth) {
          logout();
        }
        return null;
      }
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      if (data?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
        return data.user;
      }
    } catch (error) {
      console.error('Failed to refresh user', error);
    }
    return null;
  }, [token, logout]);

  const refreshProfileName = useCallback(async () => {
    if (!token) return null;
    try {
      const res = await fetch('/api/user/settings', {
        headers: {
          Authorization: `Bearer ${token}`,
          'x-session-expired-silent': '1',
        },
      });
      if (res.headers.get('x-session-expired') === '1') {
        return null;
      }
      if (res.status === 401) {
        return null;
      }
      if (!res.ok) {
        return null;
      }
      const data = await res.json();
      const nextProfileName = data?.settings?.preferences?.profileName || '';
      setProfileName(nextProfileName);
      return nextProfileName;
    } catch (error) {
      console.error('Failed to refresh profile name', error);
    }
    return null;
  }, [setProfileName, token]);

  const login = async (email, password = 'password') => {
    // Determine if we are in "demo" mode or real mode. 
    // For now, we try to hit the API. If the API fails (e.g. user not found), we fall back?
    // No, let's Stick to the plan: Real API.

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const message = await readApiErrorMessage(res, t('login.errors.loginFailed'));
        throw new Error(message);
      }

      const data = await res.json();
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(TOKEN_ORIGIN_KEY, 'backend');
      localStorage.setItem(USER_KEY, JSON.stringify(data.user));
      localStorage.removeItem('bazi_session_expired');
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
          : t('errors.network');
      throw new Error(message);
    }
  };

  useEffect(() => {
    if (!token) {
      clearIdleTimeout();
      setProfileName('');
      return;
    }

    const lastActivityRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
    const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : Date.now();
    const elapsed = Date.now() - lastActivity;
    if (elapsed >= SESSION_IDLE_MS) {
      expireSession();
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
  }, [token, clearIdleTimeout, expireSession, recordActivity, scheduleIdleTimeout]);

  useEffect(() => {
    const syncFromStorage = () => {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      const storedOrigin = localStorage.getItem(TOKEN_ORIGIN_KEY);
      const storedUserRaw = localStorage.getItem(USER_KEY);
      const storedUser = safeParseUser(storedUserRaw);

      if (!storedToken) {
        clearSessionState();
        setProfileName('');
        return;
      }
      if (!storedOrigin && isBackendToken(storedToken)) {
        localStorage.setItem(TOKEN_ORIGIN_KEY, 'backend');
      }

      if (storedToken !== token) {
        setToken(storedToken);
      }
      setUser(storedUser);
      const storedProfileName = localStorage.getItem(PROFILE_NAME_KEY);
      setProfileNameState(storedProfileName ? storedProfileName.trim() : '');

      const lastActivityRaw = localStorage.getItem(LAST_ACTIVITY_KEY);
      const lastActivity = lastActivityRaw ? Number(lastActivityRaw) : Date.now();
      const elapsed = Date.now() - lastActivity;
      if (elapsed >= SESSION_IDLE_MS) {
        expireSession();
        return;
      }
      scheduleIdleTimeout(SESSION_IDLE_MS - elapsed);
    };

    const handleStorage = (event) => {
      if (event.storageArea !== localStorage) return;
      if (event.key && ![TOKEN_KEY, USER_KEY, LAST_ACTIVITY_KEY].includes(event.key)) return;
      syncFromStorage();
    };

    const handleVisibility = () => {
      if (!document.hidden) syncFromStorage();
    };

    const intervalId = setInterval(syncFromStorage, 2000);

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', syncFromStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', syncFromStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearSessionState, expireSession, scheduleIdleTimeout, token, setProfileName]);

  useEffect(() => {
    if (!token) return;
    let isMounted = true;
    const loadProfileName = async () => {
      try {
        await refreshProfileName();
      } finally {
        if (!isMounted) return;
      }
    };
    void loadProfileName();
    return () => {
      isMounted = false;
    };
  }, [refreshProfileName, token]);

  useEffect(() => {
    if (!token || user) return;
    let active = true;
    const loadUser = async () => {
      try {
        await refreshUser();
      } finally {
        if (!active) return;
      }
    };
    void loadUser();
    return () => {
      active = false;
    };
  }, [refreshUser, token, user]);

  const value = useMemo(
    () => ({
      token,
      user,
      profileName,
      isAuthenticated: Boolean(token),
      login,
      logout,
      refreshUser,
      refreshProfileName,
      setProfileName,
      setRetryAction,
      getRetryAction,
      clearRetryAction,
    }),
    [
      token,
      user,
      profileName,
      login,
      logout,
      refreshUser,
      refreshProfileName,
      setProfileName,
      setRetryAction,
      getRetryAction,
      clearRetryAction,
    ]
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
