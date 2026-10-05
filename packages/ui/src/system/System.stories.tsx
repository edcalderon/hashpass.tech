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
  HoverText,
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
        <Badge mode={mode} tone="neutral" markerColor={uiTokens.feature.green} compact>
          Panel
        </Badge>
        <Badge
          mode={mode}
          tone="neutral"
          compact
          markerColor={uiTokens.feature.cyan}
          leadingIcon={<Text style={{ color: palette.accent }}>◎</Text>}
        >
          Networking
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
        <ActionButton
          mode={mode}
          label="Next"
          trailingIcon={<Text style={{ color: palette.onAccent }}>→</Text>}
        />
        <ActionButton mode={mode} label="Learn more" variant="secondary" />
        <ActionButton
          mode={mode}
          label="A longer translated action label"
          labelNumberOfLines={1}
          tooltipText="A longer translated action label"
          variant="secondary"
          style={{ maxWidth: 180 }}
        />
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
      <View style={{ flexDirection: "row", gap: uiTokens.space.sm }}>
        <IconButton mode={mode} label="Reload events">
          <Text style={{ color: palette.accent }}>↻</Text>
        </IconButton>
        <IconButton mode={mode} label="Reload events" revealLabel>
          <Text style={{ color: palette.accent }}>↻</Text>
        </IconButton>
      </View>
      <View style={{ gap: uiTokens.space.md }}>
        <Text
          style={{
            color: palette.muted,
            fontSize: uiTokens.type.label,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          IconButton interactions
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: uiTokens.space.sm }}>
          <IconButton mode={mode} label="Refresh agenda" revealLabel>
            <Text style={{ color: palette.accent }}>↻</Text>
          </IconButton>
          <IconButton
            mode={mode}
            label="A longer translated label that still fits the expanded pill"
            revealLabel
          >
            <Text style={{ color: palette.accent }}>↻</Text>
          </IconButton>
          <IconButton
            mode={mode}
            label="Refresh agenda"
            revealLabel
            loading
            loadingLabel="Refreshing"
          >
            <Text style={{ color: palette.accent }}>↻</Text>
          </IconButton>
          <IconButton mode={mode} label="Disabled action" revealLabel disabled>
            <Text style={{ color: palette.accent }}>↻</Text>
          </IconButton>
          <IconButton
            mode={mode}
            label="Accent override"
            revealLabel
            accentColor={uiTokens.feature.cyan}
          >
            <Text style={{ color: uiTokens.feature.cyan }}>◎</Text>
          </IconButton>
        </View>
        <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption, lineHeight: 18 }}>
          Hover or focus a reveal button to expand its label (debounced on leave).
          Native: LayoutAnimation-driven width. Web: CSS transition. Reduced motion
          is honored from the system setting.
        </Text>
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
      <View style={{ gap: uiTokens.space.md }}>
        <Text
          style={{
            color: palette.muted,
            fontSize: uiTokens.type.label,
            fontWeight: "700",
            textTransform: "uppercase",
            letterSpacing: 1,
          }}
        >
          HoverText truncation
        </Text>
        <View style={{ gap: uiTokens.space.sm, maxWidth: 260 }}>
          <HoverText
            mode={mode}
            numberOfLines={1}
            style={{ color: palette.text, fontSize: uiTokens.type.body }}
          >
            Short title fits
          </HoverText>
          <HoverText
            mode={mode}
            numberOfLines={1}
            style={{ color: palette.text, fontSize: uiTokens.type.body }}
          >
            A much longer translated event title that has to be clipped on one line
          </HoverText>
          <HoverText
            mode={mode}
            numberOfLines={2}
            style={{ color: palette.text, fontSize: uiTokens.type.body }}
          >
            A long translated description that wraps across two lines before it
            gets clipped and needs the full-content tooltip affordance to be
            readable in full
          </HoverText>
        </View>
        <Text style={{ color: palette.muted, fontSize: uiTokens.type.caption, lineHeight: 18 }}>
          Web: hover a clipped line for the native browser tooltip. Native:
          long-press a clipped line to reveal the full text.
        </Text>
      </View>
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
