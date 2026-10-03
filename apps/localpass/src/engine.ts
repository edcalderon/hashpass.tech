import type { DestinationPack, ItineraryItem, Language, Place } from './types';

const aliases: Record<string, string[]> = {
  food: ['food', 'eat', 'lunch', 'breakfast', 'comida', 'comer', 'almuerzo', 'desayuno'],
  nature: ['nature', 'walk', 'lake', 'outdoor', 'naturaleza', 'caminar', 'lago'],
  culture: ['culture', 'history', 'artisan', 'cultura', 'historia', 'artesania'],
  rain: ['rain', 'raining', 'rainy', 'lluvia', 'llueve', 'lluvioso'],
  transport: ['bus', 'medellin', 'return', 'regresar', 'transporte'],
};
const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
const stopWords = new Set('i have want to do visit like a an the and or in of for with hours hour cop tengo quiero hacer visitar me gusta el la los las un una y o en de del por para con horas hora'.split(' '));
const queryWords = (query: string) => [...new Set(normalize(query).match(/\p{L}+/gu) ?? [])]
  .filter(word => word.length > 1 && !stopWords.has(word));

export function extractQuery(query: string) {
  const text = normalize(query);
  const amount = text.match(/(?:\bcop\s*|\$\s*)(\d[\d.,]*)/)
    ?? text.match(/(\d[\d.,]*)\s*cop\b/);
  return {
    hours: Number(text.match(/(\d+)\s*(?:hours?|horas?)\b/)?.[1] ?? 3),
    budget: amount ? Number(amount[1].replace(/[.,]/g, '')) : 100_000,
    interests: Object.entries(aliases)
      .filter(([, words]) => words.some(word => new RegExp(`\\b${word}\\b`).test(text)))
      .map(([key]) => key),
  };
}

function relevance(place: Place, words: string[], language: Language) {
  const name = normalize(place.name);
  const tags = normalize([place.category, place.category_es, ...place.tags].join(' '));
  const description = normalize(place[`description_${language}`]);
  const location = normalize(language === 'es' ? place.location_es : place.location);
  return words.reduce((score, word) => score
    + (name.includes(word) ? 4 : 0)
    + (tags.includes(word) ? 3 : 0)
    + (description.includes(word) ? 1 : 0)
    + (location.includes(word) ? 1 : 0), 0);
}

export function searchPlaces(pack: DestinationPack, query: string, language: Language): Place[] {
  const words = queryWords(query);
  return pack.places.map(place => ({ place, score: relevance(place, words, language) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || Number(b.place.local_business) - Number(a.place.local_business))
    .map(({ place }) => place);
}

export function buildItinerary(pack: DestinationPack, query: string, language: Language): ItineraryItem[] {
  const constraints = extractQuery(query);
  const words = queryWords(query);
  const interests = constraints.interests.length ? constraints.interests : ['culture', 'nature', 'food'];
  const ranked = pack.places
    .filter(place => place.offline_safe && place.estimated_cost <= constraints.budget)
    .map(place => ({
      place,
      relevance: relevance(place, words, language),
      score: interests.filter(interest => place.tags.includes(interest)).length * 4
        + (place.local_business ? 2 : 0) - place.estimated_cost / Math.max(constraints.budget, 1),
    }))
    .sort((a, b) => b.relevance - a.relevance || b.score - a.score);
  let minutes = 0;
  let cost = 0;
  const result: ItineraryItem[] = [];
  for (const { place } of ranked) {
    const travel = result.length ? 15 : 0;
    if (minutes + travel + place.estimated_duration > constraints.hours * 60
      || cost + place.estimated_cost > constraints.budget) continue;
    minutes += travel;
    const start = 9 * 60 + minutes;
    result.push({
      place_id: place.id,
      start_time: `${String(Math.floor(start / 60)).padStart(2, '0')}:${String(start % 60).padStart(2, '0')}`,
      duration: place.estimated_duration,
      estimated_cost: place.estimated_cost,
      reason: language === 'es'
        ? `${place.local_business ? 'Apoya a un negocio local. ' : ''}Se ajusta a tu tiempo y presupuesto.`
        : `${place.local_business ? 'Supports a local business. ' : ''}Fits your time and budget.`,
    });
    minutes += place.estimated_duration;
    cost += place.estimated_cost;
    if (result.length === 5) break;
  }
  return result;
}
