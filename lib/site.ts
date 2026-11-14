/** Public origin for absolute URLs in metadata, robots and sitemap. Override per deploy with NEXT_PUBLIC_SITE_URL. */
export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://konveko.vercel.app';

/** Public topic pages ("halaman SEO"): one per search need. Read by the proxy, robots and the sitemap. */
export const TOPIC_PATHS = [
  '/aplikasi-konveksi',
  '/kontrol-penjahit-borongan',
  '/tracking-produksi-konveksi',
  '/stok-opname-konveksi',
  '/label-qr-barcode-konveksi',
];
