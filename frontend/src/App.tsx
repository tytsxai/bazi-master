import { ReactNode, useEffect, useMemo, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from './auth/AuthContext';
import Header from './components/Header';
import OfflineNotice from './components/OfflineNotice';
import SoulPortrait from './components/soul/SoulPortrait';
import Synastry from './components/synastry/Synastry';
import ProtectedRoute from './components/ProtectedRoute';
import { BaziProvider } from './context/BaziContext';
import Home from './pages/Home';
import Login from './pages/Login';
import Profile from './pages/Profile';
import History from './pages/History';
import Favorites from './pages/Favorites';
import BaziRecordDetails from './pages/BaziRecordDetails';
import Bazi from './pages/Bazi';
import Tarot from './pages/Tarot';
import Iching from './pages/Iching';
import Zodiac from './pages/Zodiac';
import Ziwei from './pages/Ziwei';
import NotFound from './pages/NotFound';

interface AdminRouteProps {
  children: ReactNode;
}

function AdminRoute({ children }: AdminRouteProps) {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();
  const isE2E = import.meta.env.MODE === 'test' || import.meta.env.VITE_E2E === '1';

  // Compute initial status synchronously outside effect
  // Compute derived status synchronously
  const computedStatus = useMemo(() => {
    if (!isAuthenticated || !user) return 'checking';
    if (!user.isAdmin) return 'forbidden';
    return null; // Requires async verification
  }, [isAuthenticated, user]);

  const [verificationStatus, setVerificationStatus] = useState<string | null>(null);

  useEffect(() => {
    // Only run async verification when needed
    if (computedStatus !== null || isE2E) {
      return;
    }
    let isActive = true;
    const controller = new AbortController();
    const verifyAdmin = async () => {
      try {
        const res = await fetch('/api/admin/health', {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!isActive) return;
        if (res.status === 401) {
          setVerificationStatus('unauthenticated');
          return;
        }
        if (res.status === 403) {
          setVerificationStatus('forbidden');
          return;
        }
        setVerificationStatus(res.ok ? 'allowed' : 'forbidden');
      } catch (error: unknown) {
        if (isActive && error instanceof Error && error.name !== 'AbortError') {
          setVerificationStatus('forbidden');
        }
      }
    };
    verifyAdmin();
    return () => {
      isActive = false;
      controller.abort();
    };
  }, [computedStatus, isE2E]);

  const status = computedStatus ?? verificationStatus ?? 'checking';

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!user.isAdmin) {
    return <Navigate to="/403" replace />;
  }

  if (isE2E) {
    return children;
  }

  if (status !== 'allowed') {
    if (status === 'unauthenticated') {
      return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }
    if (status === 'forbidden') {
      return <Navigate to="/403" replace />;
    }
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-gray-600">
        {t('admin.verifying')}
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
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-3xl font-semibold">{t('admin.forbiddenTitle')}</h1>
      <p className="mt-4 text-base text-gray-600">{t('admin.forbiddenDesc')}</p>
    </div>
  );
}

function AdminArea() {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-2xl font-semibold">{t('admin.areaTitle')}</h1>
      <p className="mt-2 text-sm text-gray-600">{t('admin.areaDesc')}</p>
    </div>
  );
}

export default function App() {
  return (
    <BaziProvider>
      <section className="min-h-screen">
        <Header />
        <OfflineNotice />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Login />} />
          <Route path="/bazi" element={<Bazi />} />
          <Route path="/tarot" element={<Tarot />} />
          <Route path="/iching" element={<Iching />} />
          <Route path="/zodiac" element={<Zodiac />} />
          <Route path="/synastry" element={<Synastry />} />
          <Route
            path="/soul-portrait"
            element={
              <ProtectedRoute>
                <SoulPortrait />
              </ProtectedRoute>
            }
          />
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
    </BaziProvider>
  );
}
