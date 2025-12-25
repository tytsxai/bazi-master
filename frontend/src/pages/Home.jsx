import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const modules = [
  { title: 'BaZi', path: '/bazi', desc: 'Four Pillars & Five Elements' },
  { title: 'Tarot', path: '/tarot', desc: 'Daily draw & spreads' },
  { title: 'I Ching', path: '/iching', desc: 'Hexagram insights' },
  { title: 'Zodiac', path: '/zodiac', desc: 'Signs & horoscopes' }
];

export default function Home() {
  const { t } = useTranslation();

  return (
    <main id="main-content" tabIndex={-1} className="relative px-6 pb-16">
      <section className="starfield rounded-3xl border border-white/10 bg-white/5 p-10 shadow-glass">
        <div className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.3em] text-gold-400/80">Oracle Platform</p>
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

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        {modules.map((mod) => (
          <Link
            key={mod.title}
            to={mod.path}
            className="glass-card rounded-2xl border border-white/10 p-6 transition hover:-translate-y-1 hover:border-gold-400/50"
          >
            <h2 className="font-display text-2xl text-gold-400">{mod.title}</h2>
            <p className="mt-2 text-sm text-white/70">{mod.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
