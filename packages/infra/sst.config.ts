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
    const { getBslSiteConfig } = await import("./src/domains.js");
    const site = getBslSiteConfig($app.stage);
    const zone = process.env.ROUTE53_ZONE_ID ? { zone: process.env.ROUTE53_ZONE_ID } : undefined;

    new sst.aws.StaticSite("bsl-web", {
      path: "../../apps/web-app",
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
        directory: "../../apps/web-app",
      },
      environment: {
        ...site.environment,
        ...getPublicSupabaseEnv(site.stage),
      },
    });

    return {
      stage: site.stage,
      siteDomain: site.domain,
      apiBaseUrl: site.environment.EXPO_PUBLIC_API_BASE_URL,
    };
  },
});
