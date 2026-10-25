export type ConsentDetails = {
  clientId: string;
  clientName?: string;
  clientUri?: string;
  redirectUri?: string;
  scopes: string[];
};

export type ConsentResponse =
  | { data: ConsentDetails; success: true }
  | { data?: ConsentDetails | null; error: string; success: false };
