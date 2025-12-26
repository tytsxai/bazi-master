import { Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import App from './App.jsx';
import './index.css';
import './i18n';
import { AuthProvider } from './auth/AuthContext.jsx';

createRoot(document.getElementById('root')).render(
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
