import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Check } from 'lucide-react';
import { SITE_URL } from '@/lib/site';
import { waLink } from './contact';
import { FaqAccordion } from './faq-accordion';
import { LandingFooter } from './landing-footer';
import { LandingHeader } from './landing-header';
import { TOPICS, type Topic } from './topics';
import { WhatsAppGlyph } from './whatsapp-glyph';
import { WhatsAppWidget } from './whatsapp-widget';

export function topicMetadata(t: Topic): Metadata {
  // Setting openGraph here replaces the root one, so the shared link-preview image has to be named again.
  const image = { url: '/opengraph-image', width: 1200, height: 630, alt: 'Konveko, tracking produksi konveksi' };
  return {
    title: { absolute: t.metaTitle },
    description: t.description,
    alternates: { canonical: t.path },
    openGraph: { type: 'article', url: t.path, siteName: 'Konveko', locale: 'id_ID', title: t.metaTitle, description: t.description, images: [image] },
    twitter: { card: 'summary_large_image', title: t.metaTitle, description: t.description, images: [image.url] },
  };
}

/** First publish date of the topic pages (Article schema). */
const PUBLISHED = '2026-11-15';

const btn = 'inline-flex h-12 items-center justify-center gap-2 rounded-md px-5 font-medium transition-colors active:scale-[0.98]';

/** One public topic page: article-width reading column, the app's real screens, FAQ and a WhatsApp CTA. */
export function TopicPage({ topic: t }: { topic: Topic }) {
  const wa = waLink(t.waText);
  const url = `${SITE_URL}${t.path}`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        headline: t.h1,
        description: t.description,
        inLanguage: 'id-ID',
        datePublished: PUBLISHED,
        image: `${SITE_URL}/opengraph-image`,
        mainEntityOfPage: url,
        author: { '@type': 'Organization', name: 'Konveko', url: SITE_URL },
        publisher: {
          '@type': 'Organization',
          name: 'Konveko',
          url: SITE_URL,
          logo: `${SITE_URL}/logo-konveko.png`,
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Konveko', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: t.nav, item: url },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: t.faq.map((f) => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
  const toc = [
    ...t.sections.map((s, i) => ({
      href: `#bagian-${i + 1}`,
      label: s.heading,
    })),
    { href: '#cara-konveko', label: t.konveko.heading },
    { href: '#faq', label: 'Pertanyaan yang sering muncul' },
  ];
  const related = t.related.map((path) => TOPICS.find((o) => o.path === path)!);
  const phones = t.shots.filter((s) => s.kind === 'phone');
  const desks = t.shots.filter((s) => s.kind === 'desk');

  return (
    <div className="overflow-x-clip bg-background">
      {/* "<" escaped so the JSON can never close the script tag */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c'),
        }}
      />
      <LandingHeader base="/" />

      <main>
        <header className="border-b border-border bg-surface-muted">
          <div className="mx-auto flex max-w-[1200px] flex-col gap-5 px-4 py-12 sm:px-6 sm:py-16 [&>*]:max-w-[760px]">
            <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-small text-text-muted">
              <Link href="/" className="underline-offset-3 hover:text-text hover:underline">
                Konveko
              </Link>
              <span aria-hidden>/</span>
              <span aria-current="page" className="text-text">
                {t.nav}
              </span>
            </nav>
            <h1 className="text-[32px] leading-10 font-bold tracking-[-0.015em] text-balance sm:text-[44px] sm:leading-[52px]">{t.h1}</h1>
            <p className="text-[17px] leading-7 text-pretty text-text-muted">{t.intro}</p>
            <a href={wa} className={`${btn} self-start bg-primary text-primary-foreground hover:bg-primary-hover max-sm:w-full`}>
              <WhatsAppGlyph size={18} />
              Tanya via WhatsApp
            </a>
          </div>
        </header>

        {/* Same 1200px container as the landing page; the text keeps a reading measure and the spare width holds a sticky aside. */}
        <div className="mx-auto grid max-w-[1200px] items-start gap-x-16 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[minmax(0,720px)_minmax(0,1fr)]">
          <article className="flex min-w-0 flex-col gap-12">
            {t.sections.map((s, i) => (
              <section key={s.heading} id={`bagian-${i + 1}`} className="flex scroll-mt-24 flex-col gap-4">
                <h2 className="text-[24px] leading-8 font-bold tracking-[-0.01em] text-balance sm:text-[28px] sm:leading-9">{s.heading}</h2>
                {s.paragraphs.map((p) => (
                  <p key={p} className="text-[16px] leading-7 text-pretty">
                    {p}
                  </p>
                ))}
                {s.list && (
                  <ul className="flex flex-col gap-2.5">
                    {s.list.map((li) => (
                      <li key={li} className="flex gap-3 text-[16px] leading-7">
                        <span aria-hidden className="mt-[11px] size-1.5 shrink-0 rounded-full bg-primary" />
                        {li}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}

            <section id="cara-konveko" className="flex scroll-mt-24 flex-col gap-6 rounded-lg border border-border bg-surface p-5 sm:p-8">
              <div className="flex flex-col gap-3">
                <h2 className="text-[24px] leading-8 font-bold tracking-[-0.01em] text-balance sm:text-[28px] sm:leading-9">{t.konveko.heading}</h2>
                <p className="text-[16px] leading-7 text-pretty text-text-muted">{t.konveko.intro}</p>
              </div>
              <ul className="flex flex-col gap-4">
                {t.konveko.points.map((p) => (
                  <li key={p.title} className="flex gap-3">
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                      <Check size={14} strokeWidth={2} aria-hidden />
                    </span>
                    <span className="flex flex-col">
                      <span className="font-semibold">{p.title}</span>
                      <span className="text-text-muted">{p.body}</span>
                    </span>
                  </li>
                ))}
              </ul>

              {phones.length > 0 && (
                <div className="grid gap-6 sm:grid-cols-2">
                  {phones.map((s) => (
                    <figure key={s.caption} className="mx-auto flex w-full max-w-[280px] flex-col gap-3">
                      <div className="rounded-[44px] bg-text p-2.5">
                        <div className="relative overflow-hidden rounded-[34px] bg-surface pt-10">
                          <div aria-hidden className="absolute top-2.5 left-1/2 h-6 w-[84px] -translate-x-1/2 rounded-2xl bg-black" />
                          <Image src={s.src} alt={s.alt} sizes="260px" className="block h-auto w-full" />
                        </div>
                      </div>
                      <figcaption className="text-center text-small text-text-muted">{s.caption}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
              {desks.map((s) => (
                <figure key={s.caption} className="flex flex-col gap-3">
                  <div className="overflow-hidden rounded-lg border border-border-strong">
                    <div aria-hidden className="flex h-8 items-center gap-1.5 border-b border-border bg-surface-muted px-3">
                      <span className="size-2.5 rounded-full bg-border-strong" />
                      <span className="size-2.5 rounded-full bg-border-strong" />
                      <span className="size-2.5 rounded-full bg-border-strong" />
                    </div>
                    <Image src={s.src} alt={s.alt} sizes="(min-width: 1024px) 656px, 100vw" className="block h-auto w-full" />
                  </div>
                  <figcaption className="text-center text-small text-text-muted">{s.caption}</figcaption>
                </figure>
              ))}
            </section>

            <section id="faq" className="flex scroll-mt-24 flex-col gap-5">
              <h2 className="text-[24px] leading-8 font-bold tracking-[-0.01em] sm:text-[28px] sm:leading-9">Pertanyaan yang sering muncul</h2>
              <FaqAccordion items={t.faq} />
            </section>

            <section aria-labelledby="baca-juga" className="flex flex-col gap-4">
              <h2 id="baca-juga" className="text-caption tracking-[0.02em] text-text-muted">
                Baca juga
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2">
                {related.map((o) => (
                  <li key={o.path}>
                    <Link
                      href={o.path}
                      className="group flex h-full flex-col gap-2 rounded-lg border border-border bg-surface p-5 transition-colors hover:border-border-strong"
                    >
                      <span className="text-h3">{o.nav}</span>
                      <span className="text-small text-pretty text-text-muted">{o.blurb}</span>
                      <span className="mt-auto inline-flex items-center gap-1 pt-2 text-small font-semibold text-primary">
                        Baca
                        <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          </article>

          <aside className="sticky top-24 hidden flex-col gap-4 lg:flex">
            <nav aria-label="Di halaman ini" className="flex flex-col gap-1 rounded-lg border border-border bg-surface p-5">
              <h2 className="pb-1 text-caption tracking-[0.02em] text-text-muted">Di halaman ini</h2>
              {toc.map((item) => (
                <a
                  key={item.href}
                  href={item.href}
                  className="-mx-2 rounded-md px-2 py-1.5 text-small text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                >
                  {item.label}
                </a>
              ))}
            </nav>
            <div className="flex flex-col gap-3 rounded-lg bg-primary p-5">
              <p className="text-h3 text-balance text-white">{t.cta}</p>
              <p className="text-small text-[#CFE3DE]">Ceritakan alur produksi kamu, kami bantu lihat cocok atau tidaknya.</p>
              <a href={wa} className={`${btn} mt-1 h-11 bg-surface font-semibold text-primary hover:bg-primary-soft`}>
                <WhatsAppGlyph size={18} />
                Tanya via WhatsApp
              </a>
            </div>
          </aside>
        </div>

        <section className="bg-primary">
          <div className="mx-auto flex max-w-[1200px] flex-col items-start gap-5 px-4 py-12 sm:px-6 sm:py-16">
            <h2 className="text-[28px] leading-9 font-bold tracking-[-0.01em] text-balance text-white sm:text-[36px] sm:leading-[44px]">{t.cta}</h2>
            <p className="text-[#CFE3DE]">Ceritakan alur produksi kamu lewat WhatsApp, kami bantu lihat cocok atau tidaknya.</p>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 max-sm:w-full">
              <a href={wa} className={`${btn} bg-surface font-semibold text-primary hover:bg-primary-soft max-sm:w-full`}>
                <WhatsAppGlyph size={18} />
                Tanya via WhatsApp
              </a>
              <Link href="/" className="group inline-flex min-h-11 items-center gap-1 font-medium text-white underline-offset-3 hover:underline">
                Lihat cara kerja Konveko
                <ArrowRight size={16} strokeWidth={1.5} aria-hidden className="transition-transform duration-200 group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <LandingFooter />
      <WhatsAppWidget />
    </div>
  );
}
