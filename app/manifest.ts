import type { MetadataRoute } from 'next';

// Scope is "/" so the login screen stays inside the installed app;
// start_url opens the scanner directly.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Konveko Scan',
    short_name: 'Konveko',
    description: 'Scan terima dan selesai bundle produksi.',
    start_url: '/scan',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#FDFCFB',
    theme_color: '#FDFCFB',
    lang: 'id',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
