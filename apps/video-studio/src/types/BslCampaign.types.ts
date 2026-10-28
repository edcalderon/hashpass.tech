import type campaign from "../content/bsl-bogota-campaign.json";

export type BslCampaignFilmConfig = (typeof campaign.films)[number];

export type BslCampaignLocale = "en" | "es";

export type BslCampaignWelcomeLocale = (typeof campaign.welcomeLocales)[BslCampaignLocale];

export type BslCampaignFilmProps = {
  film: BslCampaignFilmConfig;
  audioFile: string;
  metricValues?: Record<string, number>;
};

export type BslCampaignWelcomeProps = {
  locale: BslCampaignLocale;
  content: BslCampaignWelcomeLocale;
};
