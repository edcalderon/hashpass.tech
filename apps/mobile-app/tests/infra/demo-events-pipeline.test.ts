/// <reference types="jest" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const infraPath = (...parts: string[]) =>
  resolve(__dirname, "../../../../packages/infra/terraform/stacks/demo-events", ...parts);

const quotedEntries = (source: string, localName: string) => {
  const match = source.match(new RegExp(`${localName}\\s*=\\s*\\[([\\s\\S]*?)\\n\\s*\\]`));
  if (!match) throw new Error(`Missing ${localName}`);
  return [...match[1].matchAll(/"([^"]+)"/g)].map((entry) => entry[1]);
};

describe("CBWeek deployment pipeline", () => {
  const pipelineSource = readFileSync(infraPath("pipeline.tf"), "utf8");
  const coreSiteSource = readFileSync(
    resolve(__dirname, "../../../../packages/infra/terraform/stacks/hashpass-web/main.tf"),
    "utf8",
  );

  it("tracks the full mobile dependency tree while respecting CodePipeline's exclusion limit", () => {
    expect(quotedEntries(pipelineSource, "cbweek2026_trigger_includes")).toContain("apps/mobile-app/**");
    expect(quotedEntries(pipelineSource, "cbweek2026_trigger_excludes")).toHaveLength(8);
  });

  it("keeps event routes eligible to rebuild the global site", () => {
    expect(coreSiteSource).not.toContain('"apps/mobile-app/app/events/**"');
  });

  it("retires populated legacy buckets from state without deleting them", () => {
    const mainSource = readFileSync(infraPath("main.tf"), "utf8");
    const migrationSource = readFileSync(infraPath("migration.tf"), "utf8");

    expect(mainSource).toContain("hashpass-cbweek2026-develop-site-");
    expect(mainSource).toContain("hashpass-cbweek2026-pipelines-");
    expect(migrationSource).toContain("from = module.criptolatinfest_pipeline.aws_s3_bucket.site");
    expect(migrationSource).toContain("from = module.criptolatinfest_pipeline.aws_s3_bucket.artifacts");
    expect(migrationSource).toContain("destroy = false");
    expect(readFileSync(infraPath("versions.tf"), "utf8")).toContain('required_version = ">= 1.7.0"');
  });
});
