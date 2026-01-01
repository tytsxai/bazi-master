import React from 'react';
import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

export default function SEO({ title, description, image, type = 'website' }) {
  const { t } = useTranslation();

  const siteTitle = 'Bazi Master';
  const fullTitle = title ? `${title} | ${siteTitle}` : siteTitle;
  const metaDescription =
    description ||
    t('seo.defaultDescription', 'Discover your destiny with AI-powered Bazi and Ziwei readings.');
  const metaImage = image || '/og-default.png'; // Assuming exists or relative path

  return (
    <Helmet>
      {/* Basic */}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:image" content={metaImage} />
      <meta property="og:site_name" content={siteTitle} />

      {/* Twitter */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={metaImage} />
    </Helmet>
  );
}
