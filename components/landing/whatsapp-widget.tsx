'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, SendHorizontal, X } from 'lucide-react';
import { waLink } from './contact';
import { WhatsAppGlyph } from './whatsapp-glyph';

/* WhatsApp brand green: the one place the landing page leaves the app palette, so the button reads
   as WhatsApp at a glance. */
const WA_GREEN = 'bg-[#25D366]';
const WA_GREEN_HOVER = 'hover:bg-[#1EBE5A]';

const TEASER_DELAY_MS = 6000;
const TYPING_MS = 900;
const TEASER_KEY = 'konveko-wa-teaser-seen';

/** Each topic opens WhatsApp with the message already written, so the visitor only has to hit send. */
const TOPICS = [
  { label: 'Minta demo Konveko', text: 'Halo Konveko, saya mau lihat demo Konveko untuk konveksi saya.' },
  { label: 'Tanya harga', text: 'Halo Konveko, saya mau tanya harga untuk tim saya.' },
  { label: 'Perangkat yang cocok', text: 'Halo Konveko, saya mau tanya soal perangkat yang cocok.' },
  { label: 'Cara mulai pakai', text: 'Halo Konveko, saya mau tanya cara mulai pakai Konveko di konveksi saya.' },
] as const;

/**
 * Floating WhatsApp button, bottom right of the landing page.
 * - A teaser bubble and a "1" badge appear after a few seconds, once per browser session.
 * - Opening it shows a small chat panel: a greeting, topic shortcuts with the message prefilled,
 *   and a free-text box. Every path ends in wa.me with the text already written.
 * z-10 keeps it under the sticky header (z-20), so the mobile menu and its backdrop cover it.
 */
export function WhatsAppWidget() {
  const [open, setOpen] = useState(false);
  const [teaser, setTeaser] = useState(false);
  const [unread, setUnread] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const greeted = useRef(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  // Teaser: once per session, and never over an open panel.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem(TEASER_KEY) === '1';
    } catch {}
    if (seen) return;
    const t = setTimeout(() => {
      setTeaser(true);
      setUnread(true);
      try {
        sessionStorage.setItem(TEASER_KEY, '1');
      } catch {}
    }, TEASER_DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  // First open only: a short "typing" beat before the greeting, skipped under reduced motion.
  useEffect(() => {
    if (!typing) return;
    const t = setTimeout(() => setTyping(false), TYPING_MS);
    return () => clearTimeout(t);
  }, [typing]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (!next) return;
    setTeaser(false);
    setUnread(false);
    try {
      sessionStorage.setItem(TEASER_KEY, '1');
    } catch {}
    if (!greeted.current) {
      greeted.current = true;
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) setTyping(true);
    }
  }

  function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message) return;
    window.open(waLink(message), '_blank', 'noopener,noreferrer');
    setText('');
  }

  return (
    <div className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex flex-col-reverse items-end gap-3 sm:right-6 sm:bottom-6 print:hidden">
      <button
        ref={toggleRef}
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={open ? 'Tutup chat WhatsApp' : 'Chat via WhatsApp'}
        className={`group relative flex size-14 cursor-pointer items-center justify-center rounded-full text-white transition-[background-color,transform] duration-200 hover:scale-105 active:scale-95 ${WA_GREEN} ${WA_GREEN_HOVER}`}
      >
        {unread && !open && (
          <span aria-hidden className={`absolute inset-0 rounded-full opacity-60 animate-ping [animation-iteration-count:4] ${WA_GREEN}`} />
        )}
        <span className={`relative transition-transform duration-300 ease-[cubic-bezier(0.2,0,0,1)] ${open ? 'rotate-90' : ''}`}>
          {open ? <X size={26} strokeWidth={2} aria-hidden /> : <WhatsAppGlyph />}
        </span>
        {unread && !open && (
          <span
            aria-hidden
            className="num absolute -top-0.5 -right-0.5 flex size-5 items-center justify-center rounded-full border-2 border-background bg-highlight text-[11px] leading-none font-bold text-white"
          >
            1
          </span>
        )}
      </button>

      {teaser && !open && (
        <div className="flex animate-[fade-in_300ms_ease-out] items-stretch overflow-hidden rounded-lg border border-border-strong bg-surface">
          <button type="button" onClick={toggle} className="max-w-[230px] cursor-pointer py-2.5 pr-2 pl-3.5 text-left transition-colors hover:bg-[#FAF9F7]">
            <span className="block text-small font-semibold">Ada pertanyaan?</span>
            <span className="block text-small text-text-muted">Chat tim Konveko lewat WhatsApp.</span>
          </button>
          <button
            type="button"
            onClick={() => setTeaser(false)}
            aria-label="Tutup pesan"
            className="flex w-10 cursor-pointer items-start justify-center pt-2.5 text-text-subtle transition-colors hover:text-text"
          >
            <X size={16} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Chat WhatsApp Konveko"
          className="flex max-h-[calc(100dvh-180px)] w-[min(360px,calc(100vw-2rem))] origin-bottom-right animate-[fade-in_220ms_ease-out] flex-col overflow-hidden rounded-xl border border-border-strong bg-surface"
        >
          <div className="flex items-center gap-3 bg-primary px-4 py-3 text-white">
            <span className={`relative flex size-10 shrink-0 items-center justify-center rounded-full ${WA_GREEN}`}>
              <WhatsAppGlyph size={22} />
            </span>
            <div className="min-w-0">
              <p className="font-semibold">Tim Konveko</p>
              <p className="text-small text-[#CFE3DE]">Chat langsung lewat WhatsApp</p>
            </div>
          </div>

          <div className="flex min-h-0 flex-col gap-3 overflow-y-auto bg-surface-muted p-4">
            <div aria-live="polite" className="max-w-[88%] self-start rounded-lg rounded-tl-sm border border-border bg-surface px-3.5 py-2.5">
              {typing ? (
                <span className="flex h-6 items-center gap-1" role="status" aria-label="Sedang mengetik">
                  {[0, 150, 300].map((d) => (
                    <span key={d} style={{ animationDelay: `${d}ms` }} className="size-1.5 animate-bounce rounded-full bg-text-subtle" />
                  ))}
                </span>
              ) : (
                <p className="text-pretty">
                  Halo! Mau tanya soal apa? Pilih topik di bawah, pesannya langsung terisi di WhatsApp.
                </p>
              )}
            </div>

            {!typing && (
              <ul className="flex animate-[fade-in_300ms_ease-out] flex-col gap-2">
                {TOPICS.map((t) => (
                  <li key={t.label}>
                    <a
                      href={waLink(t.text)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group flex min-h-11 items-center justify-between gap-3 rounded-md border border-border-strong bg-surface px-3.5 font-medium text-primary transition-colors hover:border-primary hover:bg-primary-soft"
                    >
                      {t.label}
                      <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="shrink-0 transition-transform duration-200 group-hover:translate-x-1" />
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={send} className="flex items-center gap-2 border-t border-border p-3">
            <label htmlFor={`${panelId}-text`} className="sr-only">
              Tulis pesan sendiri
            </label>
            <input
              id={`${panelId}-text`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Atau tulis pesan sendiri"
              autoComplete="off"
              enterKeyHint="send"
              className="h-11 min-w-0 flex-1 rounded-md border border-border-strong bg-surface px-3 text-[16px] placeholder:text-text-subtle focus:border-primary focus:outline-none"
            />
            <button
              type="submit"
              disabled={!text.trim()}
              aria-label="Kirim lewat WhatsApp"
              className={`flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md text-white transition-[background-color,opacity] disabled:cursor-not-allowed disabled:opacity-40 ${WA_GREEN} ${WA_GREEN_HOVER}`}
            >
              <SendHorizontal size={18} strokeWidth={1.5} aria-hidden />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
