import path from 'node:path';

const eventIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const compositionIdPattern = /^EventHero[A-Z][A-Za-z0-9]*$/;
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;

function requireString(value, field) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Event hero ${field} is required.`);
  }
  return value.trim();
}

function validateHero(hero) {
  if (!hero || typeof hero !== 'object' || Array.isArray(hero)) {
    throw new Error('Each event hero must be an object.');
  }

  const id = requireString(hero.id, 'id');
  if (!eventIdPattern.test(id)) throw new Error(`Event hero id is invalid: ${id}`);

  const compositionId = requireString(hero.compositionId, 'compositionId');
  if (!compositionIdPattern.test(compositionId)) {
    throw new Error(`Event hero compositionId is invalid: ${compositionId}`);
  }

  if (!hero.eventLogo || typeof hero.eventLogo !== 'object') {
    throw new Error(`Event hero ${id} needs an eventLogo.`);
  }
  const logoTarget = requireString(hero.eventLogo.target, 'eventLogo.target');
  if (!logoTarget.startsWith(`event-heroes/${id}/`)) {
    throw new Error(`Event hero ${id} logo target must stay within its event directory.`);
  }

  const accentColor = requireString(hero.accentColor, 'accentColor');
  if (!hexColorPattern.test(accentColor)) {
    throw new Error(`Event hero ${id} accentColor must be a six-digit hex color.`);
  }

  return {
    ...hero,
    id,
    compositionId,
    title: requireString(hero.title, 'title'),
    city: requireString(hero.city, 'city'),
    country: requireString(hero.country, 'country'),
    venue: requireString(hero.venue, 'venue'),
    accentColor,
    eventLogo: {...hero.eventLogo, target: logoTarget},
  };
}

/** Validate the reviewed hero inventory before any render or publication. */
export function validateEventHeroManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || manifest.version !== 1 || !Array.isArray(manifest.heroes)) {
    throw new Error('event-hero-specs.json must declare version 1 and a heroes array.');
  }

  const ids = new Set();
  const compositions = new Set();
  return manifest.heroes.map((hero) => {
    const normalized = validateHero(hero);
    if (ids.has(normalized.id)) throw new Error(`Duplicate event hero id: ${normalized.id}`);
    if (compositions.has(normalized.compositionId)) {
      throw new Error(`Duplicate event hero compositionId: ${normalized.compositionId}`);
    }
    ids.add(normalized.id);
    compositions.add(normalized.compositionId);
    return normalized;
  });
}

/** Build the only allowed CDN layout: immutable media below its owning event. */
export function createHeroPublishPlan(heroes, {mediaBaseUrl, outputDirectory}) {
  const baseUrl = requireString(mediaBaseUrl, 'mediaBaseUrl').replace(/\/+$/, '');
  const outputRoot = requireString(outputDirectory, 'outputDirectory');

  return heroes.map((hero) => {
    const filename = 'hashpass-event-hero-v1.mp4';
    const suffix = `${hero.id}/branding/${filename}`;
    return {
      eventId: hero.id,
      localPath: path.join(outputRoot, hero.id, filename),
      objectKey: `events/${suffix}`,
      publicUrl: `${baseUrl}/${suffix}`,
    };
  });
}
