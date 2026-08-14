import type { EventBannerSlide } from "@hashpass/types";
import type { EventInfo } from "./event-detector";

export interface ResolvedEventBannerSlide extends EventBannerSlide {
  title: string;
  subtitle: string;
  date: string;
  backgroundColor: string;
}

type TranslateBannerCopy = (key: string, fallback: string) => string;

/** Resolves organizer-supplied locale keys while preserving canonical event
 * and brand names where no translation key has been supplied. */
export const localizeEventBannerSlide = (
  slide: ResolvedEventBannerSlide,
  translate: TranslateBannerCopy,
): ResolvedEventBannerSlide => ({
  ...slide,
  eyebrow: slide.i18n?.eyebrow
    ? translate(slide.i18n.eyebrow, slide.eyebrow || "")
    : slide.eyebrow,
  title: slide.i18n?.title
    ? translate(slide.i18n.title, slide.title)
    : slide.title,
  subtitle: slide.i18n?.subtitle
    ? translate(slide.i18n.subtitle, slide.subtitle)
    : slide.subtitle,
  date: slide.i18n?.date ? translate(slide.i18n.date, slide.date) : slide.date,
  cta: slide.cta
    ? {
        ...slide.cta,
        label: slide.i18n?.ctaLabel
          ? translate(slide.i18n.ctaLabel, slide.cta.label)
          : slide.cta.label,
      }
    : undefined,
});

/**
 * Resolves an event's organizer-managed banner slides. Every event has a
 * useful static fallback, so adding banner support never leaves old events
 * with an empty hero while the admin has not added campaign media yet.
 */
export const getEventBannerSlides = (
  event: EventInfo,
): ResolvedEventBannerSlide[] => {
  const fallback: ResolvedEventBannerSlide = {
    id: "default",
    media: { type: "image", url: event.image },
    title: event.title,
    subtitle: event.subtitle || "",
    date: event.eventDateString || event.subtitle || "Coming soon",
    backgroundColor: event.color || "#007AFF",
    cta: event.cta,
  };

  if (!event.bannerSlides?.length) return [fallback];

  return event.bannerSlides.map((slide) => ({
    ...fallback,
    ...slide,
    media: slide.media,
    title: slide.title || fallback.title,
    subtitle: slide.subtitle || fallback.subtitle,
    date: slide.date || fallback.date,
    backgroundColor: slide.backgroundColor || fallback.backgroundColor,
    cta: slide.cta || fallback.cta,
  }));
};
