declare module '@cap.js/server' {
  export interface CapChallengeStorage {
    store: (token: string, data: unknown) => Promise<void>;
    read: (token: string) => Promise<unknown>;
    delete: (token: string) => Promise<void>;
    deleteExpired: () => Promise<void>;
  }

  export interface CapTokenStorage {
    store: (key: string, expires: number) => Promise<void>;
    get: (key: string) => Promise<number | null>;
    delete: (key: string) => Promise<void>;
    deleteExpired: () => Promise<void>;
  }

  export interface CapOptions {
    tokens_store_path?: string;
    noFSState?: boolean;
    storage?: {
      challenges: CapChallengeStorage;
      tokens: CapTokenStorage;
    };
  }

  export default class Cap {
    constructor(options?: CapOptions);
    validateToken(token: string): Promise<{ success: boolean; message?: string; error?: string }>;
    createChallenge(options: any): Promise<any>;
    redeemChallenge(options: any): Promise<any>;
  }
}
