/// <reference types="jest" />

import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../../..');
const STACK = path.join(ROOT, 'packages/infra/terraform/stacks/event-production-sites');
const read = (file: string) => fs.readFileSync(path.join(STACK, file), 'utf8');

describe('production event-site infrastructure', () => {
  it('provisions each configured site with private S3, CloudFront OAC, ACM, and Route 53 aliases', () => {
    const main = read('main.tf');
    const variables = read('variables.tf');

    expect(variables).toContain('variable "event_sites"');
    expect(main).toContain('for_each = var.event_sites');
    expect(main).toContain('resource "aws_s3_bucket_public_access_block"');
    expect(main).toContain('resource "aws_cloudfront_origin_access_control"');
    expect(main).toContain('resource "aws_cloudfront_distribution"');
    expect(main).toContain('resource "aws_acm_certificate"');
    expect(main).toContain('resource "aws_acm_certificate_validation"');
    expect(main).toContain('resource "aws_route53_record"');
    expect(main).toContain('AWS:SourceArn');
    expect(read('terraform.tfvars.example')).toContain('cbweek.hashpass.tech');
  });

  it('keeps production indexable and excludes API/Lambda mutation permissions', () => {
    const main = read('main.tf');

    expect(main).not.toMatch(/noindex|X-Robots-Tag|demo_noindex/i);
    expect(main).not.toMatch(/aws_codepipeline|aws_codebuild|lambda:UpdateFunctionCode|lambda:UpdateFunctionConfiguration/i);
    expect(main).toContain('cloudfront:CreateInvalidation');
    expect(main).toContain('s3:PutObject');
    expect(main).toContain('s3:DeleteObject');
  });

  it('restricts the publisher role to the approved repo, production environment, and main ref', () => {
    const main = read('main.tf');
    expect(main).toContain('repo:${var.github_repository}:environment:${each.value.github_environment}');
    expect(main).toContain('token.actions.githubusercontent.com:ref');
    expect(main).toContain('refs/heads/main');
    expect(main).toContain('aws_cloudfront_distribution.site[each.key].arn');
  });

  it('adds the production origin to application, auth, API Gateway, and event-media CORS allowlists', () => {
    const paths = [
      'packages/config/src/sso-config.ts',
      'apps/mobile-app/config/sso-config.ts',
      'apps/mobile-app/lib/cors.ts',
      'packages/infra/lambda/index.js',
      'apps/mobile-app/.env.example',
      'packages/infra/terraform/stacks/hashpass-api-target/variables.tf',
      'packages/infra/terraform/stacks/hashpass-api-target/terraform.tfvars.example',
      'packages/infra/terraform/stacks/hashpass-links-api/main.tf',
      'packages/infra/terraform/stacks/hashpass-links-api/variables.tf',
      'packages/infra/terraform/stacks/hashpass-links-api/terraform.tfvars.example',
      'packages/hashpass-links-api/lambda/index.ts',
      'docs/event-media-cors-policy.json',
    ];

    for (const file of paths) {
      expect(fs.readFileSync(path.join(ROOT, file), 'utf8')).toContain('https://cbweek.hashpass.tech');
    }
  });

  it('uses encrypted, locked remote state and registers the stack in validation tooling', () => {
    const backend = read('backend.tf');
    const stackScript = fs.readFileSync(path.join(ROOT, 'packages/infra/terraform/scripts/stack.sh'), 'utf8');
    const makefile = fs.readFileSync(path.join(ROOT, 'packages/infra/terraform/Makefile'), 'utf8');

    expect(backend).toContain('backend "s3"');
    expect(stackScript).toContain('event-production-sites/terraform.tfstate');
    expect(stackScript).toContain('dynamodb_table=hashpass-terraform-locks');
    expect(stackScript).toContain('encrypt=true');
    expect(makefile).toContain('stacks/event-production-sites');
  });
});
