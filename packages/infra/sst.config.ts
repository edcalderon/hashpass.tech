import * as sst from "sst";
import { $config } from "sst";
import { getBslSiteConfig } from "./src/domains.js";

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
    const site = getBslSiteConfig(process.env.SST_STAGE);
    const zone = process.env.ROUTE53_ZONE_ID ? { zone: process.env.ROUTE53_ZONE_ID } : undefined;

    new sst.aws.StaticSite("bsl-web", {
      path: "../../apps/web-app",
      domain: {
        name: site.domain,
        dns: zone ? sst.aws.dns(zone) : sst.aws.dns(),
      },
      build: {
        command: "npm run build",
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
