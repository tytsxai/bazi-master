import { useTranslation } from 'react-i18next';
import { useAuth } from '../auth/AuthContext.jsx';

export default function Profile() {
  const { t } = useTranslation();
  const { user } = useAuth();

  return (
    <main id="main-content" tabIndex={-1} className="px-6 pb-16">
      <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
        <h1 className="font-display text-3xl text-gold-400">{t('protected.title')}</h1>
        <p className="mt-3 text-white/70">{t('protected.subtitle')}</p>
        <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
          <p className="text-white/70">Name</p>
          <p className="text-white">{user?.name}</p>
          <p className="mt-4 text-white/70">Email</p>
          <p className="text-white">{user?.email}</p>
        </div>
      </section>
    </main>
  );
}
