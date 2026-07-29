/// <reference types="jest" />

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const routePath = resolve(
  __dirname,
  "../../app/api/events/[eventId]/speakers/[id]+api.ts",
);
const routeExists = existsSync(routePath);
const collectionRoutePath = resolve(
  __dirname,
  "../../app/api/events/[eventId]/speakers+api.ts",
);
const collectionRouteExists = existsSync(collectionRoutePath);

const speaker = {
  id: "speaker-123",
  name: "Ada Lovelace",
  image_url: "https://images.example.test/ada.png",
};

let mockResult: { data: unknown; error: unknown } = { data: speaker, error: null };

function mockCreateQuery(): Record<string, unknown> {
  const query: Record<string, unknown> = {
    eq: jest.fn(() => query),
    in: jest.fn(() => query),
    ilike: jest.fn(() => query),
    limit: jest.fn(() => query),
    not: jest.fn(() => query),
    maybeSingle: jest.fn(async () => mockResult),
    order: jest.fn(() => query),
    select: jest.fn(() => query),
    single: jest.fn(async () => mockResult),
    then: (onFulfilled: (value: typeof mockResult) => unknown) =>
      Promise.resolve(mockResult).then(onFulfilled),
  };

  return query;
}

jest.mock("@/lib/supabase-server", () => ({
  getSupabaseServerForRequest: () => ({
    from: jest.fn(() => mockCreateQuery()),
    rpc: jest.fn(async () => mockResult),
  }),
}));

describe("event-scoped speaker detail api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResult = { data: speaker, error: null };
  });

  it("exposes an event-scoped server endpoint instead of requiring a browser Supabase call", () => {
    expect(routeExists).toBe(true);
  });

  const describeRoute = routeExists ? describe : describe.skip;

  describeRoute("GET", () => {
    it("returns the speaker resolved by the server for the event and speaker id in the URL", async () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/speakers/[id]+api");

      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/speakers/speaker-123"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: speaker });
    });

    it("returns not found when the server cannot resolve that speaker in the event", async () => {
      mockResult = { data: null, error: null };

      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/speakers/[id]+api");

      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/speakers/missing-speaker"),
      );

      expect(response.status).toBe(404);
    });
  });
});

describe("event-scoped speaker collection api", () => {
  beforeEach(() => {
    jest.resetModules();
    mockResult = { data: [speaker], error: null };
  });

  it("exposes a backend collection endpoint for agenda speaker lookups", () => {
    expect(collectionRouteExists).toBe(true);
  });

  const describeCollectionRoute = collectionRouteExists ? describe : describe.skip;

  describeCollectionRoute("GET", () => {
    it("returns speakers for the requested event without requiring a direct REST request from the agenda", async () => {
      /* eslint-disable @typescript-eslint/no-require-imports */
      const { GET } = require("../../app/api/events/[eventId]/speakers+api");

      const response = await GET(
        new Request("https://api.hashpass.tech/api/events/bsl/speakers"),
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ data: [speaker] });
    });
  });
});

describe("speaker detail backend boundary", () => {
  const source = readFileSync(
    resolve(__dirname, "../../app/events/[eventSlug]/speakers/[id].tsx"),
    "utf8",
  );

  it("loads speaker data through the event API rather than the browser Supabase client", () => {
    expect(source).toMatch(
      /eventApiPath\s*\(\s*eventId\s*,\s*`speakers\/\$\{[^}]+\}`\s*\)/,
    );
    expect(source).not.toMatch(/\bsupabase\.rpc\s*\(/);
    expect(source).not.toMatch(
      /\bsupabase\.from\s*\(\s*["']bsl_speakers["']\s*\)/,
    );
  });

  it("always ends speaker loading after a failed or missing backend response", () => {
    expect(source).toMatch(/catch\s*(?:\([^)]*\))?\s*\{/);
    expect(source).toMatch(
      /finally\s*\{[\s\S]*?set[A-Za-z]*Loading\s*\(\s*false\s*\)/,
    );
  });
});

describe("agenda speaker backend boundary", () => {
  const agendaSource = readFileSync(
    resolve(__dirname, "../../app/events/[eventSlug]/agenda.tsx"),
    "utf8",
  );

  it("loads the agenda speaker map from the event API instead of Supabase REST", () => {
    expect(agendaSource).toMatch(
      /eventApiPath\s*\(\s*eventId\s*,\s*["']speakers["']\s*\)/,
    );
    expect(agendaSource).not.toMatch(
      /\bsupabase\.from\s*\(\s*["']bsl_speakers["']\s*\)/,
    );
  });
});
