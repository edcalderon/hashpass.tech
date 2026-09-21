#!/usr/bin/env node
import { execFileSync } from 'node:child_process';

const budgetName = 'hashpass-production-monthly-max-50-usd';

function aws(args) {
  try {
    const regionArgs = args.includes('--region') ? [] : ['--region', 'us-east-1'];
    return JSON.parse(execFileSync('aws', [...args, ...regionArgs, '--output', 'json'], {
      encoding: 'utf8', maxBuffer: 4 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'],
    }));
  } catch {
    // Never dump command arguments, environment, account IDs or AWS payloads.
    throw new Error(`AWS ${args[0]} ${args[1]} failed; check the read-only role and account configuration.`);
  }
}

function money(value) {
  return `$${Number(value).toFixed(2)}`;
}

try {
  const expectedAccount = process.env.AWS_TARGET_ACCOUNT_ID;
  if (!/^\d{12}$/.test(expectedAccount || '')) throw new Error('A private AWS_TARGET_ACCOUNT_ID is required.');
  const identity = aws(['sts', 'get-caller-identity']);
  if (identity.Account !== expectedAccount) throw new Error('Production account verification failed.');

  const now = new Date();
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1)).toISOString().slice(0, 10);
  const filter = JSON.stringify({ Not: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit', 'Refund'] } } });
  const costs = aws(['ce', 'get-cost-and-usage', '--time-period', `Start=${start},End=${end}`,
    '--granularity', 'MONTHLY', '--metrics', 'UnblendedCost', '--filter', filter,
    '--group-by', 'Type=DIMENSION,Key=SERVICE']);
  const budget = aws(['budgets', 'describe-budget', '--account-id', expectedAccount, '--budget-name', budgetName]).Budget;
  const limit = Number(budget.BudgetLimit.Amount);
  const actual = Number(budget.CalculatedSpend.ActualSpend.Amount);
  const forecast = budget.CalculatedSpend.ForecastedSpend?.Amount;
  const groups = costs.ResultsByTime.flatMap(period => period.Groups)
    .map(group => ({ name: group.Keys[0], cost: Number(group.Metrics.UnblendedCost.Amount) }))
    .filter(service => service.cost > 0).sort((a, b) => b.cost - a.cost);

  console.log(`## AWS cost control — ${now.toISOString().slice(0, 10)}\n`);
  console.log(`Budget: **${money(actual)} / ${money(limit)}**. Forecast: **${forecast ? money(forecast) : 'unavailable'}**.\n`);
  console.log('Estimated month-to-date UnblendedCost, excluding credits/refunds. Accrued charges cannot be reversed by stopping future builds.\n');
  console.log('| Service | Month to date |\n|---|---:|');
  for (const service of groups) console.log(`| ${service.name} | ${money(service.cost)} |`);

  let drift = false;
  const allowed = new Set(['hashpass-dev-site', 'hashpass-production-site', 'hashpass-cbweek2026-develop-site', 'bsl-hashpass-dev', 'bsl-hashpass-prod']);
  const pipelines = (process.env.AWS_MANUAL_BUILD_PIPELINES || [...allowed].join(',')).split(',').filter(Boolean);
  console.log('\n### Migrated build trigger checks\n');
  for (const name of pipelines) {
    if (!allowed.has(name)) throw new Error('Unexpected pipeline in cost-control configuration.');
    const pipeline = aws(['codepipeline', 'get-pipeline', '--name', name, '--region', 'us-east-2']).pipeline;
    const sources = pipeline.stages.flatMap(stage => stage.actions).filter(action => action.actionTypeId.category === 'Source');
    const manualOnly = !pipeline.triggers?.length && sources.length > 0
      && sources.every(action => action.configuration.DetectChanges === 'false');
    console.log(`- ${name}: ${manualOnly ? 'manual recovery only' : 'ERROR — automatic build trigger enabled'}`);
    drift ||= !manualOnly;
  }

  const overBudget = actual > limit || Number(forecast || 0) > limit;
  if (overBudget) console.log('\n**Budget alert:** actual spend or forecast exceeds the approved ceiling. This report alerts; it never shuts down serving infrastructure or starts recovery builds.');
  if (overBudget || drift) process.exitCode = 1;
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
