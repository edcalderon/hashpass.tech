/// <reference types="jest" />

import React from "react";
import { act, create } from "react-test-renderer";
import { Pressable } from "react-native";
import ExplorerHeroAction from "../../components/explorer/ExplorerHeroAction";

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

    const button = renderer!.root.findByType(Pressable);
    expect(button.props.accessibilityLabel).toBe("Explore event");
    expect(
      renderer!.root.findByProps({ name: "arrow-up-right" }),
    ).toBeTruthy();

    act(() => button.props.onPress());
    expect(onPress).toHaveBeenCalledTimes(1);

    act(() => renderer!.unmount());
  });
});
