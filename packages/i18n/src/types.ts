export type SupportedLocale = 'en' | 'es' | 'ko' | 'fr' | 'pt' | 'de';

export type MessageValue = string | Record<string, unknown>;

export type Messages = {
  [key: string]: MessageValue;
};

export type InterpolationParams = Record<string, string | number>;

export type TranslateFn = (key: string, params?: InterpolationParams) => string;

export interface LocaleDescriptor {
  code: SupportedLocale;
  name: string;
  nativeName: string;
  dir: 'ltr' | 'rtl';
}

export interface I18nState {
  locale: SupportedLocale;
  messages: Messages;
}

export type MessageCatalog = Record<SupportedLocale, Messages>;

export interface I18nContextValue {
  locale: SupportedLocale;
  setLocale: (locale: SupportedLocale) => void;
  t: TranslateFn;
  availableLocales: LocaleDescriptor[];
}
