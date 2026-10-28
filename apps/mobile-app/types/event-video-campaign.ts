export type EventVideoCampaignFilm = {
  id: "welcome" | "walkthrough" | "recap";
  title: string;
  durationMs: number;
  url: string;
  poster: string;
  captions: string;
};

export type EventVideoCampaign = {
  version: 1;
  campaignId: string;
  eventId: string;
  closesAt: string;
  metricsCutoff: string | null;
  films: EventVideoCampaignFilm[];
};
