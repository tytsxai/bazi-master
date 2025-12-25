import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Login() {
  const { t } = useTranslation();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthError, setOauthError] = useState('');
  const [loginError, setLoginError] = useState('');
  const isSubmittingRef = useRef(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetErrors, setResetErrors] = useState({});
  const [resetStatus, setResetStatus] = useState(null);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

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

  const validateResetRequest = (nextEmail) => {
    const nextErrors = {};
    if (!nextEmail.trim()) {
      nextErrors.email = 'Email is required.';
    } else if (!emailPattern.test(nextEmail)) {
      nextErrors.email = 'Enter a valid email address.';
    }
    return nextErrors;
  };

  const validateResetConfirm = (nextToken, nextPassword) => {
    const nextErrors = {};
    if (!nextToken.trim()) {
      nextErrors.token = 'Reset code is required.';
    }
    if (!nextPassword) {
      nextErrors.password = 'New password is required.';
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

  const sanitizeNextPath = (value) => {
    if (!value || typeof value !== 'string') return null;
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    return value;
  };

  const decodeUserParam = (value) => {
    if (!value) return null;
    try {
      const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
      const decoded = atob(padded);
      return JSON.parse(decoded);
    } catch {
      return null;
    }
  };

  const readErrorMessage = async (response, fallback) => {
    const text = await response.text();
    if (!text) return fallback;
    try {
      const parsed = JSON.parse(text);
      return parsed?.error || parsed?.message || fallback;
    } catch {
      return text;
    }
  };

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setResetErrors({});
    setResetStatus(null);
    setIsResetSubmitting(false);
    setOauthError('');
    setLoginError('');
  };

  const getLoginErrorMessage = (error) => {
    const message =
      error instanceof Error && error.message
        ? error.message
        : 'Login failed. Please try again.';
    if (message.toLowerCase() === 'login failed') {
      return 'Incorrect email or password.';
    }
    return message;
  };

  const getOauthErrorMessage = (error, provider) => {
    if (!error) return '';
    const isWeChat = provider === 'wechat';
    const defaultMessage = isWeChat
      ? 'WeChat sign-in failed. Please try again.'
      : 'Google sign-in failed. Please try again.';
    const mappings = isWeChat
      ? {
          wechat_missing_params: 'WeChat sign-in did not return the required parameters.',
          wechat_not_configured: 'WeChat sign-in is not configured.',
          wechat_invalid_state: 'WeChat sign-in session expired. Please try again.',
          wechat_token_failed: 'WeChat sign-in could not fetch an access token.',
          wechat_missing_openid: 'WeChat sign-in did not return an account identifier.',
          wechat_oauth_failed: 'WeChat sign-in could not be completed.',
          server_error: 'WeChat sign-in failed due to a server error.',
        }
      : {
          access_denied: 'Google sign-in was cancelled.',
          missing_code: 'Google sign-in did not return an authorization code.',
          invalid_state: 'Google sign-in session expired. Please try again.',
          not_configured: 'Google sign-in is not configured.',
          missing_email: 'Google sign-in did not return an email address.',
          server_error: 'Google sign-in failed due to a server error.',
        };
    return mappings[error] || defaultMessage;
  };

  const getFirstErrorMessage = (nextErrors) => {
    const firstMessage = Object.values(nextErrors || {}).find(
      (value) => typeof value === 'string' && value.trim()
    );
    return firstMessage || '';
  };

  const loginErrorAnnouncement =
    loginError || oauthError || getFirstErrorMessage(errors);
  const resetErrorAnnouncement =
    (resetStatus?.type === 'error' ? resetStatus.message : '') || getFirstErrorMessage(resetErrors);

  useEffect(() => {
    if (!isAuthenticated) return;
    const next = resolveRedirectPath(location.state?.from);
    navigate(next, { replace: true });
  }, [isAuthenticated, location.state, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const tokenParam = params.get('token');
    const userParam = params.get('user');
    const nextParam = params.get('next');
    const errorParam = params.get('error');
    const providerParam = params.get('provider');

    if (errorParam) {
      setOauthError(getOauthErrorMessage(errorParam, providerParam));
    }

    if (!tokenParam) return;
    const userFromParam = decodeUserParam(userParam);
    localStorage.setItem('bazi_token', tokenParam);
    if (userFromParam) {
      localStorage.setItem('bazi_user', JSON.stringify(userFromParam));
    }
    localStorage.setItem('bazi_last_activity', String(Date.now()));

    const nextPath = sanitizeNextPath(nextParam) || resolveRedirectPath(location.state?.from);
    window.location.replace(nextPath);
  }, [location.search, location.state, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    setLoginError('');
    const nextErrors = validate(email, password);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      isSubmittingRef.current = true;
      setIsSubmitting(true);
      await login(email, password);
    } catch (error) {
      setLoginError(getLoginErrorMessage(error));
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    const nextPath = resolveRedirectPath(location.state?.from);
    const params = new URLSearchParams();
    if (nextPath) params.set('next', nextPath);
    window.location.assign(`/api/auth/google?${params.toString()}`);
  };

  const handleWeChatLogin = () => {
    const nextPath = resolveRedirectPath(location.state?.from);
    const params = new URLSearchParams();
    if (nextPath) params.set('next', nextPath);
    window.location.assign(`/api/auth/wechat/redirect?${params.toString()}`);
  };

  const handleRequestReset = async (event) => {
    event.preventDefault();
    const nextErrors = validateResetRequest(resetEmail);
    setResetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      setIsResetSubmitting(true);
      const res = await fetch('/api/password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to request reset.');
        setResetStatus({ type: 'error', message });
        return;
      }
      const data = await res.json();
      setResetStatus({
        type: 'success',
        message: data?.message || 'If an account exists for that email, a reset link has been sent.',
      });
    } catch (error) {
      setResetStatus({
        type: 'error',
        message: 'Network error. Please try again.',
      });
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleConfirmReset = async (event) => {
    event.preventDefault();
    const nextErrors = validateResetConfirm(resetToken, resetPassword);
    setResetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      setIsResetSubmitting(true);
      const res = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), password: resetPassword }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to reset password.');
        setResetStatus({ type: 'error', message });
        return;
      }
      setResetStatus({
        type: 'success',
        message: 'Password updated. You can log in now.',
      });
      setResetPassword('');
      setResetToken('');
    } catch (error) {
      setResetStatus({
        type: 'error',
        message: 'Network error. Please try again.',
      });
    } finally {
      setIsResetSubmitting(false);
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container flex min-h-[70vh] items-center justify-center">
      <form
        onSubmit={mode === 'login' ? handleSubmit : mode === 'request' ? handleRequestReset : handleConfirmReset}
        className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glass"
      >
        <h1 className="font-display text-3xl text-gold-400">
          {mode === 'login' ? t('login.title') : mode === 'request' ? 'Reset password' : 'Set new password'}
        </h1>

        {mode === 'login' && (
          <>
            <div className="sr-only" role="alert" aria-live="assertive">
              {loginErrorAnnouncement}
            </div>
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
                  if (loginError) setLoginError('');
                  if (errors.email && emailPattern.test(value)) {
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
                  if (loginError) setLoginError('');
                  if (errors.password && value) {
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
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="mt-3 w-full rounded-full border border-white/20 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-gold-400 hover:text-gold-300"
            >
              Continue with Google
            </button>
            <button
              type="button"
              onClick={handleWeChatLogin}
              className="mt-3 w-full rounded-full border border-emerald-300/60 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 shadow-lg shadow-emerald-500/20 hover:border-emerald-300"
            >
              Continue with WeChat
            </button>
            {oauthError && (
              <p className="mt-3 text-xs text-rose-200" role="alert">
                {oauthError}
              </p>
            )}
            {loginError && (
              <p className="mt-3 text-xs text-rose-200" role="alert">
                {loginError}
              </p>
            )}
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('request')}
              >
                Forgot password?
              </button>
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('reset')}
              >
                Have a reset code?
              </button>
            </div>
            <p className="mt-4 text-xs text-white/60">
              Demo access only: use any email and password to continue.
            </p>
          </>
        )}

        {mode === 'request' && (
          <>
            <div className="sr-only" role="alert" aria-live="assertive">
              {resetErrorAnnouncement}
            </div>
            <div className="mt-6">
              <label htmlFor="reset-email" className="block text-sm text-white/80">
                Email
              </label>
              <input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(event) => {
                  const value = event.target.value;
                  setResetEmail(value);
                  setResetStatus(null);
                  if (resetErrors.email && emailPattern.test(value)) {
                    setResetErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                placeholder="seer@example.com"
                required
                aria-invalid={Boolean(resetErrors.email)}
                aria-describedby={resetErrors.email ? 'reset-email-error' : undefined}
              />
              {resetErrors.email && (
                <span id="reset-email-error" className="mt-2 block text-xs text-rose-200">
                  {resetErrors.email}
                </span>
              )}
            </div>
            {resetStatus && (
              <p
                role={resetStatus.type === 'error' ? 'alert' : 'status'}
                aria-live={resetStatus.type === 'error' ? 'assertive' : 'polite'}
                className={`mt-4 text-xs ${resetStatus.type === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}
              >
                {resetStatus.message}
              </p>
            )}
            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isResetSubmitting}
            >
              {isResetSubmitting ? 'Sending...' : 'Send reset link'}
            </button>
            <p className="mt-4 text-xs text-white/60">
              For this demo, reset codes are logged on the server.
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('login')}
              >
                Back to login
              </button>
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('reset')}
              >
                Have a reset code?
              </button>
            </div>
          </>
        )}

        {mode === 'reset' && (
          <>
            <div className="sr-only" role="alert" aria-live="assertive">
              {resetErrorAnnouncement}
            </div>
            <div className="mt-6">
              <label htmlFor="reset-token" className="block text-sm text-white/80">
                Reset code
              </label>
              <input
                id="reset-token"
                type="text"
                value={resetToken}
                onChange={(event) => {
                  const value = event.target.value;
                  setResetToken(value);
                  setResetStatus(null);
                  if (resetErrors.token && value.trim()) {
                    setResetErrors((prev) => ({ ...prev, token: undefined }));
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                placeholder="Paste the reset code"
                required
                aria-invalid={Boolean(resetErrors.token)}
                aria-describedby={resetErrors.token ? 'reset-token-error' : undefined}
              />
              {resetErrors.token && (
                <span id="reset-token-error" className="mt-2 block text-xs text-rose-200">
                  {resetErrors.token}
                </span>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor="reset-password" className="block text-sm text-white/80">
                New password
              </label>
              <input
                id="reset-password"
                type="password"
                value={resetPassword}
                onChange={(event) => {
                  const value = event.target.value;
                  setResetPassword(value);
                  setResetStatus(null);
                  if (resetErrors.password && value) {
                    setResetErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                placeholder="••••••••"
                required
                aria-invalid={Boolean(resetErrors.password)}
                aria-describedby={resetErrors.password ? 'reset-password-error' : undefined}
              />
              {resetErrors.password && (
                <span id="reset-password-error" className="mt-2 block text-xs text-rose-200">
                  {resetErrors.password}
                </span>
              )}
            </div>
            {resetStatus && (
              <p
                role={resetStatus.type === 'error' ? 'alert' : 'status'}
                aria-live={resetStatus.type === 'error' ? 'assertive' : 'polite'}
                className={`mt-4 text-xs ${resetStatus.type === 'error' ? 'text-rose-200' : 'text-emerald-200'}`}
              >
                {resetStatus.message}
              </p>
            )}
            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isResetSubmitting}
            >
              {isResetSubmitting ? 'Updating...' : 'Update password'}
            </button>
            <p className="mt-4 text-xs text-white/60">
              For this demo, reset codes are logged on the server.
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('login')}
              >
                Back to login
              </button>
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('request')}
              >
                Resend reset link
              </button>
            </div>
          </>
        )}
      </form>
    </main>
  );
}
