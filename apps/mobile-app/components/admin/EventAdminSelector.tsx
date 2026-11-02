import React, { useMemo, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import {
  ActionButton,
  FilterChip,
  FormField,
  ModalBackdrop,
  Surface,
} from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { MaterialIcons } from "../../lib/vector-icons";
import type {
  AdminEventFilter,
  AdminEventSelectorAnchor,
  EventAdminSelectorProps,
} from "../../types/AdminEventSelector.types";
import { filterAdminEventOptions } from "../../lib/admin-event-selector";

const FILTERS: Array<{ value: AdminEventFilter; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "past", label: "Past" },
  { value: "all", label: "All events" },
];

export default function EventAdminSelector({
  options,
  selectedEventId,
  mode,
  onSelect,
}: EventAdminSelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filter, setFilter] = useState<AdminEventFilter>("upcoming");
  const [query, setQuery] = useState("");
  const [anchor, setAnchor] = useState<AdminEventSelectorAnchor>({
    x: 12,
    y: 12,
    width: 320,
    height: 48,
  });
  const triggerRef = useRef<View>(null);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const palette = uiPalette(mode);
  const selectedEvent = options.find(
    (event) => event.eventId === selectedEventId,
  );
  const filteredEvents = useMemo(
    () => filterAdminEventOptions(options, filter, query),
    [options, filter, query],
  );

  const chooseEvent = (eventId: string) => {
    onSelect(eventId);
    setIsOpen(false);
    setQuery("");
  };

  const toggleSelector = () => {
    if (isOpen) {
      setIsOpen(false);
      return;
    }

    const trigger = triggerRef.current;
    if (!trigger) {
      setIsOpen(true);
      return;
    }

    trigger.measureInWindow((x, y, width, height) => {
      setAnchor({ x, y, width, height });
      setIsOpen(true);
    });
  };

  const panelWidth = Math.min(
    windowWidth - uiTokens.space.lg,
    Math.max(anchor.width, 280),
    640,
  );
  const panelLeft = Math.max(
    uiTokens.space.sm,
    Math.min(anchor.x, windowWidth - panelWidth - uiTokens.space.sm),
  );
  const desiredPanelHeight = Math.min(440, windowHeight - uiTokens.space.lg);
  const panelTopBelow = anchor.y + anchor.height + uiTokens.space.sm;
  const availableBelow = Math.max(
    0,
    windowHeight - panelTopBelow - uiTokens.space.sm,
  );
  const availableAbove = Math.max(0, anchor.y - uiTokens.space.sm * 2);
  const showBelow =
    availableBelow >= Math.min(260, desiredPanelHeight) ||
    availableBelow >= availableAbove;
  const panelMaxHeight = Math.max(
    120,
    Math.min(desiredPanelHeight, showBelow ? availableBelow : availableAbove),
  );
  const panelTop = showBelow
    ? panelTopBelow
    : Math.max(
        uiTokens.space.sm,
        anchor.y - panelMaxHeight - uiTokens.space.sm,
      );

  return (
    <View style={styles.root}>
      <View ref={triggerRef} collapsable={false} style={styles.triggerWrap}>
        <ActionButton
          mode={mode}
          variant="secondary"
          label={selectedEvent?.label ?? "Select event"}
          labelNumberOfLines={1}
          tooltipText={selectedEvent?.label}
          leadingIcon={
            <MaterialIcons name="event" size={20} color={palette.accent} />
          }
          trailingIcon={
            <MaterialIcons
              name={isOpen ? "expand-less" : "expand-more"}
              size={22}
              color={palette.accent}
            />
          }
          onPress={toggleSelector}
          accessibilityLabel={`Select event for administration. Current event: ${selectedEvent?.label ?? "none"}`}
          accessibilityState={{ expanded: isOpen }}
          style={styles.trigger}
        />
      </View>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        presentationStyle="overFullScreen"
        onRequestClose={() => setIsOpen(false)}
      >
        <ModalBackdrop mode={mode} style={styles.overlay}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close event selector"
            onPress={() => setIsOpen(false)}
            style={StyleSheet.absoluteFill}
          />
          <Surface
            mode={mode}
            style={[
              styles.panel,
              {
                left: panelLeft,
                top: panelTop,
                width: panelWidth,
                maxHeight: panelMaxHeight,
              },
            ]}
          >
            <FormField
              mode={mode}
              label="Search events"
              accessibilityLabel="Search events"
              placeholder="Name, city, country, or series"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              autoFocus
              style={styles.searchField}
            />

            <ScrollView
              horizontal
              style={styles.filtersScroll}
              contentContainerStyle={styles.filters}
              showsHorizontalScrollIndicator={false}
              accessibilityLabel="Filter events"
            >
              {FILTERS.map(({ value, label }) => (
                <FilterChip
                  key={value}
                  mode={mode}
                  label={label}
                  selected={filter === value}
                  onPress={() => setFilter(value)}
                />
              ))}
            </ScrollView>

            <ScrollView
              style={[styles.optionsList, { maxHeight: panelMaxHeight - 190 }]}
              contentContainerStyle={styles.optionsContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
              accessibilityLabel="Available events"
            >
              {filteredEvents.length ? (
                filteredEvents.map((event) => {
                  const selected = event.eventId === selectedEventId;
                  return (
                    <Pressable
                      key={event.eventId}
                      accessibilityRole="radio"
                      accessibilityLabel={[event.label, event.detail]
                        .filter(Boolean)
                        .join(". ")}
                      accessibilityState={{ selected }}
                      onPress={() => chooseEvent(event.eventId)}
                      style={({ pressed }) => [
                        styles.option,
                        {
                          backgroundColor: selected
                            ? palette.accentSoft
                            : palette.surface,
                          borderColor: selected
                            ? palette.accent
                            : palette.border,
                          opacity: pressed ? 0.78 : 1,
                        },
                      ]}
                    >
                      <MaterialIcons
                        name={event.isSeriesHub ? "hub" : "event"}
                        size={20}
                        color={selected ? palette.accent : palette.muted}
                        accessible={false}
                      />
                      <View style={styles.optionText}>
                        <Text
                          numberOfLines={2}
                          style={[styles.optionLabel, { color: palette.text }]}
                        >
                          {event.label}
                        </Text>
                        {!!event.detail && (
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.optionDetail,
                              { color: palette.muted },
                            ]}
                          >
                            {event.detail}
                          </Text>
                        )}
                      </View>
                      {selected ? (
                        <MaterialIcons
                          name="check-circle"
                          size={20}
                          color={palette.accent}
                          accessible={false}
                        />
                      ) : null}
                    </Pressable>
                  );
                })
              ) : (
                <Text
                  accessibilityRole="text"
                  style={[styles.empty, { color: palette.muted }]}
                >
                  No events match this search and filter.
                </Text>
              )}
            </ScrollView>
          </Surface>
        </ModalBackdrop>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    marginTop: uiTokens.space.md,
  },
  triggerWrap: {
    width: "100%",
    maxWidth: 640,
  },
  trigger: {
    alignSelf: "stretch",
    justifyContent: "space-between",
    maxWidth: 640,
  },
  panel: {
    position: "absolute",
    padding: uiTokens.space.lg,
    gap: uiTokens.space.md,
    overflow: "hidden",
    zIndex: 2,
    elevation: 8,
  },
  overlay: {
    flex: 1,
    alignItems: "stretch",
    justifyContent: "flex-start",
    padding: 0,
  },
  searchField: {
    width: "100%",
  },
  filters: {
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.space.sm,
  },
  filtersScroll: {
    flexGrow: 0,
  },
  optionsList: {
    maxHeight: 320,
    flexShrink: 1,
  },
  optionsContent: {
    gap: uiTokens.space.sm,
  },
  option: {
    minHeight: uiTokens.control.minHeight,
    flexDirection: "row",
    alignItems: "center",
    gap: uiTokens.space.md,
    borderWidth: 1,
    borderRadius: uiTokens.radius.input,
    paddingHorizontal: uiTokens.space.md,
    paddingVertical: uiTokens.space.sm,
  },
  optionText: {
    flex: 1,
    minWidth: 0,
    gap: uiTokens.space.xs,
  },
  optionLabel: {
    fontSize: uiTokens.type.label,
    lineHeight: 20,
    fontWeight: "600",
  },
  optionDetail: {
    fontSize: uiTokens.type.caption,
    lineHeight: 18,
  },
  empty: {
    paddingVertical: uiTokens.space.lg,
    textAlign: "center",
    fontSize: uiTokens.type.body,
  },
});
