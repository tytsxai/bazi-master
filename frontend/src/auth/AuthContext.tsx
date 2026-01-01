/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import { readApiErrorMessage } from '../utils/apiError';
import logger from '../utils/logger';
import { sanitizeRedirectPath, safeAssignLocation } from '../utils/redirect';

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
  user: User | null;
  profileName: string;
  isAuthenticated: boolean;
  isAuthResolved: boolean;
  login: (email: string, password?: string) => Promise<boolean>;
  logout: (options?: { preserveRetry?: boolean; preserveSessionExpired?: boolean }) => void;
  refreshUser: () => Promise<User | null>;
  refreshProfileName: () => Promise<string | null>;
  setProfileName: (value: string) => void;
  setRetryAction: (action: Partial<RetryAction>) => void;
  getRetryAction: () => RetryAction | null;
  clearRetryAction: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const USER_KEY = 'bazi_user';
const LAST_ACTIVITY_KEY = 'bazi_last_activity';
const RETRY_ACTION_KEY = 'bazi_retry_action';
const SESSION_EXPIRED_KEY = 'bazi_session_expired';
const PROFILE_NAME_KEY = 'bazi_profile_name';
const SESSION_IDLE_MS = 30 * 60 * 1000;
const LEGACY_TOKEN_KEYS = ['bazi_token', 'bazi_token_origin'];
const shouldUseLegacyTokens = () =>
  import.meta.env.MODE === 'test' || import.meta.env.VITE_E2E === '1';

const safeRemoveStorageItem = (storage: Storage, key: string) => {
  try {
    storage.removeItem(key);
  } catch (error) {
    void error;
  }
};

const safeSetStorageItem = (storage: Storage, key: string, value: string) => {
  try {
    storage.setItem(key, value);
  } catch (error) {
    void error;
  }
};

const clearLegacyTokens = () => {
  for (const key of LEGACY_TOKEN_KEYS) {
    safeRemoveStorageItem(localStorage, key);
    safeRemoveStorageItem(sessionStorage, key);
  }
};

const hasSessionExpiredFlag = () => {
  try {
    if (localStorage.getItem(SESSION_EXPIRED_KEY) === '1') return true;
  } catch {
    // Ignore storage failures.
  }
  try {
    if (sessionStorage.getItem(SESSION_EXPIRED_KEY) === '1') return true;
  } catch {
    // Ignore storage failures.
  }
  return false;
};

const storeLegacyToken = (token: string | null | undefined, origin = 'backend') => {
  if (!token || !shouldUseLegacyTokens()) return;
  safeSetStorageItem(localStorage, 'bazi_token', token);
  safeSetStorageItem(localStorage, 'bazi_token_origin', origin);
  safeSetStorageItem(sessionStorage, 'bazi_token', token);
  safeSetStorageItem(sessionStorage, 'bazi_token_origin', origin);
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
  const [user, setUser] = useState<User | null>(() => {
    const raw = readStoredValue(USER_KEY);
    return safeParseUser(raw);
  });
  useEffect(() => {
    const shouldClearLegacyTokens =
      import.meta.env.MODE !== 'test' && import.meta.env.VITE_E2E !== '1';
    if (shouldClearLegacyTokens) {
      clearLegacyTokens();
    }
  }, []);
  const [isAuthResolved, setAuthResolved] = useState(false);
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
    setUser(null);
  }, [clearIdleTimeout]);

  const logout = useCallback(
    ({ preserveRetry = false, preserveSessionExpired = false } = {}) => {
      fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'x-session-expired-silent': '1',
        },
      }).catch(() => {
        // Ignore logout network errors.
      });
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(LAST_ACTIVITY_KEY);
      if (!preserveSessionExpired) {
        localStorage.removeItem(SESSION_EXPIRED_KEY);
      }
      localStorage.removeItem(PROFILE_NAME_KEY);
      clearLegacyTokens();
      sessionStorage.clear();
      if (preserveSessionExpired) {
        try {
          sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
        } catch {
          // Ignore storage failures.
        }
      }
      if (!preserveRetry) {
        clearRetryAction();
      }
      clearSessionState();
      setAuthResolved(true);
    },
    [clearRetryAction, clearSessionState]
  );

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
    try {
      sessionStorage.setItem(SESSION_EXPIRED_KEY, '1');
    } catch {
      // Ignore storage failures.
    }
    clearLegacyTokens();
    logout({ preserveRetry: true, preserveSessionExpired: true });
    if (typeof window !== 'undefined') {
      const redirectPath = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
      const safeNext = sanitizeRedirectPath(redirectPath, null);
      const params = new URLSearchParams({ reason: 'session_expired' });
      if (safeNext && safeNext !== '/login') {
        params.set('next', safeNext);
      }
      safeAssignLocation(`/login?${params.toString()}`);
    }
  }, [logout]);

  const scheduleIdleTimeout = useCallback(
    (remainingMs: number) => {
      clearIdleTimeout();
      idleTimeoutRef.current = setTimeout(() => {
        expireSession();
      }, remainingMs);
      if (
        idleTimeoutRef.current &&
        typeof (idleTimeoutRef.current as unknown as { unref?: () => void }).unref === 'function'
      ) {
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
    if (hasSessionExpiredFlag()) {
      clearLegacyTokens();
      clearSessionState();
      setAuthResolved(true);
      return null;
    }
    try {
      const headers = new Headers();
      headers.set('x-session-expired-silent', '1');
      if (shouldUseLegacyTokens()) {
        headers.set('x-include-token', '1');
      }
      const res = await fetch('/api/auth/me', {
        credentials: 'include',
        cache: 'no-store',
        headers,
      });
      if (res.headers.get('x-session-expired') === '1') {
        clearSessionState();
        setAuthResolved(true);
        return null;
      }
      if (res.status === 401) {
        clearSessionState();
        setAuthResolved(true);
        return null;
      }
      if (!res.ok) {
        setAuthResolved(true);
        return null;
      }
      const data = await res.json();
      if (data?.token) {
        storeLegacyToken(data.token, 'backend');
      }
      if (data?.user) {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
        setAuthResolved(true);
        return data.user as User;
      }
    } catch (error) {
      const isFetchFailure =
        error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        logger.error({ error }, 'Failed to refresh user');
      }
    }
    setAuthResolved(true);
    return null;
  }, [clearSessionState]);

  const refreshProfileName = useCallback(async (): Promise<string | null> => {
    try {
      const res = await fetch('/api/user/settings', {
        credentials: 'include',
        headers: {
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
      const isFetchFailure =
        error instanceof TypeError && /failed to fetch/i.test(error.message || '');
      if (!isFetchFailure) {
        logger.error({ error }, 'Failed to refresh profile name');
      }
    }
    return null;
  }, [setProfileName]);

  const login = useCallback(
    async (email: string, password = 'password'): Promise<boolean> => {
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password }),
        });

        if (!res.ok) {
          const message = await readApiErrorMessage(res, t('login.errors.loginFailed'));
          throw new Error(message);
        }

        const data = await res.json();
        if (data?.token) {
          storeLegacyToken(data.token, 'backend');
        }
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        localStorage.removeItem('bazi_session_expired');
        try {
          sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
          sessionStorage.removeItem('bazi_session_expired');
        } catch {
          // Ignore storage failures.
        }
        setUser(data.user);
        setAuthResolved(true);
        recordActivity();
        return true;
      } catch (error) {
        logger.error({ error }, 'Login error:');
        const message =
          error instanceof Error && error.message ? error.message : t('errors.network');
        throw new Error(message);
      }
    },
    [recordActivity, t]
  );

  useEffect(() => {
    if (!user) {
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
  }, [user, clearIdleTimeout, expireSession, recordActivity, scheduleIdleTimeout, setProfileName]);

  useEffect(() => {
    const syncFromStorage = () => {
      const storedUserRaw = localStorage.getItem(USER_KEY);
      const storedUser = safeParseUser(storedUserRaw);

      if (!storedUser) {
        clearSessionState();
        setProfileName('');
        return;
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
      if (
        event.key &&
        ![USER_KEY, LAST_ACTIVITY_KEY, PROFILE_NAME_KEY, SESSION_EXPIRED_KEY].includes(event.key)
      )
        return;
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
  }, [clearSessionState, expireSession, scheduleIdleTimeout, setProfileName, user]);

  useEffect(() => {
    if (isAuthResolved) return;
    const loadUser = async () => {
      try {
        await refreshUser();
      } catch {
        // Ignore errors
      }
    };
    void loadUser();
  }, [refreshUser, isAuthResolved]);

  const value = useMemo(
    () => ({
      user,
      profileName,
      isAuthenticated: Boolean(user),
      isAuthResolved,
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
      user,
      profileName,
      isAuthResolved,
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

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
