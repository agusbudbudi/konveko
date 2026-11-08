import type { Metadata } from 'next';
import { CircleCheck, PackageCheck, ScanLine } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { ReconciliationBar } from '@/components/recon/reconciliation-bar';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Masuk' };

// Example numbers from the PRD (Kemeja M, target 20)
const sample = { target: 20, ready: 17, reject: 2, wip_menunggu: 0, wip_dikerjakan: 0, selisih: 1 };

const steps = [
  { icon: ScanLine, title: 'Scan terima', text: 'Qty dicek di setiap serah-terima. Kurang langsung ditandai.' },
  { icon: CircleCheck, title: 'Scan selesai', text: 'Jadi dan reject dicatat per penjahit dan per step.' },
  { icon: PackageCheck, title: 'Masuk stok', text: 'Hanya yang lolos QC yang menambah stok gudang.' },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,560px)]">
      {/* Product panel: desktop only. Shows what the app does with its own building blocks. */}
      <section className="hidden flex-col justify-between border-r border-border bg-surface-muted px-12 py-10 lg:flex">
        <Wordmark size="lg" />

        <div className="max-w-md">
          <h2 className="text-[32px] leading-10 font-semibold tracking-[-0.01em]">
            Setiap potong tercatat, dari rol kain sampai stok.
          </h2>
          <ol className="mt-8 flex flex-col gap-5">
            {steps.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex gap-4">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface text-primary">
                  <Icon size={20} strokeWidth={1.5} aria-hidden />
                </span>
                <div>
                  <p className="font-medium">
                    <span className="num mr-2 text-text-subtle">{i + 1}</span>
                    {title}
                  </p>
                  <p className="text-small text-text-muted">{text}</p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-8 rounded-lg border border-border bg-surface p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-caption tracking-[0.02em] text-text-muted">Contoh rekonsiliasi · Kemeja M</p>
              <p className="num text-small text-text-muted">target 20</p>
            </div>
            <div className="mt-3">
              <ReconciliationBar r={sample} />
            </div>
            <p className="mt-1 text-small text-text-muted">stok + reject + WIP + selisih, selalu sama dengan target.</p>
          </div>
        </div>

        <p className="text-small text-text-subtle">Tracking produksi konveksi</p>
      </section>

      {/* Form */}
      <section className="flex flex-col px-4 py-8 sm:px-8 lg:justify-center lg:px-16">
        <div className="lg:hidden">
          <Wordmark size="lg" />
        </div>
        <div className="mx-auto mt-12 w-full max-w-sm lg:mt-0">
          <h1 className="text-h1">Masuk</h1>
          <p className="mt-1 text-text-muted">Gunakan akun yang dibuat oleh admin.</p>
          <LoginForm next={next ?? ''} />
        </div>
      </section>
    </main>
  );
}
