import type { MetadataRoute } from 'next';
import { SITE_URL, TOPIC_PATHS } from '@/lib/site';

// Only the landing page, its topic pages and the login screen are public; everything else is behind sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: ['/$', '/login', ...TOPIC_PATHS.map((p) => `${p}$`)], disallow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
