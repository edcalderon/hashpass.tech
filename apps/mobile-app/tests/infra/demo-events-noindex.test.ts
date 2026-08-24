/// <reference types="jest" />

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("demo-events crawler policy", () => {
  it("delivers noindex instructions from the demo CloudFront distribution", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../../../../packages/infra/terraform/stacks/demo-events/main.tf",
      ),
      "utf8",
    );

    expect(source).toContain(
      'resource "aws_cloudfront_response_headers_policy" "demo_noindex"',
    );
    expect(source).toContain('header   = "X-Robots-Tag"');
    expect(source).toContain(
      'value    = "noindex, nofollow, noarchive, nosnippet"',
    );
    expect(source).toContain(
      "response_headers_policy_id = aws_cloudfront_response_headers_policy.demo_noindex.id",
    );
  });
});
