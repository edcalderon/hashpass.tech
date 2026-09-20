import React from "react";
import { View, Text } from "react-native";
import type { Meta, StoryObj } from "@storybook/react";
import {
  ActionButton,
  IconButton,
  ModalBackdrop,
  Badge,
  FilterChip,
  FormField,
  Surface,
} from "./primitives";
import { uiPalette, uiTokens, type ColorMode } from "./tokens";
function Catalog({ mode = "light" }: { mode?: ColorMode }) {
  const palette = uiPalette(mode);
  return (
    <View
      style={{
        backgroundColor: palette.canvas,
        padding: uiTokens.space.xl,
        gap: uiTokens.space.xl,
        width: "100%",
        maxWidth: 900,
      }}
    >
      <Text
        style={{
          color: palette.text,
          fontSize: uiTokens.type.heading,
          fontWeight: "700",
        }}
      >
        HASHPASS interface system
      </Text>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: uiTokens.space.sm,
        }}
      >
        <Badge mode={mode}>Featured</Badge>
        <Badge mode={mode} tone="neutral">
          Upcoming
        </Badge>
        <Badge mode={mode} tone="onMedia">
          Organizer media
        </Badge>
      </View>
      <Surface mode={mode}>
        <Text
          style={{
            color: palette.text,
            fontSize: uiTokens.type.title,
            fontWeight: "700",
          }}
        >
          One surface, across platforms
        </Text>
        <Text
          style={{
            color: palette.muted,
            fontSize: uiTokens.type.body,
            lineHeight: 26,
            marginTop: uiTokens.space.md,
          }}
        >
          Cards use a quiet border and 24px corners. Media uses 16px. Inputs use
          12px. Pills are reserved for labels and actions.
        </Text>
      </Surface>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: uiTokens.space.md,
        }}
      >
        <ActionButton mode={mode} label="Explore events" />
        <ActionButton mode={mode} label="Learn more" variant="secondary" />
        <ActionButton mode={mode} label="Cancel" variant="ghost" />
        <ActionButton mode={mode} label="Saving" loading />
        <ActionButton mode={mode} label="Unavailable" disabled />
      </View>
      <View
        style={{
          flexDirection: "row",
          flexWrap: "wrap",
          gap: uiTokens.space.sm,
        }}
      >
        <FilterChip mode={mode} label="All events" />
        <FilterChip mode={mode} label="Upcoming" selected />
        <FilterChip
          mode={mode}
          label="A longer translated filter that wraps without clipping"
        />
      </View>
      <View
        style={{
          height: 280,
          overflow: "hidden",
          borderRadius: uiTokens.radius.card,
        }}
      >
        <ModalBackdrop mode={mode}>
          <Surface mode={mode}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 24 }}
            >
              <Text style={{ color: palette.text, fontSize: 20 }}>
                Join HASHPASS
              </Text>
              <IconButton mode={mode} label="Close dialog">
                <Text style={{ color: palette.accent }}>×</Text>
              </IconButton>
            </View>
            <Text style={{ color: palette.muted }}>
              One modal surface. Blue scrim and web blur.
            </Text>
          </Surface>
        </ModalBackdrop>
      </View>
      <FormField
        mode={mode}
        label="Email address"
        placeholder="you@example.com"
        keyboardType="email-address"
      />
      <FormField
        mode={mode}
        label="Email address"
        value="invalid"
        error="Enter a valid email address."
      />
      <FormField
        mode={mode}
        label="Unavailable field"
        editable={false}
        value="Read only"
      />
    </View>
  );
}
const meta = {
  title: "Design System/Foundations and Controls",
  component: Catalog,
  parameters: { layout: "fullscreen" },
  tags: ["autodocs"],
} satisfies Meta<typeof Catalog>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Light: Story = { args: { mode: "light" } };
export const Dark: Story = { args: { mode: "dark" } };
export const Mobile: Story = {
  args: { mode: "light" },
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
