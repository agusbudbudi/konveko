import type { Metadata } from 'next';
import Image, { type StaticImageData } from 'next/image';
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronLeft,
  ClipboardCheck,
  Flashlight,
  Mail,
  MessageCircle,
  Monitor,
  Printer,
  ScanLine,
  Search,
  Smartphone,
  Tag,
  Truck,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { FaqAccordion } from '@/components/landing/faq-accordion';
import { LandingHeader } from '@/components/landing/landing-header';
import { RevealOnScroll } from '@/components/landing/reveal-on-scroll';
import { SessionLink } from '@/components/landing/session-link';
import { RolesSlider, type RoleSlide } from '@/components/landing/roles-slider';
import { EMAIL, WA_ASK_URL, WA_DEVICE_URL, WA_DISPLAY, WA_URL } from '@/components/landing/contact';
import { Badge } from '@/components/ui/status-badge';
import hero from '@/public/hero-login.png';
import adminPhoto from '@/public/landing/Admin.png';
import finishingPhoto from '@/public/landing/Finishing.png';
import laptopPhoto from '@/public/landing/PC atau laptop.png';
import phonePhoto from '@/public/landing/HP Android.png';
import printerPhoto from '@/public/landing/Printer label thermal.png';
import handheldPhoto from '@/public/landing/SUNMI handheld.png';
import gunScannerPhoto from '@/public/landing/Scanner barcode genggam.png';
import gudangPhoto from '@/public/landing/Gudang.png';
import penjahitPhoto from '@/public/landing/Penjahit.png';
import produksiPhoto from '@/public/landing/Produksi.png';
import supervisorPhoto from '@/public/landing/Supervisor.png';

const DESCRIPTION =
  'Konveko mencatat qty di setiap serah-terima lewat scan QR, dari rol kain sampai rak gudang. Selisih ketahuan di step terjadinya, bukan saat stok opname.';

export const metadata: Metadata = {
  title: { absolute: 'Konveko · Tracking produksi konveksi' },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: '/',
    siteName: 'Konveko',
    locale: 'id_ID',
    title: 'Konveko · Tracking produksi konveksi',
    description: DESCRIPTION,
  },
  twitter: { card: 'summary_large_image', title: 'Konveko · Tracking produksi konveksi', description: DESCRIPTION },
};

/* Public landing page. Marketing-scale type (42/32) and the full-width primary CTA band are
   landing-only exceptions to DESIGN §3.1 and §4.4; everything else uses the app tokens. */

const iconProps = { size: 16, strokeWidth: 1.5, 'aria-hidden': true } as const;

function Overline({ children }: { children: React.ReactNode }) {
  return <span className="text-caption tracking-[0.02em] text-text-muted">{children}</span>;
}

function SectionTitle({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <h2 className={`text-[28px] leading-9 font-bold tracking-[-0.01em] text-balance sm:text-[40px] sm:leading-[48px] ${className}`}>{children}</h2>;
}

const btnPrimary =
  'inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-5 font-medium text-primary-foreground transition-colors hover:bg-primary-hover active:scale-[0.98]';
const btnSecondary =
  'inline-flex h-12 items-center justify-center rounded-md border border-border bg-surface px-5 font-medium text-text transition-colors hover:border-border-strong active:scale-[0.98]';

/* ---------- Sample data (illustrative numbers, written out so they always add up) ---------- */

const EQUATION = [
  { label: 'Ready stock', n: 104, color: 'bg-primary' },
  { label: 'Reject', n: 6, color: 'bg-danger' },
  { label: 'WIP dikerjakan', n: 5, color: 'bg-wip-active' },
  { label: 'WIP menunggu', n: 3, color: 'bg-neutral/20' },
  { label: 'Selisih', n: 2, color: 'bg-warning' },
];

const STEPS: { no: string; who: string; title: string; note?: string; flag?: boolean; badge: [React.ComponentProps<typeof Badge>['tone'], string]; current?: boolean }[] = [
  { no: '01', who: 'Produksi', title: 'Input rol dan cetak label', badge: ['neutral', 'Siap jahit'] },
  { no: '02', who: 'Penjahit', title: 'Scan terima di jahit', note: 'Kurang? Langsung di-flag', flag: true, badge: ['info', 'Proses jahit'], current: true },
  { no: '03', who: 'Penjahit', title: 'Scan selesai jahit', note: 'Jadi + reject dicatat', badge: ['neutral', 'Siap finishing'] },
  { no: '04', who: 'Finishing', title: 'Scan terima di finishing', note: 'Kurang? Langsung di-flag', flag: true, badge: ['info', 'Proses finishing'] },
  { no: '05', who: 'Finishing', title: 'Scan selesai, lolos QC', note: 'Hanya yang lolos QC masuk stok', badge: ['success', 'Ready stock'] },
];

const DESK_TILES = [
  { label: 'Ready stock', n: '1.012', color: 'bg-primary' },
  { label: 'Reject', n: '48', color: 'bg-danger' },
  { label: 'WIP', n: '171', color: 'bg-wip-active' },
  { label: 'Selisih', n: '9', color: 'bg-warning', warn: true },
];

const FEATURES: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: Tag, title: 'Label per pcs dan rak', body: 'Setiap pcs punya QR sendiri dan tercatat di rak mana. Stok bisa dilihat per variant, rak, atau produk.' },
  { icon: Truck, title: 'Barang keluar dan retur', body: 'Scan pcs yang dikirim ke dokumen keluar. Retur dicatat dengan kondisi baik atau rusak.' },
  { icon: ClipboardCheck, title: 'Stok opname per rak', body: 'Hitung buta: tim scan isi rak tanpa melihat stok sistem, lalu selisihnya dicocokkan di desk.' },
  { icon: Search, title: 'Lacak riwayat', body: 'Ketik kode pcs, bundle, atau batch. Lihat siapa memegangnya dan kapan, dari rol sampai keluar.' },
  { icon: Wrench, title: 'Reject dan rework', body: 'Reject dicatat dengan alasan. Yang bisa diperbaiki masuk rework dan kembali ke alur.' },
  { icon: BarChart3, title: 'Laporan dan export', body: 'Output, reject, dan selisih per periode. Master data bisa diimport dan diexport lewat Excel.' },
];

const ROLES: RoleSlide[] = [
  { role: 'Produksi', task: 'Input batch rol, cetak label bundle', photo: produksiPhoto, alt: 'Petugas produksi memegang gulungan label QR yang keluar dari printer thermal' },
  { role: 'Penjahit', task: 'Scan terima dan selesai jahit', photo: penjahitPhoto, alt: 'Penjahit memindai label bundle dengan scanner, layar menunjukkan proses selesai' },
  { role: 'Finishing', task: 'Scan terima, QC, catat reject', photo: finishingPhoto, alt: 'Petugas finishing memindai label kaos dengan scanner di meja QC' },
  { role: 'Gudang', task: 'Masuk rak, barang keluar, retur, opname', photo: gudangPhoto, alt: 'Petugas gudang memindai label kardus di depan rak stok' },
  { role: 'Supervisor', task: 'Pantau rekonsiliasi, selesaikan selisih', photo: supervisorPhoto, alt: 'Supervisor mencatat di clipboard, layar dashboard di sebelahnya' },
  { role: 'Admin', task: 'Kelola master data dan user', photo: adminPhoto, alt: 'Admin memegang laptop di area produksi, layar dashboard di belakangnya' },
];

const DEVICES: { art: { src: StaticImageData; alt: string }; use: string; name: string; body: string; tags: string[] }[] = [
  { art: { src: phonePhoto, alt: 'HP Android membuka kamera untuk scan QR code' }, use: 'Scan', name: 'HP Android', body: 'Kamera HP langsung jadi scanner QR. Cocok untuk penjahit yang sudah pegang HP sendiri.', tags: ['Kamera', 'Chrome'] },
  {
    art: { src: handheldPhoto, alt: 'Perangkat SUNMI handheld dengan scanner bawaan menampilkan scan berhasil' },
    use: 'Scan',
    name: 'SUNMI handheld',
    body: 'Perangkat Android dengan scanner bawaan. Tekan tombol samping, label langsung terbaca, cocok untuk scan beruntun.',
    tags: ['Scanner bawaan', 'Android'],
  },
  {
    art: { src: gunScannerPhoto, alt: 'Scanner barcode genggam dengan sinar scan hijau' },
    use: 'Scan',
    name: 'Scanner barcode genggam',
    body: 'Scanner QR yang terhubung ke HP atau PC dan bekerja seperti keyboard. Hasil scan langsung masuk tanpa perlu buka kamera.',
    tags: ['Mode keyboard'],
  },
  { art: { src: printerPhoto, alt: 'Printer label thermal mencetak label QR' }, use: 'Cetak', name: 'Printer label thermal', body: 'Cetak label QR untuk bundle, pcs, dan rak, lalu tempel di barang sebelum berpindah tangan.', tags: ['Label QR', 'Thermal'] },
  {
    art: { src: laptopPhoto, alt: 'Laptop membuka dashboard rekonsiliasi' },
    use: 'Kelola',
    name: 'PC atau laptop',
    body: 'Untuk supervisor dan admin: cek rekonsiliasi, tindak lanjuti selisih, kelola master data, dan export laporan.',
    tags: ['Browser', 'Excel'],
  },
];

const FAQ = [
  {
    q: 'Perangkat apa saja yang dibutuhkan?',
    a: 'Untuk scan di lantai produksi cukup HP Android atau scanner handheld. Untuk cetak label dan cek rekonsiliasi di meja, pakai PC dan printer thermal.',
  },
  {
    q: 'Bagaimana cara mendapatkan akun?',
    a: 'Akun dibuat oleh admin usaha kamu, lengkap dengan perannya. Setelah itu kamu bisa masuk dengan nomor HP dan PIN, atau email dan password.',
  },
  {
    q: 'Apa yang terjadi kalau qty yang diterima kurang?',
    a: 'Selisih langsung ditandai di step serah-terima itu, dan penerima memilih alasannya. Supervisor bisa menindaklanjuti dari meja tanpa menunggu stok opname.',
  },
  {
    q: 'Barang reject masih bisa diperbaiki?',
    a: 'Bisa. Reject dicatat dengan alasan, lalu yang masih bisa diperbaiki masuk rework dan kembali ke alur produksi.',
  },
  {
    q: 'Apakah data produk lama bisa dipindahkan?',
    a: 'Master data bisa diimport lewat Excel, dan laporan maupun master data juga bisa diexport kembali ke Excel.',
  },
  {
    q: 'Berapa biayanya?',
    a: 'Biaya menyesuaikan jumlah tim dan perangkat. Hubungi kami lewat WhatsApp untuk penawaran.',
  },
  {
    q: 'Bagaimana stok opname dilakukan?',
    a: 'Per rak, dengan hitung buta. Tim scan isi rak tanpa melihat stok sistem, lalu selisihnya dicocokkan di meja.',
  },
];

/* ---------- Small drawings ---------- */

/** Decorative QR (21×21 modules) for the label card and the phone viewfinder. */
function FakeQr({ size, label }: { size: number; label?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 21 21"
      shapeRendering="crispEdges"
      className="shrink-0"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
    >
      <g fill="#1C1B19">
        <path d="M0 0h7v7H0z M1 1v5h5V1z M2 2h3v3H2z" fillRule="evenodd" />
        <path d="M14 0h7v7h-7z M15 1v5h5V1z M16 2h3v3h-3z" fillRule="evenodd" />
        <path d="M0 14h7v7H0z M1 15v5h5v-5z M2 16h3v3H2z" fillRule="evenodd" />
        <path d="M8 0h1v2H8zM10 1h2v1h-2zM9 3h1v2H9zM11 4h2v1h-2zM8 6h1v1H8zM10 6h1v1h-1zM12 6h1v1h-1zM0 8h2v1H0zM3 8h1v2H3zM5 9h2v1H5zM1 11h1v2H1zM4 12h2v1H4zM8 8h2v2H8zM11 8h1v1h-1zM13 9h2v1h-2zM9 11h3v1H9zM12 12h1v2h-1zM8 13h1v1H8zM16 8h1v2h-1zM18 9h2v1h-2zM15 11h2v1h-2zM19 12h1v2h-1zM8 15h2v1H8zM11 16h1v2h-1zM9 18h1v2H9zM12 19h2v1h-2zM14 14h3v3h-3zM18 15h1v1h-1zM15 18h1v2h-1zM17 19h3v1h-3zM19 17h2v1h-2z" />
      </g>
    </svg>
  );
}

/** Half phone showing the camera scan screen, cut off by the bottom of the Alur section. */
function ScanPhone() {
  return (
    <div
      role="img"
      aria-label="Mockup HP: layar scan kamera membaca label QR bundle B-00231"
      className="relative h-[600px] w-[340px] max-w-full rounded-t-[56px] bg-text px-3 pt-3"
    >
      <div className="relative flex size-full flex-col overflow-hidden rounded-t-[44px] bg-[#33312D]">
        <div aria-hidden className="absolute -left-10 top-[150px] h-[300px] w-[420px] -rotate-[8deg] rounded-xl bg-[#3E5C55]" />
        <div aria-hidden className="absolute top-3 left-1/2 h-8 w-[110px] -translate-x-1/2 rounded-2xl bg-black" />

        <div aria-hidden className="relative mt-14 flex items-center gap-3 px-4">
          <span className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white">
            <ChevronLeft size={20} strokeWidth={1.5} />
          </span>
          <span className="flex grow flex-col text-white">
            <span className="text-[15px] leading-5 font-semibold">Scan terima</span>
            <span className="text-xs leading-4 text-[#D9D6D0]">Jahit · Tim A</span>
          </span>
          <span className="flex size-10 items-center justify-center rounded-full bg-black/45 text-white">
            <Flashlight size={20} strokeWidth={1.5} />
          </span>
        </div>

        <div aria-hidden className="relative mx-auto mt-10 size-[220px]">
          <div className="absolute top-[30px] left-[30px] size-40 -rotate-4 rounded-md bg-white p-3.5">
            <FakeQr size={132} />
          </div>
          <span className="absolute top-0 left-0 size-9 rounded-tl-[14px] border-t-4 border-l-4 border-white" />
          <span className="absolute top-0 right-0 size-9 rounded-tr-[14px] border-t-4 border-r-4 border-white" />
          <span className="absolute bottom-0 left-0 size-9 rounded-bl-[14px] border-b-4 border-l-4 border-white" />
          <span className="absolute right-0 bottom-0 size-9 rounded-br-[14px] border-r-4 border-b-4 border-white" />
          <span className="landing-scan absolute inset-x-4 top-[118px] h-0.5 rounded-[1px] bg-[#5FD4BF] shadow-[0_0_12px_2px_rgb(95_212_191/0.6)]" />
        </div>

        <span aria-hidden className="relative mt-5 self-center rounded-2xl bg-black/55 px-3 py-1.5 text-small text-white">
          Arahkan kamera ke label bundle
        </span>

        <div aria-hidden className="relative mx-3 mt-6 flex grow flex-col gap-2.5 rounded-t-2xl bg-white p-4">
          <span className="flex items-center gap-2">
            <span className="flex size-6 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Check size={14} strokeWidth={2} />
            </span>
            <span className="text-small font-medium text-primary">Label terbaca</span>
            <span className="num ml-auto text-small font-semibold text-text">B-00231</span>
          </span>
          <span className="text-[15px] leading-[22px] font-semibold text-text">Kaos polo · L · Hijau</span>
          <span className="num text-small text-text-muted">Dari produksi: 20 pcs · Batch BT-0012</span>
        </div>
      </div>
    </div>
  );
}

/** Receive screen on a phone, inside the "Di lantai produksi" card. */
function ReceivePhone() {
  return (
    <div aria-hidden className="flex w-full max-w-[300px] flex-col overflow-hidden rounded-t-[48px] border-[10px] border-b-0 border-text bg-background">
      <div className="flex h-11 items-start justify-center bg-surface pt-2.5">
        <span className="h-7 w-24 rounded-[14px] bg-black" />
      </div>
      <div className="flex h-11 items-center gap-2 border-b border-border bg-surface px-3.5">
        <span className="text-[15px] font-semibold text-primary">konveko</span>
        <span className="rounded-sm bg-surface-muted px-1.5 py-0.5 text-[11px] font-medium text-neutral">Jahit · Tim A</span>
      </div>
      <div className="flex flex-col gap-3 p-3.5">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2">
            <span className="num text-small font-semibold">B-00231</span>
            <span className="inline-flex h-5 items-center gap-[5px] rounded-sm bg-neutral-soft px-1.5 text-[11px] font-medium text-neutral">
              <span className="size-[5px] rounded-full bg-current" />
              Siap jahit
            </span>
          </span>
          <span className="text-[15px] font-semibold">Kaos polo · L · Hijau</span>
        </div>
        <span className="text-xs font-medium text-text-muted">Qty diterima</span>
        <div className="flex items-center gap-2">
          <span className="flex size-12 items-center justify-center rounded-md border border-border bg-surface text-xl">−</span>
          <span className="num flex h-12 grow items-center justify-center rounded-md border border-primary text-[28px] font-semibold">19</span>
          <span className="flex size-12 items-center justify-center rounded-md border border-border bg-surface text-xl">+</span>
        </div>
        <span className="num text-xs text-warning">Selisih 1 dari 20 pcs. Pilih alasan.</span>
        <div className="flex flex-wrap gap-1.5">
          <span className="inline-flex h-8 items-center rounded-md border border-primary bg-primary-soft px-2.5 text-xs font-medium text-primary">Kurang dari produksi</span>
          <span className="inline-flex h-8 items-center rounded-md border border-border bg-surface px-2.5 text-xs font-medium">Potongan rusak</span>
        </div>
        <span className="flex h-12 items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground">
          Konfirmasi terima <span className="num ml-1">19</span>&nbsp;pcs
        </span>
      </div>
    </div>
  );
}

/* ---------- Page ---------- */

export default function LandingPage() {
  const total = EQUATION.reduce((n, e) => n + e.n, 0);

  return (
    <div className="overflow-x-clip bg-background">
      <LandingHeader />
      <RevealOnScroll />

      <main>
        {/* Hero */}
        <section className="mx-auto grid max-w-[1200px] items-center gap-8 px-4 pt-6 pb-14 sm:px-6 lg:pt-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1.25fr)]">
          <div className="flex flex-col gap-6">
            <span className="landing-in inline-flex h-7 items-center gap-2 self-start rounded-sm bg-primary-soft px-2.5 text-small font-medium text-primary">
              <ScanLine {...iconProps} />
              Tracking produksi konveksi
            </span>
            <h1 style={{ '--delay': '80ms' } as React.CSSProperties} className="landing-in text-[36px] leading-[44px] font-bold tracking-[-0.015em] text-balance sm:text-[52px] sm:leading-[60px]">
              Dari rol kain sampai rak gudang, setiap pcs tercatat.
            </h1>
            <p style={{ '--delay': '160ms' } as React.CSSProperties} className="landing-in max-w-[520px] text-[17px] leading-7 text-pretty text-text-muted">
              Konveko mencatat qty di setiap serah-terima lewat scan QR. Kalau ada yang kurang, ketahuan di step terjadinya, bukan saat
              stok opname.
            </p>
            <div style={{ '--delay': '240ms' } as React.CSSProperties} className="landing-in flex flex-wrap gap-3 max-sm:[&>a]:flex-[1_1_100%]">
              <a href={WA_ASK_URL} className={btnPrimary}>
                <MessageCircle size={18} strokeWidth={1.5} aria-hidden />
                Tanya via WhatsApp
              </a>
              <a href="#alur" className={btnSecondary}>
                Lihat alur kerja
              </a>
            </div>
            <ul style={{ '--delay': '320ms' } as React.CSSProperties} className="landing-in flex flex-wrap gap-x-5 gap-y-2 text-small text-text-muted">
              {[
                { icon: Smartphone, label: 'HP Android' },
                { icon: ScanLine, label: 'Scanner handheld' },
                { icon: Monitor, label: 'PC dan printer thermal' },
              ].map(({ icon: Icon, label }) => (
                <li key={label} className="flex items-center gap-1.5">
                  <Icon {...iconProps} className="text-text-subtle" />
                  {label}
                </li>
              ))}
            </ul>
          </div>

          <div className="relative flex flex-col items-center pb-3 lg:pb-0">
            <Image
              src={hero}
              alt="Ilustrasi alur produksi: rol kain, bundle berlabel QR, mesin jahit, tumpukan kaos, sampai rak gudang"
              priority
              sizes="(min-width: 1024px) 760px, 100vw"
              style={{ '--delay': '120ms' } as React.CSSProperties}
              className="landing-in block h-auto w-[145%] max-w-none sm:w-full lg:-mr-20 lg:w-[calc(100%+100px)]"
            />
            {/* Scan result card */}
            <div style={{ '--delay': '450ms' } as React.CSSProperties} className="landing-float absolute top-[34%] -left-2 flex w-[216px] flex-col gap-1.5 rounded-lg bg-surface p-3 shadow-[0_8px_24px_-6px_rgb(28_27_25/0.12),0_2px_6px_rgb(28_27_25/0.05)] sm:top-1/2 sm:left-6 sm:-translate-y-1/2 sm:gap-2.5 sm:p-4">
              <div className="flex items-center gap-2">
                <span className="num font-semibold text-primary">B-00231</span>
                <Badge tone="info">Proses jahit</Badge>
              </div>
              <p className="text-sm leading-[22px]">
                Diterima <span className="num font-semibold">19</span> dari <span className="num">20</span> pcs.
              </p>
              <span className="self-start whitespace-nowrap">
                <Badge tone="warning">
                  Selisih <span className="num">1</span> pcs di terima jahit
                </Badge>
              </span>
            </div>
            {/* Bundle label */}
            <div style={{ '--delay': '650ms' } as React.CSSProperties} className="landing-float absolute -right-2 bottom-6 flex w-[200px] flex-col gap-2 rounded-sm bg-surface p-2.5 shadow-[0_8px_24px_-6px_rgb(28_27_25/0.12),0_2px_6px_rgb(28_27_25/0.05)] sm:right-0 sm:bottom-14 sm:p-3 lg:-right-6">
              <span className="flex items-center gap-1.5 text-[11px] leading-4 font-medium text-text-muted">
                <Printer size={14} strokeWidth={1.5} aria-hidden />
                Label bundle
              </span>
              <div className="flex items-center gap-2.5 border-t border-dashed border-[#C9C4BC] pt-2.5">
                <span className="size-[52px] shrink-0 sm:size-16 [&>svg]:size-full">
                  <FakeQr size={64} label="QR label B-00231" />
                </span>
                <div className="flex min-w-0 flex-col whitespace-nowrap">
                  <span className="num text-[15px] leading-5 font-semibold">B-00231</span>
                  <span className="text-xs leading-4 text-neutral">Kaos polo · L · Hijau</span>
                  <span className="num text-xs leading-4 text-neutral">20 pcs · BT-0012</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Equation */}
        <section className="mx-auto max-w-[1200px] px-4 pb-14 sm:px-6 sm:pb-20">
          <div data-reveal className="grid items-center gap-8 rounded-lg border border-border bg-surface p-5 sm:p-8 md:grid-cols-2">
            <div className="flex flex-col gap-3">
              <Overline>Rekonsiliasi per batch</Overline>
              <SectionTitle>Satu persamaan, tidak ada angka yang hilang.</SectionTitle>
              <p className="text-pretty text-text-muted">
                Target potong selalu sama dengan ready stock, reject, barang yang masih dikerjakan, dan selisih serah-terima. Kalau tidak
                cocok, kamu tahu di tangan siapa.
              </p>
            </div>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="num text-[26px] leading-[34px] font-semibold sm:text-[32px] sm:leading-10">
                  {total} = 104 + 6 + 8 + 2
                </span>
                <span className="text-small text-text-muted">
                  pcs · Batch <span className="num">BT-0012</span>
                </span>
              </div>
              <div
                role="img"
                aria-label="Bar rekonsiliasi: 104 ready stock, 6 reject, 5 sedang dikerjakan, 3 menunggu terima, 2 selisih"
                className="landing-bar flex h-3 gap-0.5 overflow-hidden rounded-sm"
              >
                {EQUATION.map((e) => (
                  <span key={e.label} className={e.color} style={{ flex: e.n }} />
                ))}
              </div>
              <ul className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-4 gap-y-2 text-small text-text-muted">
                {EQUATION.map((e) => (
                  <li key={e.label} className="flex items-center gap-2">
                    <span className={`size-2 rounded-[2px] ${e.color}`} />
                    {e.label}
                    <span className={`num ml-auto font-medium ${e.label === 'Selisih' ? 'text-warning' : 'text-text'}`}>{e.n}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Flow */}
        <section id="alur" className="scroll-mt-16 overflow-hidden border-y border-border bg-surface-muted">
          <div className="mx-auto grid max-w-[1200px] items-end gap-12 px-4 pt-14 sm:px-6 sm:pt-20 lg:grid-cols-2">
            <div className="flex flex-col gap-8 lg:pb-20">
              <div data-reveal className="flex flex-col gap-3">
                <Overline>Alur kerja</Overline>
                <SectionTitle>Empat scan per bundle. Dua menangkap selisih, dua mencatat reject.</SectionTitle>
                <p className="text-pretty text-text-muted">
                  Label QR dicetak sekali di produksi. Setelah itu setiap perpindahan cukup satu scan dan konfirmasi qty, di bawah 30 detik.
                </p>
              </div>
              <ol data-reveal style={{ '--delay': '100ms' } as React.CSSProperties} className="overflow-hidden rounded-lg border border-border bg-surface">
                {STEPS.map((s) => (
                  <li
                    key={s.no}
                    aria-current={s.current ? 'step' : undefined}
                    className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 px-4 py-3.5 not-first:border-t not-first:border-border sm:grid-cols-[96px_minmax(0,1fr)_auto] sm:gap-y-3 ${
                      s.current ? 'bg-primary-soft shadow-[inset_3px_0_0_var(--primary)]' : ''
                    }`}
                  >
                    <span className={`num col-span-full text-small sm:col-span-1 ${s.current ? 'font-medium text-primary' : 'text-text-muted'}`}>
                      {s.no} · {s.who}
                    </span>
                    <span className="flex flex-col">
                      <span className="font-semibold">{s.title}</span>
                      {s.note && <span className={`text-small ${s.flag ? 'text-warning' : 'text-text-muted'}`}>{s.note}</span>}
                    </span>
                    <Badge tone={s.badge[0]}>{s.badge[1]}</Badge>
                  </li>
                ))}
              </ol>
            </div>
            <div data-reveal style={{ '--delay': '150ms' } as React.CSSProperties} className="flex justify-center">
              <ScanPhone />
            </div>
          </div>
        </section>

        {/* Two places */}
        <section className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-14 sm:px-6 sm:py-20">
          <div data-reveal className="flex max-w-[640px] flex-col gap-3">
            <Overline>Dua tempat kerja</Overline>
            <SectionTitle>Scan di lantai produksi, cocokkan di meja.</SectionTitle>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div data-reveal className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-h2">
                  <Smartphone size={20} strokeWidth={1.5} aria-hidden className="text-primary" />
                  Di lantai produksi
                </h3>
                <p className="text-pretty text-text-muted">
                  Penjahit dan finishing scan label pakai HP atau scanner. Satu tangan, tombol besar, qty sudah terisi.
                </p>
              </div>
              <div className="flex justify-center overflow-hidden rounded-lg bg-surface-muted px-4 pt-6">
                <ReceivePhone />
              </div>
            </div>

            <div data-reveal style={{ '--delay': '120ms' } as React.CSSProperties} className="flex flex-col gap-6 rounded-lg border border-border bg-surface p-5 sm:p-6">
              <div className="flex flex-col gap-2">
                <h3 className="flex items-center gap-2 text-h2">
                  <Monitor size={20} strokeWidth={1.5} aria-hidden className="text-primary" />
                  Di meja
                </h3>
                <p className="text-pretty text-text-muted">
                  Supervisor dan owner lihat rekonsiliasi semua batch, tindak lanjuti selisih, dan koreksi data.
                </p>
              </div>
              <div aria-hidden className="grid grow grid-cols-2 content-start gap-2 rounded-lg bg-surface-muted p-4">
                <div className="col-span-full flex flex-col gap-2 rounded-lg border border-border bg-surface p-3.5">
                  <span className="text-caption text-text-muted">Target</span>
                  <span className="flex items-baseline gap-2">
                    <span className="num text-[28px] leading-9 font-semibold">1.240</span>
                    <span className="text-small text-text-muted">
                      pcs dari <span className="num">14</span> batch
                    </span>
                  </span>
                  <div className="landing-bar flex h-2 gap-0.5 overflow-hidden rounded-sm">
                    <span className="bg-primary" style={{ flex: 1012 }} />
                    <span className="bg-danger" style={{ flex: 48 }} />
                    <span className="bg-wip-active" style={{ flex: 110 }} />
                    <span className="bg-neutral/20" style={{ flex: 61 }} />
                    <span className="bg-warning" style={{ flex: 9 }} />
                  </div>
                </div>
                {DESK_TILES.map((t) => (
                  <div key={t.label} className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-3.5">
                    <span className="flex items-center gap-1.5 text-caption text-text-muted">
                      <span className={`size-2 rounded-[2px] ${t.color}`} />
                      {t.label}
                    </span>
                    <span className={`num text-[24px] leading-8 font-semibold ${t.warn ? 'text-warning' : ''}`}>{t.n}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="fitur" className="scroll-mt-16 border-t border-border">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-14 sm:px-6 sm:py-20">
            <div data-reveal className="flex max-w-[640px] flex-col gap-3">
              <Overline>Setelah ready stock</Overline>
              <SectionTitle>Lacak sampai per pcs, sampai barang keluar gudang.</SectionTitle>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {FEATURES.map(({ icon: Icon, title, body }, i) => (
                <div
                  key={title}
                  data-reveal
                  style={{ '--delay': `${(i % 3) * 80}ms` } as React.CSSProperties}
                  className="group flex flex-col gap-2 rounded-lg border border-border bg-surface p-5 hover:border-border-strong"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
                    <Icon size={20} strokeWidth={1.5} aria-hidden />
                  </span>
                  <h3 className="text-h3">{title}</h3>
                  <p className="text-sm leading-[22px] text-text-muted">{body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Roles */}
        <section id="peran" className="scroll-mt-16 overflow-hidden border-y border-border bg-surface-muted">
          <div className="mx-auto max-w-[1200px] px-4 py-14 sm:px-6 sm:py-20">
            <RolesSlider
              reveal
              slides={ROLES}
              intro={
                <>
                  <Overline>Untuk siapa</Overline>
                  <SectionTitle>Setiap orang hanya lihat tugasnya.</SectionTitle>
                  <p className="text-pretty text-text-muted">
                    Akses diatur per peran. Satu orang bisa punya lebih dari satu peran, misalnya supervisor yang juga admin.
                  </p>
                </>
              }
            />
          </div>
        </section>

        {/* Devices */}
        <section id="perangkat" className="scroll-mt-16 border-b border-border">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-14 sm:px-6 sm:py-20">
            <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
              <div data-reveal className="flex max-w-[640px] flex-[1_1_480px] flex-col gap-3">
                <Overline>Perangkat yang didukung</Overline>
                <SectionTitle>Pakai perangkat yang sudah ada di lantai produksi.</SectionTitle>
                <p className="text-pretty text-text-muted">
                  Konveko jalan di browser. Scan bisa lewat kamera HP, scanner bawaan perangkat handheld, atau scanner genggam. Label dicetak
                  dari PC ke printer thermal.
                </p>
              </div>
              <a href={WA_DEVICE_URL} className="group inline-flex min-h-11 md:ml-auto items-center gap-1.5 font-medium text-primary hover:text-primary-hover">
                Tanya perangkat yang cocok
                <ArrowRight {...iconProps} className="transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>
            {/* Web: 3 cards on the first row, 2 wider ones on the second (6-column grid). */}
            <ul className="grid grid-cols-1 gap-4 md:grid-cols-6">
              {DEVICES.map(({ art, use, name, body, tags }, i) => (
                <li
                  key={name}
                  data-reveal
                  style={{ '--delay': `${(i < 3 ? i : i - 3) * 80}ms` } as React.CSSProperties}
                  className={`group flex overflow-hidden rounded-lg border border-border bg-surface hover:border-border-strong md:flex-col ${i < 3 ? 'md:col-span-2' : 'md:col-span-3'}`}
                >
                  <div className="flex w-28 shrink-0 items-center justify-center bg-surface-muted md:h-[184px] md:w-auto">
                    <Image src={art.src} alt={art.alt} sizes="(min-width: 768px) 252px, 132px" className="h-auto max-h-[88px] w-auto max-w-[104px] transition-transform duration-500 ease-[cubic-bezier(0.2,0,0,1)] group-hover:scale-105 group-hover:-rotate-2 md:max-h-[168px] md:max-w-[252px]" />
                  </div>
                  <div className="flex grow flex-col gap-1 px-4 py-3.5 md:gap-2 md:p-5">
                    <span className="text-caption text-primary">{use}</span>
                    <h3 className="text-h3">{name}</h3>
                    <p className="text-sm leading-[22px] text-pretty text-text-muted">{body}</p>
                    <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                      {tags.map((t) => (
                        <span key={t} className="inline-flex h-6 items-center rounded-sm bg-neutral-soft px-2 text-xs font-medium text-neutral">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="scroll-mt-16">
          <div className="mx-auto grid max-w-[1200px] items-start gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2">
            <div data-reveal className="flex flex-col gap-3">
              <Overline>FAQ</Overline>
              <SectionTitle>Pertanyaan yang sering muncul.</SectionTitle>
              <p className="text-pretty text-text-muted">
                Belum terjawab? Hubungi kami lewat{' '}
                <a href={WA_URL} className="font-medium text-primary underline-offset-3 hover:underline">
                  WhatsApp
                </a>{' '}
                atau{' '}
                <a href={`mailto:${EMAIL}`} className="font-medium text-primary underline-offset-3 hover:underline">
                  email
                </a>
                .
              </p>
            </div>
            <div data-reveal style={{ '--delay': '120ms' } as React.CSSProperties}>
              <FaqAccordion items={FAQ} />
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="bg-primary">
          <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-6 px-4 py-14 sm:px-6 sm:py-20">
            <div data-reveal className="flex flex-[1_1_420px] flex-col gap-2">
              <SectionTitle className="text-white">Siap tahu di mana setiap pcs berada?</SectionTitle>
              <p className="text-[#CFE3DE]">
                Ceritakan alur produksi konveksi kamu, kami bantu siapkan Konveko untuk tim jahit, finishing, dan gudang.
              </p>
            </div>
            <div data-reveal style={{ '--delay': '120ms' } as React.CSSProperties} className="flex flex-col items-start gap-1 max-sm:w-full">
              <a
                href={WA_ASK_URL}
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-surface px-5 font-semibold text-primary transition-[background-color,transform] hover:bg-primary-soft active:scale-[0.98] max-sm:w-full"
              >
                <MessageCircle size={18} strokeWidth={1.5} aria-hidden />
                Tanya via WhatsApp
              </a>
              <SessionLink className="group inline-flex min-h-11 items-center gap-1 text-sm font-medium text-white underline-offset-3 hover:underline" />
            </div>
          </div>
        </section>
      </main>

      <footer id="kontak" className="scroll-mt-16 bg-primary">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-3 px-4 py-6 text-small text-[#CFE3DE] sm:px-6 border-t border-white/15">
          <Wordmark size="md" onDark />
          <span>Tracking produksi konveksi dari rol kain sampai stok gudang.</span>
          <nav aria-label="Kontak" className="flex flex-wrap items-center gap-x-4 gap-y-1 lg:ml-auto">
            <a href={`mailto:${EMAIL}`} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-white hover:underline underline-offset-3">
              <Mail {...iconProps} />
              {EMAIL}
            </a>
            <a href={WA_URL} className="inline-flex min-h-11 items-center gap-1.5 font-medium text-white hover:underline underline-offset-3">
              <MessageCircle {...iconProps} />
              <span className="num">WhatsApp {WA_DISPLAY}</span>
            </a>
          </nav>
          <span className="num">© 2026 Konveko</span>
        </div>
      </footer>
    </div>
  );
}
