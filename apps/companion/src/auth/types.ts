export type CompanionAuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'error';

export type CompanionAuthUser = {
  id: string;
  email: string;
  name?: string;
  image?: string;
};

export type CompanionAuthState = {
  status: CompanionAuthStatus;
  user?: CompanionAuthUser;
  error?: string;
};

export type CompanionAuthSessionResult = {
  user?: {
    id?: unknown;
    email?: unknown;
    name?: unknown;
    image?: unknown;
  };
};
