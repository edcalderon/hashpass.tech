import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { createCostControlReport } from "./aws-cost-report.mjs";
import { buildAlertEmail } from "./send-aws-cost-alert.mjs";

const budget = {
  BudgetLimit: { Amount: "50" },
  CalculatedSpend: {
    ActualSpend: { Amount: "60.62" },
    ForecastedSpend: { Amount: "91.92" },
  },
};
const costs = {
  ResultsByTime: [
    {
      Groups: [
        { Keys: ["CodeBuild"], Metrics: { UnblendedCost: { Amount: "45.8" } } },
      ],
    },
  ],
};

test("cost threshold creates an alert without reporting trigger drift", () => {
  const report = createCostControlReport({
    now: new Date("2026-09-23T12:00:00Z"),
    costs,
    budget,
    pipelines: [{ name: "hashpass-production-site", manualOnly: true }],
  });

  assert.equal(report.budgetAlert, true);
  assert.equal(report.triggerDrift, false);
  assert.equal(report.services[0].name, "CodeBuild");
});

test("internal email contains cost detail while keeping the GitHub workflow generic", () => {
  const report = createCostControlReport({
    now: new Date("2026-09-23T12:00:00Z"),
    costs,
    budget,
    pipelines: [{ name: "hashpass-production-site", manualOnly: true }],
  });
  const email = buildAlertEmail(report);

  assert.match(email.subject, /cost-control/i);
  assert.match(email.html, /\$60\.62/);
  assert.match(email.html, /CodeBuild/);
  assert.match(email.html, /excluded from GitHub Actions logs/i);
});

test("workflow privately mails budget alerts instead of publishing the report or failing the alert path", () => {
  const workflow = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "..",
      ".github",
      "workflows",
      "aws-cost-report.yml",
    ),
    "utf8",
  );

  assert.doesNotMatch(workflow, /tee\s+-a\s+"\$GITHUB_STEP_SUMMARY"/);
  assert.match(workflow, /send-aws-cost-alert\.mjs/);
  assert.match(workflow, /pnpm install --frozen-lockfile --ignore-scripts/);
  assert.match(workflow, /if \[ "\$trigger_drift" = 'true' \]; then/);
  assert.doesNotMatch(workflow, /budgetAlert[\s\S]{0,120}exit 1/);
});
