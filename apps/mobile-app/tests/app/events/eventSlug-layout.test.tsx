/// <reference types="jest" />
/* eslint-disable @typescript-eslint/no-require-imports */

const mockCanGoBack = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();

jest.mock("expo-router", () => {
  const ReactActual = require("react");
  const Stack = ({ children }: { children?: unknown }) =>
    ReactActual.createElement(ReactActual.Fragment, null, children as any);
  Stack.Screen = () => null;
  return {
    Stack,
    useRouter: () => ({
      canGoBack: mockCanGoBack,
      back: mockBack,
      replace: mockReplace,
    }),
  };
});

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    isDark: false,
    colors: {
      background: { default: "#FFFFFF", paper: "#F5F5F5" },
      text: { primary: "#111111" },
    },
  }),
}));

jest.mock("@contexts/ScrollContext", () => ({
  ScrollProvider: ({ children }: { children?: unknown }) => children,
}));

jest.mock("@contexts/EventContext", () => ({
  useEvent: () => ({ event: { id: "colombia2026", title: "Colombia 2026" } }),
}));

jest.mock("@expo/vector-icons", () => ({ MaterialIcons: "MaterialIcons" }));

import React from "react";
import { act, create } from "react-test-renderer";
import { Stack } from "expo-router";
import EventStackLayout from "../../../app/events/[eventSlug]/_layout";

describe("events/[eventSlug]/_layout back button", () => {
  beforeEach(() => {
    mockCanGoBack.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
  });

  const renderBackButtonElement = () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(<EventStackLayout />);
    });
    const stackElement = renderer!.root.findByType(Stack as any);
    const headerLeft = (
      stackElement.props as { screenOptions: { headerLeft: () => React.ReactElement } }
    ).screenOptions.headerLeft;
    act(() => renderer!.unmount());
    return headerLeft();
  };

  it("goes back through real navigation history when there is any", () => {
    mockCanGoBack.mockReturnValue(true);
    const buttonElement = renderBackButtonElement();

    let buttonRenderer: ReturnType<typeof create>;
    act(() => {
      buttonRenderer = create(buttonElement);
    });
    const button = buttonRenderer!.root.findByProps({
      accessibilityLabel: "Go back",
    });
    act(() => button.props.onPress());

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
    act(() => buttonRenderer!.unmount());
  });

  it("falls back to the public landing page, not the event redirector, when there is no history (regression)", () => {
    // Regression: this used to fall back to /events/{id}/home, which (after
    // the auth-redirect fix) just bounces right back to whichever screen
    // the visitor is already on -- a dead-end back button for anyone who
    // entered via a deep link with no real navigation history.
    mockCanGoBack.mockReturnValue(false);
    const buttonElement = renderBackButtonElement();

    let buttonRenderer: ReturnType<typeof create>;
    act(() => {
      buttonRenderer = create(buttonElement);
    });
    const button = buttonRenderer!.root.findByProps({
      accessibilityLabel: "Go back",
    });
    act(() => button.props.onPress());

    expect(mockReplace).toHaveBeenCalledWith("/home");
    expect(mockBack).not.toHaveBeenCalled();
    act(() => buttonRenderer!.unmount());
  });
});
