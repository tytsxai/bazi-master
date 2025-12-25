import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  const isGuest = !isAuthenticated || !user;
  const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;

  if (isGuest) {
    let target = '/login';
    const params = new URLSearchParams();
    if (redirectPath) {
      params.set('next', redirectPath);
    }
    try {
      const expired = localStorage.getItem('bazi_session_expired') === '1';
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

  return children;
}
