export interface VaultStore {
  read(key: string): Promise<string | null>;
  compareAndSwap(key: string, expected: string | null, next: string): Promise<boolean>;
}
