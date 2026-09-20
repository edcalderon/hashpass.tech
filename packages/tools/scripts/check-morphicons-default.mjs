#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const read = (...parts) =>
  fs.readFileSync(path.join(root, ...parts), "utf8");

const wrapper = read("apps/mobile-app/lib/morph-icon.tsx");
const home = read("apps/mobile-app/app/home.tsx");
const dashboard = read("apps/mobile-app/app/(shared)/dashboard/_layout.tsx");
const auth = read("apps/mobile-app/app/(shared)/auth.tsx");
const errors = [];

if (!wrapper.includes('from "morphicons/react-native"')) {
  errors.push("MorphIcon must use the native-compatible Morphicons adapter.");
}

for (const [label, source] of [
  ["landing proposal action", home],
  ["dashboard menu action", dashboard],
  ["auth verification action", auth],
]) {
  if (!source.includes("<MorphIcon")) {
    errors.push(`${label} must use the shared MorphIcon wrapper.`);
  }
}

for (const state of ["isEventProposalHovered", "isEventExplorerHovered"]) {
  if (!home.includes(state)) {
    errors.push(`Landing action is missing its ${state} micro-interaction state.`);
  }
}

const footerAction = home.slice(home.indexOf("footerAction={"), home.indexOf("onEventPress={"));
if (footerAction.includes("<Ionicons")) {
  errors.push("Landing carousel actions must use MorphIcon, not static icon components.");
}

if (errors.length) {
  console.error(`Morphicons default guard failed:\n${errors.join("\n")}`);
  process.exit(1);
}

console.log("Morphicons default guard passed for interactive landing, dashboard, and auth actions.");
