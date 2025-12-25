import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth/AuthContext.jsx';
import Header from './components/Header.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import Home from './pages/Home.jsx';
import Login from './pages/Login.jsx';
import Profile from './pages/Profile.jsx';
import History from './pages/History.jsx';
import Favorites from './pages/Favorites.jsx';
import BaziRecordDetails from './pages/BaziRecordDetails.jsx';
import Bazi from './pages/Bazi.jsx';
import Tarot from './pages/Tarot.jsx';
import Iching from './pages/Iching.jsx';
import Zodiac from './pages/Zodiac.jsx';
import Ziwei from './pages/Ziwei.jsx';
import NotFound from './pages/NotFound.jsx';

function AdminRoute({ children }) {
  const { isAuthenticated, user, token } = useAuth();
  const location = useLocation();
  const [status, setStatus] = useState('checking');
  const shouldVerify = Boolean(token && /^token_\d+_/.test(token));

  useEffect(() => {
    if (!isAuthenticated || !user || !user.isAdmin) {
      setStatus('checking');
      return;
    }
    if (!shouldVerify) {
      setStatus('allowed');
      return;
    }
    let isActive = true;
    const controller = new AbortController();
    const verifyAdmin = async () => {
      setStatus('checking');
      try {
        const res = await fetch('/api/admin/health', {
          headers: { Authorization: `Bearer ${token}` },
          signal: controller.signal,
        });
        if (!isActive) return;
        if (res.status === 401) {
          setStatus('unauthenticated');
          return;
        }
        if (res.status === 403) {
          setStatus('forbidden');
          return;
        }
        setStatus(res.ok ? 'allowed' : 'forbidden');
      } catch (error) {
        if (isActive && error?.name !== 'AbortError') {
          setStatus('forbidden');
        }
      }
    };
    verifyAdmin();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [isAuthenticated, shouldVerify, token, user]);

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/403" replace />;
  }

  if (shouldVerify && status !== 'allowed') {
    if (status === 'unauthenticated') {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    if (status === 'forbidden') {
      return <Navigate to="/403" replace />;
    }
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-gray-600">
        Verifying admin access...
      </div>
    );
  }

  return children;
}

function NotFoundRedirect() {
  const location = useLocation();
  const missingPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;
  return <Navigate to="/404" replace state={{ from: missingPath }} />;
}

function Forbidden() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">403 - Forbidden</h1>
      <p className="mt-4 text-base text-gray-600">
        You do not have access to this admin area.
      </p>
    </div>
  );
}

function AdminArea() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">Admin</h1>
      <p className="mt-2 text-sm text-gray-600">Restricted area for administrators.</p>
    </div>
  );
}

export default function App() {
  const { i18n } = useTranslation();

  useEffect(() => {
    document.documentElement.lang = i18n.language || 'en-US';
  }, [i18n.language]);

  useEffect(() => {
    const handleError = (event) => {
      if (typeof event?.message === 'string' && event.message.includes('Failed to load resource')) {
        event.preventDefault();
      }
    };
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  }, []);

  return (
    <section className="min-h-screen">
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Login />} />
        <Route path="/bazi" element={<Bazi />} />
        <Route path="/tarot" element={<Tarot />} />
        <Route path="/iching" element={<Iching />} />
        <Route path="/zodiac" element={<Zodiac />} />
        <Route
          path="/ziwei"
          element={
            <ProtectedRoute>
              <Ziwei />
            </ProtectedRoute>
          }
        />
        <Route path="/404" element={<NotFound />} />
        <Route path="/403" element={<Forbidden />} />
        <Route
          path="/admin"
          element={
            <AdminRoute>
              <AdminArea />
            </AdminRoute>
          }
        />
        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history"
          element={
            <ProtectedRoute>
              <History />
            </ProtectedRoute>
          }
        />
        <Route
          path="/history/:id"
          element={
            <ProtectedRoute>
              <BaziRecordDetails />
            </ProtectedRoute>
          }
        />
        <Route
          path="/favorites"
          element={
            <ProtectedRoute>
              <Favorites />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<NotFoundRedirect />} />
      </Routes>
    </section>
  );
}
