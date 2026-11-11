import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // The report PDF reads its font and logo from disk at runtime; ship them with that function.
  outputFileTracingIncludes: {
    '/laporan/pdf': [
      './node_modules/@fontsource/plus-jakarta-sans/files/plus-jakarta-sans-latin-*-normal.woff',
      './public/logo-konveko-mark.png',
    ],
  },
  experimental: {
    serverActions: {
      // largest upload: the master-data Excel import (max 2 MB) plus multipart overhead;
      // the business logo is 1 MB. Default is 1 MB.
      bodySizeLimit: '3mb',
    },
  },
};

export default nextConfig;
