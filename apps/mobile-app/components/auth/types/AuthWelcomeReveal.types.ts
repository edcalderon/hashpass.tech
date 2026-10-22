import type { AnimationLevel } from "../../../contexts/AnimationLevelContext";
import type { StyleProp, TextStyle, ViewStyle } from "react-native";

export type AuthWelcomeRevealProps = {
  animationLevel: AnimationLevel;
  contrastShadowColor: string;
  subtitle: string;
  subtitleOverlayColor: string;
  subtitleStyle: StyleProp<TextStyle>;
  subtitleWrapperStyle?: StyleProp<ViewStyle>;
  title: string;
  titleOverlayColor: string;
  titleStyle: StyleProp<TextStyle>;
};
