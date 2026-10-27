import { test } from "node:test";
import assert from "node:assert/strict";
import { rewriteRelativeLinks } from "./plane-link-rewrite.mjs";

const base = "https://github.com/hashpass-tech/hashpass.tech/blob/develop/";
const rewrite = (md, source = "docs/architecture/x.md") => rewriteRelativeLinks(md, source, base);

test("sibling and parent-relative links resolve against the source directory", () => {
  assert.equal(
    rewrite("[a](knowledge-governance-github-plane-notion.md) [b](../../apps/docs/docs/auth/plane-mcp-authorization.md)"),
    `[a](${base}docs/architecture/knowledge-governance-github-plane-notion.md) [b](${base}apps/docs/docs/auth/plane-mcp-authorization.md)`,
  );
});

test("fragments, titles, images, angle brackets and reference definitions are preserved", () => {
  assert.equal(rewrite("[a](./y.md#sec)"), `[a](${base}docs/architecture/y.md#sec)`);
  assert.equal(rewrite("[a](./y.md?view=raw#sec)"), `[a](${base}docs/architecture/y.md?view=raw#sec)`);
  assert.equal(rewrite('[a](y.md "Title")'), `[a](${base}docs/architecture/y.md "Title")`);
  assert.equal(rewrite("![i](img/z.png)"), `![i](${base}docs/architecture/img/z.png)`);
  assert.equal(rewrite("[a](<my file.md>)"), `[a](<${base}docs/architecture/my file.md>)`);
  assert.equal(rewrite("[ref]: ../x.md"), `[ref]: ${base}docs/x.md`);
  assert.equal(rewrite("[a](/CLAUDE.md)"), `[a](${base}CLAUDE.md)`);
});

test("absolute URLs, mail links, anchors and escaping paths are left alone", () => {
  for (const md of ["[a](https://x.test/a.md)", "[a](mailto:a@b.c)", "[a](#top)", "[a](//cdn.test/x)", "[a](../../../../outside.md)"]) {
    assert.equal(rewrite(md), md);
  }
});

test("fenced code blocks are not rewritten", () => {
  const md = "```md\n[a](y.md)\n```\n[b](y.md)";
  assert.equal(rewrite(md), `\`\`\`md\n[a](y.md)\n\`\`\`\n[b](${base}docs/architecture/y.md)`);
});
