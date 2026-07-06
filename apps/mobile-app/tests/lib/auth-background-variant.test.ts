/// <reference types="jest" />

import {
  AUTH_BACKGROUND_VARIANT_STORAGE_KEY,
  resolveAuthBackgroundVariant,
} from '../../lib/auth-background-variant';

describe('resolveAuthBackgroundVariant', () => {
  const storage = () => {
    const values = new Map<string, string>();
    return {
      getItem: jest.fn((key: string) => values.get(key) ?? null),
      setItem: jest.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: jest.fn((key: string) => {
        values.delete(key);
      }),
    };
  };

  it('reuses a stored variant when present', () => {
    const mockStorage = storage();
    mockStorage.setItem(AUTH_BACKGROUND_VARIANT_STORAGE_KEY, 'shader');

    expect(resolveAuthBackgroundVariant(mockStorage, () => 0.1)).toBe('shader');
    expect(mockStorage.setItem).toHaveBeenCalledTimes(1);
  });

  it('stores a random variant when nothing is stored', () => {
    const mockStorage = storage();

    expect(resolveAuthBackgroundVariant(mockStorage, () => 0.9)).toBe('shader');
    expect(mockStorage.setItem).toHaveBeenCalledWith(AUTH_BACKGROUND_VARIANT_STORAGE_KEY, 'shader');
  });

  it('falls back to fluid when the random source is low', () => {
    const mockStorage = storage();

    expect(resolveAuthBackgroundVariant(mockStorage, () => 0.1)).toBe('fluid');
    expect(mockStorage.setItem).toHaveBeenCalledWith(AUTH_BACKGROUND_VARIANT_STORAGE_KEY, 'fluid');
  });
});
