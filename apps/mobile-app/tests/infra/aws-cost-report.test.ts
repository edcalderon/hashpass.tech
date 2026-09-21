/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const source = fs.readFileSync(path.resolve(__dirname, '../../../../packages/tools/scripts/aws-cost-report.mjs'), 'utf8')
  .replace(/^import .*;$/m, '');
const testAccount = '000000000000';

function report(options: {
  actual?: number; forecast?: number | null; account?: string; expected?: string;
  triggers?: unknown[]; detectChanges?: string; sources?: boolean;
  pipelines?: string; fail?: boolean;
} = {}) {
  const calls: string[][] = [];
  const output: string[] = [];
  const processMock = { env: {
    AWS_TARGET_ACCOUNT_ID: options.expected ?? testAccount,
    AWS_MANUAL_BUILD_PIPELINES: options.pipelines ?? 'hashpass-dev-site',
  }, exitCode: 0 };
  const responses: Record<string, unknown> = {
    sts: { Account: options.account ?? testAccount },
    ce: { ResultsByTime: [{ Groups: [{ Keys: ['AWS CodeBuild'], Metrics: { UnblendedCost: { Amount: '12.34' } } }] }] },
    budgets: { Budget: { BudgetLimit: { Amount: '50' }, CalculatedSpend: {
      ActualSpend: { Amount: String(options.actual ?? 20) },
      ...(options.forecast === null ? {} : { ForecastedSpend: { Amount: String(options.forecast ?? 30) } }),
    } } },
    codepipeline: { pipeline: { triggers: options.triggers ?? [], stages: [{ actions: options.sources === false ? [] : [{
      actionTypeId: { category: 'Source' }, configuration: { DetectChanges: options.detectChanges ?? 'false' },
    }] }] } },
  };
  vm.runInNewContext(source, {
    process: processMock,
    console: { log: (line: string) => output.push(line), error: (line: string) => output.push(line) },
    execFileSync: (binary: string, args: string[]) => {
      expect(binary).toBe('aws');
      calls.push(args);
      if (options.fail) throw new Error(`private AWS payload ${testAccount}`);
      return JSON.stringify(responses[args[0]]);
    },
  });
  return { calls, output: output.join('\n'), exitCode: processMock.exitCode };
}

describe('read-only AWS cost guard', () => {
  it('reports spend and a disabled source without leaking the account', () => {
    const result = report();
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('$20.00 / $50.00');
    expect(result.output).toContain('| AWS CodeBuild | $12.34 |');
    expect(result.output).toContain('manual recovery only');
    expect(result.output).not.toContain(testAccount);
    expect(result.calls.map(args => args[1])).toEqual(['get-caller-identity', 'get-cost-and-usage', 'describe-budget', 'get-pipeline']);
  });

  it.each([{ actual: 57.55 }, { forecast: 172.77 }])('alerts on actual or forecast breach: %j', options => {
    expect(report(options).exitCode).toBe(1);
    expect(report(options).output).toContain('Budget alert');
  });

  it('allows exactly the ceiling and a missing forecast', () => {
    expect(report({ actual: 50, forecast: 50 }).exitCode).toBe(0);
    const result = report({ forecast: null });
    expect(result.exitCode).toBe(0);
    expect(result.output).toContain('unavailable');
  });

  it.each([{ triggers: [{}] }, { detectChanges: 'true' }, { detectChanges: '' }, { sources: false }])('detects unsafe trigger state: %j', options => {
    const result = report(options);
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('automatic build trigger enabled');
  });

  it('checks every migrated pipeline in its own region', () => {
    const names = ['hashpass-dev-site', 'hashpass-production-site', 'hashpass-cbweek2026-develop-site', 'bsl-hashpass-dev', 'bsl-hashpass-prod'];
    const result = report({ pipelines: names.join(',') });
    expect(result.exitCode).toBe(0);
    const pipelineCalls = result.calls.filter(args => args[0] === 'codepipeline');
    expect(pipelineCalls).toHaveLength(5);
    for (const args of pipelineCalls) {
      expect(args[args.indexOf('--region') + 1]).toBe('us-east-2');
      expect(args.filter(arg => arg === '--region')).toHaveLength(1);
    }
    expect(result.calls.filter(args => args[0] === 'ce')).toHaveLength(1);
    expect(result.calls.find(args => args[0] === 'ce')).toContain(JSON.stringify({ Not: { Dimensions: { Key: 'RECORD_TYPE', Values: ['Credit', 'Refund'] } } }));
  });

  it('rejects invalid account configuration before making AWS requests', () => {
    const result = report({ expected: 'invalid' });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(0);
  });

  it('defaults to monitoring all five migrated pipelines when the variable is absent', () => {
    const result = report({ pipelines: '' });
    expect(result.exitCode).toBe(0);
    expect(result.calls.filter(args => args[0] === 'codepipeline')).toHaveLength(5);
  });

  it('rejects a mismatched account before accessing billing or pipelines', () => {
    const result = report({ account: '111111111111' });
    expect(result.exitCode).toBe(1);
    expect(result.calls).toHaveLength(1);
    expect(result.output).not.toContain('111111111111');
  });

  it('refuses unexpected pipeline names', () => {
    const result = report({ pipelines: 'unrelated-production-pipeline' });
    expect(result.exitCode).toBe(1);
    expect(result.calls.some(args => args[0] === 'codepipeline')).toBe(false);
  });

  it('sanitizes AWS failures instead of dumping private command details', () => {
    const result = report({ fail: true });
    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('AWS sts get-caller-identity failed');
    expect(result.output).not.toContain(testAccount);
    expect(result.output).not.toContain('private AWS payload');
  });
});
