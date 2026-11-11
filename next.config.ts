import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      // largest upload: the master-data Excel import (max 2 MB) plus multipart overhead;
      // the business logo is 1 MB. Default is 1 MB.
      bodySizeLimit: '3mb',
    },
  },
};

export default nextConfig;
