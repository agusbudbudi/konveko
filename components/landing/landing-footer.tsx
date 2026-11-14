import Link from 'next/link';
import { Mail } from 'lucide-react';
import { Wordmark } from '@/components/brand/wordmark';
import { EMAIL, WA_ASK_URL, WA_DISPLAY, WA_URL } from './contact';
import { SessionLink } from './session-link';
import { TOPICS } from './topics';
import { WhatsAppGlyph } from './whatsapp-glyph';

/* "/#..." so the same links work from the landing page and from topic pages. */
const PRODUCT = [
  { href: '/#alur', label: 'Alur kerja' },
  { href: '/#fitur', label: 'Fitur' },
  { href: '/#peran', label: 'Untuk siapa' },
  { href: '/#perangkat', label: 'Perangkat' },
  { href: '/#mulai', label: 'Cara mulai' },
  { href: '/#faq', label: 'FAQ' },
];

const heading = 'pb-2 text-caption tracking-[0.02em] text-[#8DB8AF]';
const link = 'inline-flex min-h-9 items-center gap-2 text-[#CFE3DE] underline-offset-3 transition-colors hover:text-white hover:underline';

/**
 * Shared by the landing page and the topic pages: brand and contact button, then three link columns,
 * then a legal bar. The topic links are how crawlers reach those pages.
 */
export function LandingFooter() {
  return (
    <footer id="kontak" className="scroll-mt-16 border-t border-white/15 bg-primary">
      <div className="mx-auto grid max-w-[1200px] grid-cols-2 gap-x-8 gap-y-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))]">
        <div className="flex flex-col items-start gap-4 col-span-2 lg:col-span-1">
          <Wordmark size="md" onDark />
          <p className="max-w-[320px] text-pretty text-[#CFE3DE]">
            Tracking produksi konveksi lewat scan QR, dari rol kain sampai stok gudang.
          </p>
          <a
            href={WA_ASK_URL}
            className="inline-flex h-11 items-center gap-2 rounded-md bg-surface px-4 font-semibold text-primary transition-[background-color,transform] hover:bg-primary-soft active:scale-[0.98]"
          >
            <WhatsAppGlyph size={18} />
            Tanya via WhatsApp
          </a>
        </div>

        <nav aria-label="Produk" className="flex flex-col items-start">
          <h2 className={heading}>Produk</h2>
          {PRODUCT.map((p) => (
            <a key={p.href} href={p.href} className={link}>
              {p.label}
            </a>
          ))}
        </nav>

        <nav aria-label="Pelajari" className="flex flex-col items-start">
          <h2 className={heading}>Pelajari</h2>
          {TOPICS.map((t) => (
            <Link key={t.path} href={t.path} className={link}>
              {t.nav}
            </Link>
          ))}
        </nav>

        <nav aria-label="Kontak" className="col-span-2 flex flex-col items-start lg:col-span-1">
          <h2 className={heading}>Kontak</h2>
          <a href={WA_URL} className={link}>
            <WhatsAppGlyph size={16} />
            <span className="num">{WA_DISPLAY}</span>
          </a>
          <a href={`mailto:${EMAIL}`} className={`${link} break-all`}>
            <Mail size={16} strokeWidth={1.5} aria-hidden className="shrink-0" />
            {EMAIL}
          </a>
        </nav>
      </div>

      {/* Right padding keeps the bar clear of the floating WhatsApp button. */}
      <div className="border-t border-white/15">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-x-6 gap-y-1 py-4 pr-24 pl-4 text-small text-[#8DB8AF] sm:pl-6">
          <span className="num">© 2026 Konveko</span>
          <SessionLink className="group inline-flex min-h-9 items-center gap-1 font-medium text-[#CFE3DE] underline-offset-3 hover:text-white hover:underline" />
        </div>
      </div>
    </footer>
  );
}
