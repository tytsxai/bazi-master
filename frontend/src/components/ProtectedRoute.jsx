import { Navigate, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import { sanitizeRedirectPath } from '../utils/redirect';

export default function ProtectedRoute({ children }) {
  const { t } = useTranslation();
  const { isAuthenticated, isAuthResolved, user } = useAuth();
  const location = useLocation();

  const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;

  if (!isAuthResolved) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-gray-600">
        {t('common.loadingAccount')}
      </div>
    );
  }

  if (!isAuthenticated) {
    let target = '/login';
    const params = new URLSearchParams();
    const safeNext = sanitizeRedirectPath(redirectPath, null);
    if (safeNext) params.set('next', safeNext);
    try {
      const expired =
        localStorage.getItem('bazi_session_expired') === '1' ||
        sessionStorage.getItem('bazi_session_expired') === '1';
      if (expired) {
        params.set('reason', 'session_expired');
      }
    } catch {
      // Ignore storage access issues.
    }
    if (params.size) {
      target = `/login?${params.toString()}`;
    }
    return <Navigate to={target} replace state={{ from: redirectPath }} />;
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-gray-600">
        {t('common.loadingAccount')}
      </div>
    );
  }

  return children;
}
