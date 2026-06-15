export const DEFAULT_EMAIL_AUTOCOMPLETE_DOMAINS = [
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'outlook.co.uk',
  'outlook.es',
  'hotmail.com',
  'hotmail.co.uk',
  'yahoo.com',
  'yahoo.co.uk',
  'ymail.com',
  'icloud.com',
  'mac.com',
  'proton.me',
  'pm.me',
  'protonmail.com',
  'live.com',
  'live.co.uk',
  'msn.com',
  'aol.com',
  'me.com',
  'mail.com',
  'gmx.com',
  'gmx.net',
  'fastmail.com',
  'zoho.com',
  'qq.com',
  '163.com',
  '126.com',
  'naver.com',
  'daum.net',
  'yandex.com',
  'yandex.ru',
  'mail.ru',
  'web.de',
  'hey.com',
  'inbox.com',
] as const;

export type EmailAutocompleteOptions = {
  domains?: string[];
  limit?: number;
};

const normalizeEmailInput = (value: string): string => value.trim().toLowerCase();
const normalizeDomain = (value: string): string => value.trim().toLowerCase();

export const getEmailAutocompleteSuggestions = (
  input: string,
  options: EmailAutocompleteOptions = {}
): string[] => {
  const normalizedInput = normalizeEmailInput(input);
  if (!normalizedInput || /\s/.test(normalizedInput)) return [];

  const sourceDomains = options.domains?.length
    ? options.domains
    : [...DEFAULT_EMAIL_AUTOCOMPLETE_DOMAINS];
  const domains = Array.from(
    new Set(sourceDomains.map(normalizeDomain).filter((domain) => domain.length > 0))
  );
  if (!domains.length) return [];

  const limit = Math.max(1, Math.floor(options.limit ?? 4));
  const atIndex = normalizedInput.indexOf('@');

  if (atIndex === -1) {
    return domains.slice(0, limit).map((domain) => `${normalizedInput}@${domain}`);
  }

  if (normalizedInput.indexOf('@', atIndex + 1) !== -1) return [];

  const localPart = normalizedInput.slice(0, atIndex);
  const domainPart = normalizedInput.slice(atIndex + 1);
  if (!localPart) return [];

  const matchingDomains = domainPart
    ? domains.filter((domain) => domain.startsWith(domainPart))
    : domains;

  return matchingDomains
    .map((domain) => `${localPart}@${domain}`)
    .filter((suggestion) => suggestion !== normalizedInput)
    .slice(0, limit);
};
