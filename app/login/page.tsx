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

      {/* Photo panel (right): desktop only. Photo sits inset with 24px padding and 16px corners (login-only exception to the 10px radius cap).
          Shows the whole photo, never cropped: the panel width follows the photo's own ratio (read from
          the file), and object-contain guarantees no crop when the form's 440px minimum caps it.
          Served through the Next image optimizer (WebP/AVIF at the panel's size). A <picture> source
          limited to >= 1024px means phones and tablets, where the panel is hidden, never request it. */}
      <section
        style={{ width: `min(calc(${hero.width / hero.height} * (100dvh - 48px) + 48px), calc(100vw - 440px))` }}
        className="hidden h-dvh p-6 lg:block"
      >
        <div className="relative size-full overflow-hidden rounded-2xl bg-surface-muted">
          <HeroPhoto />

        {/* Solid card + border (no shadow/blur, DESIGN §1) so text reads on top of the photo */}
        <div className="absolute bottom-6 left-6 right-6 max-w-sm rounded-lg border border-border-strong bg-surface p-5">
          <h2 className="text-h2">Setiap potong tercatat, dari rol kain sampai stok.</h2>
          <p className="mt-2 text-text-muted">Scan QR di setiap serah-terima. Kurang langsung ketahuan.</p>
          <div className="mt-5">
            <div className="mb-2 flex items-baseline justify-between text-small text-text-muted">
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
    alt: 'Penjahit menjahit kain di lantai produksi konveksi',
    fill: true,
    sizes: '100vh', // square photo, panel height = viewport height
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
