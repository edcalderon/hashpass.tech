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
  assert.match(workflow, /aws-cost-alert-policy\.mjs/);
  assert.match(workflow, /aws ssm get-parameter/);
  assert.match(workflow, /aws ssm put-parameter/);
  assert.match(workflow, /aws ssm get-parameter\s+\\\n\s+--region us-east-2/);
  assert.match(workflow, /aws ssm put-parameter\s+\\\n\s+--region us-east-2/);
  assert.match(workflow, /AWS_COST_ALERT_STATE_PARAMETER/);
  assert.match(workflow, /pnpm\/action-setup@v4/);
  assert.match(workflow, /pnpm install --frozen-lockfile --ignore-scripts/);
  assert.match(workflow, /if \[ "\$trigger_drift" = 'true' \]; then/);
  assert.doesNotMatch(workflow, /budgetAlert[\s\S]{0,120}exit 1/);
});

test("cost-report role can persist only the dedicated private alert state", () => {
  const template = readFileSync(
    join(
      import.meta.dirname,
      "..",
      "..",
      "infra",
      "cloudformation",
      "github-cost-report.yml",
    ),
    "utf8",
  );

  assert.match(template, /ssm:GetParameter/);
  assert.match(template, /ssm:PutParameter/);
  assert.match(template, /kms:Decrypt/);
  assert.match(template, /alias\/aws\/ssm/);
  assert.match(template, /parameter\/hashpass\/operations\/aws-cost-alert-state/);
  assert.doesNotMatch(template, /ssm:\*/);
});

test("cost-alert transport keeps SMTP TLS verification enabled and workflow watches alert dependencies", () => {
  const sender = readFileSync(
    join(import.meta.dirname, "send-aws-cost-alert.mjs"),
    "utf8",
  );
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

  assert.doesNotMatch(sender, /rejectUnauthorized\s*:\s*false/i);
  assert.match(sender, /rejectUnauthorized\s*:\s*true/i);
  assert.doesNotMatch(sender, /checkServerIdentity\s*:/i);
  assert.doesNotMatch(sender, /servername\s*:/i);
  assert.doesNotMatch(sender, /includes\(\s*["'](?:brevo|sendinblue)\.com/i);
  assert.doesNotMatch(sender, /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*["']?0/i);

  assert.match(workflow, /packages\/tools\/scripts\/send-aws-cost-alert\.mjs/);
  assert.match(workflow, /package\.json/);
  assert.match(workflow, /pnpm-lock\.yaml/);
});
