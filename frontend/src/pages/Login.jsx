import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { t } = useTranslation();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isSubmittingRef = useRef(false);

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = (nextEmail, nextPassword) => {
    const nextErrors = {};

    if (!nextEmail.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!emailPattern.test(nextEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }

    if (!nextPassword) {
      nextErrors.password = 'Password is required.';
    }

    return nextErrors;
  };

  const resolveRedirectPath = (from) => {
    if (!from) return '/profile';
    if (typeof from === 'string') return from;
    if (from.pathname) {
      return `${from.pathname}${from.search || ''}${from.hash || ''}`;
    }
    return '/profile';
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    const next = resolveRedirectPath(location.state?.from);
    navigate(next, { replace: true });
  }, [isAuthenticated, location.state, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    const nextErrors = validate(email, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      await login(email, password);
    } catch (error) {
      alert('Login failed: ' + error.message);
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-[70vh] items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glass"
      >
        <h1 className="font-display text-3xl text-gold-400">{t('login.title')}</h1>
        <div className="mt-6">
          <label htmlFor="email" className="block text-sm text-white/80">
            {t('login.email')}
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(event) => {
              const value = event.target.value;
              setEmail(value);
              if (errors.email) {
                setErrors((prev) => ({ ...prev, email: undefined }));
              }
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
            placeholder="seer@example.com"
            required
            aria-invalid={Boolean(errors.email)}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
          {errors.email && (
            <span id="login-email-error" className="mt-2 block text-xs text-rose-200">
              {errors.email}
            </span>
          )}
        </div>
        <div className="mt-4">
          <label htmlFor="password" className="block text-sm text-white/80">
            {t('login.password')}
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(event) => {
              const value = event.target.value;
              setPassword(value);
              if (errors.password) {
                setErrors((prev) => ({ ...prev, password: undefined }));
              }
            }}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
            placeholder="••••••••"
            required
            aria-invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? 'login-password-error' : undefined}
          />
          {errors.password && (
            <span id="login-password-error" className="mt-2 block text-xs text-rose-200">
              {errors.password}
            </span>
          )}
        </div>
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
          disabled={isSubmitting}
        >
          {isSubmitting ? `${t('login.submit')}...` : t('login.submit')}
        </button>
        <p className="mt-4 text-xs text-white/60">
          Demo access only: use any email and password to continue.
        </p>
      </form>
    </main>
  );
}
