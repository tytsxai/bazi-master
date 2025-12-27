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
    integrations: [
      Sentry.browserTracingIntegration(),
      Sentry.replayIntegration(),
    ],
    tracesSampleRate: 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');

createRoot(rootElement).render(
  <BrowserRouter>
    <HelmetProvider>
      <AuthProvider>
        <Suspense fallback="Loading...">
          <App />
        </Suspense>
      </AuthProvider>
    </HelmetProvider>
  </BrowserRouter>
);
