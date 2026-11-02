import React from "react";
import { act, create } from "react-test-renderer";
import { Modal, Pressable, ScrollView, TextInput } from "react-native";
import EventAdminSelector from "../../../components/admin/EventAdminSelector";
import type { AdminEventOption } from "../../../types/AdminEventSelector.types";

jest.mock("../../../lib/vector-icons", () => ({
  MaterialIcons: "MaterialIcons",
}));

const options: AdminEventOption[] = [
  {
    eventId: "bsl",
    label: "BSL On Tour",
    detail: "Roadshow 2026",
    searchText: "bsl on tour roadshow 2026",
    startDate: "2026-11-04T08:00:00-05:00",
    isSeriesHub: true,
    hasUpcomingChildren: true,
  },
  {
    eventId: "chile2026",
    label: "BSL On Tour · Chile 2026",
    detail: "Santiago · Aug 5–7, 2026",
    searchText: "chile santiago bsl on tour",
    startDate: "2026-08-05T09:00:00-04:00",
    endDate: "2026-08-07T23:59:59-04:00",
    isSeriesHub: false,
    hasUpcomingChildren: false,
  },
  {
    eventId: "colombia2026",
    label: "BSL On Tour · Colombia 2026",
    detail: "Bogotá · Nov 4–6, 2026",
    searchText: "colombia bogota bsl on tour",
    startDate: "2026-11-04T08:00:00-05:00",
    endDate: "2026-11-06T23:59:59-05:00",
    isSeriesHub: false,
    hasUpcomingChildren: false,
  },
];

describe("EventAdminSelector", () => {
  it("opens with upcoming events, searches and selects an event", () => {
    const onSelect = jest.fn();
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EventAdminSelector
          options={options}
          selectedEventId="colombia2026"
          mode="light"
          onSelect={onSelect}
        />,
      );
    });

    const trigger = renderer!.root.find(
      (node) =>
        node.type === Pressable &&
        node.props.accessibilityLabel.startsWith(
          "Select event for administration",
        ),
    );
    expect(trigger.props.accessibilityState.expanded).toBe(false);
    act(() => trigger.props.onPress());

    expect(renderer!.root.findByType(Modal).props.visible).toBe(true);
    expect(renderer!.root.findByType(TextInput).props.autoFocus).toBe(true);
    expect(renderer!.root.findByType(TextInput).props.accessibilityLabel).toBe(
      "Search events",
    );
    expect(
      renderer!.root
        .findAllByProps({ accessibilityRole: "radio" })
        .map((node) => node.props.accessibilityLabel),
    ).toEqual([
      "BSL On Tour. Roadshow 2026",
      "BSL On Tour · Colombia 2026. Bogotá · Nov 4–6, 2026",
    ]);

    act(() =>
      renderer!.root.findByType(TextInput).props.onChangeText("bogota"),
    );
    expect(
      renderer!.root
        .findAllByProps({ accessibilityRole: "radio" })
        .map((node) => node.props.accessibilityLabel),
    ).toEqual(["BSL On Tour · Colombia 2026. Bogotá · Nov 4–6, 2026"]);

    const selectedOption = renderer!.root.find(
      (node) =>
        node.props.accessibilityRole === "radio" &&
        node.props.accessibilityLabel.startsWith("BSL On Tour · Colombia"),
    );
    act(() => selectedOption.props.onPress());
    expect(onSelect).toHaveBeenCalledWith("colombia2026");
    expect(renderer!.root.findByType(Modal).props.visible).toBe(false);
    expect(
      renderer!.root.find(
        (node) =>
          node.type === Pressable &&
          node.props.accessibilityLabel.startsWith(
            "Select event for administration",
          ),
      ).props.accessibilityState.expanded,
    ).toBe(false);
    act(() => renderer!.unmount());
  });

  it("switches to past events and reports an empty search", () => {
    let renderer: ReturnType<typeof create>;
    act(() => {
      renderer = create(
        <EventAdminSelector
          options={options}
          selectedEventId="colombia2026"
          mode="dark"
          onSelect={jest.fn()}
        />,
      );
    });
    act(() =>
      renderer!.root
        .find(
          (node) =>
            node.type === Pressable &&
            node.props.accessibilityLabel.startsWith(
              "Select event for administration",
            ),
        )
        .props.onPress(),
    );

    const pastFilter = renderer!.root.find(
      (node) =>
        node.type === Pressable && node.props.accessibilityLabel === "Past",
    );
    act(() => pastFilter.props.onPress());
    expect(
      renderer!.root
        .findAllByProps({ accessibilityRole: "radio" })
        .map((node) => node.props.accessibilityLabel),
    ).toEqual(["BSL On Tour · Chile 2026. Santiago · Aug 5–7, 2026"]);

    act(() =>
      renderer!.root
        .findByType(TextInput)
        .props.onChangeText("no matching event"),
    );
    expect(renderer!.root.findAllByType(ScrollView)).toHaveLength(2);
    expect(
      renderer!.root.findAll((node) =>
        node.children.includes("No events match this search and filter."),
      ),
    ).toHaveLength(1);
    act(() => renderer!.unmount());
  });
});
