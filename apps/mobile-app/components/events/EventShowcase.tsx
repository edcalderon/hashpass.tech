import { ActionButton, Badge } from "@hashpass/ui/primitives";
import { uiTokens, uiPalette } from "@hashpass/ui/tokens";
import React, { useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  AppState,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useTheme } from "../../hooks/useTheme";
import { useTranslation } from "../../i18n/i18n";
import { useAnimationLevel } from "../../contexts/AnimationLevelContext";
import { type EventInfo } from "../../lib/event-detector";
import { filterPublicEvents, publicEventStatus } from "../../lib/public-events";
import {
  getEventBannerSlides,
  localizeEventBannerSlide,
  type ResolvedEventBannerSlide,
} from "../../lib/event-banners";
import { resolveEventImageSource } from "../../lib/event-branding";
import EventBannerBackgroundVideo from "../EventBannerBackgroundVideo";

function EventImage({
  source,
  hero = false,
}: {
  source?: string;
  hero?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [source]);
  return source && !failed ? (
    <Image
      source={resolveEventImageSource(source)}
      resizeMode={hero ? "contain" : "cover"}
      onError={() => setFailed(true)}
      style={hero ? styles.heroImage : StyleSheet.absoluteFillObject}
      accessible={false}
    />
  ) : null;
}
export default function EventShowcase({
  events,
  onSelectEvent,
  active = true,
  includePast = false,
}: {
  active?: boolean;
  includePast?: boolean;
  events: EventInfo[];
  onSelectEvent: (event: EventInfo) => void;
}) {
  const frame = useRef<View>(null);
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    if (
      Platform.OS !== "web" ||
      typeof IntersectionObserver === "undefined" ||
      !frame.current
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0]?.isIntersecting ?? false),
      { threshold: 0.05 },
    );
    observer.observe(frame.current as unknown as Element);
    return () => observer.disconnect();
  }, []);
  const { isDark } = useTheme();
  const { t } = useTranslation("publicEvents");
  const { t: translate } = useTranslation();
  const { animationLevel } = useAnimationLevel();
  const [now, setNow] = useState(Date.now());
  const [slideIndex, setSlideIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState !== "background",
  );
  const [reduceMotion, setReduceMotion] = useState(true);
  const catalog: EventInfo[] = filterPublicEvents(events, {}, now);
  const featured: EventInfo[] = catalog
    .filter(
      (event) =>
        includePast ||
        ["live", "upcoming"].includes(publicEventStatus(event, now)),
    )
    .slice(0, 5);
  const slides: Array<{ event: EventInfo; slide: ResolvedEventBannerSlide }> = featured.flatMap((event) =>
    getEventBannerSlides(event).map((slide: ResolvedEventBannerSlide) => ({
      event,
      slide,
    })),
  );
  const slidesKey = slides
    .map((item) => `${item.event.id}:${item.slide.id}`)
    .join("|");
  const selected = slides[slideIndex % Math.max(1, slides.length)];
  const banner = selected
    ? localizeEventBannerSlide(selected.slide, translate)
    : null;
  // Public discovery is often the first native screen opened after a cold
  // launch. Keep it independent of the native video surface: a remote event
  // film can fail while the player is allocating/decoding and take the whole
  // Android activity with it. Web keeps the organizer film; native shows the
  // event's supplied poster on the same slide instead.
  const playBannerVideo =
    Platform.OS === "web" && banner?.media.type === "video";
  const playing =
    visible &&
    active &&
    !paused &&
    !focused &&
    !hovered &&
    foreground &&
    !reduceMotion &&
    animationLevel === "full";
  useEffect(() => {
    setSlideIndex(0);
  }, [slidesKey]);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (active) setReduceMotion(value);
      })
      .catch(() => {});
    const preference = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotion,
    );
    const app = AppState.addEventListener("change", (state) =>
      setForeground(state === "active"),
    );
    const visibility = () =>
      setForeground(document.visibilityState === "visible");
    if (Platform.OS === "web" && typeof document !== "undefined") {
      visibility();
      document.addEventListener("visibilitychange", visibility);
    }
    const clock = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      active = false;
      clearInterval(clock);
      preference.remove();
      app.remove();
      if (Platform.OS === "web" && typeof document !== "undefined")
        document.removeEventListener("visibilitychange", visibility);
    };
  }, []);
  useEffect(() => {
    if (!playing || slides.length < 2) return;
    const timer = setTimeout(
      () => setSlideIndex((index) => (index + 1) % slides.length),
      9000,
    );
    return () => clearTimeout(timer);
  }, [playing, slideIndex, slides.length, slidesKey]);
  const palette = {
    ...uiPalette(isDark),
    background: uiPalette(isDark).canvas,
  };
  const action = (name: string, primary: boolean, onPress: () => void) => (
    <ActionButton
      mode={isDark ? "dark" : "light"}
      label={name}
      variant={primary ? "primary" : "secondary"}
      onPress={onPress}
    />
  );

  const open = onSelectEvent;
  return (
    <View ref={frame}>
      {selected && banner && (
        <View
          style={[
            styles.hero,
            { borderColor: palette.border, backgroundColor: palette.surface },
          ]}
          onAccessibilityEscape={() => setPaused(true)}
          {...(Platform.OS === "web"
            ? {
                onFocusCapture: () => setFocused(true),
                onBlurCapture: () => setFocused(false),
                onPointerEnter: () => setHovered(true),
                onPointerLeave: () => setHovered(false),
              }
            : {})}
        >
          <View
            style={[
              styles.heroMedia,
              {
                backgroundColor: banner.backgroundColor || selected.event.color,
              },
            ]}
          >
            {playBannerVideo &&
            visible &&
            active &&
            !paused &&
            foreground &&
            !reduceMotion &&
            animationLevel === "full" ? (
              <EventBannerBackgroundVideo
                key={banner.media.url}
                source={banner.media.url!}
                loadingLabel={t("loadingFilm", "Loading event film")}
              />
            ) : (
              <EventImage
                source={
                  banner.media.type === "image"
                    ? banner.media.url
                    : selected.event.image
                }
                hero
              />
            )}
          </View>
          <View style={styles.heroCopy}>
            <Badge mode={isDark ? "dark" : "light"}>
              {t(publicEventStatus(selected.event, now), "Upcoming")}
            </Badge>
            <Text
              accessibilityRole="header"
              style={[styles.heroTitle, { color: palette.text }]}
            >
              {banner.title}
            </Text>
            <Text style={{ color: palette.muted, lineHeight: 23 }}>
              {banner.date}
            </Text>
            {!!banner.subtitle && (
              <Text style={{ color: palette.muted, lineHeight: 23 }}>
                {banner.subtitle}
              </Text>
            )}
            <View style={styles.row}>
              {action(t("viewEvent", "Explore event"), true, () =>
                open(selected.event),
              )}
              {slides.length > 1 && (
                <>
                  {action(t("previous", "Previous"), false, () => {
                    setPaused(true);
                    setSlideIndex(
                      (index) => (index - 1 + slides.length) % slides.length,
                    );
                  })}
                  {action(t("next", "Next"), false, () => {
                    setPaused(true);
                    setSlideIndex((index) => (index + 1) % slides.length);
                  })}
                </>
              )}
              {animationLevel === "full" &&
                !reduceMotion &&
                action(
                  paused
                    ? t("play", "Play showcase")
                    : t("pause", "Pause showcase"),
                  false,
                  () => setPaused((value) => !value),
                )}
            </View>
            <Text style={{ color: palette.muted }}>
              {(slideIndex % slides.length) + 1} / {slides.length}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  hero: {
    borderWidth: 1,
    borderRadius: uiTokens.radius.card,
    overflow: "hidden",
  },
  heroMedia: { height: 280, position: "relative", overflow: "hidden" },
  heroImage: { width: "100%", height: "100%" },
  heroCopy: { padding: 24, gap: 14 },
  heroTitle: {
    fontSize: 28,
    lineHeight: 34,
    letterSpacing: -0.6,
    fontWeight: "700",
  },
});
