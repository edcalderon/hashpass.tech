#!/usr/bin/env node

// `$LKS` is the required customer-facing notation for the Blockchain Latam
// Foundation LATAM crypto-peso index. Keep bare `LKS` out of translated copy;
// implementation identifiers are intentionally outside this content guard.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const localeDir = path.join(scriptDir, "..", "i18n", "locales");
const bareLks = /(^|[^$])\bLKS\b/;
const violations = [];

const collectStrings = (value, key = "") => {
  if (typeof value === "string") return [[key, value]];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([childKey, child]) =>
    collectStrings(child, key ? `${key}.${childKey}` : childKey),
  );
};

for (const file of fs.readdirSync(localeDir).filter((entry) => entry.endsWith(".json"))) {
  const catalog = JSON.parse(fs.readFileSync(path.join(localeDir, file), "utf8"));
  for (const [key, value] of collectStrings(catalog)) {
    if (bareLks.test(value)) violations.push(`${file}:${key} must use $LKS`);
  }
}

if (violations.length) {
  console.error("Bare LKS currency notation found:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Verified $LKS notation in translated customer-facing copy.");
