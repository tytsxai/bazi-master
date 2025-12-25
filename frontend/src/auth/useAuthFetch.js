import { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

export const SESSION_EXPIRED_REASON = 'session_expired';

export function useAuthFetch() {
  const { token, logout, setRetryAction } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  return useCallback(
    async (input, init = {}, retryAction = null) => {
      const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
      const params = new URLSearchParams({ reason: SESSION_EXPIRED_REASON, next: redirectPath });
      const target = `/login?${params.toString()}`;
      const redirectToLogin = () => {
        navigate(target, {
          replace: true,
          state: { from: redirectPath },
        });
        window.setTimeout(() => {
          if (window.location.pathname !== '/login') {
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
      if (response.headers.get('x-session-expired') === '1' || response.status === 401) {
        if (retryAction) {
          setRetryAction({ ...retryAction, redirectPath });
        }
        logout({ preserveRetry: Boolean(retryAction) });
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
