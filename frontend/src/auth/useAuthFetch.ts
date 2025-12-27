import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth, RetryAction } from './AuthContext';

export const SESSION_EXPIRED_REASON = 'session_expired';
export const SESSION_EXPIRED_KEY = 'bazi_session_expired';

export function useAuthFetch() {
  const { token, logout, setRetryAction } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const isBackendToken = (value: string | null): boolean =>
    typeof value === 'string' && /^token_\d+_\d+_[A-Za-z0-9]+$/.test(value);

  return useCallback(
    async (
      input: string | URL | Request,
      init: RequestInit = {},
      retryAction: Partial<RetryAction> | null = null
    ): Promise<Response> => {
      const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
      const params = new URLSearchParams({ reason: SESSION_EXPIRED_REASON, next: redirectPath });
      const target = `/login?${params.toString()}`;

      const redirectToLogin = () => {
        navigate(target, {
          replace: true,
          state: { from: redirectPath },
        });
        window.setTimeout(() => {
          const currentPath = `${window.location.pathname}${window.location.search || ''}${window.location.hash || ''}`;
          if (currentPath !== target) {
            window.location.assign(target);
          }
        }, 50);
      };

      let effectiveToken = token;
      try {
        const storedToken = localStorage.getItem('bazi_token');
        if (storedToken) {
          effectiveToken = storedToken;
        }
      } catch {
        // Ignore storage access errors.
      }

      const headers = new Headers(init.headers || {});
      headers.set('x-session-expired-silent', '1');
      if (effectiveToken) {
        headers.set('Authorization', `Bearer ${effectiveToken}`);
      }

      const response = await fetch(input, { ...init, headers });

      let tokenOrigin: string | null = null;
      try {
        tokenOrigin = localStorage.getItem('bazi_token_origin');
      } catch {
        tokenOrigin = null;
      }

      const shouldEnforceAuth = Boolean(effectiveToken)
        && (tokenOrigin === 'backend' || isBackendToken(effectiveToken));

      if ((response.headers.get('x-session-expired') === '1' || response.status === 401) && shouldEnforceAuth) {
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
        redirectToLogin();
        if (response.headers.get('x-session-expired') === '1') {
          return new Response(null, { status: 401, statusText: 'Session expired' });
        }
      }
      return response;
    },
    [token, logout, navigate, location, setRetryAction]
  );
}
