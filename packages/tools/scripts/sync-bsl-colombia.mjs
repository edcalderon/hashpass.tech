#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import "dotenv/config";
import {
  BSL_COLOMBIA_EVENT_ID,
  BSL_COLOMBIA_SOURCE_URL,
  parseBslColombiaProgramme,
} from "../../event-ingestion/src/bsl-colombia.ts";
import { readLimitedResponse } from "../../event-ingestion/src/bounded-response.ts";

const SOURCE_ID = "blockchainsummit-colombia2026";
const MAX_PAGE_BYTES = 2_000_000;
const MAX_IMAGE_BYTES = 8_000_000;
const TIMEOUT_MS = 20_000;
const profile =
  process.argv.find((arg) => arg.startsWith("--profile="))?.split("=")[1] ||
  "dry-run";
const dryRun = profile === "dry-run" || process.argv.includes("--dry-run");
const inputFile = process.argv
  .find((arg) => arg.startsWith("--input="))
  ?.split("=")[1];

const profileEnv = {
  development: {
    url: ["BSL_SUPABASE_URL_DEV", "EXPO_PUBLIC_BSL_SUPABASE_URL_DEV"],
    key: ["BSL_SUPABASE_SERVICE_ROLE_KEY_DEV"],
  },
  production: {
    url: ["BSL_SUPABASE_URL_PROD", "EXPO_PUBLIC_BSL_SUPABASE_URL_PROD"],
    key: ["BSL_SUPABASE_SERVICE_ROLE_KEY_PROD"],
  },
};

const firstEnv = (names) =>
  names.map((name) => process.env[name]).find(Boolean);
const timeoutSignal = () => AbortSignal.timeout(TIMEOUT_MS);

async function fetchProgramme() {
  if (inputFile)
    return parseBslColombiaProgramme(await readFile(inputFile, "utf8"));
  const robots = await fetch("https://blockchainsummit.la/robots.txt", {
    headers: {
      "User-Agent": "HashPass-Event-Ingestion/1.0 (+https://hashpass.tech)",
    },
    signal: timeoutSignal(),
  });
  if (robots.ok && /^\s*Disallow:\s*\/\s*$/im.test(await robots.text()))
    throw new Error("The source disallows crawling in robots.txt");
  const response = await fetch(BSL_COLOMBIA_SOURCE_URL, {
    headers: {
      Accept: "text/html",
      "User-Agent": "HashPass-Event-Ingestion/1.0 (+https://hashpass.tech)",
    },
    redirect: "error",
    signal: timeoutSignal(),
  });
  const { bytes } = await readLimitedResponse(
    response,
    MAX_PAGE_BYTES,
    "BSL Colombia page",
  );
  return parseBslColombiaProgramme(new TextDecoder().decode(bytes));
}

function assertAwsAccount() {
  const expected = process.env.EXPECTED_AWS_ACCOUNT_ID;
  if (!expected)
    throw new Error(
      "EXPECTED_AWS_ACCOUNT_ID is required before an AWS mutation",
    );
  const args = [
    "sts",
    "get-caller-identity",
    "--query",
    "Account",
    "--output",
    "text",
  ];
  if (process.env.AWS_PROFILE) args.push("--profile", process.env.AWS_PROFILE);
  const actual = execFileSync("aws", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
  if (actual !== expected)
    throw new Error(
      "AWS caller identity does not match EXPECTED_AWS_ACCOUNT_ID",
    );
}

function imageType(bytes, contentType) {
  const isPng =
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isWebp =
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  if (isPng) return { extension: "png", contentType: "image/png" };
  if (isJpeg) return { extension: "jpg", contentType: "image/jpeg" };
  if (isWebp) return { extension: "webp", contentType: "image/webp" };
  throw new Error(
    `Unsupported speaker image (${contentType || "unknown content type"})`,
  );
}

async function uploadImages(programme) {
  const bucket =
    process.env.BSL_SPEAKER_ASSETS_BUCKET ||
    process.env.EXPO_PUBLIC_AWS_S3_BUCKET;
  const cdn = process.env.BSL_SPEAKER_CDN_URL || process.env.AWS_S3_CDN_URL;
  if (!bucket || !cdn)
    throw new Error(
      "BSL_SPEAKER_ASSETS_BUCKET and BSL_SPEAKER_CDN_URL are required",
    );
  assertAwsAccount();
  const s3 = new S3Client({ region: process.env.AWS_REGION || "us-east-1" });
  return Promise.all(
    programme.speakers.map(async (speaker) => {
      const response = await fetch(speaker.imageSourceUrl, {
        headers: {
          Accept: "image/png,image/jpeg,image/webp",
          "User-Agent": "HashPass-Event-Ingestion/1.0 (+https://hashpass.tech)",
        },
        redirect: "error",
        signal: timeoutSignal(),
      });
      const { bytes, contentType } = await readLimitedResponse(
        response,
        MAX_IMAGE_BYTES,
        `Image for ${speaker.name}`,
      );
      const type = imageType(bytes, contentType);
      const digest = createHash("sha256")
        .update(bytes)
        .digest("hex")
        .slice(0, 16);
      const key = `events/${BSL_COLOMBIA_EVENT_ID}/speakers/${speaker.slug}-${digest}.${type.extension}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: bytes,
          ContentType: type.contentType,
          CacheControl: "public, max-age=31536000, immutable",
          Metadata: {
            source: SOURCE_ID,
            fingerprint: speaker.sourceFingerprint,
          },
        }),
      );
      return { ...speaker, imageUrl: `${cdn.replace(/\/$/, "")}/${key}` };
    }),
  );
}

async function postgrest(baseUrl, key, path, init = {}) {
  const response = await fetch(
    `${baseUrl.replace(/\/$/, "")}/rest/v1/${path}`,
    {
      ...init,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...init.headers,
      },
      signal: timeoutSignal(),
    },
  );
  if (!response.ok)
    throw new Error(
      `Database ${response.status}: ${(await response.text()).slice(0, 400)}`,
    );
  return response;
}

async function syncDatabase(programme, speakers) {
  const config = profileEnv[profile];
  if (!config) throw new Error(`Unknown profile: ${profile}`);
  const baseUrl = firstEnv(config.url);
  const key = firstEnv(config.key);
  if (!baseUrl || !key)
    throw new Error(`Missing BSL ${profile} database credentials`);
  const syncedAt = new Date().toISOString();
  const speakerRows = speakers.map((speaker) => ({
    event_id: BSL_COLOMBIA_EVENT_ID,
    slug: speaker.slug,
    name: speaker.name,
    title: speaker.title,
    company: speaker.company,
    bio: speaker.description,
    imageurl: speaker.imageUrl,
    is_active: true,
    metadata: {
      source: SOURCE_ID,
      category: speaker.category,
      source_url: speaker.imageSourceUrl,
      source_fingerprint: speaker.sourceFingerprint,
      synced_at: syncedAt,
    },
    updated_at: syncedAt,
  }));
  const agendaRows = programme.agenda.map((item) => ({
    id: item.externalId,
    event_id: BSL_COLOMBIA_EVENT_ID,
    time: item.startsAt,
    title: item.title,
    description: JSON.stringify({
      ends_at: item.endsAt,
      source: SOURCE_ID,
      source_fingerprint: item.sourceFingerprint,
    }),
    speakers: [],
    type: item.type,
    location: item.location,
    day: item.day,
    day_name: item.dayName,
    updated_at: syncedAt,
  }));
  await postgrest(baseUrl, key, "rpc/sync_bsl_public_programme", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      p_event_id: BSL_COLOMBIA_EVENT_ID,
      p_source_id: SOURCE_ID,
      p_speakers: speakerRows,
      p_agenda: agendaRows,
    }),
  });
}

const programme = await fetchProgramme();
if (dryRun) {
  console.log(
    JSON.stringify(
      {
        profile,
        dryRun: true,
        speakers: programme.speakers,
        agenda: programme.agenda,
      },
      null,
      2,
    ),
  );
} else {
  const speakers = await uploadImages(programme);
  await syncDatabase(programme, speakers);
  console.log(
    JSON.stringify(
      {
        profile,
        eventId: BSL_COLOMBIA_EVENT_ID,
        speakerCount: speakers.length,
        agendaCount: programme.agenda.length,
      },
      null,
      2,
    ),
  );
}
