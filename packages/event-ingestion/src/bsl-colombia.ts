import { createHash } from "node:crypto";
import {
  attribute,
  elements,
  firstElement,
  hasClass,
  parseHtml,
  textContent,
  type HtmlElement,
} from "./html.js";

export const BSL_COLOMBIA_SOURCE_URL =
  "https://blockchainsummit.la/colombia2026/";
export const BSL_COLOMBIA_EVENT_ID = "colombia2026";
export const BSL_COLOMBIA_TIMEZONE = "America/Bogota";

const DAY_DATES: Record<string, string> = {
  "1": "2026-11-04",
  "2": "2026-11-05",
  "3": "2026-11-06",
};

export interface BslSpeaker {
  externalId: string;
  name: string;
  slug: string;
  category: string;
  title: string;
  company: string;
  description: string;
  imageSourceUrl: string;
  sourceFingerprint: string;
}

export interface BslAgendaItem {
  externalId: string;
  day: string;
  dayName: string;
  startsAt: string;
  endsAt: string;
  timeLabel: string;
  title: string;
  type:
    | "keynote"
    | "panel"
    | "workshop"
    | "networking"
    | "break"
    | "registration"
    | "meal";
  location: string;
  sourceFingerprint: string;
}

export interface BslColombiaProgramme {
  sourceUrl: string;
  speakers: BslSpeaker[];
  agenda: BslAgendaItem[];
}

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

const fingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

const childText = (root: HtmlElement, className: string) => {
  const child = firstElement(root, (element) => hasClass(element, className));
  return child ? textContent(child).trim() : "";
};

function splitRole(value: string): { title: string; company: string } {
  const pieces = value.split(/\s*[·•]\s*/u).map((part) => part.trim());
  return {
    title: pieces.shift() || "",
    company: pieces.join(" · "),
  };
}

function resolvePublicAsset(value: string): string {
  const url = new URL(value, BSL_COLOMBIA_SOURCE_URL);
  if (url.protocol !== "https:" || url.hostname !== "blockchainsummit.la") {
    throw new Error(`Untrusted BSL asset URL: ${url.href}`);
  }
  return url.href;
}

function parseTime(day: string, value: string) {
  const match = value.match(/^(\d{2}):(\d{2})\s*[–-]\s*(\d{2}):(\d{2})$/u);
  if (!match) throw new Error(`Invalid BSL agenda time: ${value}`);
  const date = DAY_DATES[day];
  if (!date) throw new Error(`Unsupported BSL agenda day: ${day}`);
  return {
    startsAt: `${date}T${match[1]}:${match[2]}:00-05:00`,
    endsAt: `${date}T${match[3]}:${match[4]}:00-05:00`,
  };
}

function normalizeAgendaType(value: string): BslAgendaItem["type"] {
  const type = slugify(value);
  if (type === "panel") return "panel";
  if (type === "workshop" || type === "taller") return "workshop";
  if (type === "networking") return "networking";
  if (type === "coffee" || type === "almuerzo") return "meal";
  if (type === "registro" || type === "acreditacion") return "registration";
  if (type === "break" || type === "receso") return "break";
  return "keynote";
}

export function parseBslColombiaProgramme(html: string): BslColombiaProgramme {
  const document = parseHtml(html);
  const speakerCards = elements(
    document,
    (element) =>
      element.tagName === "article" && hasClass(element, "wp-team-item"),
  );
  const speakers = speakerCards.map((card) => {
    const nameElement = firstElement(
      card,
      (element) => element.tagName === "h4",
    );
    const imageElement = firstElement(
      card,
      (element) => element.tagName === "img",
    );
    const descriptionElement = firstElement(
      card,
      (element) => element.tagName === "p",
    );
    const name = nameElement ? textContent(nameElement).trim() : "";
    const description = descriptionElement
      ? textContent(descriptionElement).trim()
      : "";
    const image =
      imageElement &&
      (attribute(imageElement, "data-remote-src") ||
        attribute(imageElement, "src"));
    if (!name || !description || !image)
      throw new Error("Incomplete BSL speaker card");
    const role = splitRole(description);
    const value = {
      externalId: slugify(name),
      name,
      slug: slugify(name),
      category: childText(card, "speaker-category"),
      ...role,
      description,
      imageSourceUrl: resolvePublicAsset(image),
    };
    return { ...value, sourceFingerprint: fingerprint(value) };
  });

  const agendaPanels = elements(
    document,
    (element) =>
      hasClass(element, "agenda-schedule") &&
      Boolean(attribute(element, "data-wp-agenda-day")),
  );
  const agenda = agendaPanels.flatMap((panel) => {
    const day = attribute(panel, "data-wp-agenda-day")!;
    const dayName = `Día ${day} - ${DAY_DATES[day]}`;
    return elements(panel, (element) =>
      hasClass(element, "wp-agenda-item"),
    ).map((slot, index) => {
      const timeLabel = childText(slot, "time");
      const kind = childText(slot, "kind");
      const titleElement = firstElement(
        slot,
        (element) => element.tagName === "h4",
      );
      const title = titleElement ? textContent(titleElement).trim() : "";
      const location = childText(slot, "room");
      if (!timeLabel || !kind || !title || !location)
        throw new Error("Incomplete BSL agenda item");
      const times = parseTime(day, timeLabel);
      const value = {
        externalId: `colombia2026-day${day}-${String(index + 1).padStart(2, "0")}-${slugify(title)}`,
        day,
        dayName,
        ...times,
        timeLabel: timeLabel.replace("–", " - "),
        title,
        type: normalizeAgendaType(kind),
        location,
      };
      return { ...value, sourceFingerprint: fingerprint(value) };
    });
  });

  if (speakers.length < 10)
    throw new Error(
      `BSL speaker count dropped unexpectedly (${speakers.length})`,
    );
  if (agenda.length < 20)
    throw new Error(`BSL agenda count dropped unexpectedly (${agenda.length})`);
  if (new Set(speakers.map((speaker) => speaker.slug)).size !== speakers.length)
    throw new Error("Duplicate BSL speaker slugs detected");
  if (new Set(agenda.map((item) => item.externalId)).size !== agenda.length)
    throw new Error("Duplicate BSL agenda ids detected");

  return { sourceUrl: BSL_COLOMBIA_SOURCE_URL, speakers, agenda };
}
