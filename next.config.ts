import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // the business logo upload (max 1 MB) plus multipart overhead; default is 1 MB
      bodySizeLimit: '2mb',
    },
  },
};

export default nextConfig;
