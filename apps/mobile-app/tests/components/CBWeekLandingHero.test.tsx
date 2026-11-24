import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { EVENTS } from "@hashpass/config";
import { Linking, Platform } from "react-native";
import type { SharedValue } from "react-native-reanimated";
import type { EventInfo } from "../../lib/event-detector";
import CBWeekLandingHero from "../../components/CBWeekLandingHero";

const event = { ...EVENTS.cbweek2026, available: true } satisfies EventInfo;
const onExplore = jest.fn();
const onScrollDown = jest.fn();
const scrollY = { value: 0 } as SharedValue<number>;
let view: ReactTestRenderer;
let originalPlatformDescriptor: PropertyDescriptor | undefined;

const renderHero = (
  overrides: Partial<React.ComponentProps<typeof CBWeekLandingHero>> = {},
) => {
  act(() => {
    view = create(
      <CBWeekLandingHero
        event={event}
        isDark={false}
        locale="en"
        animationLevel="none"
        scrollY={scrollY}
        onExplore={onExplore}
        onScrollDown={onScrollDown}
        {...overrides}
      />,
    );
  });
};

const setPlatform = (os: string) => {
  Object.defineProperty(Platform, "OS", {
    configurable: true,
    value: os,
  });
};

beforeAll(() => {
  originalPlatformDescriptor = Object.getOwnPropertyDescriptor(Platform, "OS");
});

beforeEach(() => {
  onExplore.mockReset();
  onScrollDown.mockReset();
  setPlatform("ios");
});

afterEach(() => {
  act(() => view?.unmount());
  jest.restoreAllMocks();
  if (originalPlatformDescriptor) {
    Object.defineProperty(Platform, "OS", originalPlatformDescriptor);
  }
});

describe("CBWeekLandingHero", () => {
  it("places the mobile scroll prompt after the event preview and keeps both actions usable", () => {
    renderHero();

    const mobilePrompt = view!.root.findByProps({
      testID: "cbweek-mobile-scroll-prompt",
    });
    expect(mobilePrompt.parent?.children.at(-1)).toBe(mobilePrompt);
    expect(JSON.stringify(view!.toJSON())).toContain("Scroll to discover");
    expect(JSON.stringify(view!.toJSON())).toContain("Colombia Blockchain Week 2026");

    act(() => {
      view!.root.findByProps({
        accessibilityLabel: "Explore Colombia Blockchain Week",
      }).props.onPress();
      view!.root.findByProps({
        accessibilityLabel: "Scroll to discover more",
      }).props.onPress();
    });

    expect(onExplore).toHaveBeenCalledTimes(1);
    expect(onScrollDown).toHaveBeenCalledTimes(1);
  });

  it("uses the Spanish dark-mode copy and fallback media for a minimally configured event", () => {
    const minimalEvent = {
      ...event,
      subtitle: "",
      eventDateString: "",
      website: "",
      image: "",
      heroPoster: "",
      branding: { ...event.branding, logo: "" },
    };

    renderHero({ event: minimalEvent, isDark: true, locale: "es" });

    const mobilePrompt = view!.root.findByProps({
      testID: "cbweek-mobile-scroll-prompt",
    });
    expect(mobilePrompt.parent?.children.at(-1)).toBe(mobilePrompt);
    expect(
      view!.root.findByProps({
        accessibilityLabel: "Desplazarse para descubrir más",
      }),
    ).toBeTruthy();
    expect(JSON.stringify(view!.toJSON())).toContain("Desliza para descubrir");
    expect(JSON.stringify(view!.toJSON())).toContain(event.shortName);
    expect(JSON.stringify(view!.toJSON())).toContain("event website");
  });

  it("embeds the official event website on web and uses its poster on native", () => {
    const websiteEvent = {
      ...event,
      website: "https://colombiablockchainweek.com/",
    };

    setPlatform("web");
    const openURL = jest
      .spyOn(Linking, "openURL")
      .mockResolvedValue(undefined);
    renderHero({ event: websiteEvent, animationLevel: "full" });
    const iframe = view!.root.findByType("iframe" as never);
    expect(iframe.props.src).toBe(websiteEvent.website);
    expect(iframe.props.title).toContain(event.title);
    act(() => {
      view!.root.findByProps({
        accessibilityLabel: "Open official event website",
      }).props.onPress();
    });
    expect(openURL).toHaveBeenCalledWith(websiteEvent.website);
    act(() => view!.unmount());

    setPlatform("ios");
    renderHero({ event: websiteEvent });
    expect(view!.root.findAllByType("ImageBackground" as never).length).toBe(1);
  });
});
