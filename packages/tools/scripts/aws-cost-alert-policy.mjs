#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

export const COST_ALERT_CHANGE_THRESHOLD_USD = 5;

function finiteAmount(value, field) {
  if (value === null && field === "forecast") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    throw new Error(`The private cost report has an invalid ${field}.`);
  }
  return amount;
}

function activeState(state) {
  if (!state || state.version !== 1 || state.active !== true) return null;

  try {
    return {
      actual: finiteAmount(state.actual, "actual"),
      forecast: finiteAmount(state.forecast, "forecast"),
    };
  } catch {
    return null;
  }
}

function stateFor(report) {
  return {
    version: 1,
    active: true,
    actual: finiteAmount(report.budget?.actual, "actual"),
    forecast: finiteAmount(report.budget?.forecast, "forecast"),
  };
}

function changedByThreshold(current, previous) {
  return Math.abs(current - previous) >= COST_ALERT_CHANGE_THRESHOLD_USD;
}

export function evaluateCostAlert({ report, previousState }) {
  const previous = activeState(previousState);
  if (!report.budgetAlert) {
    return {
      notify: false,
      reason: previous ? "breach-resolved" : "no-breach",
      nextState: previous ? { version: 1, active: false } : null,
    };
  }

  const current = stateFor(report);
  if (!previous) {
    return { notify: true, reason: "initial-breach", nextState: current };
  }

  if (current.forecast === null || previous.forecast === null) {
    if (current.forecast !== previous.forecast) {
      return {
        notify: true,
        reason: "forecast-availability-change",
        nextState: current,
      };
    }
  } else if (changedByThreshold(current.forecast, previous.forecast)) {
    return {
      notify: true,
      reason: "forecast-threshold-change",
      nextState: current,
    };
  }

  if (changedByThreshold(current.actual, previous.actual)) {
    return {
      notify: true,
      reason: "actual-threshold-change",
      nextState: current,
    };
  }

  const unchanged =
    current.actual === previous.actual && current.forecast === previous.forecast;
  return {
    notify: false,
    reason: unchanged ? "unchanged" : "below-threshold",
    // Preserve the last *sent* state. Otherwise small repeated moves would
    // continually reset the baseline and prevent a useful alert forever.
    nextState: null,
  };
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

function privateJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

export function writeCostAlertDecision({ reportFile, stateFile, decisionFile }) {
  const report = privateJson(reportFile);
  const previousState = existsSync(stateFile) ? privateJson(stateFile) : null;
  const decision = evaluateCostAlert({ report, previousState });
  writeFileSync(decisionFile, JSON.stringify(decision), {
    encoding: "utf8",
    mode: 0o600,
  });
  return decision;
}

function main() {
  const reportFile = argumentValue("--report-file");
  const stateFile = argumentValue("--state-file");
  const decisionFile = argumentValue("--decision-file");
  if (!reportFile || !stateFile || !decisionFile) {
    throw new Error(
      "Private --report-file, --state-file, and --decision-file values are required.",
    );
  }
  writeCostAlertDecision({ reportFile, stateFile, decisionFile });
  console.log("AWS cost-alert notification policy evaluated privately.");
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  try {
    main();
  } catch {
    console.error("AWS cost-alert notification policy could not be evaluated.");
    process.exitCode = 1;
  }
}
