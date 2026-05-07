import * as sst from "sst";
import { $config } from "sst";
import { getBslSiteConfig } from "./src/domains.js";

function getPublicSupabaseEnv() {
  const supabaseUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    "";

  const supabaseAnonKey =
    process.env.EXPO_PUBLIC_SUPABASE_KEY ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    "";

  return {
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
    const site = getBslSiteConfig(process.env.SST_STAGE);
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
        ...getPublicSupabaseEnv(),
      },
    });

    return {
      stage: site.stage,
      siteDomain: site.domain,
      apiBaseUrl: site.environment.EXPO_PUBLIC_API_BASE_URL,
    };
  },
});
