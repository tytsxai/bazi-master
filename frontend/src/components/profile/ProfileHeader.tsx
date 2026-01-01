import { useTranslation } from 'react-i18next';
import { User } from '../../auth/AuthContext';

interface ProfileHeaderProps {
  user: User | null;
  profileNameValue: string;
}

export default function ProfileHeader({ user, profileNameValue }: ProfileHeaderProps) {
  const { t } = useTranslation();

  return (
    <section className="glass-card rounded-3xl border border-white/10 p-8 shadow-glass">
      <h1 className="font-display text-3xl text-gold-400">{t('profile.title')}</h1>
      <p className="mt-3 text-white/70">{t('profile.subtitle')}</p>
      <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
        <p className="text-white/70">{t('profile.name')}</p>
        <p className="text-white">{user?.name || '—'}</p>
        {profileNameValue ? (
          <>
            <p className="mt-4 text-white/70">{t('profile.displayName')}</p>
            <p className="text-white">{profileNameValue}</p>
          </>
        ) : null}
        <p className="mt-4 text-white/70">{t('profile.email')}</p>
        <p className="text-white">{user?.email || '—'}</p>
      </div>
    </section>
  );
}
