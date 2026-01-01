import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function NotFound() {
  const { t } = useTranslation();
  const location = useLocation();
  const missingPath = location?.pathname || '';

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center"
    >
      <p className="text-sm uppercase tracking-[0.3em] text-gold-400/80">404</p>
      <h1 className="mt-3 font-display text-3xl text-white">
        {t('404.title', { defaultValue: 'Page not found' })}
      </h1>
      <p className="mt-2 text-sm text-slate-200/80">
        {t('404.desc', { defaultValue: "We couldn't find" })}
        <span className="mx-2 inline-block rounded-full bg-white/10 px-3 py-1 text-xs text-slate-100">
          {missingPath || t('404.thisPage', { defaultValue: 'this page' })}
        </span>
        {t('404.mist', { defaultValue: '—the path fades into the mist.' })}
      </p>
      <Link
        to="/"
        className="mt-6 rounded-full border border-gold-400/60 px-5 py-2 text-sm text-gold-400 hover:bg-gold-400/20"
      >
        {t('nav.home')}
      </Link>
    </main>
  );
}
