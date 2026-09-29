import React from "react";
import type { StyleProp, ViewStyle } from "react-native";
import { ActionButton } from "@hashpass/ui/primitives";
import { uiTokens } from "@hashpass/ui/tokens";
import { NativeSafeIcon } from "../../lib/vector-icons";

type ExplorerHeroActionProps = {
  label: string;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Keeps dashboard hero CTAs aligned with the landing explorer action. */
export default function ExplorerHeroAction({
  label,
  onPress,
  style,
}: ExplorerHeroActionProps) {
  return (
    <ActionButton
      mode="light"
      variant="secondary"
      label={label}
      leadingIcon={(
        <NativeSafeIcon
          name="arrow-up-right"
          size={18}
          color={uiTokens.colors.dark.accent}
          strokeWidth={2}
        />
      )}
      onPress={onPress}
      style={style}
    />
  );
}
