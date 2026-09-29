import heroManifest from './event-hero-specs.json';

export type EventHeroSpec = {
  id: string;
  compositionId: string;
  title: string;
  city: string;
  country: string;
  venue: string;
  accentColor: string;
  /** A reviewed visual language for this event, never inferred at render time. */
  visualTheme?: 'city-columns' | 'poker-table';
  eventLogo: {
    source: string;
    target: string;
  };
};

export const eventHeroSpecs = heroManifest.heroes as EventHeroSpec[];

// Twelve seconds keeps dashboard background motion deliberately calm.
export const EVENT_HERO_DURATION_IN_FRAMES = 360;
