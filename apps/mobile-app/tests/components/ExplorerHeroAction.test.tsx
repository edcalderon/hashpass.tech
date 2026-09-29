/// <reference types="jest" />

import React from "react";
import { act, create } from "react-test-renderer";
import { Pressable } from "react-native";
import { uiTokens } from "@hashpass/ui/tokens";
import ExplorerHeroAction, {
  ExplorerExpandableAction,
} from "../../components/explorer/ExplorerHeroAction";

jest.mock("../../lib/vector-icons", () => ({
  NativeSafeIcon: "NativeSafeIcon",
}));

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
});
