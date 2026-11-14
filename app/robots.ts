import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

// Only the landing page and the login screen are public; everything else is behind sign-in.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: ['/$', '/login'], disallow: '/' },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
