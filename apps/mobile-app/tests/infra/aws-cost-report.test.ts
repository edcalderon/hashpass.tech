/// <reference types="jest" />

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const source = fs
  .readFileSync(
    path.resolve(
      __dirname,
      "../../../../packages/tools/scripts/aws-cost-report.mjs",
    ),
    "utf8",
  )
  .replace(/^import .*;$/gm, "")
  .replace(/^export /gm, "")
  .replace(
    /\nif \(process\.argv\[1\] === new URL\(import\.meta\.url\)\.pathname\) \{[\s\S]*$/,
    `
(async () => {
  try {
    await main();
  } catch {
    console.error('AWS cost and build-trigger guard could not complete. Check the read-only role and account configuration.');
    process.exitCode = 1;
  }
})()`,
  );
const testAccount = "000000000000";

async function report(
  options: {
    actual?: number;
    forecast?: number | null;
    account?: string;
    expected?: string;
    triggers?: unknown[];
    detectChanges?: string;
    sources?: boolean;
    pipelines?: string;
    fail?: boolean;
  } = {},
) {
  const calls: string[][] = [];
  const output: string[] = [];
  const reports: Record<string, unknown>[] = [];
  const processMock = {
    env: {
      AWS_TARGET_ACCOUNT_ID: options.expected ?? testAccount,
      AWS_MANUAL_BUILD_PIPELINES: options.pipelines ?? "hashpass-dev-site",
    },
    argv: [
      "node",
      "aws-cost-report.mjs",
      "--output-file",
      "private-report.json",
    ],
    exitCode: 0,
  };
  const responses: Record<string, unknown> = {
    sts: { Account: options.account ?? testAccount },
    ce: {
      ResultsByTime: [
        {
          Groups: [
            {
              Keys: ["AWS CodeBuild"],
              Metrics: { UnblendedCost: { Amount: "12.34" } },
            },
          ],
        },
      ],
    },
    budgets: {
      Budget: {
        BudgetLimit: { Amount: "50" },
        CalculatedSpend: {
          ActualSpend: { Amount: String(options.actual ?? 20) },
          ...(options.forecast === null
            ? {}
            : { ForecastedSpend: { Amount: String(options.forecast ?? 30) } }),
        },
      },
    },
    codepipeline: {
      pipeline: {
        triggers: options.triggers ?? [],
        stages: [
          {
            actions:
              options.sources === false
                ? []
                : [
                    {
                      actionTypeId: { category: "Source" },
                      configuration: {
                        DetectChanges: options.detectChanges ?? "false",
                      },
                    },
                  ],
          },
        ],
      },
    },
  };
  const completion = vm.runInNewContext(source, {
    process: processMock,
    console: {
      log: (line: string) => output.push(line),
      error: (line: string) => output.push(line),
    },
    writeFileSync: (_path: string, contents: string) =>
      reports.push(JSON.parse(contents)),
    execFileSync: (binary: string, args: string[]) => {
      expect(binary).toBe("aws");
      calls.push(args);
      if (options.fail) throw new Error(`private AWS payload ${testAccount}`);
      return JSON.stringify(responses[args[0]]);
    },
  });
  await completion;
  return {
    calls,
    output: output.join("\n"),
    privateReport: reports[0],
    exitCode: processMock.exitCode,
  };
}

describe("read-only AWS cost guard", () => {
  it("writes spend and trigger details to a private report without leaking them to output", async () => {
    const result = await report();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain("Confidential details were withheld");
    expect(result.output).not.toContain("$20.00 / $50.00");
    expect(result.privateReport).toMatchObject({
      budget: { actual: 20, limit: 50, forecast: 30 },
      services: [{ name: "AWS CodeBuild", cost: 12.34 }],
      pipelines: [{ name: "hashpass-dev-site", manualOnly: true }],
      budgetAlert: false,
      triggerDrift: false,
    });
    expect(result.calls.map((args) => args[1])).toEqual([
      "get-caller-identity",
      "get-cost-and-usage",
      "describe-budget",
      "get-pipeline",
    ]);
  });

  it.each([{ actual: 57.55 }, { forecast: 172.77 }])(
    "privately marks an actual or forecast breach: %j",
    async (options) => {
      const result = await report(options);
      expect(result.exitCode).toBe(0);
      expect(result.privateReport).toMatchObject({
        budgetAlert: true,
        triggerDrift: false,
      });
      expect(result.output).not.toContain("Budget alert");
    },
  );

  it("allows exactly the ceiling and preserves a missing forecast in the private report", async () => {
    expect(
      (await report({ actual: 50, forecast: 50 })).privateReport,
    ).toMatchObject({ budgetAlert: false });
    expect((await report({ forecast: null })).privateReport).toMatchObject({
      budget: { forecast: null },
    });
  });

  it.each([
    { triggers: [{}] },
    { detectChanges: "true" },
    { detectChanges: "" },
    { sources: false },
  ])(
    "marks unsafe trigger state in the private report: %j",
    async (options) => {
      const result = await report(options);
      expect(result.exitCode).toBe(0);
      expect(result.privateReport).toMatchObject({ triggerDrift: true });
      expect(result.output).not.toContain("automatic build trigger enabled");
    },
  );

  it("checks every migrated pipeline in its own region", async () => {
    const names = [
      "hashpass-dev-site",
      "hashpass-production-site",
      "hashpass-cbweek2026-develop-site",
      "bsl-hashpass-dev",
      "bsl-hashpass-prod",
    ];
    const result = await report({ pipelines: names.join(",") });
    expect(result.exitCode).toBe(0);
    const pipelineCalls = result.calls.filter(
      (args) => args[0] === "codepipeline",
    );
    expect(pipelineCalls).toHaveLength(5);
    for (const args of pipelineCalls) {
      expect(args[args.indexOf("--region") + 1]).toBe("us-east-2");
      expect(args.filter((arg) => arg === "--region")).toHaveLength(1);
    }
    expect(result.calls.filter((args) => args[0] === "ce")).toHaveLength(1);
    expect(result.calls.find((args) => args[0] === "ce")).toContain(
      JSON.stringify({
        Not: {
          Dimensions: { Key: "RECORD_TYPE", Values: ["Credit", "Refund"] },
        },
      }),
    );
  });

  it("rejects invalid account configuration before making AWS requests", async () => {
    const result = await report({ expected: "invalid" });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(0);
  });

  it("defaults to monitoring all five migrated pipelines when the variable is absent", async () => {
    const result = await report({ pipelines: "" });
    expect(result.exitCode).toBe(0);
    expect(
      result.calls.filter((args) => args[0] === "codepipeline"),
    ).toHaveLength(5);
  });

  it("rejects a mismatched account before accessing billing or pipelines", async () => {
    const result = await report({ account: "111111111111" });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(1);
    expect(result.output).not.toContain("111111111111");
  });

  it("refuses unexpected pipeline names", async () => {
    const result = await report({ pipelines: "unrelated-production-pipeline" });
    expect(result.exitCode).toBe(1);
    expect(result.calls.some((args) => args[0] === "codepipeline")).toBe(false);
  });

  it("sanitizes AWS failures instead of dumping private command details", async () => {
    const result = await report({ fail: true });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain(
      "AWS cost and build-trigger guard could not complete",
    );
    expect(result.output).not.toContain(testAccount);
    expect(result.output).not.toContain("private AWS payload");
  });
});
