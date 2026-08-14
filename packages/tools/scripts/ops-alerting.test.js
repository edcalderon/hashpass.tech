const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const test = require('node:test');

const root = join(__dirname, '..', '..', '..');
const stackPath = join(root, 'packages', 'infra', 'terraform', 'stacks', 'hashpass-web', 'main.tf');
const variablesPath = join(root, 'packages', 'infra', 'terraform', 'stacks', 'hashpass-web', 'variables.tf');
const workerModulePath = join(root, 'packages', 'infra', 'terraform', 'modules', 'aws_pipeline_ec2_worker', 'main.tf');
const workerVariablesPath = join(root, 'packages', 'infra', 'terraform', 'modules', 'aws_pipeline_ec2_worker', 'variables.tf');

const read = (path) => readFileSync(path, 'utf8');

test('web pipeline monitor can inspect pipelines while reconciling legacy workers', () => {
  const stack = read(stackPath);

  assert.match(stack, /Sid\s*=\s*"MonitorWebPipelines"[\s\S]*"codepipeline:GetPipeline"/);
});

test('web stack provisions a support email path for EC2 starts and cost controls', () => {
  const stack = read(stackPath);
  const variables = read(variablesPath);

  assert.match(stack, /resource\s+"aws_sns_topic"\s+"ops_alerts"/);
  assert.match(stack, /resource\s+"aws_sns_topic_subscription"\s+"ops_email"/);
  assert.match(stack, /resource\s+"aws_cloudwatch_event_rule"\s+"ec2_running"/);
  assert.match(stack, /resource\s+"aws_budgets_budget"\s+"monthly_cost"/);
  assert.match(stack, /resource\s+"aws_ce_anomaly_monitor"\s+"aws_services"/);
  assert.match(stack, /resource\s+"aws_ce_anomaly_subscription"\s+"immediate"/);
  assert.match(stack, /sid\s*=\s*"AllowCloudWatchPublish"/i);
  assert.match(variables, /variable\s+"ops_alert_email"[\s\S]*default\s*=\s*"support@hashpass\.tech"/);
  assert.match(variables, /variable\s+"monthly_cost_budget_usd"/);
  assert.match(variables, /variable\s+"monthly_cost_budget_name"/);
  assert.match(variables, /variable\s+"cost_anomaly_monitor_arn"/);
  assert.match(stack, /count\s*=\s*trimspace\(var\.cost_anomaly_monitor_arn\)\s*==\s*""\s*\?\s*1\s*:\s*0/);
});

test('legacy worker health alarms use the operations topic', () => {
  const stack = read(stackPath);
  const workerModule = read(workerModulePath);
  const workerVariables = read(workerVariablesPath);

  assert.match(stack, /alarm_actions\s*=\s*\[aws_sns_topic\.ops_alerts\.arn\]/);
  assert.match(workerVariables, /variable\s+"alarm_actions"/);
  assert.match(workerModule, /alarm_actions\s*=\s*var\.alarm_actions/);
});
