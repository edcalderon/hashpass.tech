/// <reference types="jest" />

describe("database-pool", () => {
  const envKeys = [
    "BETTER_AUTH_DATABASE_URL",
    "BSL_BETTER_AUTH_DATABASE_URL",
    "BSL_DATABASE_URL",
    "DATABASE_URL",
    "SUPABASE_DB_URL",
    "SUPABASE_DB_URL_DEV",
    "SUPABASE_DB_URL_PROD",
    "BSL_SUPABASE_DB_URL_DEV",
    "BSL_SUPABASE_DB_URL_PROD",
    "DATABASE_URL_DEV",
    "DATABASE_URL_PROD",
    "DEV_DB_URL",
    "PROD_DB_URL",
    "DEV_BSL_DB_URL",
    "PROD_BSL_DB_URL",
    "DB_HOST",
    "DB_PORT",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DB_SSL",
    "DB_SSL_REJECT_UNAUTHORIZED",
  ] as const;

  const originalEnv = Object.fromEntries(
    envKeys.map((key) => [key, process.env[key]]),
  ) as Record<(typeof envKeys)[number], string | undefined>;

  beforeEach(() => {
    jest.resetModules();

    delete process.env.BETTER_AUTH_DATABASE_URL;
    delete process.env.BSL_BETTER_AUTH_DATABASE_URL;
    delete process.env.BSL_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.SUPABASE_DB_URL;
    delete process.env.SUPABASE_DB_URL_DEV;
    delete process.env.SUPABASE_DB_URL_PROD;
    delete process.env.BSL_SUPABASE_DB_URL_DEV;
    delete process.env.BSL_SUPABASE_DB_URL_PROD;
    delete process.env.DATABASE_URL_DEV;
    delete process.env.DATABASE_URL_PROD;
    delete process.env.DEV_DB_URL;
    delete process.env.PROD_DB_URL;
    delete process.env.DEV_BSL_DB_URL;
    delete process.env.PROD_BSL_DB_URL;
    delete process.env.DB_HOST;
    delete process.env.DB_PORT;
    delete process.env.DB_NAME;
    delete process.env.DB_USER;
    delete process.env.DB_PASSWORD;
    delete process.env.DB_SSL;
    delete process.env.DB_SSL_REJECT_UNAUTHORIZED;
  });

  afterAll(() => {
    Object.entries(originalEnv).forEach(([key, value]) => {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    });
  });

  it("builds a connection string from DB_* env vars", () => {
    process.env.DB_HOST = "localhost";
    process.env.DB_PORT = "5432";
    process.env.DB_NAME = "hashpass";
    process.env.DB_USER = "dbu";
    process.env.DB_PASSWORD = "pw";
    process.env.DB_SSL = "false";

    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      getDatabaseConnectionString,
      hasDatabaseConnectionString,
    } = require("../../../lib/server/database-pool");

    expect(hasDatabaseConnectionString()).toBe(true);
    expect(getDatabaseConnectionString()).toBe(
      "postgresql://dbu:pw@localhost:5432/hashpass",
    );
  });

  it("uses SUPABASE_DB_URL_DEV when Better Auth aliases are missing", () => {
    process.env.SUPABASE_DB_URL_DEV = "db://" + "hashpass_dev";

    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      getDatabaseConnectionString,
      hasDatabaseConnectionString,
    } = require("../../../lib/server/database-pool");

    expect(hasDatabaseConnectionString()).toBe(true);
    expect(getDatabaseConnectionString()).toBe("db://hashpass_dev");
  });

  it("normalizes explicit Better Auth direct Supabase URLs to the pooler", () => {
    process.env.BETTER_AUTH_DATABASE_URL =
      "postgresql://postgres:pw@db.fxgftanraszjjyeidvia.supabase.co:5432/postgres";

    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      getDatabaseConnectionString,
    } = require("../../../lib/server/database-pool");

    expect(getDatabaseConnectionString()).toBe(
      "postgresql://postgres.fxgftanraszjjyeidvia:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres",
    );
  });

  it("keeps explicit Supabase pooler URLs unchanged", () => {
    process.env.BETTER_AUTH_DATABASE_URL =
      "postgresql://postgres.fxgftanraszjjyeidvia:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres";

    /* eslint-disable @typescript-eslint/no-require-imports */
    const {
      getDatabaseConnectionString,
    } = require("../../../lib/server/database-pool");

    expect(getDatabaseConnectionString()).toBe(
      "postgresql://postgres.fxgftanraszjjyeidvia:pw@aws-0-us-east-2.pooler.supabase.com:5432/postgres",
    );
  });
});
