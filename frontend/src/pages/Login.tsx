import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext';
import Breadcrumbs from '../components/Breadcrumbs';
import { readApiErrorMessage } from '../utils/apiError';
import { emailPattern, validateLogin, validatePasswordStrength, validateEmail } from '../utils/validation';

// Subcomponents
import LoginForm from '../components/auth/LoginForm';
import RegisterForm from '../components/auth/RegisterForm';
import ResetRequestForm from '../components/auth/ResetRequestForm';
import ResetConfirmForm from '../components/auth/ResetConfirmForm';
import type { AuthMode } from '../auth/authTypes';

const SESSION_EXPIRED_KEY = 'bazi_session_expired';

export default function Login() {
  const { t } = useTranslation();
  const { login, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [oauthError, setOauthError] = useState('');
  const [loginError, setLoginError] = useState('');
  const isSubmittingRef = useRef(false);

  // Register state
  const [registerName, setRegisterName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');
  const [registerConfirm, setRegisterConfirm] = useState('');
  const [registerErrors, setRegisterErrors] = useState<Record<string, string | undefined>>({});
  const [registerStatus, setRegisterStatus] = useState('');
  const [isRegisterSubmitting, setIsRegisterSubmitting] = useState(false);

  // Reset state
  const [resetEmail, setResetEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetErrors, setResetErrors] = useState<Record<string, string | undefined>>({});
  const [resetStatus, setResetStatus] = useState<{ type: string; message: string } | null>(null);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);

  const [sessionNotice, setSessionNotice] = useState('');

  const sanitizeNextPath = (value: any): string | null => {
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

  const resolveRedirectPath = (from: any, search = '') => {
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

  const decodeUserParam = (value: string | null) => {
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

  const switchMode = (nextMode: AuthMode) => {
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

  const getLoginErrorMessage = (error: any) => {
    const message = error instanceof Error && error.message ? error.message : t('login.errors.loginFailed');
    return message.toLowerCase() === 'login failed' ? t('login.errors.loginFailed') : message;
  };

  const getOauthErrorMessage = (error: string, provider: string | null) => {
    if (!error) return '';
    const isWeChat = provider === 'wechat';
    const defaultMessage = isWeChat ? 'WeChat sign-in failed. Please try again.' : 'Google sign-in failed. Please try again.';
    const mappings: Record<string, string> = isWeChat
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

  useEffect(() => {
    if (!isAuthenticated) return;
    const next = resolveRedirectPath(location.state?.from, location.search);
    navigate(next, { replace: true });
  }, [isAuthenticated, location.state, navigate]);

  useEffect(() => {
    if (location.pathname === '/register') setMode('register');
    else if (location.pathname === '/login') setMode('login');
  }, [location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    let reason = params.get('reason');
    if (!reason) {
      try {
        if (localStorage.getItem(SESSION_EXPIRED_KEY) === '1') {
          const search = buildAuthSearch();
          const target = `/login?reason=session_expired${search ? `&${search}` : ''}`;
          navigate(target, { replace: true, state: location.state });
          reason = 'session_expired';
        }
      } catch { /* ignore */ }
    }
    if (reason === 'session_expired') {
      setSessionNotice(t('login.sessionExpired'));
      try { localStorage.removeItem(SESSION_EXPIRED_KEY); } catch { /* ignore */ }
    } else {
      setSessionNotice('');
    }
  }, [location.search, location.state, navigate, t]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const hashParams = new URLSearchParams(location.hash && location.hash.startsWith('#') ? location.hash.slice(1) : '');
    const tokenParam = hashParams.get('token') || searchParams.get('token');
    const userParam = hashParams.get('user') || searchParams.get('user');
    const nextParam = searchParams.get('next');
    const errorParam = searchParams.get('error');
    const providerParam = searchParams.get('provider');

    if (errorParam) setOauthError(getOauthErrorMessage(errorParam, providerParam));
    if (!tokenParam) return;

    const userFromParam = decodeUserParam(userParam);
    localStorage.setItem('bazi_token', tokenParam);
    localStorage.setItem('bazi_token_origin', 'backend');
    if (userFromParam) localStorage.setItem('bazi_user', JSON.stringify(userFromParam));
    localStorage.setItem('bazi_last_activity', String(Date.now()));

    const nextPath = sanitizeNextPath(nextParam) || resolveRedirectPath(location.state?.from, location.search);
    window.location.replace(nextPath);
  }, [location.search, location.hash, location.state]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (isSubmittingRef.current) return;
    setLoginError('');
    const nextErrors = validateLogin(email, password, t);
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

  const handleRegister = async (event: FormEvent) => {
    event.preventDefault();
    if (isRegisterSubmitting) return;
    setRegisterStatus('');
    const nextErrors: Record<string, string | undefined> = {};
    const emailErr = validateEmail(registerEmail, t);
    if (emailErr) nextErrors.email = emailErr;
    if (!registerPassword) nextErrors.password = t('login.errors.passwordRequired');
    else {
      const strength = validatePasswordStrength(registerPassword, t);
      if (strength) nextErrors.password = strength;
    }
    if (registerConfirm && registerConfirm !== registerPassword) nextErrors.confirm = t('login.errors.passwordsNotMatch');
    if (registerName.trim().length > 0 && registerName.trim().length < 2) nextErrors.name = t('login.errors.nameTooShort');

    setRegisterErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    try {
      setIsRegisterSubmitting(true);
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: registerName.trim() || null, email: registerEmail.trim(), password: registerPassword }),
      });
      if (!res.ok) {
        setRegisterStatus(await readApiErrorMessage(res, t('login.errors.registerFailed')));
        return;
      }
      await res.json();
      await login(registerEmail.trim(), registerPassword);
    } catch (error: any) {
      setRegisterStatus(error?.message || t('login.errors.registerFailed'));
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

  const handleRequestReset = async (event: FormEvent) => {
    event.preventDefault();
    const err = validateEmail(resetEmail, t);
    if (err) { setResetErrors({ email: err }); return; }
    try {
      setIsResetSubmitting(true);
      const res = await fetch('/api/auth/password/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: resetEmail }),
      });
      if (!res.ok) {
        setResetStatus({ type: 'error', message: await readApiErrorMessage(res, t('login.errors.resetRequestFailed')) });
        return;
      }
      const data = await res.json();
      setResetStatus({ type: 'success', message: data?.message || t('login.ui.resetSent') });
    } catch {
      setResetStatus({ type: 'error', message: t('errors.network') });
    } finally { setIsResetSubmitting(false); }
  };

  const handleConfirmReset = async (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: Record<string, string | undefined> = {};
    if (!resetToken.trim()) nextErrors.token = t('login.errors.tokenRequired');
    if (!resetPassword) nextErrors.password = t('login.errors.newPasswordRequired');
    else {
      const strength = validatePasswordStrength(resetPassword, t);
      if (strength) nextErrors.password = strength;
    }
    setResetErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    try {
      setIsResetSubmitting(true);
      const res = await fetch('/api/auth/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken.trim(), password: resetPassword }),
      });
      if (!res.ok) {
        setResetStatus({ type: 'error', message: await readApiErrorMessage(res, t('login.errors.resetPasswordFailed')) });
        return;
      }
      setResetStatus({ type: 'success', message: t('login.ui.passwordUpdated') });
      setResetPassword(''); setResetToken('');
    } catch {
      setResetStatus({ type: 'error', message: t('errors.network') });
    } finally { setIsResetSubmitting(false); }
  };

  return (
    <main id="main-content" tabIndex={-1} className="responsive-container flex min-h-[70vh] flex-col items-center justify-center gap-4">
      <div className="w-full max-w-md"><Breadcrumbs /></div>
      <form
        onSubmit={mode === 'login' ? handleSubmit : mode === 'register' ? handleRegister : mode === 'request' ? handleRequestReset : handleConfirmReset}
        className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glass"
      >
        <h1 className="font-display text-3xl text-gold-400">
          {mode === 'login' ? t('login.title') : mode === 'register' ? t('login.registerTitle') : mode === 'request' ? t('login.ui.resetPassword') : t('login.ui.setNewPassword')}
        </h1>
        {sessionNotice && <div role="status" className="mt-4 rounded-2xl border border-amber-400/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">{sessionNotice}</div>}

        {mode === 'login' && (
          <LoginForm
            email={email} setEmail={setEmail} password={password} setPassword={setPassword}
            errors={errors} setErrors={setErrors} loginError={loginError} setLoginError={setLoginError}
            isSubmitting={isSubmitting} oauthError={oauthError} handleSubmit={handleSubmit}
            handleGoogleLogin={handleGoogleLogin} handleWeChatLogin={handleWeChatLogin}
            onSwitchMode={switchMode} emailPattern={emailPattern}
          />
        )}

        {mode === 'register' && (
          <RegisterForm
            name={registerName} setName={setRegisterName} email={registerEmail} setEmail={setRegisterEmail}
            password={registerPassword} setPassword={setRegisterPassword} confirm={registerConfirm} setConfirm={setRegisterConfirm}
            errors={registerErrors} setErrors={setRegisterErrors} status={registerStatus} isSubmitting={isRegisterSubmitting}
            onSwitchMode={(m) => {
              const search = buildAuthSearch();
              switchMode(m);
              if (m === 'login') navigate(search ? `/login?${search}` : '/login');
            }}
            emailPattern={emailPattern}
          />
        )}

        {mode === 'request' && (
          <ResetRequestForm
            email={resetEmail} setEmail={setResetEmail} errors={resetErrors} setErrors={setResetErrors}
            status={resetStatus} isSubmitting={isResetSubmitting} onSwitchMode={switchMode} emailPattern={emailPattern}
          />
        )}

        {mode === 'reset' && (
          <ResetConfirmForm
            token={resetToken} setToken={setResetToken} password={resetPassword} setPassword={setResetPassword}
            errors={resetErrors} setErrors={setResetErrors} status={resetStatus} isSubmitting={isResetSubmitting}
            onSwitchMode={switchMode}
          />
        )}
      </form>
    </main>
  );
}
