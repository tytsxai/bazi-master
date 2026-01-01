import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, RetryAction } from './AuthContext';
import { sanitizeRedirectPath, safeAssignLocation } from '../utils/redirect';

export const SESSION_EXPIRED_REASON = 'session_expired';
export const SESSION_EXPIRED_KEY = 'bazi_session_expired';

export function useAuthFetch() {
  const { isAuthenticated, logout, setRetryAction } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    async (
      input: string | URL | Request,
      init: RequestInit = {},
      retryAction: Partial<RetryAction> | null = null
    ): Promise<Response> => {
      const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
      const safeNext = sanitizeRedirectPath(redirectPath, null);
      const params = new URLSearchParams({ reason: SESSION_EXPIRED_REASON });
      if (safeNext) params.set('next', safeNext);
      const target = `/login?${params.toString()}`;

      const redirectToLogin = () => {
        navigate(target, {
          replace: true,
          state: { from: redirectPath },
        });
        window.setTimeout(() => {
          const currentPath = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
          if (currentPath !== target) {
            safeAssignLocation(target);
          }
        }, 50);
      };

      const headers = new Headers(init.headers || {});
      headers.set('x-session-expired-silent', '1');

      const response = await fetch(input, {
        ...init,
        headers,
        credentials: 'include',
      });

      if (
        (response.headers.get('x-session-expired') === '1' || response.status === 401) &&
        isAuthenticated
      ) {
        if (retryAction) {
          setRetryAction({
            ...retryAction,
            createdAt: retryAction.createdAt ?? Date.now(),
          });
        }
        logout({ preserveRetry: Boolean(retryAction) });
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
        redirectToLogin();
        if (response.headers.get('x-session-expired') === '1') {
          return new Response(null, { status: 401, statusText: 'Session expired' });
        }
      }
      return response;
    },
    [isAuthenticated, logout, navigate, location, setRetryAction]
  );
}
