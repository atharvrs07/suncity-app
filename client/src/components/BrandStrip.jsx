import { useTranslation } from 'react-i18next';

// Society branding shown at the very top of every screen (item 13). Rendered once
// at the app root so it appears on auth pages and every in-app page consistently.
export default function BrandStrip() {
  const { t } = useTranslation();
  return (
    <div className="brand-strip" role="banner">
      <span>{t('brand.title')}</span>
    </div>
  );
}
