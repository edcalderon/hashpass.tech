import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import {
  ActionButton,
  FilterChip,
  FormField,
  Surface,
} from "@hashpass/ui/primitives";
import { uiPalette, uiTokens } from "@hashpass/ui/tokens";
import { MaterialIcons } from "../../lib/vector-icons";
import type {
  AdminEventFilter,
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

  return (
    <View style={styles.root}>
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
        onPress={() => setIsOpen((open) => !open)}
        accessibilityLabel={`Select event for administration. Current event: ${selectedEvent?.label ?? "none"}`}
        accessibilityState={{ expanded: isOpen }}
        style={styles.trigger}
      />

      {isOpen ? (
        <Surface mode={mode} style={styles.panel}>
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
            style={styles.searchField}
          />

          <View style={styles.filters} accessibilityLabel="Filter events">
            {FILTERS.map(({ value, label }) => (
              <FilterChip
                key={value}
                mode={mode}
                label={label}
                selected={filter === value}
                onPress={() => setFilter(value)}
              />
            ))}
          </View>

          <ScrollView
            style={styles.optionsList}
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
                        borderColor: selected ? palette.accent : palette.border,
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
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: "100%",
    marginTop: uiTokens.space.md,
  },
  trigger: {
    alignSelf: "stretch",
    justifyContent: "space-between",
    maxWidth: 640,
  },
  panel: {
    width: "100%",
    maxWidth: 640,
    marginTop: uiTokens.space.sm,
    padding: uiTokens.space.lg,
    gap: uiTokens.space.md,
  },
  searchField: {
    width: "100%",
  },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: uiTokens.space.sm,
  },
  optionsList: {
    maxHeight: 320,
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
