export type ContactClient = {
  from: (table: string) => any;
  auth?: { admin?: { getUserById: (id: string) => Promise<any> } };
};

export type HolderContact = { email: string | null; username: string | null };
