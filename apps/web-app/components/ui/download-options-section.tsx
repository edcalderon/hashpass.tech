'use client';

import { useTranslation } from '@hashpass/i18n';
import { Download, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { HashpassLogo } from '@/components/ui/hashpass-logo';
import { resolveHashpassAppUrl } from '@/lib/hashpass-app-url';

export const PLAY_STORE_URL =
  'https://play.google.com/store/apps/details?id=com.hashpass.tech&hl=en-US&ah=RlHQxhHQladajDZn9ZGTm7_ucMs';

function GooglePlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 32 32" className="h-7 w-7 shrink-0 drop-shadow-sm">
      <path fill="#00d7fe" d="M3.2 3.3 18.9 16 3.2 28.7A3.2 3.2 0 0 1 2 26.2V5.8c0-1 .45-1.9 1.2-2.5Z" />
      <path fill="#ffcf40" d="m18.9 16 4.4-3.6 5.2 3c1.25.72 1.25 1.48 0 2.2l-5.2 3-4.4-4.6Z" />
      <path fill="#ff3a44" d="m3.2 28.7 15.7-12.7 4.4 4.6L6.1 30.5c-1.08.62-2.1.45-2.9-1.8Z" />
      <path fill="#00ef77" d="M3.2 3.3c.8-2.25 1.82-2.42 2.9-1.8l17.2 9.9-4.4 4.6L3.2 3.3Z" />
    </svg>
  );
}

/** Download call-to-action displayed after the landing-page gallery completes. */
export function DownloadShowcase() {
  const { t } = useTranslation('download');

  return (
    <section
      aria-labelledby="download-hashpass-title"
      className="download-showcase relative z-20 mx-auto flex w-full justify-center px-5 pb-24 pt-10 sm:pb-36 sm:pt-16"
    >
      <div className="download-showcase__card relative w-full max-w-3xl overflow-hidden rounded-[28px] border border-white/60 bg-white/75 px-5 py-6 text-center shadow-[0_24px_80px_rgba(73,55,140,0.18)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/70 sm:px-9 sm:py-8">
        <div aria-hidden="true" className="absolute -left-16 -top-20 h-48 w-48 rounded-full bg-cyan-300/25 blur-3xl" />
        <div aria-hidden="true" className="absolute -bottom-24 -right-12 h-56 w-56 rounded-full bg-violet-400/30 blur-3xl" />

        <div className="relative">
          <div className="download-showcase__app-icon mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_12px_35px_rgba(21,101,192,0.25)] ring-1 ring-black/5 dark:bg-slate-900 dark:ring-white/10">
            <HashpassLogo alt="" width={48} height={48} priority />
            <span className="download-showcase__badge absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-lg">
              <Download className="h-3.5 w-3.5" strokeWidth={2.5} />
            </span>
          </div>

          <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-blue-500/15 bg-blue-500/10 px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-blue-700 dark:text-blue-300">
            <Sparkles className="h-3 w-3" /> {t('badge')}
          </div>
          <h2 id="download-hashpass-title" className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t('title')}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
            {t('description')}
          </p>

          <div className="mt-5 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
            <Button asChild size="lg" className="h-14 rounded-2xl bg-slate-950 px-6 !text-white shadow-xl shadow-blue-950/15 hover:bg-slate-800 dark:bg-white dark:!text-slate-950 dark:hover:bg-slate-100">
              <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" aria-label={t('googlePlayAriaLabel')} className="download-showcase__shine-cta">
                <GooglePlayIcon />
                <span className="ml-3 flex flex-col items-start leading-none">
                  <span className="text-[9px] font-medium uppercase tracking-[0.14em] opacity-70">{t('getItOn')}</span>
                  <span className="mt-1 text-base font-semibold">{t('googlePlay')}</span>
                </span>
              </a>
            </Button>
            {/* Goes to the main HASHPASS app (not the Play Store -- that's
                the button above) -- env-aware the same way SignInModal's
                "Sign in using the web app" button is: localhost -> local
                Expo web, a dev host -> dev.hashpass.tech, otherwise ->
                hashpass.tech. Static href is a safe no-JS/build-time
                fallback; the real resolved target is set on click. */}
            <Button asChild size="lg" variant="outline" className="h-14 rounded-2xl border-blue-500/25 bg-white/55 px-6 !text-slate-900 shadow-lg shadow-blue-950/5 backdrop-blur-md hover:bg-white/90 dark:border-white/15 dark:bg-slate-900/80 dark:!text-white dark:hover:bg-slate-900">
              <a
                href="https://hashpass.tech"
                target="_blank"
                rel="noreferrer"
                aria-label={t('downloadAriaLabel')}
                className="download-showcase__shine-cta"
                onClick={(event) => {
                  event.preventDefault();
                  window.open(resolveHashpassAppUrl(), '_blank', 'noopener,noreferrer');
                }}
              >
                <HashpassLogo alt="" width={28} height={28} />
                <span className="ml-3 font-semibold">
                  {t('downloadHashpass')}
                  <sup className="ml-0.5 text-[10px] font-bold">*</sup>
                </span>
                <Download className="ml-2 h-4 w-4 download-showcase__arrow" />
              </a>
            </Button>
          </div>

          {/* "Download HASHPASS" opens the web app on desktop, not a literal
              file download (Android install lives on the Google Play
              button) -- the asterisk on the button ties to this footnote so
              that isn't misread as broken given the download-arrow icon
              still on it. */}
          <p className="mx-auto mt-3 max-w-md text-[11px] leading-4 text-muted-foreground/70">
            * {t('webDisclaimer')}
          </p>
        </div>
      </div>
    </section>
  );
}
