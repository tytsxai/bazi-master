import { useState } from 'react';
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email || !password) return;
    try {
      await login(email, password);
      const next = location.state?.from || '/profile';
      navigate(next, { replace: true });
    } catch (error) {
      alert('Login failed: ' + error.message);
    }
  };

  if (isAuthenticated) {
    navigate('/profile', { replace: true });
  }

  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-[70vh] items-center justify-center px-6">
      <form
        onSubmit={handleSubmit}
        className="glass-card w-full max-w-md rounded-3xl border border-white/10 p-8 shadow-glass"
      >
        <h1 className="font-display text-3xl text-gold-400">{t('login.title')}</h1>
        <label className="mt-6 block text-sm text-white/80">
          {t('login.email')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
            placeholder="seer@example.com"
            required
          />
        </label>
        <label className="mt-4 block text-sm text-white/80">
          {t('login.password')}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-white outline-none focus:border-gold-400"
            placeholder="••••••••"
            required
          />
        </label>
        <button
          type="submit"
          className="mt-6 w-full rounded-full bg-gold-400 px-4 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30"
        >
          {t('login.submit')}
        </button>
        <p className="mt-4 text-xs text-white/60">
          Demo access only: use any email and password to continue.
        </p>
      </form>
    </main>
  );
}
