import type { MetadataRoute } from 'next';
import { SITE_URL, TOPIC_PATHS } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: SITE_URL, changeFrequency: 'monthly', priority: 1 },
    ...TOPIC_PATHS.map((p) => ({ url: `${SITE_URL}${p}`, changeFrequency: 'monthly' as const, priority: 0.8 })),
  ];
}
