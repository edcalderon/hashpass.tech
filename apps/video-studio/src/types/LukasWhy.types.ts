export type LukasWhyLocale = 'en' | 'es' | 'ko' | 'fr' | 'pt' | 'de';

export type LukasWhyCopy = {
  eyebrow: string;
  title: string;
  indexLine: string;
  backingLine: string;
  currencyLabel: string;
  currencies: Array<{code: string; weight: string}>;
};

export type LukasWhyExplainerProps = {locale?: LukasWhyLocale};

export type LukasWhyCoinProps = {
  code: string;
  size: number;
  x: number;
  y: number;
  rotation: number;
  progress: number;
  isCentral?: boolean;
};

export type LukasWhyOrbitRingProps = {size: number; opacity: number; rotation: number};

export type LukasWhyCurrencyOrbitProps = {copy: LukasWhyCopy; frame: number};
