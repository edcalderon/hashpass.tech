const trimValue = (value?: string | null): string => (value || '').trim();

export const resolveGoogleOAuthClientId = (): string =>
  trimValue(
    process.env.GOOGLE_CLIENT_ID ||
      process.env.BETTER_AUTH_GOOGLE_CLIENT_ID ||
      process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
  );

export const resolveGoogleOAuthClientSecret = (): string =>
  trimValue(
    process.env.GOOGLE_CLIENT_SECRET ||
      process.env.BETTER_AUTH_GOOGLE_CLIENT_SECRET
  );
