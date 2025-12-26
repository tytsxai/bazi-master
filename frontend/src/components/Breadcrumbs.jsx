import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

const ROUTE_LABELS = {
  '/': 'nav.home',
  '/bazi': 'nav.bazi',
  '/tarot': 'nav.tarot',
  '/iching': 'nav.iching',
  '/zodiac': 'nav.zodiac',
  '/ziwei': 'nav.ziwei',
  '/profile': 'nav.profile',
  '/history': 'nav.history',
  '/favorites': 'nav.favorites',
  '/login': 'nav.login',
  '/admin': 'nav.admin',
  '/404': '404',
  '/403': '403'
};

const resolveBasePath = (pathname) => {
  if (!pathname || pathname === '/') return '/';
  const segment = pathname.split('/').filter(Boolean)[0];
  return `/${segment}`;
};

export default function Breadcrumbs() {
  const { t } = useTranslation();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const basePath = resolveBasePath(location.pathname);
  const crumbs = [];
  const homeLabel = t('nav.home');

  if (basePath !== '/') {
    crumbs.push({ label: homeLabel, path: '/' });
  } else {
    crumbs.push({ label: homeLabel, path: '/' });
  }

  if (basePath !== '/') {
    const labelKey = ROUTE_LABELS[basePath];
    const label = labelKey?.includes?.('.')
      ? t(labelKey, { defaultValue: basePath.replace('/', '') })
      : labelKey || basePath.replace('/', '');
    crumbs.push({ label, path: basePath });
  }

  if (basePath === '/history') {
    const pathMatch = location.pathname.match(/^\/history\/(\d+)/);
    const recordFromPath = pathMatch ? Number(pathMatch[1]) : null;
    const recordParam = searchParams.get('recordId')
      || searchParams.get('id')
      || searchParams.get('record');
    const recordFromQuery = Number(recordParam);
    const recordId = Number.isInteger(recordFromPath) && recordFromPath > 0
      ? recordFromPath
      : Number.isInteger(recordFromQuery) && recordFromQuery > 0
        ? recordFromQuery
        : null;
    if (recordId) {
      crumbs.push({ label: t('history.recordHeading', { id: recordId }), path: location.pathname + location.search });
    }
  }

  return (
    <nav aria-label={t('common.breadcrumbs')} className="mb-4 text-xs text-white/60">
      <ol className="flex flex-wrap items-center gap-2">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${crumb.path || index}`} className="flex items-center gap-2">
              {isLast ? (
                <span className="text-white/80">{crumb.label}</span>
              ) : (
                <Link to={crumb.path} className="transition hover:text-gold-300">
                  {crumb.label}
                </Link>
              )}
              {!isLast && <span className="text-white/30">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
