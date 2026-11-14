import {
  ArrowRight,
  BarChart3,
  Boxes,
  ClipboardCheck,
  Database,
  Layers,
  Printer,
  Scale,
  ScanLine,
  Search,
  TriangleAlert,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { WA_ASK_URL } from './contact';
import { WhatsAppGlyph } from './whatsapp-glyph';

type Feature = { icon: LucideIcon; title: string; body: string; href: string };

/** Everything the system does, grouped by where the work happens. Shown in the header's Fitur tray. */
export const FEATURE_GROUPS: { title: string; items: Feature[] }[] = [
  {
    title: 'Produksi',
    items: [
      { icon: ScanLine, title: 'Scan serah-terima', body: 'Qty dicatat lewat scan QR setiap barang berpindah tangan.', href: '#alur' },
      { icon: Printer, title: 'Label QR', body: 'Cetak label untuk bundle, pcs, dan rak dari printer thermal.', href: '#alur' },
      { icon: TriangleAlert, title: 'Selisih langsung ketahuan', body: 'Qty kurang ditandai di step terjadinya, lengkap dengan alasannya.', href: '#alur' },
      { icon: Wrench, title: 'Reject dan rework', body: 'Reject dicatat dengan alasan, yang bisa diperbaiki kembali ke alur.', href: '#fitur' },
    ],
  },
  {
    title: 'Gudang',
    items: [
      { icon: Boxes, title: 'Stok per pcs dan rak', body: 'Setiap pcs punya QR sendiri dan tercatat di rak mana.', href: '#fitur' },
      { icon: Truck, title: 'Barang keluar dan retur', body: 'Scan pcs ke dokumen keluar, retur dicatat baik atau rusak.', href: '#fitur' },
      { icon: ClipboardCheck, title: 'Stok opname per rak', body: 'Hitung buta lewat scan, selisihnya dicocokkan di desk.', href: '#fitur' },
      { icon: Search, title: 'Lacak riwayat', body: 'Cari kode pcs, bundle, atau batch dan lihat siapa memegangnya.', href: '#fitur' },
    ],
  },
  {
    title: 'Pantau dan kelola',
    items: [
      { icon: Scale, title: 'Rekonsiliasi', body: 'Ready stock, reject, WIP, dan selisih dalam satu layar.', href: '#alur' },
      { icon: Layers, title: 'Pantau WIP', body: 'Lihat barang yang sedang dikerjakan dan yang masih menunggu.', href: '#alur' },
      { icon: BarChart3, title: 'Laporan dan export', body: 'Output, reject, dan selisih per periode, bisa diexport ke Excel.', href: '#fitur' },
      { icon: Database, title: 'Master data dan user', body: 'Kelola produk dan akun tim per peran, import lewat Excel.', href: '#fitur' },
    ],
  },
];

/** Desktop tray: three columns of features under the header, with a contact strip at the bottom. */
export function FeatureTray({ id, base = '', onNavigate }: { id: string; base?: string; onNavigate: () => void }) {
  return (
    <div
      id={id}
      className="absolute inset-x-0 top-full max-h-[calc(100dvh-4rem)] animate-[fade-in_200ms_ease-out] overflow-y-auto border-b border-border-strong bg-surface"
    >
      <div className="mx-auto grid max-w-[1200px] grid-cols-3 gap-x-6 px-6 pt-6 pb-5">
        {FEATURE_GROUPS.map((g) => (
          <section key={g.title} aria-label={g.title} className="flex flex-col gap-1">
            <h2 className="px-3 pb-1 text-caption tracking-[0.02em] text-text-muted">{g.title}</h2>
            <ul className="flex flex-col">
              {g.items.map(({ icon: Icon, title, body, href }) => (
                <li key={title}>
                  <a href={base + href} onClick={onNavigate} className="group flex gap-3 rounded-md p-3 transition-colors hover:bg-surface-muted">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                      <Icon size={20} strokeWidth={1.5} aria-hidden />
                    </span>
                    <span className="flex min-w-0 flex-col">
                      <span className="font-semibold text-text">{title}</span>
                      <span className="text-small text-pretty text-text-muted">{body}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      <div className="border-t border-border bg-surface-muted">
        <div className="mx-auto flex max-w-[1200px] items-center gap-4 px-6 py-3">
          <p className="pl-3 text-small text-text-muted">Mau tahu cocok atau tidak untuk alur konveksi kamu?</p>
          <a href={WA_ASK_URL} onClick={onNavigate} className="ml-auto inline-flex h-10 items-center gap-2 rounded-md px-3 text-small font-semibold text-primary transition-colors hover:bg-primary-soft">
            <WhatsAppGlyph size={16} />
            Tanya via WhatsApp
          </a>
          <a href={`${base}#fitur`} onClick={onNavigate} className="group inline-flex h-10 items-center gap-1.5 rounded-md px-3 text-small font-semibold text-text transition-colors hover:bg-surface">
            Lihat bagian fitur
            <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" />
          </a>
        </div>
      </div>
    </div>
  );
}

/** Mobile menu: the same list, compact (icon and title), under the Fitur row. */
export function FeatureList({ base = '', onNavigate }: { base?: string; onNavigate: () => void }) {
  return (
    <div className="flex flex-col gap-3 pt-1 pb-3 pl-3">
      {FEATURE_GROUPS.map((g) => (
        <section key={g.title} aria-label={g.title}>
          <h2 className="px-3 pb-1 text-caption tracking-[0.02em] text-text-muted">{g.title}</h2>
          <ul>
            {g.items.map(({ icon: Icon, title, href }) => (
              <li key={title}>
                <a href={base + href} onClick={onNavigate} className="flex min-h-11 items-center gap-3 rounded-md px-3 text-text hover:bg-surface-muted">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
                    <Icon size={16} strokeWidth={1.5} aria-hidden />
                  </span>
                  {title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
