import type { Metadata } from 'next';
import { getImageProps } from 'next/image';
import { Wordmark } from '@/components/brand/wordmark';
import { ReconciliationBar } from '@/components/recon/reconciliation-bar';
import hero from '@/public/hero-login.png';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Masuk' };

// 1×1 transparent GIF: what phones get instead of the photo
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Example numbers from the PRD (Kemeja M, target 20)
const sample = { target: 20, ready: 17, reject: 2, wip_menunggu: 0, wip_dikerjakan: 0, selisih: 1 };


export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(440px,1fr)_auto]">
      {/* Form */}
      <section className="flex flex-col px-4 py-8 sm:px-8 lg:px-12 lg:py-10">
        <Wordmark size="lg" />
        <div className="mx-auto mt-12 w-full max-w-sm lg:my-auto">
          <h1 className="text-h1">Masuk</h1>
          <p className="mt-1 text-text-muted">Gunakan akun yang dibuat oleh admin.</p>
          <LoginForm next={next ?? ''} />
        </div>
      </section>

      {/* Illustration panel (right): desktop only. Inset with 24px padding and 16px corners (login-only exception to the 10px radius cap).
          The panel width follows the image's own ratio (read from the file), so the square illustration is
          never cropped; object-contain guarantees it when the form's 440px minimum caps the width.
          The image is a transparent PNG, so it sits on the panel's soft gradient and fills the panel.
          Served through the Next image optimizer (WebP/AVIF at the panel's size). A <picture> source
          limited to >= 1024px means phones and tablets, where the panel is hidden, never request it. */}
      <section
        style={{ width: `min(calc(${hero.width / hero.height} * (100dvh - 48px) + 48px), calc(100vw - 440px))` }}
        className="hidden h-dvh p-6 lg:block"
      >
        <div
          className="relative size-full overflow-hidden rounded-[28px]"
          style={{
            background:
              'radial-gradient(120% 90% at 85% 0%, var(--primary-soft) 0%, transparent 60%), linear-gradient(160deg, var(--surface-muted) 0%, var(--background) 100%)',
          }}
        >
          {/* Image area stops above the card so the full-width card never hides the rack. */}
          <div className="absolute inset-x-0 top-0 bottom-24">
            <HeroPhoto />
          </div>

          {/* Floating proof card, full width of the panel, laid out as one slim row.
              Solid card with a soft shadow, no border: login-only exception to DESIGN §1. */}
          <div
            className="absolute inset-x-6 bottom-6 flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-[18px] bg-surface px-6 py-4"
            style={{ boxShadow: '0 8px 24px -6px rgb(28 27 25 / 0.12), 0 2px 6px rgb(28 27 25 / 0.05)' }}
          >
            <div className="min-w-[240px] flex-1">
              <h2 className="text-h3 xl:text-h2">Setiap potong tercatat, dari rol kain sampai stok.</h2>
              <p className="mt-1 text-small text-text-muted">Scan QR di setiap serah-terima. Kurang langsung ketahuan.</p>
            </div>
            <div className="w-full max-w-xs min-w-[220px] flex-1">
              <div className="mb-2 flex items-baseline justify-between gap-2 text-small text-text-muted">
                <span>Kemeja M</span>
                <span className="num">17 dari 20 masuk stok</span>
              </div>
              <ReconciliationBar r={sample} />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function HeroPhoto() {
  const {
    props: { srcSet, sizes, ...rest },
  } = getImageProps({
    src: hero,
    alt: 'Ilustrasi alur produksi: rol kain, bundle, jahit, pcs berlabel QR, sampai rak gudang',
    fill: true,
    sizes: '100vh', // square image, panel height = viewport height
    className: 'object-contain',
  });
  return (
    <picture>
      <source media="(min-width: 1024px)" srcSet={srcSet} sizes={sizes} />
      {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
      <img {...rest} src={BLANK} />
    </picture>
  );
}
