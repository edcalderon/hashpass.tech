/// <reference types="jest" />

import { canViewHolderContact, loadHolderContact } from "../../lib/server/qr-holder-contact";

const rows = (data: unknown, error: unknown = null) => {
  const c: Record<string, any> = {};
  for (const m of ["select", "eq", "in"]) c[m] = jest.fn(() => c);
  c.maybeSingle = jest.fn(async () => ({ data, error }));
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data, error }).then(resolve);
  return c;
};
const client = (tables: Record<string, any>, getUserById?: jest.Mock) => ({
  from: jest.fn((table: string) => tables[table] ?? rows(null)),
  auth: getUserById ? { admin: { getUserById } } : undefined,
});
const future = "2999-01-01T00:00:00.000Z";

describe("canViewHolderContact", () => {
  it("denies anonymous viewers and plain attendees", async () => {
    expect(await canViewHolderContact(client({}), null, "e1")).toBe(false);
    expect(await canViewHolderContact(client({ user_roles: rows([]), event_roles: rows([]) }), "u", "e1")).toBe(false);
  });

  it("allows global admins, event managers, and ignores expired or failed lookups", async () => {
    expect(await canViewHolderContact(client({ user_roles: rows([{ role: "admin", expires_at: null }]), event_roles: rows([]) }), "u", "e1")).toBe(true);
    expect(await canViewHolderContact(client({ user_roles: rows([]), event_roles: rows([{ role: "moderator", expires_at: future }]) }), "u", "e1")).toBe(true);
    expect(await canViewHolderContact(client({ user_roles: rows([{ role: "admin", expires_at: "2000-01-01T00:00:00.000Z" }]), event_roles: rows([]) }), "u", "e1")).toBe(false);
    expect(await canViewHolderContact(client({ user_roles: rows(null, { message: "x" }), event_roles: rows([]) }), "u", "e1")).toBe(false);
    expect(await canViewHolderContact(client({ user_roles: rows([]) }), "u", null)).toBe(false);
  });
});

describe("loadHolderContact", () => {
  it("prefers the auth account", async () => {
    const getUserById = jest.fn().mockResolvedValue({ data: { user: { email: "ada@example.com", user_metadata: { username: "ada" } } } });
    expect(await loadHolderContact(client({}, getUserById), "u")).toEqual({ email: "ada@example.com", username: "ada" });
  });

  it("falls back to the registry and profile when auth is unavailable", async () => {
    const getUserById = jest.fn().mockRejectedValue(new Error("down"));
    const supabase = client({ user: rows({ email: null, profile_metadata: { username: "grace" } }), user_profiles: rows({ email: "g@example.com" }) }, getUserById);
    expect(await loadHolderContact(supabase, "u")).toEqual({ email: "g@example.com", username: "grace" });
  });

  it("returns nulls when nothing is known", async () => {
    expect(await loadHolderContact(client({}), "u")).toEqual({ email: null, username: null });
  });
});
