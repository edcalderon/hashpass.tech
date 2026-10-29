export const LUKAS_WHY_LOCALES = ['en', 'es', 'ko', 'fr', 'pt', 'de'] as const;

import type {LukasWhyCopy, LukasWhyLocale} from '../types/LukasWhy.types';

export type {LukasWhyCopy, LukasWhyLocale};

const currencies = [
  {code: 'BRL', weight: '40%'},
  {code: 'MXN', weight: '30%'},
  {code: 'COP', weight: '15%'},
  {code: 'CLP', weight: '10%'},
  {code: 'ARS', weight: '5%'},
];

export const LUKAS_WHY_COPY: Record<LukasWhyLocale, LukasWhyCopy> = {
  en: {
    eyebrow: 'WHY LUKAS STAYS STABLE',
    title: 'One regional index. Five local currencies.',
    indexLine: '1 LUKAS = 1 LatAm Peso',
    backingLine: 'Backed by HashPass merchants + omni-chain collateral',
    currencyLabel: 'LatAm peso index',
    currencies,
  },
  es: {
    eyebrow: 'POR QUÉ LUKAS ES ESTABLE',
    title: 'Un índice regional. Cinco monedas locales.',
    indexLine: '1 LUKAS = 1 Peso LatAm',
    backingLine: 'Respaldado por comercios HashPass + colateral omni-chain',
    currencyLabel: 'Índice del peso LatAm',
    currencies,
  },
  ko: {
    eyebrow: 'LUKAS가 안정적인 이유',
    title: '하나의 지역 지수. 다섯 개의 현지 통화.',
    indexLine: '1 LUKAS = 라틴아메리카 페소 1',
    backingLine: 'HashPass 가맹점과 옴니체인 담보로 뒷받침됩니다',
    currencyLabel: '라틴아메리카 페소 지수',
    currencies,
  },
  fr: {
    eyebrow: 'POURQUOI LUKAS RESTE STABLE',
    title: 'Un indice régional. Cinq monnaies locales.',
    indexLine: '1 LUKAS = 1 peso latino-américain',
    backingLine: 'Adossé aux commerces HashPass + à une garantie omni-chain',
    currencyLabel: 'Indice du peso latino-américain',
    currencies,
  },
  pt: {
    eyebrow: 'POR QUE LUKAS É ESTÁVEL',
    title: 'Um índice regional. Cinco moedas locais.',
    indexLine: '1 LUKAS = 1 Peso LatAm',
    backingLine: 'Respaldado por comércios HashPass + colateral omni-chain',
    currencyLabel: 'Índice do peso latino-americano',
    currencies,
  },
  de: {
    eyebrow: 'WARUM LUKAS STABIL BLEIBT',
    title: 'Ein regionaler Index. Fünf lokale Währungen.',
    indexLine: '1 LUKAS = 1 LatAm-Peso',
    backingLine: 'Besichert durch HashPass-Händler + Omni-Chain-Kollateral',
    currencyLabel: 'LatAm-Peso-Index',
    currencies,
  },
};

export const LUKAS_WHY_DURATION_SECONDS = 12;
export const LUKAS_WHY_DURATION_IN_FRAMES = LUKAS_WHY_DURATION_SECONDS * 30;
