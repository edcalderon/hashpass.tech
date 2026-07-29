declare const $app: any;
declare const $config: any;
declare const sst: any;

function firstEnv(names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }

  return "";
}

function getInfraTarget() {
  const value = process.env.HASHPASS_INFRA_TARGET?.trim().toLowerCase();

  return value === "club-docs" ? "club-docs" : "bsl";
}

function getPublicSupabaseEnv(stage: string) {
  const isProduction = stage === "production";
  const supabaseUrl = firstEnv(
    isProduction
      ? [
          "EXPO_PUBLIC_BSL_SUPABASE_URL_PROD",
          "EXPO_PUBLIC_SUPABASE_URL_BSL_PROD",
          "EXPO_PUBLIC_BSL_SUPABASE_URL",
          "EXPO_PUBLIC_SUPABASE_URL_PROD",
          "EXPO_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_URL",
        ]
      : [
          "EXPO_PUBLIC_BSL_SUPABASE_URL_DEV",
          "EXPO_PUBLIC_SUPABASE_URL_BSL_DEV",
          "EXPO_PUBLIC_BSL_SUPABASE_URL",
          "EXPO_PUBLIC_SUPABASE_URL_DEV",
          "EXPO_PUBLIC_SUPABASE_URL",
          "NEXT_PUBLIC_SUPABASE_URL",
        ]
  );

  const supabaseAnonKey = firstEnv(
    isProduction
      ? [
          "EXPO_PUBLIC_BSL_SUPABASE_KEY_PROD",
          "EXPO_PUBLIC_SUPABASE_KEY_BSL_PROD",
          "EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_PROD",
          "EXPO_PUBLIC_BSL_SUPABASE_KEY",
          "EXPO_PUBLIC_SUPABASE_KEY_PROD",
          "EXPO_PUBLIC_SUPABASE_KEY",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ]
      : [
          "EXPO_PUBLIC_BSL_SUPABASE_KEY_DEV",
          "EXPO_PUBLIC_SUPABASE_KEY_BSL_DEV",
          "EXPO_PUBLIC_BSL_SUPABASE_ANON_KEY_DEV",
          "EXPO_PUBLIC_BSL_SUPABASE_KEY",
          "EXPO_PUBLIC_SUPABASE_KEY_DEV",
          "EXPO_PUBLIC_SUPABASE_KEY",
          "EXPO_PUBLIC_SUPABASE_ANON_KEY",
          "NEXT_PUBLIC_SUPABASE_ANON_KEY",
        ]
  );
  const profile = isProduction ? "bsl-production" : "bsl-development";

  // Guard: a production stage deploy with no resolvable Supabase URL/key
  // used to silently proceed — SST would build and ship a static site whose
  // client bundle logs "Supabase URL or Anon Key is missing for profile
  // bsl-production" at runtime instead of failing the deploy, which is how
  // this reached bsl.hashpass.tech live. Only checked for the production
  // stage: the dev stage's SST Console environment can legitimately be
  // configured later/incompletely without blocking iteration.
  if (isProduction && (!supabaseUrl || !supabaseAnonKey)) {
    throw new Error(
      `[sst.config.ts] Refusing to deploy the "production" stage: no Supabase URL/Anon Key ` +
        "resolved from any of the EXPO_PUBLIC_BSL_SUPABASE_*_PROD (or fallback) environment " +
        "variables. Set them in the SST Console's autodeploy environment for this app/stage " +
        "before retrying — a deploy without them ships a static site with every Supabase-backed " +
        "feature silently broken."
    );
  }

  return {
    EXPO_PUBLIC_SUPABASE_PROFILE: profile,
    SUPABASE_PROFILE: profile,
    EXPO_PUBLIC_SUPABASE_URL: supabaseUrl,
    EXPO_PUBLIC_SUPABASE_KEY: supabaseAnonKey,
    EXPO_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
    NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: supabaseAnonKey,
  };
}

export default $config({
  app(input: { stage: string }) {
    return {
      name: "hashpass-bsl",
      home: "aws",
      providers: {
        aws: {
          region: "us-east-2",
        },
      },
      removal: input.stage === "production" ? "retain" : "remove",
    };
  },
  console: {
    autodeploy: {
      target(event: { type?: string; action?: string; branch?: string }) {
        if (event.type === "branch" && event.action === "pushed" && event.branch === "main") {
          return { stage: "production" };
        }

        if (
          event.type === "branch" &&
          event.action === "pushed" &&
          (event.branch === "develop" || event.branch === "dev")
        ) {
          return { stage: "dev" };
        }
      },
    },
  },
  async run() {
    const target = getInfraTarget();

    if (target === "club-docs") {
      if ($app.stage !== "production") {
        throw new Error("The club-docs infra target only supports the production stage.");
      }

      const { CLUB_DOCS_HOST_REWRITE, CLUB_SITE_ALIASES, CLUB_SITE_BUILD_OUTPUT, CLUB_SITE_DOMAIN, CLUB_SITE_ENV } =
        await import("./src/club-docs.js");

      new sst.aws.StaticSite("club-site", {
        path: "../..",
        domain: {
          name: CLUB_SITE_DOMAIN,
          aliases: [...CLUB_SITE_ALIASES],
          dns: sst.aws.dns({ override: true }),
        },
        build: {
          command: "CI=1 pnpm --filter @hashpass/infra run build:club-docs-site",
          output: CLUB_SITE_BUILD_OUTPUT,
        },
        environment: CLUB_SITE_ENV,
        edge: {
          viewerRequest: {
            injection: CLUB_DOCS_HOST_REWRITE,
          },
        },
      });

      return {
        stage: $app.stage,
        target,
        siteDomain: CLUB_SITE_DOMAIN,
        aliases: [...CLUB_SITE_ALIASES],
      };
    }

    const { getBslSiteConfig, BSL_SPA_FALLBACK_REWRITE } = await import("./src/domains.js");
    const site = getBslSiteConfig($app.stage);
    const zone = process.env.ROUTE53_ZONE_ID ? { zone: process.env.ROUTE53_ZONE_ID } : undefined;

    new sst.aws.StaticSite("bsl-web", {
      path: "../../apps/mobile-app",
      domain: {
        name: site.domain,
        dns: zone ? sst.aws.dns(zone) : sst.aws.dns(),
      },
      build: {
        // Use the static export path so SST uploads to S3/CloudFront without
        // spending time on Expo route pre-rendering.
        command: "CI=1 SKIP_ENV_PROPAGATE=1 npm run build:static",
        output: "dist",
      },
      dev: {
        command: "npm run dev",
        directory: "../../apps/mobile-app",
      },
      environment: {
        ...site.environment,
        ...getPublicSupabaseEnv(site.stage),
      },
      edge: {
        // The active BSL front door uses an S3 website origin. Without this
        // rewrite a direct SPA route gets index.html with HTTP 404, which
        // turns an old cached client into an endless bootstrap/reload loop.
        viewerRequest: {
          injection: BSL_SPA_FALLBACK_REWRITE,
        },
      },
    });

    return {
      stage: site.stage,
      target,
      siteDomain: site.domain,
      apiBaseUrl: site.environment.EXPO_PUBLIC_API_BASE_URL,
    };
  },
});
