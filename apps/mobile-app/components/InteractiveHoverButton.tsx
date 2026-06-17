import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ArrowRight } from "lucide-react-native";

interface InteractiveHoverButtonProps {
  text?: string;
}

const InteractiveHoverButton = ({ text = "Button" }: InteractiveHoverButtonProps) => {
  return (
    <View style={styles.button}>
      <Text style={styles.text}>{text}</Text>
      <ArrowRight color="#22d3ee" size={18} />
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
    borderColor: "rgba(34,211,238,0.2)",
    backgroundColor: "rgba(34,211,238,0.1)",
  },
  text: {
    color: "#22d3ee",
    fontWeight: "600",
    fontSize: 15,
  },
});

export { InteractiveHoverButton };
