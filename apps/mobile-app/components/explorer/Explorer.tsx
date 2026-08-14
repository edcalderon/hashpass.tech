import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { NativeSafeIcon } from "../../lib/vector-icons";
import { useTheme } from "../../hooks/useTheme";
import { useRouter } from "expo-router";
import { useTranslation } from "../../i18n/i18n";
import PassesDisplay from "../PassesDisplay";
import { getEventQuickAccessItems } from "../../lib/event-detector";
import { resolveEventImageSource } from "../../lib/event-branding";
import {
  getEventChatAvatarUrl,
  loadEventChatPresence,
  type EventChatPresence,
} from "../../lib/event-chat";
import {
  loadExplorerBookmarks,
  saveExplorerBookmarks,
} from "../../lib/explorer-bookmarks";
import type { EventInfo } from "../../lib/event-detector";
import type { EventPassInfo } from "../../lib/pass-system";
import {
  EXPLORER_HERO_LAYOUT,
  filterExplorerEvents,
  getActiveFilterCount,
  getEventRoomTarget,
  getExplorerEventStatus,
  getExplorerHeroActionTarget,
  getExplorerLayout,
  getExplorerScopeLabel,
  sortExplorerEvents,
  type ExplorerEvent,
  type ExplorerLayoutMode,
} from "./explorer";

interface ExplorerProps {
  events: EventInfo[];
  selectedEvent: EventInfo | null;
  onSelectEvent: (event: EventInfo) => void;
  isLoggedIn: boolean;
  dbUserId?: string | null;
  isLoading?: boolean;
  isGlobalExplorer: boolean;
}

type HeroSlide = {
  eyebrow: string;
  title: string;
  subtitle: string;
  tone: string;
  action?: string;
};

const HERO_SLIDES: HeroSlide[] = [
  {
    eyebrow: "NEXT UP",
    title: "Blockchain Summit Latam Colombia 2026",
    subtitle: "November 5–6, 2026 · Bogotá, Colombia",
    tone: "#B88A14",
    action: "Get your pass",
  },
  {
    eyebrow: "BSL ON TOUR",
    title: "Three cities. One connected community.",
    subtitle: "Peru and Chile are archived. Colombia is next.",
    tone: "#4B3B5D",
    action: "Explore the tour",
  },
  {
    eyebrow: "HASHPASS EVENTS",
    title: "Discover what is next",
    subtitle:
      "One global explorer for every summit, stop, and community moment.",
    tone: "#5552E8",
  },
  {
    eyebrow: "OFFICIAL PARTNERS",
    title: "Built with the people moving the ecosystem forward.",
    subtitle: "Sponsors and community partners make every stop possible.",
    tone: "#18212D",
  },
];

const FILTER_SERIES = [
  "BSL On Tour",
  "Summit",
  "Meetup",
  "Hackathon",
  "Workshop",
];

const FILTER_CITIES = [
  ["Lima", "lima"],
  ["Santiago", "santiago"],
  ["Bogotá", "bogota"],
  ["Medellín", "medellin"],
  ["CDMX", "cdmx"],
  ["Buenos Aires", "buenos-aires"],
  ["São Paulo", "sao-paulo"],
] as const;

const toExplorerEvent = (event: EventInfo): ExplorerEvent => ({
  id: event.id,
  title: event.title,
  subtitle: event.subtitle,
  eventDateString: event.eventDateString,
  eventStartDate: event.eventStartDate,
  eventEndDate: event.eventEndDate,
  country: event.geo?.country,
  city: event.tour?.city,
  cityKey:
    event.tour?.city?.toLocaleLowerCase().replace(/[^a-z]+/g, "-") || "all",
  series: event.series || (event.id === "bsl" ? "BSL On Tour" : "Summit"),
  continent: event.geo?.continent,
  color: event.color,
  tourRole: event.tour?.role,
  image: event.image,
});

const resolveExplorerIconName = (name: string) => {
  const aliases = {
    search: "search",
    tune: "filter",
    "filter-list": "filter",
    view_agenda: "list",
    apps: "grid",
    view_carousel: "rail",
    "unfold-more": "sort",
    bookmark: "bookmark",
    "bookmark-border": "bookmark",
    "bookmark-added": "bookmark-filled",
    "search-off": "search-off",
    "arrow-upward": "arrow-up",
    "arrow-back": "arrow-left",
    event: "event",
    people: "people",
    info: "info",
  } as const;
  return aliases[name as keyof typeof aliases] || "info";
};

const Icon = ({
  name,
  color,
  size = 22,
}: {
  name: string;
  color: string;
  size?: number;
}) => (
  <NativeSafeIcon
    name={resolveExplorerIconName(name)}
    size={size}
    color={color}
  />
);

export default function Explorer({
  events,
  selectedEvent,
  onSelectEvent,
  isLoggedIn,
  dbUserId = null,
  isLoading = false,
  isGlobalExplorer,
}: ExplorerProps) {
  const { isDark, colors } = useTheme();
  const router = useRouter();
  const styles = getStyles(isDark, colors);
  const { t: translate } = useTranslation();
  const [heroIndex, setHeroIndex] = useState(2);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState<"All" | "Upcoming" | "Past">(
    "All",
  );
  const [filterFromDate, setFilterFromDate] = useState("");
  const [filterToDate, setFilterToDate] = useState("");
  const [filterSeries, setFilterSeries] = useState<string[]>([]);
  const [filterCity, setFilterCity] = useState("all");
  const [onlyPasses, setOnlyPasses] = useState(false);
  const [sortBy, setSortBy] = useState<"date" | "name">("date");
  const [mode, setMode] = useState<ExplorerLayoutMode>("list");
  const [visibleCount, setVisibleCount] = useState(8);
  const [loadingMore, setLoadingMore] = useState(false);
  const [bookmarkedEventIds, setBookmarkedEventIds] = useState<string[]>([]);
  const [passEventIds, setPassEventIds] = useState<string[]>([]);
  const [roomPresenceByEventId, setRoomPresenceByEventId] = useState<
    Record<string, EventChatPresence>
  >({});
  const [showBackToTop, setShowBackToTop] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const loadMoreTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let mounted = true;
    loadExplorerBookmarks().then((ids: string[]) => {
      if (mounted) setBookmarkedEventIds(ids);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!dbUserId) {
      setPassEventIds([]);
      return;
    }

    let mounted = true;
    // Keep pass loading lazy: the Explorer can render for signed-out users
    // without initializing the pass/auth client bundle.
    import("../../lib/pass-system")
      .then((module) =>
        (
          module as unknown as {
            default: {
              getAllUserPasses: (userId: string) => Promise<EventPassInfo[]>;
            };
          }
        ).default.getAllUserPasses(dbUserId),
      )
      .then((passes: EventPassInfo[]) => {
        if (mounted) setPassEventIds(passes.map((pass) => pass.event_id));
      })
      .catch(() => {
        if (mounted) setPassEventIds([]);
      });

    return () => {
      mounted = false;
    };
  }, [dbUserId]);

  useEffect(() => {
    const passIds = new Set(passEventIds);
    const eligibleEventIds: string[] = [];
    for (const event of events) {
      if (passIds.has(event.id)) eligibleEventIds.push(event.id);
    }
    if (!dbUserId || !eligibleEventIds.length) {
      setRoomPresenceByEventId({});
      return;
    }

    let mounted = true;
    const refreshPresence = () => {
      Promise.all(
        eligibleEventIds.map(async (eventId) => {
          try {
            return [eventId, await loadEventChatPresence(eventId)] as const;
          } catch {
            return null;
          }
        }),
      ).then((entries) => {
        if (!mounted) return;
        setRoomPresenceByEventId(
          Object.fromEntries(
            entries.filter(
              (entry): entry is readonly [string, EventChatPresence] =>
                Boolean(entry),
            ),
          ),
        );
      });
    };
    refreshPresence();
    const timer = setInterval(refreshPresence, 15_000);

    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [dbUserId, events, passEventIds]);

  const explorerEvents = useMemo(() => {
    const passIds = new Set(passEventIds);
    return events.map((event) => {
      const explorerEvent = toExplorerEvent(event);
      const hasPass =
        passIds.has(event.id) || (event.id === "bsl" && passIds.size > 0);
      return { ...explorerEvent, hasPass };
    });
  }, [events, passEventIds]);
  // Keep the lower wallet/quick-access context aligned with the next dated
  // stop. The event catalog is ordered by tour role, not by date, so using
  // events[0] here selected Peru even after it had ended.
  const activeEvent =
    selectedEvent ||
    events.find(
      (event) =>
        event.tour?.role === "stop" &&
        getExplorerEventStatus(event) === "upcoming",
    ) ||
    events[0] ||
    null;
  const filteredEvents = useMemo(
    () =>
      filterExplorerEvents(explorerEvents, {
        query,
        status: filterStatus,
        fromDate: filterFromDate,
        toDate: filterToDate,
        series: filterSeries,
        cityKey: filterCity,
        onlyPasses,
      }),
    [
      explorerEvents,
      filterCity,
      filterFromDate,
      filterSeries,
      filterStatus,
      filterToDate,
      onlyPasses,
      query,
    ],
  );
  const sortedEvents = useMemo(
    () => sortExplorerEvents(filteredEvents, bookmarkedEventIds, sortBy),
    [bookmarkedEventIds, filteredEvents, sortBy],
  );
  const visibleEvents = sortedEvents.slice(0, visibleCount);
  const hasMore = visibleEvents.length < filteredEvents.length;
  const activeFilterCount = getActiveFilterCount({
    query,
    status: filterStatus,
    fromDate: filterFromDate,
    toDate: filterToDate,
    series: filterSeries,
    cityKey: filterCity,
    onlyPasses,
    sortBy,
  });
  const selectedExplorerEvent = activeEvent
    ? toExplorerEvent(activeEvent)
    : null;
  const layout = getExplorerLayout(mode);

  useEffect(() => {
    // The rotating hero slides (Colombia/BSL On Tour/etc.) only apply to the
    // global explorer -- a single-tenant whitelabel domain renders one
    // static hero built from its own event instead (see renderHero below),
    // so there's nothing to rotate there.
    const timer = isGlobalExplorer
      ? setInterval(() => {
          setHeroIndex((current) => (current + 1) % HERO_SLIDES.length);
        }, 5000)
      : null;

    return () => {
      if (timer) clearInterval(timer);
      if (loadMoreTimerRef.current) clearTimeout(loadMoreTimerRef.current);
    };
  }, [isGlobalExplorer]);

  const handleScroll = (
    event: NativeSyntheticEvent<NativeScrollEvent>,
    axis: "vertical" | "horizontal" = "vertical",
  ) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (axis === "vertical") {
      setShowBackToTop(contentOffset.y > 120);
    }
    const offset = axis === "horizontal" ? contentOffset.x : contentOffset.y;
    const viewport =
      axis === "horizontal"
        ? layoutMeasurement.width
        : layoutMeasurement.height;
    const contentLength =
      axis === "horizontal" ? contentSize.width : contentSize.height;
    const threshold = axis === "horizontal" ? 180 : 520;

    if (
      hasMore &&
      !loadingMore &&
      contentLength > viewport &&
      offset + viewport >= contentLength - threshold
    ) {
      setLoadingMore(true);
      loadMoreTimerRef.current = setTimeout(() => {
        setVisibleCount((current) => current + 8);
        setLoadingMore(false);
        loadMoreTimerRef.current = null;
      }, 450);
    }
  };

  const handleSearch = (value: string) => {
    setQuery(value);
    setVisibleCount(8);
    setSearchOpen(true);
  };

  const clearFilters = () => {
    setQuery("");
    setFilterStatus("All");
    setFilterFromDate("");
    setFilterToDate("");
    setFilterSeries([]);
    setFilterCity("all");
    setOnlyPasses(false);
    setSortBy("date");
    setVisibleCount(8);
    setFilterSheetOpen(false);
  };

  const toggleBookmark = (eventId: string) => {
    const nextIds = bookmarkedEventIds.includes(eventId)
      ? bookmarkedEventIds.filter((id) => id !== eventId)
      : [eventId, ...bookmarkedEventIds];
    setBookmarkedEventIds(nextIds);
    saveExplorerBookmarks(nextIds).catch(() => {});
  };

  const selectEvent = (id: string) => {
    const event = events.find((item) => item.id === id);
    if (event) onSelectEvent(event);
  };

  const handleHeroAction = (action: string) => {
    const target = getExplorerHeroActionTarget(action);
    if (!target) return;
    router.push(target.route as any);
    if (target.eventId) selectEvent(target.eventId);
  };

  const openEventRoom = (event: ExplorerEvent) => {
    // Let the room screen show its rules/name modal before making the
    // protected entitlement request. The backend remains the source of truth
    // after the user explicitly chooses to enter.
    router.push(getEventRoomTarget(event.id) as any);
  };

  const renderHero = () => {
    // Single-tenant whitelabel domains (e.g. demo-criptolatinfest.hashpass.tech)
    // get a static hero built from their own event -- never the hardcoded
    // Colombia/BSL On Tour/partners slides below, which are global-explorer
    // only (confirmed live bug: those rendered on every tenant regardless).
    if (!isGlobalExplorer) {
      const heroEvent = selectedEvent || events[0];
      if (!heroEvent) return null;

      return (
        <View style={[styles.hero, { backgroundColor: heroEvent.color || "#18212D" }]}>
          <View style={styles.heroTexture} />
          <View style={styles.heroScrim} />
          <View style={styles.heroContent}>
            <View style={styles.heroEyebrow}>
              <View style={styles.liveDot} />
              <Text style={styles.heroEyebrowText}>
                {translate("explore.rework.heroFeatured", "FEATURED EVENT")}
              </Text>
            </View>
            <Text style={styles.heroTitle}>{heroEvent.title}</Text>
            <Text style={styles.heroSubtitle}>
              {heroEvent.subtitle || heroEvent.eventDateString || ""}
            </Text>
          </View>
        </View>
      );
    }

    const hero = HERO_SLIDES[heroIndex];
    const localizedHero = [
      {
        eyebrow: translate("explore.rework.heroNextUp", "NEXT UP"),
        title: translate(
          "explore.rework.heroNextTitle",
          "Blockchain Summit Latam Colombia 2026",
        ),
        subtitle: translate(
          "explore.rework.heroNextSubtitle",
          "November 5–6, 2026 · Bogotá, Colombia",
        ),
        action: translate("explore.rework.heroGetPass", "Get your pass"),
      },
      {
        eyebrow: translate("explore.rework.heroTour", "BSL ON TOUR"),
        title: translate(
          "explore.rework.heroTourTitle",
          "Three cities. One connected community.",
        ),
        subtitle: translate(
          "explore.rework.heroTourSubtitle",
          "Peru and Chile are archived. Colombia is next.",
        ),
        action: translate("explore.rework.heroExploreTour", "Explore the tour"),
      },
      {
        eyebrow: translate("explore.rework.heroEvents", "HASHPASS EVENTS"),
        title: translate(
          "explore.rework.heroEventsTitle",
          "Discover what is next",
        ),
        subtitle: translate(
          "explore.rework.heroEventsSubtitle",
          "One global explorer for every summit, stop, and community moment.",
        ),
      },
      {
        eyebrow: translate("explore.rework.heroPartners", "OFFICIAL PARTNERS"),
        title: translate(
          "explore.rework.heroPartnersTitle",
          "Built with the people moving the ecosystem forward.",
        ),
        subtitle: translate(
          "explore.rework.heroPartnersSubtitle",
          "Sponsors and community partners make every stop possible.",
        ),
      },
    ][heroIndex];
    const localizedSlide = { ...hero, ...localizedHero };

    return (
      <View style={[styles.hero, { backgroundColor: hero.tone }]}>
        <View style={styles.heroTexture} />
        <View style={styles.heroScrim} />
        <View style={styles.heroContent}>
          <View style={styles.heroEyebrow}>
            <View style={styles.liveDot} />
            <Text style={styles.heroEyebrowText}>{localizedSlide.eyebrow}</Text>
          </View>
          <Text style={styles.heroTitle}>{localizedSlide.title}</Text>
          <Text style={styles.heroSubtitle}>{localizedSlide.subtitle}</Text>
          {localizedSlide.action && (
            <TouchableOpacity
              style={styles.heroAction}
              onPress={() => handleHeroAction(hero.action || "")}
              accessibilityRole="button"
            >
              <Text style={styles.heroActionText}>{localizedSlide.action}</Text>
            </TouchableOpacity>
          )}
        </View>
        <View
          style={styles.heroProgress}
          accessibilityLabel={translate(
            "explore.rework.heroSlides",
            "Hero slides",
          )}
        >
          {HERO_SLIDES.map((slide, index) => (
            <TouchableOpacity
              key={slide.eyebrow}
              accessibilityRole="button"
              accessibilityLabel={`${translate("explore.rework.show", "Show")} ${slide.eyebrow.toLowerCase()}`}
              style={styles.heroProgressTrack}
              onPress={() => setHeroIndex(index)}
            >
              <View
                style={[
                  styles.heroProgressFill,
                  index === heroIndex && styles.heroProgressActive,
                ]}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  const renderSearchBar = () => (
    <View style={styles.toolbar}>
      <View style={styles.toolbarRow}>
        <TouchableOpacity
          style={styles.searchField}
          onPress={() => setSearchOpen(true)}
          accessibilityRole="search"
        >
          <Icon name="search" color={colors.text.secondary} size={21} />
          <TextInput
            value={query}
            onChangeText={handleSearch}
            onFocus={() => setSearchOpen(true)}
            placeholder={translate(
              "explore.rework.search",
              "Search events, cities, series",
            )}
            placeholderTextColor={colors.text.secondary}
            style={styles.searchInput}
            returnKeyType="search"
            accessibilityLabel={translate(
              "explore.rework.searchEvents",
              "Search events",
            )}
          />
          {query.length > 0 && (
            <TouchableOpacity
              onPress={() => setQuery("")}
              accessibilityLabel={translate(
                "explore.rework.clearSearch",
                "Clear search",
              )}
            >
              <Text style={styles.clearSearch}>×</Text>
            </TouchableOpacity>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.filterButton}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={translate(
            "explore.rework.openFilters",
            "Open filters",
          )}
        >
          <Icon name="tune" color={colors.primary} size={22} />
          {activeFilterCount > 0 && (
            <Text style={styles.filterBadge}>{activeFilterCount}</Text>
          )}
        </TouchableOpacity>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {[
          {
            label: translate("explore.rework.all", "All events"),
            active: filterStatus === "All" && !query,
            onPress: clearFilters,
          },
          {
            label: translate("explore.rework.upcoming", "Upcoming"),
            active: filterStatus === "Upcoming",
            onPress: () => {
              setFilterStatus("Upcoming");
              setVisibleCount(8);
            },
          },
          {
            label: translate("explore.rework.cities", "Cities"),
            active: false,
            onPress: () => setFilterSheetOpen(true),
          },
          {
            label: translate("explore.rework.series", "Series"),
            active: false,
            onPress: () => setFilterSheetOpen(true),
          },
        ].map((chip) => (
          <TouchableOpacity
            key={chip.label}
            style={[styles.chip, chip.active && styles.chipActive]}
            onPress={chip.onPress}
            accessibilityRole="button"
          >
            <Text
              style={[styles.chipText, chip.active && styles.chipTextActive]}
            >
              {chip.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );

  const renderModeSwitcher = () => (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderCopy}>
        <Text style={styles.sectionTitle}>
          {translate("explore.rework.allEvents", "Explore All Events")}
        </Text>
        <Text style={styles.sectionDescription}>
          {translate(
            "explore.rework.showing",
            "Showing {visible} of {total} events",
            {
              visible: visibleEvents.length,
              total: sortedEvents.length,
            },
          )}{" "}
          {translate("explore.rework.eventsAcross", "events across {scope}", {
            scope: getExplorerScopeLabel(sortedEvents),
          })}
        </Text>
      </View>
      <View style={styles.headerControls}>
        <View
          style={styles.modeSwitcher}
          accessibilityLabel={translate(
            "explore.rework.eventLayout",
            "Event layout",
          )}
        >
          {[
            {
              key: "list" as const,
              icon: "view_agenda",
              label: translate("explore.rework.list", "List"),
            },
            {
              key: "grid" as const,
              icon: "apps",
              label: translate("explore.rework.grid", "3×3 grid"),
            },
            {
              key: "rail" as const,
              icon: "view_carousel",
              label: translate("explore.rework.rail", "Rail"),
            },
          ].map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[
                styles.modeButton,
                mode === item.key && styles.modeButtonActive,
              ]}
              onPress={() => setMode(item.key)}
              accessibilityRole="button"
              accessibilityLabel={`${item.label} layout`}
            >
              <Icon
                name={item.icon}
                color={mode === item.key ? "#fff" : colors.text.secondary}
                size={18}
              />
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity
          style={styles.sortMeta}
          onPress={() => setFilterSheetOpen(true)}
          accessibilityRole="button"
          accessibilityLabel={translate(
            "explore.rework.openFiltersAndSorting",
            "Open event filters and sorting",
          )}
        >
          <Icon name="unfold-more" color={colors.text.secondary} size={18} />
          <Text style={styles.sortMetaText}>
            {translate("explore.rework.sortedBy", "Sorted by {sort}", {
              sort:
                sortBy === "name"
                  ? translate("explore.rework.name", "Name A–Z")
                  : translate("explore.rework.date", "Date"),
            })}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderEventCard = (event: ExplorerEvent) => {
    const selected = selectedExplorerEvent?.id === event.id;
    const archive = getExplorerEventStatus(event) === "past";
    const bookmarked = bookmarkedEventIds.includes(event.id);
    const presence = roomPresenceByEventId[event.id];
    const dateLabel =
      event.eventDateString ||
      translate("explore.rework.dateToBeAnnounced", "Date to be announced");
    const imageSource = resolveEventImageSource(event.image);
    const cardStyle =
      mode === "grid"
        ? styles.gridCard
        : mode === "rail"
          ? styles.railCard
          : styles.listCard;

    return (
      <TouchableOpacity
        key={event.id}
        style={[
          styles.eventCard,
          cardStyle,
          selected && styles.eventCardSelected,
          archive && styles.archiveCard,
        ]}
        onPress={() => selectEvent(event.id)}
        activeOpacity={0.86}
        accessibilityRole="button"
        accessibilityLabel={`Select ${event.title}`}
      >
        <View
          style={[
            styles.eventCover,
            mode !== "list" && styles.wideEventCover,
            {
              height: layout.coverSize,
              backgroundColor: event.color || colors.primary,
            },
          ]}
        >
          {imageSource && (
            <Image
              source={imageSource}
              style={styles.eventCoverImage}
              resizeMode="cover"
            />
          )}
          <View style={styles.eventCoverShade} />
          <Text style={styles.eventCoverMark}>
            {archive
              ? translate("explore.rework.archive", "ARCHIVE")
              : translate("explore.rework.onTour", "BSL ON TOUR")}
          </Text>
          <View style={styles.eventBadge}>
            <Text style={styles.eventBadgeText}>
              {archive
                ? translate("explore.rework.pastEvent", "PAST EVENT")
                : translate("explore.rework.onTour", "BSL ON TOUR")}
            </Text>
          </View>
          <TouchableOpacity
            style={[
              styles.bookmarkButton,
              bookmarked && styles.bookmarkButtonActive,
            ]}
            onPress={() => toggleBookmark(event.id)}
            accessibilityRole="button"
            accessibilityLabel={`${
              bookmarkedEventIds.includes(event.id)
                ? translate("explore.rework.removeBookmark", "Remove bookmark")
                : translate("explore.rework.bookmark", "Bookmark")
            } ${event.title}`}
          >
            <Icon
              name={bookmarked ? "bookmark" : "bookmark-border"}
              color="#fff"
              size={19}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.eventBody}>
          <Text style={styles.eventTitle} numberOfLines={2}>
            {event.title}
          </Text>
          <Text style={styles.eventMeta} numberOfLines={1}>
            {dateLabel}
          </Text>
          <Text style={styles.eventCity} numberOfLines={1}>
            {event.subtitle}
          </Text>
          {mode !== "grid" && (
            <TouchableOpacity
              style={styles.eventFooter}
              onPress={() => openEventRoom(event)}
              accessibilityRole="button"
              accessibilityLabel={`Join the room for ${event.title}`}
            >
              <View
                style={styles.attendeeDots}
                accessibilityLabel="Event room attendees"
              >
                {(presence?.avatarUrls || []).map(
                  (avatarUrl: string | null, index: number) => (
                    <Image
                      key={avatarUrl || event.id}
                      source={{
                        uri:
                          avatarUrl ||
                          getEventChatAvatarUrl({
                            senderId: `${event.id}-attendee-${index}`,
                          }),
                      }}
                      style={[
                        styles.attendeeAvatar,
                        index > 0 && styles.attendeeDotOffset,
                      ]}
                      accessibilityIgnoresInvertColors
                    />
                  ),
                )}
              </View>
              <Text style={styles.attendeeText}>
                {presence
                  ? presence.peopleCount === 0
                    ? translate(
                        "eventChat.zeroPeopleInRoom",
                        "0 people in room",
                      )
                    : translate(
                        "eventChat.peopleInRoom",
                        "{count} people in room",
                        { count: presence.peopleCount },
                      )
                  : translate("eventChat.joinRoom", "Join the room")}
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const renderEvents = () => {
    if (isLoading) {
      return (
        <View
          style={styles.eventList}
          accessibilityLabel={translate(
            "explore.rework.loadingEvents",
            "Loading events",
          )}
        >
          {[0, 1, 2].map((index) => (
            <View
              key={index}
              style={[
                styles.skeletonCard,
                mode === "grid" && styles.skeletonGrid,
              ]}
            />
          ))}
        </View>
      );
    }

    if (visibleEvents.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyMark}>
            <Icon name="search-off" color={colors.primary} size={28} />
          </View>
          <Text style={styles.emptyTitle}>
            {query
              ? `${translate("explore.rework.noEventsMatch", "No events match “{query}”", { query })}`
              : translate(
                  "explore.rework.noEvents",
                  "No events are available yet",
                )}
          </Text>
          <Text style={styles.emptyDescription}>
            {translate(
              "explore.rework.noEventsHint",
              "Try a different city, clear a filter, or browse the full tour.",
            )}
          </Text>
          <TouchableOpacity
            style={styles.emptyAction}
            onPress={clearFilters}
            accessibilityRole="button"
          >
            <Text style={styles.emptyActionText}>
              {translate("explore.rework.clearAllFilters", "Clear all filters")}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (mode === "rail") {
      return (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.railList}
          snapToInterval={layout.cardWidth + layout.gap}
          decelerationRate="fast"
          onScroll={(event) => handleScroll(event, "horizontal")}
          scrollEventThrottle={16}
        >
          {visibleEvents.map(renderEventCard)}
        </ScrollView>
      );
    }

    return (
      <View style={[styles.eventList, mode === "grid" && styles.gridList]}>
        {visibleEvents.map(renderEventCard)}
      </View>
    );
  };

  const renderQuickAccess = () => {
    if (!activeEvent) return null;
    const items = getEventQuickAccessItems(activeEvent.id) as {
      id: string;
      title: string;
      subtitle?: string;
      icon: string;
      color: string;
      route: string;
    }[];

    return (
      <View style={styles.quickSection}>
        <View style={styles.quickHeader}>
          <View>
            <Text style={styles.sectionTitle}>
              {translate("explore.quickAccess", "Quick Access")}
            </Text>
            <Text style={styles.quickSubtitle}>
              {translate("explore.quickAccess.forEvent", "For")}{" "}
              {activeEvent.title}
            </Text>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.quickRail}
        >
          {items.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.quickCard}
              onPress={() => router.push(item.route as any)}
              accessibilityRole="button"
              accessibilityLabel={item.title}
            >
              <View
                style={[
                  styles.quickIcon,
                  { backgroundColor: `${item.color}20` },
                ]}
              >
                <Icon name={item.icon} color={item.color} size={22} />
              </View>
              <Text style={styles.quickTitle} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.quickBody} numberOfLines={2}>
                {item.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  };

  const recentQueries = ["Bogotá", "BSL On Tour", "Santiago"];

  return (
    <View style={styles.container}>
      <ScrollView
        ref={scrollRef}
        style={styles.scrollView}
        contentContainerStyle={styles.content}
        stickyHeaderIndices={[1]}
        showsVerticalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
      >
        {renderHero()}
        {renderSearchBar()}
        <View style={styles.resultsSection}>
          {renderModeSwitcher()}
          {renderEvents()}
          {loadingMore && (
            <View style={styles.loadingMore}>
              <View style={styles.loadingDot} />
              <View style={styles.loadingDot} />
              <View style={styles.loadingDot} />
              <Text style={styles.loadingMoreText}>
                {translate("explore.rework.loadingMore", "Loading more events")}
              </Text>
            </View>
          )}
          {!hasMore && visibleEvents.length > 0 && (
            <Text style={styles.endLine}>
              {translate("explore.rework.allCaughtUp", "You’re all caught up.")}
            </Text>
          )}
        </View>
        {isLoggedIn && (
          <View style={styles.passesSection}>
            <Text style={styles.sectionTitle}>
              {translate("explore.rework.yourPasses", "Your Passes")}
            </Text>
            <PassesDisplay
              mode="dashboard"
              showTitle={false}
              showPassComparison={false}
              walletLayout={isGlobalExplorer ? "stacked" : "plain"}
            />
          </View>
        )}
        {renderQuickAccess()}
      </ScrollView>

      {showBackToTop && (
        <TouchableOpacity
          style={styles.toTop}
          onPress={() => {
            setShowBackToTop(false);
            scrollRef.current?.scrollTo({ y: 0, animated: true });
          }}
          accessibilityRole="button"
          accessibilityLabel={translate(
            "explore.rework.scrollToTop",
            "Scroll to top",
          )}
        >
          <Icon name="arrow-upward" color="#fff" size={22} />
        </TouchableOpacity>
      )}

      <Modal
        visible={searchOpen}
        animationType="slide"
        onRequestClose={() => setSearchOpen(false)}
      >
        <View style={styles.searchLayer}>
          <View style={styles.searchLayerTop}>
            <TouchableOpacity
              onPress={() => setSearchOpen(false)}
              accessibilityLabel={translate(
                "explore.rework.closeSearch",
                "Close search",
              )}
            >
              <Icon name="arrow-back" color={colors.text.primary} size={24} />
            </TouchableOpacity>
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={translate(
                "explore.rework.search",
                "Search events, cities, series",
              )}
              placeholderTextColor={colors.text.secondary}
              style={styles.searchLayerInput}
              accessibilityLabel={translate(
                "explore.rework.searchEvents",
                "Search events",
              )}
            />
          </View>
          <View style={styles.searchLayerBody}>
            <Text style={styles.searchLabel}>
              {translate("explore.rework.recent", "Recent")}
            </Text>
            <View style={styles.searchPills}>
              {recentQueries.map((recent) => (
                <TouchableOpacity
                  key={recent}
                  style={styles.searchPill}
                  onPress={() => {
                    setQuery(recent);
                    setSearchOpen(false);
                  }}
                >
                  <Text style={styles.searchPillText}>{recent}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={[styles.searchLabel, styles.searchSuggestionsLabel]}>
              {translate("explore.rework.suggestions", "Suggestions")}
            </Text>
            {events.slice(0, 4).map((event) => (
              <TouchableOpacity
                key={event.id}
                style={styles.suggestion}
                onPress={() => {
                  onSelectEvent(event);
                  setQuery(event.title);
                  setSearchOpen(false);
                }}
              >
                <Icon name="event" color={colors.primary} size={20} />
                <View style={styles.suggestionCopy}>
                  <Text style={styles.suggestionTitle}>{event.title}</Text>
                  <Text style={styles.suggestionMeta}>{event.subtitle}</Text>
                </View>
                <Icon
                  name="north-east"
                  color={colors.text.secondary}
                  size={18}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <Modal
        visible={filterSheetOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setFilterSheetOpen(false)}
      >
        <View style={styles.sheetBackdrop}>
          <TouchableOpacity
            style={styles.sheetDismiss}
            onPress={() => setFilterSheetOpen(false)}
            accessibilityLabel={translate(
              "explore.rework.closeFilters",
              "Close filters",
            )}
          />
          <View style={styles.filterSheet}>
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.filterSheetContent}
            >
              <View style={styles.sheetHandle} />
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>
                  {translate("explore.rework.filters", "Filters")}
                </Text>
                <TouchableOpacity onPress={clearFilters}>
                  <Text style={styles.resetText}>
                    {translate("explore.rework.reset", "Reset")}
                  </Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.sheetLabel}>
                {translate("explore.rework.when", "When")}
              </Text>
              <View style={styles.statusSegmented}>
                {(["All", "Upcoming", "Past"] as const).map((status) => (
                  <TouchableOpacity
                    key={status}
                    style={[
                      styles.statusSegment,
                      filterStatus === status && styles.statusSegmentActive,
                    ]}
                    onPress={() => {
                      setFilterStatus(status);
                      setVisibleCount(8);
                    }}
                  >
                    <Text
                      style={[
                        styles.statusSegmentText,
                        filterStatus === status &&
                          styles.statusSegmentTextActive,
                      ]}
                    >
                      {status === "All"
                        ? translate("explore.rework.all", "All events")
                        : status === "Upcoming"
                          ? translate("explore.rework.upcoming", "Upcoming")
                          : translate("explore.rework.past", "Past")}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.dateRangeRow}>
                <TextInput
                  value={filterFromDate}
                  onChangeText={setFilterFromDate}
                  placeholder={translate(
                    "explore.rework.fromDate",
                    "From · any date",
                  )}
                  placeholderTextColor={colors.text.secondary}
                  style={styles.dateField}
                  accessibilityLabel="Filter from date"
                />
                <TextInput
                  value={filterToDate}
                  onChangeText={setFilterToDate}
                  placeholder={translate(
                    "explore.rework.toDate",
                    "To · any date",
                  )}
                  placeholderTextColor={colors.text.secondary}
                  style={styles.dateField}
                  accessibilityLabel="Filter to date"
                />
              </View>

              <Text style={styles.sheetLabel}>
                {translate("explore.rework.seriesLabel", "Series")}
              </Text>
              <View style={styles.filterPillRow}>
                {FILTER_SERIES.map((series) => {
                  const active = filterSeries.includes(series);
                  return (
                    <TouchableOpacity
                      key={series}
                      style={[
                        styles.filterPill,
                        active && styles.filterPillActive,
                      ]}
                      onPress={() =>
                        setFilterSeries((current) =>
                          active
                            ? current.filter((item) => item !== series)
                            : [...current, series],
                        )
                      }
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          active && styles.filterPillTextActive,
                        ]}
                      >
                        {series}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sheetLabel}>
                {translate("explore.rework.city", "City")}
              </Text>
              <View style={styles.filterPillRow}>
                {FILTER_CITIES.map(([label, key]) => {
                  const active = filterCity === key;
                  return (
                    <TouchableOpacity
                      key={key}
                      style={[
                        styles.filterPill,
                        active && styles.filterPillActive,
                      ]}
                      onPress={() => setFilterCity(active ? "all" : key)}
                    >
                      <Text
                        style={[
                          styles.filterPillText,
                          active && styles.filterPillTextActive,
                        ]}
                      >
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.sheetLabel}>
                {translate("explore.rework.access", "Access")}
              </Text>
              <View style={styles.accessRows}>
                <TouchableOpacity
                  style={styles.accessRow}
                  onPress={() => setOnlyPasses((value) => !value)}
                  accessibilityRole="switch"
                  accessibilityState={{ checked: onlyPasses }}
                >
                  <Text style={styles.accessText}>
                    {translate(
                      "explore.rework.onlyPasses",
                      "Only events I hold a pass for",
                    )}
                  </Text>
                  <View
                    style={[styles.toggle, onlyPasses && styles.toggleActive]}
                  >
                    <View
                      style={[
                        styles.toggleThumb,
                        onlyPasses && styles.toggleThumbActive,
                      ]}
                    />
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={styles.sheetLabel}>
                {translate("explore.rework.sortBy", "Sort by")}
              </Text>
              <View style={styles.sortOptions}>
                {(
                  [
                    ["date", translate("explore.rework.date", "Date")],
                    ["name", translate("explore.rework.name", "Name A–Z")],
                  ] as const
                ).map(([value, label]) => (
                  <TouchableOpacity
                    key={value}
                    style={styles.sortOption}
                    onPress={() => setSortBy(value)}
                  >
                    <Text style={styles.sortOptionText}>{label}</Text>
                    <View
                      style={[
                        styles.radio,
                        sortBy === value && styles.radioActive,
                      ]}
                    >
                      {sortBy === value && <View style={styles.radioDot} />}
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
            <View style={styles.sheetFooter}>
              <TouchableOpacity
                style={styles.applyButton}
                onPress={() => setFilterSheetOpen(false)}
                accessibilityRole="button"
              >
                <Text style={styles.applyButtonText}>
                  Show {filteredEvents.length} events
                  {activeFilterCount ? ` · ${activeFilterCount} filters` : ""}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const getStyles = (isDark: boolean, colors: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background.default },
    scrollView: { flex: 1 },
    content: { paddingBottom: 48 },
    hero: {
      height: EXPLORER_HERO_LAYOUT.height,
      position: "relative",
      overflow: "hidden",
      justifyContent: "flex-start",
    },
    heroTexture: {
      ...StyleSheet.absoluteFillObject,
      opacity: 0.32,
      backgroundImage:
        "repeating-linear-gradient(115deg, rgba(255,255,255,.16) 0 12px, transparent 12px 24px)",
    } as any,
    heroScrim: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(6, 8, 16, .32)",
    },
    heroContent: {
      paddingHorizontal: 20,
      paddingTop: EXPLORER_HERO_LAYOUT.contentTopInset,
      paddingBottom: EXPLORER_HERO_LAYOUT.contentBottomInset,
      gap: 10,
    },
    heroEyebrow: {
      alignSelf: "flex-start",
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      backgroundColor: "rgba(239, 68, 68, .92)",
    },
    liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#fff" },
    heroEyebrowText: {
      color: "#fff",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.4,
    },
    heroTitle: {
      color: "#fff",
      fontSize: 28,
      lineHeight: 33,
      fontWeight: "800",
      maxWidth: 330,
    },
    heroSubtitle: {
      color: "rgba(255,255,255,.76)",
      fontSize: 14,
      lineHeight: 20,
      maxWidth: 330,
    },
    heroAction: {
      alignSelf: "flex-start",
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 18,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    heroActionText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    heroProgress: {
      position: "absolute",
      left: 20,
      right: 20,
      bottom: EXPLORER_HERO_LAYOUT.progressBottomInset,
      flexDirection: "row",
      gap: 6,
    },
    heroProgressTrack: {
      flex: 1,
      height: 4,
      borderRadius: 2,
      overflow: "hidden",
      backgroundColor: "rgba(255,255,255,.28)",
    },
    heroProgressFill: { height: "100%", width: "0%", backgroundColor: "#fff" },
    heroProgressActive: { width: "100%" },
    toolbar: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: 12,
      backgroundColor: isDark ? "rgba(18,18,18,.94)" : "rgba(255,255,255,.94)",
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    toolbarRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    searchField: {
      flex: 1,
      height: 46,
      flexDirection: "row",
      alignItems: "center",
      gap: 9,
      paddingHorizontal: 13,
      borderRadius: 14,
      backgroundColor: colors.background.paper,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    searchInput: {
      flex: 1,
      minWidth: 0,
      color: colors.text.primary,
      fontSize: 14,
      paddingVertical: 0,
    },
    clearSearch: {
      color: colors.text.secondary,
      fontSize: 20,
      paddingHorizontal: 4,
    },
    filterButton: {
      width: 46,
      height: 46,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: isDark ? "rgba(175,13,1,.15)" : "#FFF2F0",
    },
    filterBadge: {
      position: "absolute",
      top: -5,
      right: -5,
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      textAlign: "center",
      color: "#fff",
      backgroundColor: colors.primary,
      fontSize: 10,
      fontWeight: "800",
      lineHeight: 18,
    },
    chipRow: { gap: 8, paddingTop: 11, paddingBottom: 2 },
    chip: {
      height: 34,
      justifyContent: "center",
      paddingHorizontal: 14,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: "transparent",
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    chipText: { color: colors.text.secondary, fontSize: 12, fontWeight: "700" },
    chipTextActive: { color: "#fff" },
    resultsSection: { paddingHorizontal: 16, paddingTop: 20 },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 12,
      marginBottom: 14,
    },
    sectionHeaderCopy: { flex: 1 },
    headerControls: {
      alignItems: "flex-end",
      gap: 8,
    },
    sectionTitle: {
      color: colors.text.primary,
      fontSize: 19,
      lineHeight: 24,
      fontWeight: "800",
    },
    sectionDescription: {
      color: colors.text.secondary,
      fontSize: 13,
      lineHeight: 19,
      marginTop: 5,
    },
    sortMeta: {
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      justifyContent: "flex-end",
    },
    sortMetaText: {
      color: colors.text.secondary,
      fontSize: 12,
      fontWeight: "500",
    },
    modeSwitcher: {
      flexDirection: "row",
      padding: 3,
      gap: 2,
      borderRadius: 11,
      backgroundColor: colors.background.paper,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    modeButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    },
    modeButtonActive: { backgroundColor: colors.primary },
    eventList: { gap: 12 },
    gridList: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
    railList: { gap: 14, paddingBottom: 6 },
    eventCard: {
      overflow: "hidden",
      flexDirection: "row",
      borderRadius: 18,
      borderWidth: 1,
      backgroundColor: colors.background.paper,
      borderColor: colors.divider,
    },
    eventCardSelected: {
      borderColor: colors.primary,
      backgroundColor: isDark ? "rgba(175,13,1,.13)" : "#FFF7F5",
    },
    archiveCard: {
      backgroundColor: isDark ? "#111820" : colors.background.paper,
    },
    listCard: { minHeight: 168 },
    gridCard: {
      width: "31%",
      minHeight: 224,
      flexDirection: "column",
      borderRadius: 14,
    },
    railCard: {
      width: 250,
      minHeight: 280,
      flexDirection: "column",
      borderRadius: 20,
    },
    eventCover: {
      width: 132,
      position: "relative",
      overflow: "hidden",
      justifyContent: "center",
      alignItems: "center",
    },
    wideEventCover: { width: "100%" },
    eventCoverImage: {
      ...StyleSheet.absoluteFillObject,
      width: "100%",
      height: "100%",
      opacity: 0.78,
    },
    eventCoverShade: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: "rgba(0,0,0,.22)",
    },
    eventCoverMark: {
      color: "rgba(255,255,255,.68)",
      fontSize: 10,
      fontWeight: "800",
      letterSpacing: 1.2,
    },
    eventBadge: {
      position: "absolute",
      top: 10,
      left: 9,
      paddingHorizontal: 7,
      paddingVertical: 5,
      borderRadius: 7,
      maxWidth: "88%",
      backgroundColor: "rgba(10, 28, 42, .86)",
    },
    eventBadgeText: {
      color: "#fff",
      fontSize: 8.5,
      fontWeight: "800",
      letterSpacing: 0.5,
    },
    bookmarkButton: {
      position: "absolute",
      top: 8,
      right: 8,
      width: 30,
      height: 30,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(10, 28, 42, .78)",
    },
    bookmarkButtonActive: { backgroundColor: colors.primary },
    eventBody: {
      flex: 1,
      minWidth: 0,
      justifyContent: "center",
      padding: 13,
      gap: 5,
    },
    eventTitle: {
      color: colors.text.primary,
      fontSize: 14,
      lineHeight: 18,
      fontWeight: "800",
    },
    eventMeta: {
      color: colors.primary,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: "700",
    },
    eventCity: { color: colors.text.secondary, fontSize: 12, lineHeight: 16 },
    eventFooter: {
      flexDirection: "row",
      alignItems: "center",
      gap: 7,
      paddingTop: 8,
      marginTop: 3,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    attendeeDots: { flexDirection: "row" },
    attendeeAvatar: {
      width: 16,
      height: 16,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: colors.background.paper,
      backgroundColor: colors.divider,
    },
    attendeeDotOffset: { marginLeft: -6 },
    attendeeText: {
      color: colors.text.secondary,
      fontSize: 10,
      fontWeight: "600",
    },
    skeletonCard: {
      height: 136,
      borderRadius: 18,
      backgroundColor: colors.background.paper,
      borderWidth: 1,
      borderColor: colors.divider,
      opacity: 0.72,
    },
    skeletonGrid: { width: "31%", height: 224 },
    emptyState: {
      alignItems: "center",
      paddingHorizontal: 24,
      paddingVertical: 44,
      borderRadius: 20,
      borderWidth: 1,
      borderStyle: "dashed",
      borderColor: colors.divider,
      backgroundColor: colors.background.paper,
    },
    emptyMark: {
      width: 64,
      height: 64,
      borderRadius: 20,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: isDark ? "#27232B" : "#FFF2F0",
    },
    emptyTitle: {
      color: colors.text.primary,
      textAlign: "center",
      fontSize: 16,
      lineHeight: 22,
      fontWeight: "800",
      marginTop: 12,
    },
    emptyDescription: {
      maxWidth: 270,
      color: colors.text.secondary,
      textAlign: "center",
      fontSize: 13,
      lineHeight: 19,
      marginTop: 8,
    },
    emptyAction: {
      minHeight: 44,
      justifyContent: "center",
      paddingHorizontal: 20,
      borderRadius: 12,
      backgroundColor: colors.primary,
      marginTop: 16,
    },
    emptyActionText: { color: "#fff", fontSize: 13, fontWeight: "800" },
    loadingMore: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 7,
      paddingTop: 22,
    },
    loadingDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
    },
    loadingMoreText: {
      color: colors.text.secondary,
      fontSize: 12,
      marginLeft: 4,
    },
    endLine: {
      color: colors.text.secondary,
      textAlign: "center",
      fontSize: 12,
      paddingTop: 24,
      paddingBottom: 4,
    },
    passesSection: { paddingHorizontal: 16, paddingTop: 28 },
    quickSection: { paddingTop: 28, paddingBottom: 12 },
    quickHeader: {
      paddingHorizontal: 16,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    quickSubtitle: { color: colors.text.secondary, fontSize: 12, marginTop: 4 },
    quickRail: { gap: 10, paddingHorizontal: 16, paddingTop: 13 },
    quickCard: {
      width: 142,
      minHeight: 126,
      padding: 13,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.background.paper,
    },
    quickIcon: {
      width: 38,
      height: 38,
      borderRadius: 11,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 10,
    },
    quickTitle: {
      color: colors.text.primary,
      fontSize: 13,
      lineHeight: 17,
      fontWeight: "800",
    },
    quickBody: {
      color: colors.text.secondary,
      fontSize: 11,
      lineHeight: 15,
      marginTop: 4,
    },
    toTop: {
      position: "absolute",
      right: 16,
      bottom: 22,
      width: 48,
      height: 48,
      borderRadius: 16,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: colors.primary,
    },
    searchLayer: { flex: 1, backgroundColor: colors.background.default },
    searchLayerTop: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 16,
      paddingTop: 16,
      paddingBottom: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    searchLayerInput: {
      flex: 1,
      height: 46,
      paddingHorizontal: 13,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.primary,
      color: colors.text.primary,
      backgroundColor: colors.background.paper,
      fontSize: 14,
    },
    searchLayerBody: { padding: 18 },
    searchLabel: {
      color: colors.text.secondary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.3,
      textTransform: "uppercase",
    },
    searchPills: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 8,
      marginTop: 11,
    },
    searchPill: {
      paddingHorizontal: 13,
      paddingVertical: 9,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: colors.background.paper,
    },
    searchPillText: {
      color: colors.text.primary,
      fontSize: 12,
      fontWeight: "700",
    },
    searchSuggestionsLabel: { marginTop: 26 },
    suggestion: {
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    suggestionCopy: { flex: 1 },
    suggestionTitle: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: "700",
    },
    suggestionMeta: {
      color: colors.text.secondary,
      fontSize: 12,
      marginTop: 3,
    },
    sheetBackdrop: {
      flex: 1,
      justifyContent: "flex-end",
      backgroundColor: "rgba(4,6,12,.55)",
    },
    sheetDismiss: { flex: 1 },
    filterSheet: {
      maxHeight: "92%",
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
      backgroundColor: colors.background.paper,
    },
    filterSheetContent: {
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: 18,
    },
    sheetFooter: {
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 22,
      borderTopWidth: 1,
      borderTopColor: colors.divider,
      backgroundColor: colors.background.paper,
    },
    sheetHandle: {
      alignSelf: "center",
      width: 42,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.divider,
      marginBottom: 18,
    },
    sheetHeader: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    sheetTitle: { color: colors.text.primary, fontSize: 21, fontWeight: "800" },
    resetText: { color: colors.primary, fontSize: 13, fontWeight: "800" },
    sheetLabel: {
      color: colors.text.secondary,
      fontSize: 11,
      fontWeight: "800",
      letterSpacing: 1.2,
      textTransform: "uppercase",
      marginTop: 26,
      marginBottom: 10,
    },
    statusSegmented: {
      flexDirection: "row",
      padding: 5,
      borderRadius: 15,
      backgroundColor: isDark ? "#252528" : "#F3F3F5",
    },
    statusSegment: {
      flex: 1,
      minHeight: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 11,
    },
    statusSegmentActive: { backgroundColor: colors.primary },
    statusSegmentText: {
      color: colors.text.secondary,
      fontSize: 14,
      fontWeight: "700",
    },
    statusSegmentTextActive: { color: "#fff" },
    dateRangeRow: { flexDirection: "row", gap: 9, marginTop: 11 },
    dateField: {
      flex: 1,
      height: 55,
      paddingHorizontal: 14,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: isDark ? "#252528" : "#F5F5F7",
      color: colors.text.primary,
      fontSize: 14,
    },
    filterPillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    filterPill: {
      minHeight: 42,
      paddingHorizontal: 15,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.divider,
      backgroundColor: isDark ? "#252528" : "#F5F5F7",
    },
    filterPillActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    filterPillText: {
      color: colors.text.primary,
      fontSize: 13,
      fontWeight: "700",
    },
    filterPillTextActive: { color: "#fff" },
    accessRows: { gap: 0 },
    accessRow: {
      minHeight: 54,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
    accessRowBorder: {
      borderTopWidth: 1,
      borderTopColor: colors.divider,
    },
    accessText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: "500",
    },
    sortOptions: { gap: 0 },
    sortOption: {
      minHeight: 48,
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottomWidth: 1,
      borderBottomColor: colors.divider,
    },
    sortOptionText: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: "500",
    },
    radio: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.divider,
      alignItems: "center",
      justifyContent: "center",
    },
    radioActive: { borderColor: colors.primary },
    radioDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      backgroundColor: colors.primary,
    },
    toggleRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      paddingVertical: 6,
    },
    toggleTitle: {
      color: colors.text.primary,
      fontSize: 14,
      fontWeight: "700",
    },
    toggleSubtitle: {
      color: colors.text.secondary,
      fontSize: 12,
      marginTop: 3,
    },
    toggle: {
      width: 48,
      height: 28,
      borderRadius: 14,
      padding: 3,
      justifyContent: "center",
      backgroundColor: colors.divider,
    },
    toggleActive: { backgroundColor: colors.primary },
    toggleThumb: {
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: "#fff",
    },
    toggleThumbActive: { alignSelf: "flex-end" },
    sheetModeRow: { flexDirection: "row", gap: 8 },
    sheetMode: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      minHeight: 42,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.divider,
    },
    sheetModeActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    sheetModeText: {
      color: colors.text.secondary,
      fontSize: 13,
      fontWeight: "700",
    },
    sheetModeTextActive: { color: "#fff" },
    applyButton: {
      minHeight: 48,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 14,
      backgroundColor: colors.primary,
      marginTop: 28,
    },
    applyButtonText: { color: "#fff", fontSize: 14, fontWeight: "800" },
  });
