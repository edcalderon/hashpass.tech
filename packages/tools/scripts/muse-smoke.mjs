#!/usr/bin/env node
/**
 * Bounded smoke test for the Meta Model API used by the Muse Companion (#457).
 *
 * Sends only synthetic data. Reads MODEL_API_KEY from the environment and prints
 * non-secret facts only: model, HTTP status, latency, token usage, tool name.
 * It never prints the key, the prompt body or raw model output.
 *
 *   MODEL_API_KEY=... node packages/tools/scripts/muse-smoke.mjs [chat|stt|all] [--wav file.wav]
 *
 * Endpoints (https://dev.meta.ai/docs):
 *   POST {base}/chat/completions    OpenAI-compatible, Bearer auth, function tools
 *   POST {base}/asr/transcribe      multipart: request (JSON) + audio (mono 16-bit PCM WAV, 16/24 kHz)
 */
import { readFile } from "node:fs/promises";

const BASE = (process.env.MODEL_API_BASE_URL ?? "https://api.meta.ai/v1").replace(/\/+$/, "");
const CHAT_MODEL = process.env.MUSE_CHAT_MODEL ?? "muse-spark-1.3";
const STT_MODEL = process.env.MUSE_STT_MODEL ?? "muse-voice-transcribe-1.0";
const TIMEOUT_MS = 30_000;

const key = process.env.MODEL_API_KEY;
if (!key) {
  console.error("MODEL_API_KEY is not set; nothing was sent.");
  process.exit(2);
}

const args = process.argv.slice(2);
const mode = args.find((a) => ["chat", "stt", "all"].includes(a)) ?? "all";
const wavIndex = args.indexOf("--wav");
const wavPath = wavIndex >= 0 ? args[wavIndex + 1] : undefined;

/** Mirrors the shape of the `get_my_events` descriptor in packages/types/src/companion.ts. */
const TOOLS = [
  {
    type: "function",
    function: {
      name: "get_my_events",
      description: "List the signed-in user's upcoming events. Takes no identity argument.",
      parameters: { type: "object", properties: { limit: { type: "number", description: "Maximum events." } } },
    },
  },
];

async function timed(label, run) {
  const started = performance.now();
  try {
    const result = await run(AbortSignal.timeout(TIMEOUT_MS));
    return { label, ms: Math.round(performance.now() - started), ...result };
  } catch (error) {
    return { label, ok: false, ms: Math.round(performance.now() - started), failure: error?.name ?? "error" };
  }
}

async function chatRoundtrip() {
  const headers = { "content-type": "application/json", authorization: `Bearer ${key}` };
  const post = (body, signal) =>
    fetch(`${BASE}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body), signal });

  const messages = [{ role: "user", content: "What is my next event? Use the tool." }];
  const first = await timed("chat:tool-call", async (signal) => {
    const res = await post({ model: CHAT_MODEL, messages, tools: TOOLS }, signal);
    const json = await res.json().catch(() => ({}));
    const choice = json.choices?.[0];
    const call = choice?.message?.tool_calls?.[0];
    return {
      ok: res.ok && Boolean(call),
      status: res.status,
      model: json.model,
      finish: choice?.finish_reason,
      tool: call?.function?.name,
      usage: json.usage,
      assistant: choice?.message,
      error: res.ok ? undefined : json.error?.message?.slice(0, 160),
    };
  });
  if (!first.ok) return [strip(first)];

  const call = first.assistant.tool_calls[0];
  const synthetic = JSON.stringify([{ name: "Synthetic Demo Summit", startsAt: "2027-01-15T09:00:00Z" }]);
  const second = await timed("chat:tool-result", async (signal) => {
    const res = await post(
      {
        model: CHAT_MODEL,
        messages: [
          ...messages,
          first.assistant,
          { role: "tool", tool_call_id: call.id, content: synthetic },
        ],
        tools: TOOLS,
      },
      signal,
    );
    const json = await res.json().catch(() => ({}));
    const text = json.choices?.[0]?.message?.content;
    return {
      ok: res.ok && typeof text === "string" && text.length > 0,
      status: res.status,
      model: json.model,
      finish: json.choices?.[0]?.finish_reason,
      usage: json.usage,
      replyChars: text?.length,
      error: res.ok ? undefined : json.error?.message?.slice(0, 160),
    };
  });
  return [strip(first), strip(second)];
}

async function transcribe() {
  if (!wavPath) return [{ label: "stt", ok: false, skipped: "no --wav file supplied" }];
  const audio = await readFile(wavPath);
  return [
    await timed("stt", async (signal) => {
      const form = new FormData();
      form.append(
        "request",
        new Blob([JSON.stringify({ mode: "PUSH_TO_TALK", model: STT_MODEL, audioEncoding: "WAV" })], {
          type: "application/json",
        }),
      );
      form.append("audio", new Blob([audio], { type: "audio/wav" }), "sample.wav");
      const res = await fetch(`${BASE}/asr/transcribe?sessionId=hashpass-smoke`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, accept: "application/json" },
        body: form,
        signal,
      });
      const json = await res.json().catch(() => ({}));
      return {
        ok: res.ok && typeof json.transcript === "string",
        status: res.status,
        audioDurationMs: json.audioDurationMs,
        transcriptChars: json.transcript?.length,
        error: res.ok ? undefined : (json.error?.message ?? json.message)?.slice(0, 160),
      };
    }),
  ];
}

/** Drop the assistant message (may carry model output) before printing. */
function strip({ assistant, ...rest }) {
  return rest;
}

const results = [];
if (mode === "chat" || mode === "all") results.push(...(await chatRoundtrip()));
if (mode === "stt" || mode === "all") results.push(...(await transcribe()));

console.log(JSON.stringify({ at: new Date().toISOString(), base: BASE, results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
