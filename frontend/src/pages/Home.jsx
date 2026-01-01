import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../components/Breadcrumbs';
import { useAuth } from '../auth/AuthContext';
import DailyFortuneWidget from '../components/dashboard/DailyFortuneWidget'; // Added import

const modules = [
  { title: 'nav.bazi', path: '/bazi', desc: 'home.modules.bazi.desc' },
  { title: 'nav.tarot', path: '/tarot', desc: 'home.modules.tarot.desc' },
  { title: 'nav.iching', path: '/iching', desc: 'home.modules.iching.desc' },
  { title: 'nav.zodiac', path: '/zodiac', desc: 'home.modules.zodiac.desc' },
  { title: 'nav.ziwei', path: '/ziwei', desc: 'home.modules.ziwei.desc', requiresAuth: true },
];

export default function Home() {
  const { t } = useTranslation();
  const { isAuthenticated, user } = useAuth();
  const isGuest = !isAuthenticated || !user;
  const visibleModules = modules.filter((mod) => !mod.requiresAuth || !isGuest);

  return (
    <main id="main-content" tabIndex={-1} className="relative responsive-container pb-16">
      <Breadcrumbs />
      <section className="starfield rounded-3xl border border-white/10 bg-white/5 p-6 shadow-glass md:p-10">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-gold-400/80">
            {t('home.oraclePlatform')}
          </p>
          <h1 className="mt-3 font-display text-4xl text-white md:text-5xl">{t('home.title')}</h1>
          <p className="mt-4 text-lg text-white/80">{t('home.subtitle')}</p>
          <Link
            to="/bazi"
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-gold-400 px-6 py-2 text-sm font-semibold text-mystic-900 shadow-lg shadow-gold-400/30"
          >
            {t('home.cta')}
          </Link>
        </div>
      </section>

      <section className="mt-6 grid gap-6 md:mt-10 md:grid-cols-2">
        {visibleModules.map((mod) => (
          <Link
            key={mod.title}
            to={mod.path}
            data-testid={`home-module-${mod.path.replace('/', '') || 'home'}`}
            className="glass-card block h-full rounded-2xl border border-white/10 p-6 transition hover:-translate-y-1 hover:border-gold-400/50"
          >
            <h2 className="font-display text-2xl text-gold-400">{t(mod.title)}</h2>
            <p className="mt-2 text-sm text-white/70">{t(mod.desc)}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
