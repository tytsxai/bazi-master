import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export default function OfflineNotice() {
  const { t } = useTranslation();
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator === 'undefined') return false;
    return !navigator.onLine;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-[100] sm:left-auto sm:right-4 sm:w-80">
      <div className="glass-card flex items-center gap-3 rounded-2xl border border-amber-500/30 bg-amber-950/40 p-4 shadow-2xl backdrop-blur-md">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500/20 text-amber-500">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-6 w-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a4.978 4.978 0 01-1.414-2.83m-1.414 5.658a9 9 0 01-2.167-3.674m0 0L3 3m3.343 2.121C5.257 6.307 5 7.613 5 9m13.364 5.364l-2.829-2.828"
            />
          </svg>
        </div>
        <div className="flex-1 overflow-hidden">
          <p className="text-sm font-semibold text-white">
            {t('offline.title', { defaultValue: 'You are offline' })}
          </p>
          <p className="truncate text-xs text-white/60">
            {t('offline.desc', { defaultValue: 'Some features may be limited' })}
          </p>
        </div>
        <button
          onClick={() => setIsOffline(false)}
          className="text-white/40 transition hover:text-white"
          aria-label="Close"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
