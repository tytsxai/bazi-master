import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Header() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();

  const toggleLocale = () => {
    const next = i18n.language === 'zh-CN' ? 'en-US' : 'zh-CN';
    i18n.changeLanguage(next);
    localStorage.setItem('locale', next);
  };

  return (
    <header className="flex items-center justify-between px-6 py-4">
      <a href="#main-content" className="skip-link">
        {t('nav.skip')}
      </a>
      <Link to="/" className="font-display text-xl tracking-widest text-gold-400">
        BaZi Master
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        <Link to="/" className={`transition hover:text-gold-400 ${location.pathname === '/' ? 'text-gold-400' : 'text-white/80'}`}>
          {t('nav.home')}
        </Link>
        {isAuthenticated && (
          <Link to="/profile" className={`transition hover:text-gold-400 ${location.pathname === '/profile' ? 'text-gold-400' : 'text-white/80'}`}>
            {t('nav.profile')}
          </Link>
        )}
        {isAuthenticated && (
          <Link to="/history" className={`transition hover:text-gold-400 ${location.pathname === '/history' ? 'text-gold-400' : 'text-white/80'}`}>
            {t('nav.history')}
          </Link>
        )}
        {isAuthenticated && (
          <Link to="/favorites" className={`transition hover:text-gold-400 ${location.pathname === '/favorites' ? 'text-gold-400' : 'text-white/80'}`}>
            {t('nav.favorites')}
          </Link>
        )}
        {!isAuthenticated ? (
          <Link to="/login" className="rounded-full border border-gold-400/60 px-4 py-1 text-gold-400 transition hover:bg-gold-400/20">
            {t('nav.login')}
          </Link>
        ) : (
          <button
            type="button"
            onClick={logout}
            className="rounded-full border border-gold-400/60 px-4 py-1 text-gold-400 transition hover:bg-gold-400/20"
          >
            {t('nav.logout')} · {user?.name}
          </button>
        )}
        <button
          type="button"
          onClick={toggleLocale}
          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:text-white"
        >
          {i18n.language === 'zh-CN' ? 'EN' : '中文'}
        </button>
      </nav>
    </header>
  );
}
