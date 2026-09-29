/// <reference types="jest" />

import React from "react";
import { act, create } from "react-test-renderer";
import { Pressable } from "react-native";
import { uiTokens } from "@hashpass/ui/tokens";
import ExplorerHeroAction, {
  ExplorerExpandableAction,
  explorerHeroActionTestId,
} from "../../components/explorer/ExplorerHeroAction";

jest.mock("../../lib/vector-icons", () => ({
  NativeSafeIcon: "NativeSafeIcon",
}));

// process.env.NODE_ENV is typed read-only in this repo's TS config, even
// though Jest's Node runtime allows the mutation fine. Object.defineProperty
// sidesteps the type error without an `as any` cast at every call site.
function setNodeEnv(value: string | undefined) {
  Object.defineProperty(process.env, "NODE_ENV", {
    value,
    configurable: true,
    enumerable: true,
    writable: true,
  });
}

describe("ExplorerHeroAction", () => {
  it("matches the landing explorer action with a pill and north-east icon", () => {
    const onPress = jest.fn();
    let renderer: ReturnType<typeof create>;

    act(() => {
      renderer = create(
        <ExplorerHeroAction label="Explore event" onPress={onPress} />,
      );
    });

    const collapsedButton = renderer!.root.findByType(Pressable);
    expect(collapsedButton.props.accessibilityLabel).toBe("Explore event");
    expect(collapsedButton.props.accessibilityState.expanded).toBe(false);
    expect(
      renderer!.root.findByProps({ name: "arrow-up-right" }),
    ).toBeTruthy();

    act(() => collapsedButton.props.onPress());
    expect(onPress).not.toHaveBeenCalled();

    const expandedButton = renderer!.root.findByType(Pressable);
    expect(expandedButton.props.accessibilityState.expanded).toBe(true);
    act(() => expandedButton.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => renderer!.unmount());
  });

  it("uses the active theme palette for the hero icon", () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ExplorerHeroAction
          label="Explore event"
          mode="dark"
          onPress={jest.fn()}
        />,
      );
    });

    expect(renderer!.root.findByProps({ name: "arrow-up-right" }).props.color)
      .toBe(uiTokens.colors.dark.accent);
    act(() => renderer!.unmount());
  });

  it("dims the shell and uses the muted icon color when disabled", () => {
    const onPress = jest.fn();
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ExplorerExpandableAction
          label="Disabled action"
          iconName="arrow-up-right"
          mode="dark"
          variant="primary"
          disabled
          onPress={onPress}
        />,
      );
    });

    const collapsedButton = renderer!.root.findByType(Pressable);
    expect(collapsedButton.props.disabled).toBe(true);
    expect(collapsedButton.props.accessibilityState.expanded).toBe(false);
    expect(renderer!.root.findByProps({ name: "arrow-up-right" }).props.color)
      .toBe(uiTokens.colors.dark.muted);

    act(() => collapsedButton.props.onPress());
    expect(onPress).not.toHaveBeenCalled();

    act(() => renderer!.unmount());
  });

  it("keeps pagination circular until hover or the first touch", () => {
    const onPress = jest.fn();
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <ExplorerExpandableAction
          label="Next"
          iconName="arrow-right"
          iconPosition="trailing"
          mode="light"
          variant="primary"
          onPress={onPress}
          testID="next-page-action"
        />,
      );
    });

    const collapsedButton = renderer!.root.findByType(Pressable);
    expect(collapsedButton.props.accessibilityState.expanded).toBe(false);
    expect(renderer!.root.findByProps({ name: "arrow-right" })).toBeTruthy();

    act(() => collapsedButton.props.onPress());
    expect(onPress).not.toHaveBeenCalled();
    const expandedButton = renderer!.root.findByType(Pressable);
    expect(expandedButton.props.accessibilityState.expanded).toBe(true);
    act(() => expandedButton.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => renderer!.unmount());
  });

  it("hides the shell testID on production web builds but keeps it under test and on native", () => {
    const rn = require("react-native");
    const originalPlatformOs = rn.Platform.OS;
    const originalNodeEnv = process.env.NODE_ENV;
    try {
      rn.Platform.OS = "web";

      setNodeEnv("test");
      expect(explorerHeroActionTestId()).toEqual({
        testID: "explorer-hero-action-shell",
      });
      expect(explorerHeroActionTestId("next-page-action")).toEqual({
        testID: "next-page-action",
      });

      setNodeEnv("production");
      expect(explorerHeroActionTestId()).toEqual({});

      rn.Platform.OS = "android";
      expect(explorerHeroActionTestId()).toEqual({
        testID: "explorer-hero-action-shell",
      });
    } finally {
      rn.Platform.OS = originalPlatformOs;
      setNodeEnv(originalNodeEnv);
    }
  });
});
