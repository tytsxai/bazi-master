import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  const isGuest = !isAuthenticated || !user;

  if (isGuest) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
