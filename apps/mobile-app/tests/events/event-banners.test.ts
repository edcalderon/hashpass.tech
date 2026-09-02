import {
  getEventBannerSlides,
  localizeEventBannerSlide,
  shouldShowEventBannerCountdown,
} from "../../lib/event-banners";
import {
  getEventBannerCtaLayout,
  resolveEventBannerCtaPosition,
} from "../../lib/banner-cta";
import type { EventInfo } from "../../lib/event-detector";

const event = {
  id: "clf",
  title: "Cripto Latin Fest 2026",
  subtitle: "Maloka, Bogotá",
  image: "https://example.test/clf.jpg",
  color: "#046BD2",
  eventDateString: "August 27-28, 2026",
  available: true,
} as EventInfo;

describe("event banner slides", () => {
  it("keeps the landing countdown for upcoming campaign video and image slides", () => {
    const now = Date.parse("2026-09-02T00:00:00Z");

    expect(
      shouldShowEventBannerCountdown("2026-12-11T09:00:00-05:00", now),
    ).toBe(true);
    expect(
      shouldShowEventBannerCountdown("2026-09-01T09:00:00-05:00", now),
    ).toBe(false);
    expect(shouldShowEventBannerCountdown(undefined, now)).toBe(false);
  });

  it("uses bottom-right as the default CTA placement with explicit overrides", () => {
    expect(resolveEventBannerCtaPosition()).toBe("bottom-right");
    expect(getEventBannerCtaLayout()).toEqual({
      position: "absolute",
      right: 20,
      bottom: 20,
    });
    expect(getEventBannerCtaLayout("top-left")).toEqual({
      position: "absolute",
      left: 20,
      top: 20,
    });
    expect(resolveEventBannerCtaPosition("bottom-left")).toBe("bottom-left");
    expect(
      getEventBannerCtaLayout("bottom-left", { edge: 12, bottom: 18 }),
    ).toEqual({
      position: "absolute",
      left: 12,
      bottom: 18,
    });
    expect(getEventBannerCtaLayout("top-right", { edge: 16, top: 14 })).toEqual(
      {
        position: "absolute",
        right: 16,
        top: 14,
      },
    );
  });

  it("gives every event one static banner when no campaign media is configured", () => {
    expect(getEventBannerSlides(event)).toEqual([
      expect.objectContaining({
        id: "default",
        media: { type: "image", url: "https://example.test/clf.jpg" },
        title: "Cripto Latin Fest 2026",
      }),
    ]);
  });

  it("keeps multiple organizer slides within the same event", () => {
    const slides = getEventBannerSlides({
      ...event,
      bannerSlides: [
        { id: "static", media: { type: "image", url: "static.jpg" } },
        {
          id: "film",
          media: { type: "video", url: "campaign.mp4" },
          cta: { label: "Watch", url: "/events/clf/home" },
        },
      ],
    });

    expect(slides.map((slide: (typeof slides)[number]) => slide.id)).toEqual([
      "static",
      "film",
    ]);
    expect(slides[1]).toMatchObject({
      media: { type: "video", url: "campaign.mp4" },
      cta: { label: "Watch", url: "/events/clf/home" },
      title: "Cripto Latin Fest 2026",
    });
  });

  it("resolves organizer campaign copy through locale keys", () => {
    const [slide] = getEventBannerSlides({
      ...event,
      bannerSlides: [
        {
          id: "film",
          media: { type: "video", url: "campaign.mp4" },
          eyebrow: "Official film",
          i18n: {
            eyebrow: "explore.rework.clfFilmEyebrow",
            ctaLabel: "explore.rework.clfExplore",
          },
          cta: { label: "Explore", url: "/events/clf/home" },
        },
      ],
    });

    const translations: Record<string, string> = {
      "explore.rework.clfFilmEyebrow": "Película oficial",
      "explore.rework.clfExplore": "Explorar Cripto Latin Fest",
    };
    const localized = localizeEventBannerSlide(
      slide,
      (key: string, fallback: string) => translations[key] || fallback,
    );

    expect(localized.eyebrow).toBe("Película oficial");
    expect(localized.cta?.label).toBe("Explorar Cripto Latin Fest");
  });
});
