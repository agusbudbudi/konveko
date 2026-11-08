import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'], // 700 only for printed labels (DESIGN §7)
  variable: '--font-jakarta',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'Konveko', template: '%s · Konveko' },
  description: 'Tracking produksi konveksi dari rol kain sampai stok gudang.',
  applicationName: 'Konveko',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#FDFCFB',
  colorScheme: 'light', // light mode only (DESIGN §2)
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className="min-h-dvh bg-background font-sans text-text">{children}</body>
    </html>
  );
}
