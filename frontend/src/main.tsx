import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import * as Sentry from '@sentry/react';
import App from './App';
import './index.css';
import './i18n';
import { AuthProvider } from './auth/AuthContext';

if (import.meta.env.VITE_SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

const installLegacyAuthFetch = () => {
  if (typeof window === 'undefined') return;
  const win = window as typeof window & {
    __baziFetchPatched?: boolean;
    __baziOriginalFetch?: typeof fetch;
  };
  if (win.__baziFetchPatched) return;
  const isE2E = import.meta.env.MODE === 'test' || import.meta.env.VITE_E2E === '1';

  const getStorageItem = (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  };

  const getLegacyToken = () => getStorageItem('bazi_token');
  const getLegacyOrigin = () => getStorageItem('bazi_token_origin');

  const isApiRequest = (url: string) => {
    if (url.startsWith('/api/')) return true;
    try {
      const parsed = new URL(url, window.location.origin);
      return parsed.origin === window.location.origin && parsed.pathname.startsWith('/api/');
    } catch {
      return false;
    }
  };

  const originalFetch = window.fetch.bind(window);
  win.__baziOriginalFetch = originalFetch;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const token = getLegacyToken();
    const origin = getLegacyOrigin();
    if (!token || (!isE2E && origin !== 'backend')) {
      return originalFetch(input, init);
    }

    const url =
      typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

    if (!isApiRequest(url)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(
      init?.headers || (input instanceof Request ? input.headers : undefined)
    );
    if (!headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    const nextInit = { ...init, headers };
    return originalFetch(input, nextInit);
  };
  win.__baziFetchPatched = true;
};

installLegacyAuthFetch();

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
    <HelmetProvider>
      <AuthProvider>
        <Suspense fallback="Loading...">
          <App />
        </Suspense>
      </AuthProvider>
    </HelmetProvider>
  </BrowserRouter>
);
