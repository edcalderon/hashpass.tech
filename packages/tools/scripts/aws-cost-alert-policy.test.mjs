import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  COST_ALERT_CHANGE_THRESHOLD_USD,
  evaluateCostAlert,
  writeCostAlertDecision,
} from "./aws-cost-alert-policy.mjs";

function report({ actual = 60, forecast = 80, budgetAlert = true } = {}) {
  return {
    budgetAlert,
    budget: { limit: 50, actual, forecast },
  };
}

test("sends the first budget breach and records its sent values", () => {
  const result = evaluateCostAlert({ report: report(), previousState: null });

  assert.equal(result.notify, true);
  assert.equal(result.reason, "initial-breach");
  assert.deepEqual(result.nextState, {
    version: 1,
    active: true,
    actual: 60,
    forecast: 80,
  });
});

test("suppresses unchanged and sub-threshold budget reports without advancing the baseline", () => {
  const previousState = {
    version: 1,
    active: true,
    actual: 60,
    forecast: 80,
  };

  const unchanged = evaluateCostAlert({
    report: report(),
    previousState,
  });
  const smallChange = evaluateCostAlert({
    report: report({ actual: 64.99, forecast: 84.99 }),
    previousState,
  });

  assert.equal(unchanged.notify, false);
  assert.equal(unchanged.reason, "unchanged");
  assert.equal(unchanged.nextState, null);
  assert.equal(smallChange.notify, false);
  assert.equal(smallChange.reason, "below-threshold");
  assert.equal(smallChange.nextState, null);
});

test("sends when either spend or forecast moves by the five-dollar threshold", () => {
  const previousState = {
    version: 1,
    active: true,
    actual: 60,
    forecast: 80,
  };

  const spendChange = evaluateCostAlert({
    report: report({ actual: 65, forecast: 80 }),
    previousState,
  });
  const forecastChange = evaluateCostAlert({
    report: report({ actual: 60, forecast: 75 }),
    previousState,
  });

  assert.equal(COST_ALERT_CHANGE_THRESHOLD_USD, 5);
  assert.equal(spendChange.notify, true);
  assert.equal(spendChange.reason, "actual-threshold-change");
  assert.equal(forecastChange.notify, true);
  assert.equal(forecastChange.reason, "forecast-threshold-change");
});

test("resets a resolved breach so a later breach is notified immediately", () => {
  const previousState = {
    version: 1,
    active: true,
    actual: 60,
    forecast: 80,
  };
  const resolved = evaluateCostAlert({
    report: report({ actual: 40, forecast: 45, budgetAlert: false }),
    previousState,
  });
  const renewed = evaluateCostAlert({
    report: report({ actual: 51, forecast: 55 }),
    previousState: resolved.nextState,
  });

  assert.equal(resolved.notify, false);
  assert.equal(resolved.reason, "breach-resolved");
  assert.deepEqual(resolved.nextState, { version: 1, active: false });
  assert.equal(renewed.notify, true);
  assert.equal(renewed.reason, "initial-breach");
});

test("treats an unavailable forecast as a distinct material cost signal", () => {
  const result = evaluateCostAlert({
    report: report({ forecast: null }),
    previousState: {
      version: 1,
      active: true,
      actual: 60,
      forecast: 80,
    },
  });

  assert.equal(result.notify, true);
  assert.equal(result.reason, "forecast-availability-change");
});

test("writes its private decision without emitting cost values", () => {
  const directory = mkdtempSync(join(tmpdir(), "hashpass-cost-alert-"));
  const reportFile = join(directory, "report.json");
  const stateFile = join(directory, "state.json");
  const decisionFile = join(directory, "decision.json");
  try {
    writeFileSync(reportFile, JSON.stringify(report({ actual: 67, forecast: 85 })));
    writeFileSync(
      stateFile,
      JSON.stringify({
        version: 1,
        active: true,
        actual: 60,
        forecast: 80,
      }),
    );

    const decision = writeCostAlertDecision({
      reportFile,
      stateFile,
      decisionFile,
    });

    assert.equal(decision.notify, true);
    assert.equal(decision.reason, "forecast-threshold-change");
    assert.deepEqual(JSON.parse(readFileSync(decisionFile, "utf8")), decision);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
