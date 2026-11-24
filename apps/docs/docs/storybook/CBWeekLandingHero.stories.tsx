import React from "react";
import type { Meta, StoryObj } from "@storybook/react";
import { EVENTS } from "@hashpass/config";
import { useSharedValue } from "react-native-reanimated";
import CBWeekLandingHero from "../../../mobile-app/components/CBWeekLandingHero";
import type { EventInfo } from "../../../mobile-app/lib/event-detector";

const event = { ...EVENTS.cbweek2026, available: true } satisfies EventInfo;
const meta = {
  title: "Product/CBWeek Landing Hero",
  component: CBWeekLandingHero,
  parameters: { layout: "fullscreen" },
  args: {
    event,
    isDark: true,
    locale: "en",
    animationLevel: "full",
    onExplore: () => {},
    onScrollDown: () => {},
  },
  render: (args) => {
    const scrollY = useSharedValue(0);
    return <CBWeekLandingHero {...args} scrollY={scrollY} />;
  },
} satisfies Meta<typeof CBWeekLandingHero>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dark: Story = {};
export const Light: Story = { args: { isDark: false } };
export const Mobile: Story = {
  parameters: { viewport: { defaultViewport: "mobile1" } },
};
export const Spanish: Story = { args: { locale: "es" } };
export const ReducedMotion: Story = { args: { animationLevel: "none" } };
