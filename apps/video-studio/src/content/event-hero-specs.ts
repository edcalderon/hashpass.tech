import heroManifest from './event-hero-specs.json';

export type EventHeroSpec = {
  id: string;
  compositionId: string;
  title: string;
  city: string;
  country: string;
  venue: string;
  accentColor: string;
  eventLogo: {
    source: string;
    target: string;
  };
};

export const eventHeroSpecs = heroManifest.heroes as EventHeroSpec[];

export const EVENT_HERO_DURATION_IN_FRAMES = 240;
