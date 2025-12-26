import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';
import ChatInterface from './chat/ChatInterface.jsx';

export default function Header() {
  const { t, i18n } = useTranslation();
  const { isAuthenticated, user, logout, profileName } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const lastNavClickRef = useRef({ at: 0, href: '' });
  const isGuest = !isAuthenticated || !user;
  const userName = user?.name || user?.email || '';
  const profileDisplayName = profileName?.trim() || '';
  const mobileDisplayName = profileDisplayName || userName;
  const showProfileName = profileDisplayName && profileDisplayName !== userName;
  const formatDisplayName = (name) => {
    const trimmed = name.trim();
    if (!trimmed) return '';
    return trimmed;
  };
  const headerDisplayName = formatDisplayName(userName);
  const mobileDisplayShort = mobileDisplayName;

  const currentLocale = i18n.resolvedLanguage || i18n.language;
  const NAV_CLICK_DELAY = 400;

  const nextLocale = currentLocale === 'zh-CN' ? 'en-US' : 'zh-CN';
  const nextLocaleAriaLabel = nextLocale === 'en-US' ? 'Switch to English' : 'Switch to Chinese';
  const nextLocaleShortLabel = nextLocale === 'en-US' ? 'EN' : '中文';

  const primaryLinks = [
    { path: '/', label: t('nav.home') },
    { path: '/bazi', label: t('nav.bazi', { defaultValue: 'BaZi' }) },
    { path: '/tarot', label: t('nav.tarot', { defaultValue: 'Tarot' }) },
    { path: '/iching', label: t('nav.iching', { defaultValue: 'I Ching' }) },
    { path: '/zodiac', label: t('nav.zodiac', { defaultValue: 'Zodiac' }) },
    { path: '/ziwei', label: t('nav.ziwei', { defaultValue: 'Zi Wei' }), requiresAuth: true },
    { path: '/soul-portrait', label: 'Soul Portrait', requiresAuth: true },
    { path: '/synastry', label: 'Compatibility', requiresAuth: false }
  ];
  const visiblePrimaryLinks = primaryLinks.filter((link) => !link.requiresAuth || !isGuest);

  const toggleLocale = () => {
    i18n.changeLanguage(nextLocale);
    setIsMenuOpen(false);
  };

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
    setIsMenuOpen(false);
  };

  const closeMenu = () => setIsMenuOpen(false);

  const isActive = (path) => (path === '/' ? location.pathname === '/' : location.pathname.startsWith(path));

  const handleSafeNavClick = (event) => {
    const now = Date.now();

    const target = event?.currentTarget;
    // Handle both React Router Link and regular elements
    let nextHref = '';
    if (target) {
      if (typeof target.getAttribute === 'function') {
        nextHref = target.getAttribute('href') || target.getAttribute('to') || '';
      } else if (target.href) {
        nextHref = target.href;
      } else if (target.dataset && target.dataset.routed) {
        // For React Router Link, get the href from the anchor element inside
        const anchor = target.querySelector('a') || target.closest('a');
        if (anchor) {
          nextHref = anchor.getAttribute('href') || anchor.getAttribute('to') || '';
        }
      }
    }

    const last = lastNavClickRef.current;

    if (now - (last?.at || 0) < NAV_CLICK_DELAY && nextHref && nextHref === last?.href) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }

    lastNavClickRef.current = { at: now, href: nextHref };
    closeMenu();
  };

  useEffect(() => {
    setIsMenuOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1024px)');
    const handleViewportChange = () => {
      if (mediaQuery.matches) {
        setIsMenuOpen(false);
      }
    };

    handleViewportChange();
    mediaQuery.addEventListener('change', handleViewportChange);

    return () => {
      mediaQuery.removeEventListener('change', handleViewportChange);
    };
  }, []);

  const NavLinks = ({ mobile = false }) => (
    <>
      {visiblePrimaryLinks.map((link) => (
        <Link
          key={link.path}
          to={link.path}
          onClick={handleSafeNavClick}
          data-routed="true"
          className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${isActive(link.path) ? 'text-gold-400' : 'text-white/80'
            }`}
        >
          {link.label}
        </Link>
      ))}
      {!isGuest && (
        <>
          <Link
            to="/profile"
            onClick={handleSafeNavClick}
            data-routed="true"
            className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${isActive('/profile') ? 'text-gold-400' : 'text-white/80'
              }`}
          >
            {t('nav.profile')}
          </Link>
          <Link
            to="/history"
            onClick={handleSafeNavClick}
            data-routed="true"
            className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${isActive('/history') ? 'text-gold-400' : 'text-white/80'
              }`}
          >
            {t('nav.history')}
          </Link>
          <Link
            to="/favorites"
            onClick={handleSafeNavClick}
            data-routed="true"
            className={`transition hover:text-gold-400 ${mobile ? 'py-3 text-lg border-b border-white/10 block w-full' : ''} ${isActive('/favorites') ? 'text-gold-400' : 'text-white/80'
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
      <Link
        to="/"
        className="font-display text-xl tracking-widest text-gold-400 z-50 relative"
        onClick={handleSafeNavClick}
      >
        {t('home.title')}
      </Link>

      {/* Desktop Navigation */}
      <nav className="hidden lg:flex items-center gap-4 text-sm">
        <NavLinks />
        {isGuest ? (
          <Link
            to="/login"
            onClick={handleSafeNavClick}
            className="rounded-full border border-gold-400/60 px-4 py-1 text-gold-400 transition hover:bg-gold-400/20"
          >
            {t('nav.login')}
          </Link>
        ) : (
          <>
            <span data-testid="header-user-name" className="text-xs text-white/70">
              {headerDisplayName}
            </span>
            {showProfileName ? (
              <span data-testid="header-profile-name" className="text-xs text-gold-200/80">
                {profileDisplayName}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-full border border-gold-400/60 px-4 py-1 text-gold-400 transition hover:bg-gold-400/20"
            >
              {t('nav.logout')}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={toggleLocale}
          className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/70 hover:text-white"
          aria-label={nextLocaleAriaLabel}
        >
          {nextLocaleShortLabel}
        </button>
      </nav>

      {/* Mobile Menu Button */}
      <button
        className="mobile-menu-btn lg:hidden z-50 relative"
        onClick={() => setIsMenuOpen(!isMenuOpen)}
        aria-label="Toggle Menu"
      >
        <span className="text-2xl">{isMenuOpen ? '✕' : '☰'}</span>
      </button>

      {/* Mobile Navigation */}
      {isMenuOpen && (
        <nav className="mobile-nav">
          <NavLinks mobile />
          <div className="flex flex-col gap-4 mt-2">
            {isGuest ? (
              <Link
                to="/login"
                onClick={handleSafeNavClick}
                className="text-center rounded-full border border-gold-400/60 px-4 py-3 text-gold-400 transition hover:bg-gold-400/20"
              >
                {t('nav.login')}
              </Link>
            ) : (
              <button
                type="button"
                onClick={handleLogout}
                aria-label={mobileDisplayName ? `${t('nav.logout')} ${mobileDisplayName}` : t('nav.logout')}
                className="text-center rounded-full border border-gold-400/60 px-4 py-3 text-gold-400 transition hover:bg-gold-400/20"
              >
                {t('nav.logout')}
                {mobileDisplayShort ? ` · ${mobileDisplayShort}` : ''}
              </button>
            )}
            <button
              type="button"
              onClick={toggleLocale}
              className="text-center rounded-full border border-white/20 px-4 py-3 text-white/70 hover:text-white"
            >
              {nextLocaleAriaLabel}
            </button>
          </div>
        </nav>
      )}

      {/* Floating Chat Interface */}
      <ChatInterface isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      {/* Floating Chat Button (if closed) */}
      {!isChatOpen && isAuthenticated && (
        <button
          onClick={() => setIsChatOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-600 shadow-2xl transition hover:scale-110 hover:bg-indigo-500"
        >
          <span className="text-2xl">🔮</span>
        </button>
      )}
    </header>
  );
}
