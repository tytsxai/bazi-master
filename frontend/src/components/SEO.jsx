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
  // 仓库没有内置 og 图片，缺省时不输出 og:image / twitter:image，
  // 避免抓取端拿到 404 的分享图。自部署时传 image 或放一张静态图再传进来。
  const metaImage = image || null;

  return (
    <Helmet>
      {/* Basic */}
      <title>{fullTitle}</title>
      <meta name="description" content={metaDescription} />

      {/* Open Graph */}
      <meta property="og:type" content={type} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:site_name" content={siteTitle} />
      {metaImage ? <meta property="og:image" content={metaImage} /> : null}

      {/* Twitter */}
      <meta name="twitter:card" content={metaImage ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={metaDescription} />
      {metaImage ? <meta name="twitter:image" content={metaImage} /> : null}
    </Helmet>
  );
}
