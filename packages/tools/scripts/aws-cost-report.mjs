#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const budgetName = "hashpass-production-monthly-max-50-usd";

function aws(args) {
  try {
    const regionArgs = args.includes("--region")
      ? []
      : ["--region", "us-east-1"];
    return JSON.parse(
      execFileSync("aws", [...args, ...regionArgs, "--output", "json"], {
        encoding: "utf8",
        maxBuffer: 4 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      }),
    );
  } catch {
    // Never dump command arguments, environment, account IDs or AWS payloads.
    throw new Error(
      `AWS ${args[0]} ${args[1]} failed; check the read-only role and account configuration.`,
    );
  }
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

export function createCostControlReport({ now, costs, budget, pipelines }) {
  const limit = Number(budget.BudgetLimit.Amount);
  const actual = Number(budget.CalculatedSpend.ActualSpend.Amount);
  const forecast = budget.CalculatedSpend.ForecastedSpend?.Amount;
  const services = costs.ResultsByTime.flatMap((period) => period.Groups)
    .map((group) => ({
      name: group.Keys[0],
      cost: Number(group.Metrics.UnblendedCost.Amount),
    }))
    .filter((service) => service.cost > 0)
    .sort((a, b) => b.cost - a.cost);
  const triggerDrift = pipelines.some((pipeline) => !pipeline.manualOnly);

  return {
    generatedAt: now.toISOString(),
    budget: { limit, actual, forecast: forecast ? Number(forecast) : null },
    services,
    pipelines: pipelines.map(({ name, manualOnly }) => ({ name, manualOnly })),
    budgetAlert: actual > limit || Number(forecast || 0) > limit,
    triggerDrift,
  };
}

async function main() {
  const outputFile = argumentValue("--output-file");
  if (!outputFile) throw new Error("A private --output-file is required.");

  const expectedAccount = process.env.AWS_TARGET_ACCOUNT_ID;
  if (!/^\d{12}$/.test(expectedAccount || ""))
    throw new Error("A private AWS_TARGET_ACCOUNT_ID is required.");
  const identity = aws(["sts", "get-caller-identity"]);
  if (identity.Account !== expectedAccount)
    throw new Error("Production account verification failed.");

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1),
  )
    .toISOString()
    .slice(0, 10);
  const filter = JSON.stringify({
    Not: { Dimensions: { Key: "RECORD_TYPE", Values: ["Credit", "Refund"] } },
  });
  const costs = aws([
    "ce",
    "get-cost-and-usage",
    "--time-period",
    `Start=${start},End=${end}`,
    "--granularity",
    "MONTHLY",
    "--metrics",
    "UnblendedCost",
    "--filter",
    filter,
    "--group-by",
    "Type=DIMENSION,Key=SERVICE",
  ]);
  const budget = aws([
    "budgets",
    "describe-budget",
    "--account-id",
    expectedAccount,
    "--budget-name",
    budgetName,
  ]).Budget;

  const allowed = new Set([
    "hashpass-dev-site",
    "hashpass-production-site",
    "hashpass-cbweek2026-develop-site",
    "bsl-hashpass-dev",
    "bsl-hashpass-prod",
  ]);
  const configuredPipelines = (
    process.env.AWS_MANUAL_BUILD_PIPELINES || [...allowed].join(",")
  )
    .split(",")
    .filter(Boolean);
  const pipelines = configuredPipelines.map((name) => {
    if (!allowed.has(name))
      throw new Error("Unexpected pipeline in cost-control configuration.");
    const pipeline = aws([
      "codepipeline",
      "get-pipeline",
      "--name",
      name,
      "--region",
      "us-east-2",
    ]).pipeline;
    const sources = pipeline.stages
      .flatMap((stage) => stage.actions)
      .filter((action) => action.actionTypeId.category === "Source");
    const manualOnly =
      !pipeline.triggers?.length &&
      sources.length > 0 &&
      sources.every((action) => action.configuration.DetectChanges === "false");
    return { name, manualOnly };
  });

  writeFileSync(
    outputFile,
    JSON.stringify(createCostControlReport({ now, costs, budget, pipelines })),
    { encoding: "utf8", mode: 0o600 },
  );
  console.log(
    "AWS cost and build-trigger guard evaluated. Confidential details were withheld from the workflow output.",
  );
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  main().catch(() => {
    console.error(
      "AWS cost and build-trigger guard could not complete. Check the read-only role and account configuration.",
    );
    process.exitCode = 1;
  });
}
