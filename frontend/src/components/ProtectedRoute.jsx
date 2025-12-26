import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext.jsx';

export default function ProtectedRoute({ children }) {
  const { isAuthenticated, user, refreshUser, logout } = useAuth();
  const location = useLocation();
  const [isVerifying, setIsVerifying] = useState(false);
  const [verificationFailed, setVerificationFailed] = useState(false);

  const redirectPath = `${location.pathname}${location.search || ''}${location.hash || ''}`;

  useEffect(() => {
    if (!isAuthenticated || user) {
      if (verificationFailed) setVerificationFailed(false);
      return;
    }
    if (isVerifying || verificationFailed) return;
    let active = true;
    setIsVerifying(true);
    refreshUser()
      .then((nextUser) => {
        if (!active) return;
        if (!nextUser) {
          setVerificationFailed(true);
        }
      })
      .catch(() => {
        if (active) setVerificationFailed(true);
      })
      .finally(() => {
        if (active) setIsVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [isAuthenticated, user, refreshUser, isVerifying, verificationFailed]);

  if (!isAuthenticated) {
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

  if (!user && verificationFailed) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-gray-600">
        <p>Unable to load your account. Please try again.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            className="rounded-md bg-gray-900 px-3 py-2 text-xs font-semibold text-white hover:bg-gray-700"
            onClick={() => setVerificationFailed(false)}
          >
            Retry
          </button>
          <button
            type="button"
            className="rounded-md border border-gray-300 px-3 py-2 text-xs font-semibold text-gray-700 hover:border-gray-400"
            onClick={() => logout()}
          >
            Sign in again
          </button>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-gray-600">
        Loading your account...
      </div>
    );
  }

  return children;
}
