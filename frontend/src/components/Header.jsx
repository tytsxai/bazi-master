import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Header() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const currentLocale = i18n.resolvedLanguage || i18n.language;

  const primaryLinks = [
    { path: '/', label: t('nav.home') },
    { path: '/bazi', label: t('nav.bazi', { defaultValue: 'BaZi' }) },
    { path: '/tarot', label: t('nav.tarot', { defaultValue: 'Tarot' }) },
    { path: '/iching', label: t('nav.iching', { defaultValue: 'I Ching' }) },
    { path: '/zodiac', label: t('nav.zodiac', { defaultValue: 'Zodiac' }) }
  ];

  const toggleLocale = () => {
    const next = currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN';
    i18n.changeLanguage(next);
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
    setIsMenuOpen(false);
  };

  const closeMenu = () => setIsMenuOpen(false);

  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

  const NavLinks = ({ mobile = false }) => (
    <>
      {primaryLinks.map((link) => (
        <Link
          key={link.path}
          to={link.path}
          onClick={closeMenu}
          className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${
            isActive(link.path) ? 'text-gold-400' : 'text-white/80'
          }`}
        >
          {link.label}
        </Link>
      ))}
      {isAuthenticated && (
        <>
          <Link
            to="/profile"
            onClick={closeMenu}
            className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${
              isActive('/profile') ? 'text-gold-400' : 'text-white/80'
            }`}
          >
            {t('nav.profile')}
          </Link>
          <Link
            to="/history"
            onClick={closeMenu}
            className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${
              isActive('/history') ? 'text-gold-400' : 'text-white/80'
            }`}
          >
            {t('nav.history')}
          </Link>
          <Link
            to="/favorites"
            onClick={closeMenu}
            className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${
              isActive('/favorites') ? 'text-gold-400' : 'text-white/80'
            }`}
          >
            {t('nav.favorites')}
          </Link>
        </>
      )}
    </>
  );

  return (
    <header className="relative flex items-center justify-between px-6 py-4">
      <a href="#main-content" className="skip-link">
        {t('nav.skip')}
      </a>
      <Link to="/" className="font-display text-xl tracking-widest text-gold-400 z-50 relative" onClick={closeMenu}>
        BaZi Master
      </Link>

      {/* Desktop Navigation */}
      <nav className="hidden md:flex items-center gap-4 text-sm">
        <NavLinks />
        {!isAuthenticated ? (
          <Link
            to="/login"
            className="rounded-full border border-gold-400/60 px-4 py-1 text-gold-400 transition hover:bg-gold-400/20"
          >
            {t('nav.login')}
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-full border border-gold-400/60 px-4 py-1 text-gold-400 transition hover:bg-gold-400/20"
          >
            {t('nav.logout')} · {user?.name}
          </button>
        )}
        <button
          type="button"
          onClick={toggleLocale}
          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:text-white"
          aria-label={currentLocale === 'zh-CN' ? 'Switch to English' : 'Switch to Chinese'}
        >
          {currentLocale === 'zh-CN' ? 'EN' : '中文'}
        </button>
      </nav>

      {/* Mobile Menu Button */}
      <button
        className="mobile-menu-btn md:hidden z-50 relative"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-label="Toggle menu"
      >
        <span className="text-2xl">{isMenuOpen ? '✕' : '☰'}</span>
      </button>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <nav className="mobile-nav">
          <NavLinks mobile />
          <div className="flex flex-col gap-4 mt-2">
            {!isAuthenticated ? (
              <Link
                to="/login"
                onClick={closeMenu}
                className="text-center rounded-full border border-gold-400/60 px-4 py-3 text-gold-400 transition hover:bg-gold-400/20"
              >
                {t('nav.login')}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleLogout}
                className="text-center rounded-full border border-gold-400/60 px-4 py-3 text-gold-400 transition hover:bg-gold-400/20"
              >
                {t('nav.logout')} · {user?.name}
              </button>
            )}
            <button
              type="button"
              onClick={toggleLocale}
              className="text-center rounded-full border border-white/20 px-4 py-3 text-white/70 hover:text-white"
            >
              {currentLocale === 'zh-CN' ? 'Switch to English' : '切换到中文'}
            </button>
          </div>
        </nav>
      )}
    </header>
  );
}