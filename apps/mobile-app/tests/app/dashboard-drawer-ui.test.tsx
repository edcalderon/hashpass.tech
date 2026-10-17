/// <reference types="jest" />

import React from "react";
import type { ReactTestRenderer } from "react-test-renderer";

const mockNavigate = jest.fn();
const mockSetOpen = jest.fn();
const mockToggleTheme = jest.fn();
const mockSetLocale = jest.fn().mockResolvedValue(undefined);
const mockSignOut = jest.fn().mockResolvedValue(undefined);
const mockReplace = jest.fn();
const mockHapticLight = jest.fn();
const mockHandleNext = jest.fn();
const mockHandleNth = jest.fn();
const mockWithRepeat = jest.fn((value: unknown) => value);
const mockGetAllUserPasses = jest
  .fn()
  .mockResolvedValue([{ used_requests: 3 }]);
const mockCanLoadCurrentAdminAccess = jest.fn(() => true);
const mockGetCurrentAdminAccess = jest.fn().mockResolvedValue({
  effectiveRole: { role: "event_admin" },
});
let mockIsDark = true;
let mockLocale = "en";
let mockPlatformOS: "ios" | "web" = "ios";
let mockAnimationsEnabled = false;
let mockDbUserId: string | null = "db-user-1";
let mockScrollChildren: unknown;
let mockHasHandleNext = true;

const mockRequestAnimationFrame = jest.fn((callback: () => void) => {
  callback();
  return 0;
});
(globalThis as any).requestAnimationFrame = mockRequestAnimationFrame;

jest.mock("react-native", () => {
  class MockAnimatedValue {
    value: number;

    constructor(value: number) {
      this.value = value;
    }

    setValue(value: number) {
      this.value = value;
    }

    interpolate({ outputRange }: { outputRange: [unknown, unknown] }) {
      return this.value > 0.5 ? outputRange[1] : outputRange[0];
    }
  }

  const animation = (
    value: MockAnimatedValue,
    config: { toValue?: number },
  ) => ({
    start: (callback?: (result?: { finished: boolean }) => void) => {
      if (typeof config.toValue === "number") value.setValue(config.toValue);
      callback?.({ finished: true });
    },
  });

  return {
    ActivityIndicator: "ActivityIndicator",
    Dimensions: { get: () => ({ width: 390, height: 844 }) },
    Image: "Image",
    Platform: {
      get OS() {
        return mockPlatformOS;
      },
      select: (options: Record<string, unknown>) =>
        options.ios ?? options.default,
    },
    ScrollView: ({ children }: { children: unknown }) => {
      mockScrollChildren = children;
      const ReactRuntime = require("react");
      return ReactRuntime.createElement("ScrollView", { children });
    },
    StatusBar: { currentHeight: 0 },
    StyleSheet: { create: (styles: unknown) => styles },
    Text: "Text",
    TouchableOpacity: "TouchableOpacity",
    View: "View",
    Animated: {
      Value: MockAnimatedValue,
      View: "Animated.View",
      timing: animation,
      spring: animation,
    },
    useWindowDimensions: () => ({ width: 390, height: 844 }),
  };
});

jest.mock(
  "react-native-css-interop/src/runtime/native/appearance-observables",
  () => ({
    getColorScheme: () => "dark",
    addChangeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeChangeListener: jest.fn(),
    removeEventListener: jest.fn(),
    resetAppearanceListeners: jest.fn(),
  }),
  { virtual: true },
);
jest.mock(
  "react-native-css-interop/jsx-runtime",
  () => {
    const ReactRuntime = require("react");
    const createJsxElement = (
      type: unknown,
      props: Record<string, unknown> | null,
      key?: string,
    ) => {
      const { children, ...rest } = props ?? {};
      const nextProps = key === undefined ? rest : { ...rest, key };
      return children === undefined
        ? ReactRuntime.createElement(type, nextProps)
        : ReactRuntime.createElement(type, { ...nextProps, children });
    };
    return {
      Fragment: ReactRuntime.Fragment,
      jsx: createJsxElement,
      jsxs: createJsxElement,
      jsxDEV: createJsxElement,
    };
  },
  { virtual: true },
);

jest.mock("react-native-reanimated", () => ({
  __esModule: true,
  default: { View: "Reanimated.View" },
  useAnimatedStyle: (factory: () => unknown) => factory(),
  useSharedValue: (value: number) => ({ value }),
  withRepeat: mockWithRepeat,
  withTiming: (value: unknown) => value,
  interpolate: (_value: number, _input: number[], output: number[]) =>
    output[0],
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

jest.mock("react-native-edge-to-edge", () => ({ SystemBars: "SystemBars" }));

jest.mock("expo-localization", () => ({
  getLocales: () => [{ languageCode: "en" }],
}));

jest.mock("expo-router", () => ({
  Slot: "Slot",
  Drawer: "Drawer",
  usePathname: () => "/(shared)/dashboard/explore",
  useRouter: () => ({ replace: mockReplace, push: jest.fn() }),
  useNavigation: () => ({ dispatch: jest.fn() }),
}));
jest.mock("expo-router/drawer", () => ({ Drawer: "Drawer" }));

jest.mock("@react-navigation/native", () => ({
  DrawerActions: {
    openDrawer: () => ({ type: "OPEN_DRAWER" }),
    closeDrawer: () => ({ type: "CLOSE_DRAWER" }),
  },
  useNavigation: () => ({ dispatch: jest.fn() }),
}));

jest.mock("@react-navigation/drawer", () => ({
  useDrawerStatus: () => "open",
}));

jest.mock("@hashpass/auth", () => ({
  authService: { getSession: jest.fn().mockResolvedValue(null) },
}));

jest.mock("@hashpass/ui/tokens", () => ({
  uiTokens: {
    radius: { card: 24, media: 16, input: 12, small: 8, circle: 999 },
    colors: {
      light: {
        accent: "#af0d01",
        onAccent: "#fff",
        canvas: "#fff",
        raised: "#fff",
        text: "#111",
      },
      dark: {
        canvas: "#111114",
        raised: "#22222a",
        text: "#fafafa",
      },
    },
  },
}));

jest.mock("../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: mockIsDark,
    toggleTheme: mockToggleTheme,
    colors: {
      primary: "#af0d01",
      divider: "#34343e",
      background: { default: "#111114", paper: "#19191f" },
      text: { primary: "#fafafa", secondary: "#b0b0bc" },
      error: { main: "#ff8a80" },
    },
  }),
}));

jest.mock("../../hooks/useIsMobile", () => ({ useIsMobile: () => true }));

jest.mock("../../hooks/useAuth", () => ({
  useAuth: () => ({
    user: {
      email: "edward@ists.tech",
      created_at: "2026-07-01T00:00:00.000Z",
      user_metadata: { full_name: "Edward Calderon" },
    },
    isLoading: false,
    dbUserId: mockDbUserId,
    isLoggedIn: true,
    signOut: mockSignOut,
  }),
}));

jest.mock("../../providers/LanguageProvider", () => ({
  useLanguage: () => ({ locale: mockLocale, setLocale: mockSetLocale }),
}));

jest.mock("@contexts/NotificationContext", () => ({
  NotificationProvider: ({ children }: { children: React.ReactNode }) =>
    children,
  useNotifications: () => ({ unreadCount: 2 }),
}));

jest.mock("@contexts/EventContext", () => ({
  useEvent: () => ({ event: null }),
}));

jest.mock("../../providers/AnimationProvider", () => ({
  AnimationProvider: ({ children }: { children: React.ReactNode }) => children,
  useAnimations: () => ({ animationsEnabled: mockAnimationsEnabled }),
}));

jest.mock("../../providers/DiscoveryScopeProvider", () => ({
  DiscoveryScopeProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

jest.mock("../../components/VersionDisplay", () => ({
  __esModule: true,
  default: () => null,
}));
jest.mock("../../components/LoadingScreen", () => "LoadingScreen");
jest.mock("../../components/SafeBlurView", () => "SafeBlurView");
jest.mock("../../components/QRScanner", () => "QRScanner");
jest.mock(
  "../../components/MiniNotificationDropdown",
  () => "MiniNotificationDropdown",
);

jest.mock("../../lib/vector-icons", () => ({ Ionicons: "Ionicons" }));
jest.mock("../../lib/morph-icon", () => ({ MorphIcon: "MorphIcon" }));
jest.mock("../../lib/haptics", () => ({
  hapticLight: mockHapticLight,
  hapticMedium: jest.fn(),
}));
jest.mock("../../lib/dashboard-navigation", () => ({
  navigateDashboardBrandToLanding: jest.fn(),
}));
jest.mock("../../lib/dashboard-drawer", () => ({
  openTargetedDashboardDrawer: jest.fn(),
}));
jest.mock("../../lib/auth/recent-auth", () => ({
  hasRecentAuthSuccess: () => false,
}));
jest.mock("../../lib/auth/dev-bypass", () => ({
  isDevAuthBypassEnabled: () => false,
}));
jest.mock("../../lib/auth-qr", () => ({ parseAuthQrScan: jest.fn() }));

jest.mock("../../lib/admin-access", () => ({
  canLoadCurrentAdminAccess: mockCanLoadCurrentAdminAccess,
  getCurrentAdminAccess: mockGetCurrentAdminAccess,
}));

jest.mock("../../lib/event-detector", () => ({
  getAvailableEvents: () => [{}],
}));
jest.mock("../../lib/public-events", () => ({
  publicEventStatus: () => "upcoming",
}));
jest.mock("../../lib/pass-system", () => ({
  passSystemService: {
    getAllUserPasses: mockGetAllUserPasses,
  },
}));

jest.mock("@lib/copilot-shim", () => ({
  CopilotStep: ({ children }: { children: React.ReactNode }) => children,
  walkthroughable: (component: unknown) => component,
  useCopilot: () =>
    mockHasHandleNext
      ? { handleNext: mockHandleNext, handleNth: mockHandleNth }
      : { handleNth: mockHandleNth },
}));

jest.mock("@lingui/macro", () => ({
  t: ({ message }: { message: string }) => message,
}));

const { CustomDrawerContent } =
  require("../../app/(shared)/dashboard/_layout") as typeof import("../../app/(shared)/dashboard/_layout");
const TestRenderer =
  require("react-test-renderer") as typeof import("react-test-renderer");
const { i18n } = require("../../i18n/i18n") as { i18n: any };
i18n.load("en", {});
i18n.activate("en");

const renderDrawer = async () => {
  let renderer: ReactTestRenderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(
      <CustomDrawerContent
        navigation={{ navigate: mockNavigate, dispatch: jest.fn() }}
        navRef={{ current: null }}
        openCloseControlRef={{ current: { setOpen: mockSetOpen } }}
        onDrawerStatusChange={jest.fn()}
      />,
    );
    await Promise.resolve();
  });
  return renderer!;
};

describe("dashboard drawer visual controls", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsDark = true;
    mockLocale = "en";
    mockPlatformOS = "ios";
    mockAnimationsEnabled = false;
    mockDbUserId = "db-user-1";
    mockHasHandleNext = true;
    mockRequestAnimationFrame.mockClear();
    mockWithRepeat.mockClear();
    mockGetAllUserPasses.mockReset();
    mockGetAllUserPasses.mockResolvedValue([{ used_requests: 3 }]);
    mockCanLoadCurrentAdminAccess.mockReset();
    mockCanLoadCurrentAdminAccess.mockReturnValue(true);
    mockGetCurrentAdminAccess.mockReset();
    mockGetCurrentAdminAccess.mockResolvedValue({
      effectiveRole: { role: "event_admin" },
    });
    mockSignOut.mockReset();
    mockSignOut.mockResolvedValue(undefined);
  });

  it("renders the reference quick-action and logout treatment", async () => {
    const renderer = await renderDrawer();
    const root = renderer.root;

    expect(root.findByProps({ accessibilityLabel: "English" })).toBeTruthy();
    expect(root.findByProps({ accessibilityLabel: "Light mode" })).toBeTruthy();
    expect(root.findByProps({ accessibilityLabel: "Log out" })).toBeTruthy();
    expect(root.findAllByProps({ name: "globe-outline" })).toHaveLength(1);
    expect(root.findAllByProps({ name: "sunny" })).toHaveLength(1);
    expect(root.findAllByProps({ name: "log-out-outline" })).toHaveLength(1);
    expect(root.findAllByProps({ name: "chevron-forward" })).toHaveLength(0);

    const accountDetails = root.findByProps({
      accessibilityLabel: "Account details",
    });
    expect(accountDetails.props.accessibilityState).toEqual({ expanded: false });
    expect(root.findAllByProps({ name: "chevron-down" })).toHaveLength(1);

    await TestRenderer.act(async () => {
      accountDetails.props.onPress();
      await Promise.resolve();
    });

    expect(
      root.findByProps({ accessibilityLabel: "Account details" }).props
        .accessibilityState,
    ).toEqual({ expanded: true });
    expect(root.findAllByProps({ name: "chevron-up" })).toHaveLength(1);
    expect(mockNavigate).not.toHaveBeenCalled();

    await TestRenderer.act(async () => {
      root.findByProps({ accessibilityLabel: "English" }).props.onPress();
      root.findByProps({ accessibilityLabel: "Light mode" }).props.onPress();
      root.findByProps({ accessibilityLabel: "Log out" }).props.onPress();
      await Promise.resolve();
    });

    expect(mockSetLocale).toHaveBeenCalledWith("es");
    expect(mockToggleTheme).toHaveBeenCalledTimes(1);
    expect(mockSignOut).toHaveBeenCalledWith({ waitForRemoteCleanup: false });
    expect(mockReplace).toHaveBeenCalledWith("/(shared)/auth");
  });

  it("uses the dark-mode label and moon icon in light theme", async () => {
    mockIsDark = false;
    const renderer = await renderDrawer();
    const root = renderer.root;

    expect(root.findByProps({ accessibilityLabel: "Dark mode" })).toBeTruthy();
    expect(root.findAllByProps({ name: "moon-outline" })).toHaveLength(1);
  });

  it("falls back to an uppercase locale label for an unsupported locale", async () => {
    mockLocale = "xx";
    const renderer = await renderDrawer();
    const root = renderer.root;

    expect(root.findByProps({ accessibilityLabel: "XX" })).toBeTruthy();

    await TestRenderer.act(async () => {
      root.findByProps({ accessibilityLabel: "XX" }).props.onPress();
      await Promise.resolve();
    });

    expect(mockSetLocale).toHaveBeenCalledWith("en");
  });

  it("shows the busy logout state while sign-out is pending", async () => {
    mockSignOut.mockImplementationOnce(() => new Promise<void>(() => {}));
    const renderer = await renderDrawer();
    const root = renderer.root;

    await TestRenderer.act(async () => {
      root.findByProps({ accessibilityLabel: "Log out" }).props.onPress();
      await Promise.resolve();
    });

    const logoutButton = root.findByProps({ accessibilityLabel: "Log out" });
    expect(logoutButton.props.disabled).toBe(true);
    expect(logoutButton.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(root.findAllByType("ActivityIndicator" as any)).toHaveLength(1);
  });

  it("runs the web-only drawer decoration animation setup", async () => {
    jest.useFakeTimers();
    mockPlatformOS = "web";
    mockAnimationsEnabled = true;

    try {
      const renderer = await renderDrawer();

      await TestRenderer.act(async () => {
        jest.advanceTimersByTime(350);
        await Promise.resolve();
      });

      expect(mockWithRepeat).toHaveBeenCalledTimes(4);
      await TestRenderer.act(async () => {
        renderer.unmount();
      });
    } finally {
      jest.useRealTimers();
    }
  });

  it("covers menu motion callbacks and delayed navigation", async () => {
    jest.useFakeTimers();

    try {
      const renderer = await renderDrawer();
      const menuButtons: any[] = [];
      const collectMenuButtons = (node: any): void => {
        if (Array.isArray(node)) {
          node.forEach(collectMenuButtons);
          return;
        }
        if (!React.isValidElement(node)) return;
        const element = node as React.ReactElement<any>;
        if (typeof element.props.onPress === "function") {
          menuButtons.push(element);
        }
        collectMenuButtons(element.props.children);
      };
      collectMenuButtons(mockScrollChildren);

      expect(menuButtons.length).toBeGreaterThan(1);
      const walletButton = menuButtons[1];

      await TestRenderer.act(async () => {
        walletButton.props.onHoverIn();
        walletButton.props.onHoverOut();
        walletButton.props.onFocus();
        walletButton.props.onBlur();
        walletButton.props.onPressIn();
        walletButton.props.onPressOut();
        walletButton.props.onPress();
        jest.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(mockNavigate).toHaveBeenCalledWith("wallet");
      expect(mockHandleNext).toHaveBeenCalled();

      const lastMenuButton = menuButtons.at(-1);
      expect(lastMenuButton).toBeTruthy();

      await TestRenderer.act(async () => {
        lastMenuButton?.props.onPress();
        jest.advanceTimersByTime(800);
        await Promise.resolve();
      });

      expect(mockSetOpen).toHaveBeenCalledWith(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it("falls back to the numbered copilot step callback", async () => {
    jest.useFakeTimers();
    mockHasHandleNext = false;

    try {
      await renderDrawer();
      const menuButtons: any[] = [];
      const collectMenuButtons = (node: any): void => {
        if (Array.isArray(node)) {
          node.forEach(collectMenuButtons);
          return;
        }
        if (!React.isValidElement(node)) return;
        const element = node as React.ReactElement<any>;
        if (typeof element.props.onPress === "function") {
          menuButtons.push(element);
        }
        collectMenuButtons(element.props.children);
      };
      collectMenuButtons(mockScrollChildren);

      await TestRenderer.act(async () => {
        menuButtons[1].props.onPress();
        jest.advanceTimersByTime(300);
        await Promise.resolve();
      });

      expect(mockHandleNth).toHaveBeenCalledWith(4);
    } finally {
      jest.useRealTimers();
    }
  });

  it("handles stats and admin-access failures without breaking the drawer", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockGetAllUserPasses.mockRejectedValueOnce(new Error("stats unavailable"));
    mockGetCurrentAdminAccess.mockRejectedValueOnce(
      new Error("admin unavailable"),
    );

    try {
      await renderDrawer();
      await TestRenderer.act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(consoleError).toHaveBeenCalledWith(
        "Unable to load drawer account stats:",
        expect.any(Error),
      );
      expect(consoleError).toHaveBeenCalledWith(
        "Unable to load admin access for drawer:",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });

  it("skips account-pass loading while the shared user id is unavailable", async () => {
    mockDbUserId = null;
    await renderDrawer();

    expect(mockGetAllUserPasses).not.toHaveBeenCalled();
  });

  it("still routes to auth when sign-out rejects", async () => {
    const consoleError = jest
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    mockSignOut.mockRejectedValueOnce(new Error("sign-out unavailable"));

    try {
      const renderer = await renderDrawer();
      const root = renderer.root;

      await TestRenderer.act(async () => {
        root.findByProps({ accessibilityLabel: "Log out" }).props.onPress();
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(mockReplace).toHaveBeenCalledWith("/(shared)/auth");
      expect(consoleError).toHaveBeenCalledWith(
        "Error signing out:",
        expect.any(Error),
      );
    } finally {
      consoleError.mockRestore();
    }
  });
});
