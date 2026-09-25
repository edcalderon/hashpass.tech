import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ArrowRight } from "lucide-react-native";
import { uiPalette } from "@hashpass/ui/tokens";

interface InteractiveHoverButtonProps {
  text?: string;
  tone?: "light" | "dark";
  className?: string;
  tabIndex?: number;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLElement>) => void;
}

const InteractiveHoverButton = ({ text = "Button", tone = "light" }: InteractiveHoverButtonProps) => {
  const dark = tone === "dark";
  const palette = uiPalette(dark);
  return (
    <View style={[styles.button, { borderColor: `${palette.accent}44`, backgroundColor: palette.accentSoft }]}>
      <Text style={[styles.text, { color: palette.accent }]}>{text}</Text>
      <ArrowRight color={palette.accent} size={18} />
    </View>
  );
};

InteractiveHoverButton.displayName = "InteractiveHoverButton";

const styles = StyleSheet.create({
  button: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 9999,
    borderWidth: 2,
  },
  text: {
    fontWeight: "600",
    fontSize: 15,
  },
});

export { InteractiveHoverButton };
