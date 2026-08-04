/// <reference types="jest" />
import {
  demoChaptersEn,
  demoChaptersEs,
  demoVideoSources,
  demoBslShowcase,
  bslChapters,
} from '../../lib/demo-chapters';
import { demoCaptionsEn, demoCaptionsEs } from '../../lib/demo-captions';
import { bslCaptionsEn, bslCaptionsEs } from '../../lib/demo-bsl-captions';
import { demoCaptionTextByLocale } from '../../lib/demo-captions-i18n';

const S3_PREFIX =
  'https://hashpass-production-event-media-952191196420-us-east-2.s3.us-east-2.amazonaws.com/events/';

describe('demo-chapters', () => {
  it('serves the general app-tutorial assets from the events/hashpass S3 folder', () => {
    for (const locale of ['en', 'es'] as const) {
      const source = demoVideoSources[locale];
      expect(source.narrated.startsWith(`${S3_PREFIX}hashpass/demo-videos/`)).toBe(true);
      expect(source.silent.startsWith(`${S3_PREFIX}hashpass/demo-videos/`)).toBe(true);
      expect(source.poster.startsWith(`${S3_PREFIX}hashpass/demo-posters/`)).toBe(true);
    }
  });

  it('serves the BSL showcase assets from the events/chile2026 S3 folder', () => {
    for (const locale of ['en', 'es'] as const) {
      const source = demoBslShowcase[locale];
      expect(source.narrated.startsWith(`${S3_PREFIX}chile2026/demo-videos/`)).toBe(true);
      expect(source.poster.startsWith(`${S3_PREFIX}chile2026/demo-posters/`)).toBe(true);
    }
  });

  it('EN/ES app-tutorial narrated and silent sources are distinct files per locale', () => {
    expect(demoVideoSources.en.narrated).not.toBe(demoVideoSources.es.narrated);
    expect(demoVideoSources.en.silent).not.toBe(demoVideoSources.es.silent);
    expect(demoVideoSources.en.narrated).not.toBe(demoVideoSources.en.silent);
  });

  it('chapter lists are ordered by increasing startSeconds', () => {
    for (const chapters of [demoChaptersEn, demoChaptersEs, bslChapters]) {
      for (let i = 1; i < chapters.length; i += 1) {
        expect(chapters[i].startSeconds).toBeGreaterThan(chapters[i - 1].startSeconds);
      }
    }
  });

  it('EN and ES app-tutorial chapter lists have the same slugs in the same order', () => {
    expect(demoChaptersEn.map((c) => c.slug)).toEqual(demoChaptersEs.map((c) => c.slug));
  });
});

describe('demo caption cue data', () => {
  it('every cue has a start strictly before its end', () => {
    for (const cues of [demoCaptionsEn, demoCaptionsEs, bslCaptionsEn, bslCaptionsEs]) {
      expect(cues.length).toBeGreaterThan(0);
      for (const cue of cues) {
        expect(cue.start).toBeLessThan(cue.end);
        expect(cue.text.length).toBeGreaterThan(0);
      }
    }
  });

  it('EN and ES caption sets have the same number of cues', () => {
    expect(demoCaptionsEn.length).toBe(demoCaptionsEs.length);
    expect(bslCaptionsEn.length).toBe(bslCaptionsEs.length);
  });

  it('translated caption text is provided for every non-EN/ES supported locale, matching EN cue count', () => {
    for (const locale of ['fr', 'pt', 'de', 'ko']) {
      const translated = demoCaptionTextByLocale[locale];
      expect(translated).toBeDefined();
      expect(translated.length).toBe(demoCaptionsEn.length);
      translated.forEach((text) => expect(text.length).toBeGreaterThan(0));
    }
  });
});
