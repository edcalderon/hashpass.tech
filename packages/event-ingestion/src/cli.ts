import { resolve } from "node:path";
import { syncEventSources } from "./sync.js";
import { PostgrestEventStore } from "./store.js";

const root = resolve(import.meta.dirname, "../../..");
const databaseUrl =
  process.env.EVENT_INGESTION_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey =
  process.env.EVENT_INGESTION_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;
const mode =
  process.env.EVENT_INGESTION_MODE ||
  (databaseUrl && serviceRoleKey ? "database" : "legacy-json");
const legacySnapshotFallback =
  process.env.EVENT_INGESTION_LEGACY_JSON_FALLBACK !== "false";
if (mode === "database" && (!databaseUrl || !serviceRoleKey))
  throw new Error(
    "EVENT_INGESTION_MODE=database requires the ingestion Supabase URL and service-role key",
  );
if (mode === "legacy-json")
  console.warn(
    "Legacy event JSON mode is active; configure database ingestion for production use.",
  );

const result = await syncEventSources({
  outputFile: resolve(
    root,
    "packages/config/src/generated/ingested-events.json",
  ),
  healthFile: resolve(root, "artifacts/event-ingestion/health.json"),
  store:
    mode === "database"
      ? new PostgrestEventStore({
          baseUrl: databaseUrl!,
          serviceRoleKey: serviceRoleKey!,
        })
      : undefined,
  legacySnapshotFallback,
});
console.log(
  JSON.stringify(
    {
      mode,
      legacySnapshotFallback,
      eventCount: result.events.length,
      health: result.health,
    },
    null,
    2,
  ),
);
if (result.health.status === "failed") process.exitCode = 1;
