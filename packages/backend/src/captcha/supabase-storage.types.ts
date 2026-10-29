export type CaptchaStateKind = 'challenge' | 'token';
export type StoredCaptchaRow = {
  key: string;
  response_body: { value?: unknown } | null;
};

export interface CaptchaStateRepository {
  store(kind: CaptchaStateKind, key: string, value: unknown): Promise<void>;
  consume(kind: CaptchaStateKind, key: string): Promise<unknown | null>;
  delete(kind: CaptchaStateKind, key: string): Promise<void>;
  deleteExpired(kind: CaptchaStateKind): Promise<void>;
}
