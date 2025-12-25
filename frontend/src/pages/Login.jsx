import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';
import Breadcrumbs from '../components/Breadcrumbs.jsx';
import { readApiErrorMessage } from '../utils/apiError.js';

const SESSION_EXPIRED_KEY = 'bazi_session_expired';

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
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerErrors, setRegisterErrors] = useState({});
  const [registerStatus, setRegisterStatus] = useState('');
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetErrors, setResetErrors] = useState({});
  const [resetStatus, setResetStatus] = useState(null);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [sessionNotice, setSessionNotice] = useState('');

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validate = (nextEmail, nextPassword, t) => {
    const nextErrors = {};

    if (!nextEmail.trim()) {
      nextErrors.email = t('login.errors.emailRequired');
    } else if (!emailPattern.test(nextEmail)) {
      nextErrors.email = t('login.errors.emailInvalid');
    }

    if (!nextPassword) {
      nextErrors.password = t('login.errors.passwordRequired');
    }

    return nextErrors;
  };

  const validatePasswordStrength = (value, t) => {
    const trimmed = value.trim();
    if (trimmed.length < 8) return t('login.errors.passwordStrength');
    if (!/[A-Za-z]/.test(trimmed) || !/\d/.test(trimmed)) return t('login.errors.passwordStrength');
    return '';
  };

  const validateRegister = (payload, t) => {
    const nextErrors = {};
    const nameValue = payload.name.trim();
    if (!payload.email.trim()) {
      nextErrors.email = t('login.errors.emailRequired');
    } else if (!emailPattern.test(payload.email)) {
      nextErrors.email = t('login.errors.emailInvalid');
    }
    if (!payload.password) {
      nextErrors.password = t('login.errors.passwordRequired');
    } else {
      const strengthError = validatePasswordStrength(payload.password, t);
      if (strengthError) nextErrors.password = strengthError;
    }
    const confirmValue = payload.confirm.trim();
    if (confirmValue && confirmValue !== payload.password) {
      nextErrors.confirm = t('login.errors.passwordsNotMatch');
    }
    if (nameValue.length > 0 && nameValue.length < 2) {
      nextErrors.name = t('login.errors.nameTooShort');
    }
    return nextErrors;
  };

  const validateResetRequest = (nextEmail, t) => {
    const nextErrors = {};
    if (!nextEmail.trim()) {
      nextErrors.email = t('login.errors.emailRequired');
    } else if (!emailPattern.test(nextEmail)) {
      nextErrors.email = t('login.errors.emailInvalid');
    }
    return nextErrors;
  };

  const validateResetConfirm = (nextToken, nextPassword, t) => {
    const nextErrors = {};
    if (!nextToken.trim()) {
      nextErrors.token = t('login.errors.tokenRequired');
    }
    if (!nextPassword) {
      nextErrors.password = t('login.errors.newPasswordRequired');
    } else {
      const strengthError = validatePasswordStrength(nextPassword, t);
      if (strengthError) nextErrors.password = strengthError;
    }
    return nextErrors;
  };

  const sanitizeNextPath = (value) => {
    if (!value || typeof value !== 'string') return null;
    if (!value.startsWith('/') || value.startsWith('//')) return null;
    return value;
  };

  const getStateRedirectPath = () => {
    const from = location.state?.from;
    if (!from) return null;
    if (typeof from === 'string') return sanitizeNextPath(from);
    if (from.pathname) {
      return sanitizeNextPath(`${from.pathname}${from.search || ''}${from.hash || ''}`);
    }
    return null;
  };

  const buildAuthSearch = () => {
    const params = new URLSearchParams();
    const currentParams = new URLSearchParams(location.search);
    const nextParam = sanitizeNextPath(currentParams.get('next')) || getStateRedirectPath();
    const reason = currentParams.get('reason');
    if (reason) params.set('reason', reason);
    if (nextParam) params.set('next', nextParam);
    return params.toString();
  };

  const resolveRedirectPath = (from, search = '') => {
    if (from) {
      if (typeof from === 'string') return from;
      if (from.pathname) {
        return `${from.pathname}${from.search || ''}${from.hash || ''}`;
      }
    }
    if (search) {
      const params = new URLSearchParams(search);
      const nextParam = sanitizeNextPath(params.get('next'));
      if (nextParam) return nextParam;
    }
    return '/profile';
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

  const readErrorMessage = (response, fallback) => readApiErrorMessage(response, fallback);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setResetErrors({});
    setResetStatus(null);
    setIsResetSubmitting(false);
    setOauthError('');
    setLoginError('');
    setRegisterErrors({});
    setRegisterStatus('');
    setIsRegisterSubmitting(false);
  };

  const getLoginErrorMessage = (error) => {
    const message =
      error instanceof Error && error.message
        ? error.message
        : t('login.errors.loginFailed');
    if (message.toLowerCase() === 'login failed') {
      return t('login.errors.loginFailed');
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
  const registerErrorAnnouncement =
    Object.values(registerErrors).find(Boolean) || registerStatus;
  const resetErrorAnnouncement =
    (resetStatus?.type === 'error' ? resetStatus.message : '') || getFirstErrorMessage(resetErrors);

  useEffect(() => {
    if (!isAuthenticated) return;
    const next = resolveRedirectPath(location.state?.from, location.search);
    navigate(next, { replace: true });
  }, [isAuthenticated, location.state, navigate]);

  useEffect(() => {
    if (location.pathname === '/register') {
      setMode('register');
    } else if (location.pathname === '/login') {
      setMode('login');
    }
  }, [location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let reason = params.get('reason');
    if (!reason) {
      try {
        const hasExpiredFlag = localStorage.getItem(SESSION_EXPIRED_KEY) === '1';
        if (hasExpiredFlag) {
          const nextFromState = sanitizeNextPath(location.state?.from);
          const nextValue = params.get('next') || nextFromState || '';
          const forcedParams = new URLSearchParams();
          forcedParams.set('reason', 'session_expired');
          if (nextValue) {
            forcedParams.set('next', nextValue);
          }
          params.forEach((value, key) => {
            if (key === 'reason' || key === 'next') return;
            forcedParams.append(key, value);
          });
          const search = forcedParams.toString();
          const target = `/login?${search}`;
          navigate(target, { replace: true, state: location.state });
          if (`${location.pathname}${location.search || ''}` !== target) {
            window.location.replace(target);
          }
          reason = 'session_expired';
        }
      } catch {
        // Ignore storage failures.
      }
    }
    if (reason === 'session_expired') {
      setSessionNotice(t('login.sessionExpired'));
      try {
        localStorage.removeItem(SESSION_EXPIRED_KEY);
      } catch {
        // Ignore storage failures.
      }
    } else {
      setSessionNotice('');
    }
  }, [location.search, location.state, navigate, t]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(
      location.hash && location.hash.startsWith('#') ? location.hash.slice(1) : ''
    );

    const tokenParam = hashParams.get('token') || searchParams.get('token');
    const userParam = hashParams.get('user') || searchParams.get('user');
    const nextParam = searchParams.get('next');
    const errorParam = searchParams.get('error');
    const providerParam = searchParams.get('provider');

    if (errorParam) {
      setOauthError(getOauthErrorMessage(errorParam, providerParam));
    }

    if (!tokenParam) return;
    const userFromParam = decodeUserParam(userParam);
    localStorage.setItem('bazi_token', tokenParam);
    localStorage.setItem('bazi_token_origin', 'backend');
    if (userFromParam) {
      localStorage.setItem('bazi_user', JSON.stringify(userFromParam));
    }
    localStorage.setItem('bazi_last_activity', String(Date.now()));

    const nextPath = sanitizeNextPath(nextParam) || resolveRedirectPath(location.state?.from, location.search);
    window.location.replace(nextPath);
  }, [location.search, location.hash, location.state, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    setLoginError('');
    const nextErrors = validate(email, password, t);
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

  const handleRegister = async (event) => {
    event.preventDefault();
    if (isRegisterSubmitting) return;
    setRegisterStatus('');
    const payload = {
      name: registerName,
      email: registerEmail,
      password: registerPassword,
      confirm: registerConfirm,
    };
    const nextErrors = validateRegister(payload, t);
    setRegisterErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsRegisterSubmitting(true);
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: payload.name.trim() || null,
          email: payload.email.trim(),
          password: payload.password,
        }),
      });
      if (!res.ok) {
        const message = await readErrorMessage(res, 'Unable to register.');
        setRegisterStatus(message);
        return;
      }
      await res.json();
      await login(payload.email.trim(), payload.password);
    } catch (error) {
      setRegisterStatus(error?.message || 'Unable to register.');
    } finally {
      setIsRegisterSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    const nextPath = resolveRedirectPath(location.state?.from, location.search);
    const params = new URLSearchParams();
    if (nextPath) params.set('next', nextPath);
    window.location.assign(`/api/auth/google?${params.toString()}`);
  };

  const handleWeChatLogin = () => {
    const nextPath = resolveRedirectPath(location.state?.from, location.search);
    const params = new URLSearchParams();
    if (nextPath) params.set('next', nextPath);
    window.location.assign(`/api/auth/wechat/redirect?${params.toString()}`);
  };

  const handleRequestReset = async (event) => {
    event.preventDefault();
    const nextErrors = validateResetRequest(resetEmail, t);
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
        message: data?.message || t('login.ui.resetSent'),
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
    const nextErrors = validateResetConfirm(resetToken, resetPassword, t);
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
        message: t('login.ui.passwordUpdated'),
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
    <main id="main-content" tabIndex={-1} className="responsive-container flex min-h-[70vh] flex-col items-center justify-center gap-4">
      <div className="w-full max-w-md">
        <Breadcrumbs />
      </div>
      <form
        onSubmit={
          mode === 'login'
            ? handleSubmit
            : mode === 'register'
              ? handleRegister
              : mode === 'request'
                ? handleRequestReset
                : handleConfirmReset
        }
        className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glass"
      >
        <h1 className="font-display text-3xl text-gold-400">
          {mode === 'login'
            ? t('login.title')
            : mode === 'register'
              ? t('login.registerTitle', { defaultValue: 'Create account' })
              : mode === 'request'
                ? t('login.ui.resetPassword')
                : t('login.ui.setNewPassword')}
        </h1>
        {sessionNotice && (
          <div
            role="status"
            className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100"
          >
            {sessionNotice}
          </div>
        )}

        {mode === 'login' && (
          <>
            {loginErrorAnnouncement ? (
              <div className="sr-only" role="alert" aria-live="assertive">
                {loginErrorAnnouncement}
              </div>
            ) : null}
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
                {t('login.ui.forgotPassword')}
              </button>
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('reset')}
              >
                {t('login.ui.haveCode')}
              </button>
            </div>
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <span>{t('login.ui.newHere')}</span>
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => {
                  const search = buildAuthSearch();
                  navigate(search ? `/register?${search}` : '/register');
                }}
              >
                {t('login.registerTitle', { defaultValue: 'Create an account' })}
              </button>
            </div>
            <p className="mt-4 text-xs text-white/60">
              Demo access only: use any email and password to continue.
            </p>
          </>
        )}

        {mode === 'register' && (
          <>
            {registerErrorAnnouncement ? (
              <div className="sr-only" role="alert" aria-live="assertive">
                {registerErrorAnnouncement}
              </div>
            ) : null}
            <div className="mt-6">
              <label htmlFor="register-name" className="block text-sm text-white/80">
                {t('login.ui.displayName')}
              </label>
              <input
                id="register-name"
                type="text"
                value={registerName}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegisterName(value);
                  if (registerErrors.name && value.trim().length >= 2) {
                    setRegisterErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                placeholder="Star Seeker"
                aria-invalid={Boolean(registerErrors.name)}
                aria-describedby={registerErrors.name ? 'register-name-error' : undefined}
              />
              {registerErrors.name && (
                <span id="register-name-error" className="mt-2 block text-xs text-rose-200">
                  {registerErrors.name}
                </span>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor="register-email" className="block text-sm text-white/80">
                {t('login.email')}
              </label>
              <input
                id="register-email"
                type="email"
                value={registerEmail}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegisterEmail(value);
                  if (registerErrors.email && emailPattern.test(value)) {
                    setRegisterErrors((prev) => ({ ...prev, email: undefined }));
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                placeholder="seer@example.com"
                required
                aria-invalid={Boolean(registerErrors.email)}
                aria-describedby={registerErrors.email ? 'register-email-error' : undefined}
              />
              {registerErrors.email && (
                <span id="register-email-error" className="mt-2 block text-xs text-rose-200">
                  {registerErrors.email}
                </span>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor="register-password" className="block text-sm text-white/80">
                {t('login.password')}
              </label>
              <input
                id="register-password"
                type="password"
                value={registerPassword}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegisterPassword(value);
                  if (registerErrors.password && !validatePasswordStrength(value, t)) {
                    setRegisterErrors((prev) => ({ ...prev, password: undefined }));
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                placeholder="••••••••"
                required
                aria-invalid={Boolean(registerErrors.password)}
                aria-describedby={registerErrors.password ? 'register-password-error' : undefined}
              />
              {registerErrors.password && (
                <span id="register-password-error" className="mt-2 block text-xs text-rose-200">
                  {registerErrors.password}
                </span>
              )}
            </div>
            <div className="mt-4">
              <label htmlFor="register-confirm" className="block text-sm text-white/80">
                {t('login.ui.confirmPassword')}
              </label>
              <input
                id="register-confirm"
                type="password"
                value={registerConfirm}
                onChange={(event) => {
                  const value = event.target.value;
                  setRegisterConfirm(value);
                  if (registerErrors.confirm && value === registerPassword) {
                    setRegisterErrors((prev) => ({ ...prev, confirm: undefined }));
                  }
                }}
                className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
                placeholder="••••••••"
                aria-invalid={Boolean(registerErrors.confirm)}
                aria-describedby={registerErrors.confirm ? 'register-confirm-error' : undefined}
              />
              {registerErrors.confirm && (
                <span id="register-confirm-error" className="mt-2 block text-xs text-rose-200">
                  {registerErrors.confirm}
                </span>
              )}
            </div>
            <p className="mt-3 text-xs text-white/60">{t('login.errors.passwordStrength')}</p>
            {registerStatus && (
              <p className="mt-3 text-xs text-rose-200" role="alert">
                {registerStatus}
              </p>
            )}
            <button
              type="submit"
              className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30 disabled:cursor-not-allowed disabled:opacity-70"
              disabled={isRegisterSubmitting}
            >
              {isRegisterSubmitting
                ? `${t('login.registerSubmit', { defaultValue: 'Create account' })}...`
                : t('login.registerSubmit', { defaultValue: 'Create account' })}
            </button>
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => {
                  const search = buildAuthSearch();
                  navigate(search ? `/login?${search}` : '/login');
                }}
              >
                {t('login.ui.backToLogin')}
              </button>
            </div>
          </>
        )}

        {mode === 'request' && (
          <>
            {resetErrorAnnouncement ? (
              <div className="sr-only" role="alert" aria-live="assertive">
                {resetErrorAnnouncement}
              </div>
            ) : null}
            <div className="mt-6">
              <label htmlFor="reset-email" className="block text-sm text-white/80">
                {t('login.email')}
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
              {isResetSubmitting ? 'Sending...' : t('login.ui.sendResetLink')}
            </button>
            <p className="mt-4 text-xs text-white/60">
              For this demo, reset codes are logged on the server.
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => {
                  const search = buildAuthSearch();
                  navigate(search ? `/login?${search}` : '/login');
                }}
              >
                {t('login.ui.backToLogin')}
              </button>
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => switchMode('reset')}
              >
                {t('login.ui.haveCode')}
              </button>
            </div>
          </>
        )}

        {mode === 'reset' && (
          <>
            {resetErrorAnnouncement ? (
              <div className="sr-only" role="alert" aria-live="assertive">
                {resetErrorAnnouncement}
              </div>
            ) : null}
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
                    setErrors((prev) => ({ ...prev, password: undefined }));
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
              {isResetSubmitting ? 'Updating...' : t('login.ui.updatePassword')}
            </button>
            <p className="mt-4 text-xs text-white/60">
              For this demo, reset codes are logged on the server.
            </p>
            <div className="mt-4 flex items-center justify-between text-xs text-white/70">
              <button
                type="button"
                className="underline decoration-white/40 underline-offset-4"
                onClick={() => {
                  const search = buildAuthSearch();
                  navigate(search ? `/login?${search}` : '/login');
                }}
              >
                {t('login.ui.backToLogin')}
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
