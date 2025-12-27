import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { readApiErrorMessage } from '../utils/apiError';

export interface User {
  id: string | number;
  email: string;
  name?: string;
  isAdmin?: boolean;
  preferences?: Record<string, unknown>;
}

export interface RetryAction {
  action: string;
  params?: Record<string, unknown>;
  payload?: unknown;
  redirectPath?: string;
  reason?: string;
  createdAt: number;
}

export interface AuthContextValue {
  token: string | null;
  user: User | null;
  profileName: string;
  isAuthenticated: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  setSession: (token: string, user?: User | null) => void;
  logout: (options?: { preserveRetry?: boolean }) => void;
  refreshUser: () => Promise<User | null>;
  refreshProfileName: () => Promise<string | null>;
  setProfileName: (value: string) => void;
  setRetryAction: (action: Partial<RetryAction>) => void;
  getRetryAction: () => RetryAction | null;
  clearRetryAction: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOKEN_KEY = 'bazi_token';
const USER_KEY = 'bazi_user';
const LAST_ACTIVITY_KEY = 'bazi_last_activity';
const TOKEN_ORIGIN_KEY = 'bazi_token_origin';
const RETRY_ACTION_KEY = 'bazi_retry_action';
const SESSION_EXPIRED_KEY = 'bazi_session_expired';
const PROFILE_NAME_KEY = 'bazi_profile_name';
const SESSION_IDLE_MS = 30 * 60 * 1000;

const isBackendToken = (value: string | null): boolean => {
  if (typeof value !== 'string') return false;
  return (
    /^token_\d+_[A-Za-z0-9_-]+\.[a-f0-9]+$/i.test(value)
    || /^token_\d+_\d+(?:_[A-Za-z0-9]+)?$/.test(value)
  );
};

const readStoredValue = (key: string): string | null => {
  try {
    const localValue = localStorage.getItem(key);
    if (localValue) return localValue;
  } catch {
    // Ignore storage failures.
  }

  try {
    const sessionValue = sessionStorage.getItem(key);
    if (!sessionValue) return null;
    try {
      localStorage.setItem(key, sessionValue);
    } catch {
      // Ignore localStorage failures.
    }
    return sessionValue;
  } catch {
    return null;
  }
};

const safeParseUser = (raw: string | null): User | null => {
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

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(() => readStoredValue(TOKEN_KEY));
  const [user, setUser] = useState<User | null>(() => {
    const raw = readStoredValue(USER_KEY);
    return safeParseUser(raw);
  });
  const [profileName, setProfileNameState] = useState<string>(() => {
    const stored = localStorage.getItem(PROFILE_NAME_KEY);
    return stored ? stored.trim() : '';
  });
  const idleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setRetryAction = useCallback((action: Partial<RetryAction>) => {
    if (!action || !action.action) return;
    try {
      const payload: RetryAction = {
        ...action,
        action: action.action,
        createdAt: action.createdAt ?? Date.now(),
      };
      localStorage.setItem(RETRY_ACTION_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage failures (private mode).
    }
  }, []);

  const getRetryAction = useCallback((): RetryAction | null => {
    try {
      const raw = localStorage.getItem(RETRY_ACTION_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.action) return null;
      return parsed as RetryAction;
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
        headers: {
          Authorization: `Bearer ${storedToken}`,
          'Content-Type': 'application/json',
          'x-session-expired-silent': '1',
        },
        body: JSON.stringify({ token: storedToken })
      }).catch(() => {
        // Ignore logout network errors.
      });
    }
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TOKEN_ORIGIN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(LAST_ACTIVITY_KEY);
    localStorage.removeItem(SESSION_EXPIRED_KEY);
    localStorage.removeItem(PROFILE_NAME_KEY);
    sessionStorage.clear();
    if (!preserveRetry) {
      clearRetryAction();
    }
    clearSessionState();
  }, [clearRetryAction, clearSessionState]);

  const setProfileName = useCallback((value: string) => {
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
    (remainingMs: number) => {
      clearIdleTimeout();
      idleTimeoutRef.current = setTimeout(() => {
        expireSession();
      }, remainingMs);
      if (idleTimeoutRef.current && typeof (idleTimeoutRef.current as unknown as { unref?: () => void }).unref === 'function') {
        (idleTimeoutRef.current as unknown as { unref: () => void }).unref();
      }
    },
    [clearIdleTimeout, expireSession]
  );

  const recordActivity = useCallback(
    (remainingMs = SESSION_IDLE_MS) => {
      const now = Date.now();
      try {
        localStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch {
        // Ignore storage failures.
      }
      try {
        sessionStorage.setItem(LAST_ACTIVITY_KEY, String(now));
      } catch {
        // Ignore storage failures.
      }
      scheduleIdleTimeout(remainingMs);
    },
    [scheduleIdleTimeout]
  );

  const refreshUser = useCallback(async (): Promise<User | null> => {
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
        return data.user as User;
      }
    } catch (error) {
      const isFetchFailure = error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        console.error('Failed to refresh user', error);
      }
    }
    return null;
  }, [token, logout]);

  const refreshProfileName = useCallback(async (): Promise<string | null> => {
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
      const isFetchFailure = error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        console.error('Failed to refresh profile name', error);
      }
    }
    return null;
  }, [setProfileName, token]);

  const login = useCallback(async (email: string, password = 'password'): Promise<boolean> => {
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
      try {
        sessionStorage.setItem(TOKEN_KEY, data.token);
        sessionStorage.setItem(TOKEN_ORIGIN_KEY, 'backend');
        sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
        sessionStorage.removeItem('bazi_session_expired');
      } catch {
        // Ignore storage failures.
      }
      setToken(data.token);
      setUser(data.user);
      recordActivity();
      return true;
    } catch (error) {
      console.error("Login error:", error);
      const message =
        error instanceof Error && error.message
          ? error.message
          : t('errors.network');
      throw new Error(message);
    }
  }, [recordActivity, t]);

  const setSession = useCallback((nextToken: string, nextUser?: User | null) => {
    if (!nextToken) return;
    try {
      localStorage.setItem(TOKEN_KEY, nextToken);
      localStorage.setItem(TOKEN_ORIGIN_KEY, 'backend');
      localStorage.removeItem(SESSION_EXPIRED_KEY);
      if (nextUser) {
        localStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      } else {
        localStorage.removeItem(USER_KEY);
      }
    } catch {
      // Ignore storage failures.
    }
    try {
      sessionStorage.setItem(TOKEN_KEY, nextToken);
      sessionStorage.setItem(TOKEN_ORIGIN_KEY, 'backend');
      sessionStorage.removeItem(SESSION_EXPIRED_KEY);
      if (nextUser) {
        sessionStorage.setItem(USER_KEY, JSON.stringify(nextUser));
      } else {
        sessionStorage.removeItem(USER_KEY);
      }
    } catch {
      // Ignore storage failures.
    }
    setToken(nextToken);
    setUser(nextUser ?? null);
    recordActivity();
  }, [recordActivity]);

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

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea !== localStorage) return;
      if (event.key && ![TOKEN_KEY, USER_KEY, LAST_ACTIVITY_KEY].includes(event.key)) return;
      syncFromStorage();
    };

    const handleVisibility = () => {
      if (!document.hidden) syncFromStorage();
    };

    const shouldPollStorage = import.meta.env.MODE !== 'test';
    const intervalId = shouldPollStorage ? setInterval(syncFromStorage, 2000) : null;

    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', syncFromStorage);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('focus', syncFromStorage);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clearSessionState, expireSession, scheduleIdleTimeout, token]);

  useEffect(() => {
    if (!token) return;
    const loadProfileName = async () => {
      try {
        await refreshProfileName();
      } catch {
        // Ignore errors
      }
    };
    void loadProfileName();
  }, [refreshProfileName, token]);

  useEffect(() => {
    if (!token || user) return;
    const loadUser = async () => {
      try {
        await refreshUser();
      } catch {
        // Ignore errors
      }
    };
    void loadUser();
  }, [refreshUser, token, user]);

  const value = useMemo(
    () => ({
      token,
      user,
      profileName,
      isAuthenticated: Boolean(token),
      login,
      setSession,
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
      setSession,
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
