import { resolve } from "node:path";
import { syncEventSources } from "./sync.js";

const root = resolve(import.meta.dirname, "../../..");
const result = await syncEventSources({
  outputFile: resolve(root, "packages/config/src/generated/ingested-events.json"),
  healthFile: resolve(root, "artifacts/event-ingestion/health.json"),
});
console.log(JSON.stringify({ eventCount: result.events.length, health: result.health }, null, 2));
if (result.health.status === "failed") process.exitCode = 1;
