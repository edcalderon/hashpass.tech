export type AuthBackgroundVariant = 'fluid' | 'shader';

export const AUTH_BACKGROUND_VARIANT_STORAGE_KEY = 'hashpass-auth-background-variant';

const isValidVariant = (value: unknown): value is AuthBackgroundVariant => value === 'fluid' || value === 'shader';

const pickRandomVariant = (random = Math.random): AuthBackgroundVariant => {
  return random() < 0.5 ? 'fluid' : 'shader';
};

export const resolveAuthBackgroundVariant = (
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null | undefined,
  random = Math.random
): AuthBackgroundVariant => {
  try {
    const stored = storage?.getItem(AUTH_BACKGROUND_VARIANT_STORAGE_KEY);
    if (isValidVariant(stored)) {
      return stored;
    }

    const nextVariant = pickRandomVariant(random);
    storage?.setItem(AUTH_BACKGROUND_VARIANT_STORAGE_KEY, nextVariant);
    return nextVariant;
  } catch {
    return pickRandomVariant(random);
  }
};
