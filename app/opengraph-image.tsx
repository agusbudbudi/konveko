import { ImageResponse } from 'next/og';
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

/* Link preview (WhatsApp, Facebook, X, Slack) for every page; built once at build time. */

export const alt = 'Konveko: dari rol kain sampai rak gudang, setiap pcs tercatat.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const fontDir = join(process.cwd(), 'node_modules/@fontsource/plus-jakarta-sans/files');
const [bold, medium, hero, mark] = await Promise.all([
  readFile(join(fontDir, 'plus-jakarta-sans-latin-700-normal.woff')),
  readFile(join(fontDir, 'plus-jakarta-sans-latin-500-normal.woff')),
  readFile(join(process.cwd(), 'public/hero-login.png'), 'base64'),
  readFile(join(process.cwd(), 'public/logo-konveko-mark.png'), 'base64'),
]);

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ display: 'flex', width: '100%', height: '100%', background: '#FDFCFB', fontFamily: 'Jakarta' }}>
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', width: 640, padding: '0 0 0 72px', gap: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${mark}`} width={44} height={44} alt="" />
            <span style={{ fontSize: 34, fontWeight: 700, color: '#1C1B19', letterSpacing: '-0.01em' }}>konveko</span>
          </div>
          <div style={{ fontSize: 56, lineHeight: 1.12, fontWeight: 700, color: '#1C1B19', letterSpacing: '-0.015em' }}>
            Dari rol kain sampai rak gudang, setiap pcs tercatat.
          </div>
          <div style={{ fontSize: 26, lineHeight: 1.4, fontWeight: 500, color: '#6B6760' }}>
            Tracking produksi konveksi lewat scan QR di setiap serah-terima.
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 22, fontWeight: 500, color: '#0E5A4F' }}>
            <div style={{ width: 10, height: 10, borderRadius: 5, background: '#0E5A4F' }} />
            konveko.vercel.app
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`data:image/png;base64,${hero}`} width={560} height={560} alt="" />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Jakarta', data: bold, weight: 700, style: 'normal' },
        { name: 'Jakarta', data: medium, weight: 500, style: 'normal' },
      ],
    },
  );
}
