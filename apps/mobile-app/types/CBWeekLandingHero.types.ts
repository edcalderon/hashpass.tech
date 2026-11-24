import type { EventInfo } from "../lib/event-detector";
import type { SharedValue } from "react-native-reanimated";

export type CBWeekLandingHeroProps = {
  event: EventInfo;
  isDark: boolean;
  locale: string;
  animationLevel: "full" | "reduced" | "none";
  scrollY: SharedValue<number>;
  onExplore: () => void;
  onScrollDown: () => void;
};
