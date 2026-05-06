const BSL_DOMAINS = {
  dev: "bsl-dev.hashpass.tech",
  production: "bsl.hashpass.tech",
} as const;

const BSL_SITE_ENV = {
  dev: {
    BUILD_ENV: "dev",
    EXPO_PUBLIC_API_BASE_URL: "https://api-dev.hashpass.tech/api",
    EXPO_PUBLIC_DIRECTUS_URL: "https://sso-dev.hashpass.co",
    EXPO_PUBLIC_SITE_URL: "https://bsl-dev.hashpass.tech",
  },
  production: {
    BUILD_ENV: "production",
    EXPO_PUBLIC_API_BASE_URL: "https://api.hashpass.tech/api",
    EXPO_PUBLIC_DIRECTUS_URL: "https://sso.hashpass.co",
    EXPO_PUBLIC_SITE_URL: "https://bsl.hashpass.tech",
  },
} as const;

function resolveBslSiteConfig(stage?: string) {
  const resolvedStage = stage === "production" ? "production" : "dev";

  return {
    stage: resolvedStage,
    domain: BSL_DOMAINS[resolvedStage],
    environment: BSL_SITE_ENV[resolvedStage],
  };
}

export default $config({
  app(input) {
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
      target(event) {
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
    const site = resolveBslSiteConfig($app.stage);
    const zone = process.env.ROUTE53_ZONE_ID ? { zone: process.env.ROUTE53_ZONE_ID } : undefined;

    new sst.aws.StaticSite("bsl-web", {
      path: "../../apps/web-app",
      domain: {
        name: site.domain,
        dns: zone ? sst.aws.dns(zone) : sst.aws.dns(),
      },
      build: {
        command: "CI=1 SKIP_ENV_PROPAGATE=1 npm run build",
        output: "dist/client",
      },
      dev: {
        command: "npm run dev",
        directory: "../../apps/web-app",
      },
      environment: site.environment,
    });

    return {
      stage: site.stage,
      siteDomain: site.domain,
      apiBaseUrl: site.environment.EXPO_PUBLIC_API_BASE_URL,
    };
  },
});
