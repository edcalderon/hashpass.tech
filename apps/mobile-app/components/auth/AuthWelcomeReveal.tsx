import { uiTokens } from "@hashpass/ui/tokens";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { AuthWelcomeRevealProps } from "./types/AuthWelcomeReveal.types";

const TITLE_START_OPACITY = 0.78;
const SUBTITLE_START_OPACITY = 0.74;

const makeAnimatedValues = (length: number) =>
  Array.from({ length }, () => new Animated.Value(0));

/**
 * An auth-specific interpretation of the supplied reveal-text reference.
 * The base copy is always high contrast; an accent layer merely sweeps across
 * it after the short entry sequence, so readability never depends on motion.
 */
const AuthWelcomeReveal = ({
  animationLevel,
  contrastShadowColor,
  subtitle,
  subtitleOverlayColor,
  subtitleStyle,
  subtitleWrapperStyle,
  title,
  titleOverlayColor,
  titleStyle,
}: AuthWelcomeRevealProps) => {
  const titleCharacters = useMemo(() => Array.from(title), [title]);
  const subtitleWords = useMemo(
    () => subtitle.split(/\s+/).filter(Boolean),
    [subtitle],
  );
  const titleEntrance = useRef<Animated.Value[]>([]);
  const titleSweep = useRef<Animated.Value[]>([]);
  const subtitleEntrance = useRef<Animated.Value[]>([]);
  const subtitleSweep = useRef<Animated.Value[]>([]);
  const activeAnimation = useRef<Animated.CompositeAnimation | null>(null);

  if (titleEntrance.current.length !== titleCharacters.length) {
    titleEntrance.current = makeAnimatedValues(titleCharacters.length);
    titleSweep.current = makeAnimatedValues(titleCharacters.length);
  }

  if (subtitleEntrance.current.length !== subtitleWords.length) {
    subtitleEntrance.current = makeAnimatedValues(subtitleWords.length);
    subtitleSweep.current = makeAnimatedValues(subtitleWords.length);
  }

  const playReveal = useCallback(() => {
    const allEntrances = [
      ...titleEntrance.current,
      ...subtitleEntrance.current,
    ];
    const allSweeps = [...titleSweep.current, ...subtitleSweep.current];
    const showStaticCopy = () => {
      allEntrances.forEach((value) => value.setValue(1));
      allSweeps.forEach((value) => value.setValue(0));
    };

    if (animationLevel !== "full") {
      showStaticCopy();
      return;
    }

    activeAnimation.current?.stop();
    allEntrances.forEach((value) => value.setValue(0));
    allSweeps.forEach((value) => value.setValue(0));

    const revealTitle = Animated.stagger(
      uiTokens.motion.stagger,
      titleEntrance.current.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: uiTokens.motion.normal,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    );
    const revealSubtitle = Animated.stagger(
      uiTokens.motion.stagger,
      subtitleEntrance.current.map((value) =>
        Animated.timing(value, {
          toValue: 1,
          duration: uiTokens.motion.normal,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ),
    );
    const sweep = (value: Animated.Value) =>
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: uiTokens.motion.fast,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.delay(uiTokens.motion.fast),
        Animated.timing(value, {
          toValue: 0,
          duration: uiTokens.motion.normal,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]);
    const sequence = Animated.sequence([
      Animated.parallel([
        revealTitle,
        Animated.sequence([
          Animated.delay(uiTokens.motion.fast),
          revealSubtitle,
        ]),
      ]),
      Animated.delay(uiTokens.motion.fast),
      Animated.stagger(uiTokens.motion.stagger, titleSweep.current.map(sweep)),
      Animated.stagger(
        uiTokens.motion.stagger,
        subtitleSweep.current.map(sweep),
      ),
    ]);

    activeAnimation.current = sequence;
    sequence.start(({ finished }) => {
      if (finished && activeAnimation.current === sequence) {
        activeAnimation.current = null;
      }
    });
  }, [animationLevel, subtitleWords.length, titleCharacters.length]);

  useEffect(() => {
    playReveal();
    return () => activeAnimation.current?.stop();
  }, [playReveal]);

  const titleShadow = {
    textShadowColor: contrastShadowColor,
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  };
  const subtitleShadow = {
    textShadowColor: contrastShadowColor,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 8,
  };

  return (
    <Pressable
      accessible={false}
      focusable={false}
      onHoverIn={playReveal}
      onPress={playReveal}
      style={styles.interactionSurface}
    >
      <View style={styles.container}>
        <View accessible accessibilityLabel={title} style={styles.titleRow}>
          {titleCharacters.map((character, index) => {
            const entrance = titleEntrance.current[index];
            const sweep = titleSweep.current[index];
            const opacity = entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [TITLE_START_OPACITY, 1],
            });
            const translateY = entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [8, 0],
            });
            const scale = entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [0.94, 1],
            });

            return (
              <Animated.View
                key={`${character}-${index}`}
                accessible={false}
                style={{
                  opacity,
                  transform: [{ translateY }, { scale }],
                }}
              >
                <Text
                  selectable={false}
                  style={[titleStyle, styles.titleLetter, titleShadow]}
                >
                  {character === " " ? "\u00a0" : character}
                </Text>
                <Animated.Text
                  accessible={false}
                  selectable={false}
                  style={[
                    titleStyle,
                    styles.titleOverlay,
                    { color: titleOverlayColor, opacity: sweep },
                  ]}
                >
                  {character === " " ? "\u00a0" : character}
                </Animated.Text>
              </Animated.View>
            );
          })}
        </View>

        <View
          accessible
          accessibilityLabel={subtitle}
          style={[styles.subtitleRow, subtitleWrapperStyle]}
        >
          {subtitleWords.map((word, index) => {
            const entrance = subtitleEntrance.current[index];
            const sweep = subtitleSweep.current[index];
            const opacity = entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [SUBTITLE_START_OPACITY, 1],
            });
            const translateY = entrance.interpolate({
              inputRange: [0, 1],
              outputRange: [5, 0],
            });
            const wordWithSpace =
              index === subtitleWords.length - 1 ? word : `${word} `;

            return (
              <Animated.View
                key={`${word}-${index}`}
                accessible={false}
                style={{ opacity, transform: [{ translateY }] }}
              >
                <Text
                  selectable={false}
                  style={[subtitleStyle, styles.subtitleWord, subtitleShadow]}
                >
                  {wordWithSpace}
                </Text>
                <Animated.Text
                  accessible={false}
                  selectable={false}
                  style={[
                    subtitleStyle,
                    styles.subtitleOverlay,
                    { color: subtitleOverlayColor, opacity: sweep },
                  ]}
                >
                  {wordWithSpace}
                </Animated.Text>
              </Animated.View>
            );
          })}
        </View>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    width: "100%",
  },
  interactionSurface: {
    alignSelf: "stretch",
    ...(Platform.OS === "web"
      ? ({ cursor: "default", userSelect: "none" } as any)
      : {}),
  },
  titleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "100%",
  },
  titleLetter: {
    textAlign: "center",
  },
  titleOverlay: {
    left: 0,
    position: "absolute",
    top: 0,
  },
  subtitleRow: {
    alignItems: "baseline",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    width: "100%",
  },
  subtitleWord: {
    textAlign: "center",
  },
  subtitleOverlay: {
    left: 0,
    position: "absolute",
    top: 0,
  },
});

export default AuthWelcomeReveal;
