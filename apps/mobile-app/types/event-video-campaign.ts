export type EventVideoCampaignLocale = "en" | "es";

export type EventVideoCampaignCaptionTrack = {
  src: string;
  language: EventVideoCampaignLocale;
  label: string;
  default?: boolean;
};

export type EventVideoCampaignFilmMedia = {
  title?: string;
  durationMs: number;
  url: string;
  poster: string;
  captions: string;
  captionTracks?: EventVideoCampaignCaptionTrack[];
};

export type EventVideoCampaignFilm = EventVideoCampaignFilmMedia & {
  id: "welcome" | "walkthrough" | "recap";
  title: string;
  alternateLocales?: Partial<Record<EventVideoCampaignLocale, EventVideoCampaignFilmMedia>>;
};

export type EventVideoCampaign = {
  version: 1;
  campaignId: string;
  eventId: string;
  closesAt: string;
  metricsCutoff: string | null;
  films: EventVideoCampaignFilm[];
};
