"use client";
import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { StyleSheet, TextStyle } from "react-native";

const FlipWords = ({
  words,
  duration = 3000,
  textStyle,
}: {
  words: string[];
  duration?: number;
  textStyle?: TextStyle;
}) => {
  const [currentWord, setCurrentWord] = useState(words[0]);
  const flattenedTextStyle = StyleSheet.flatten(textStyle) ?? {};
  const fontSize = typeof flattenedTextStyle.fontSize === "number" ? flattenedTextStyle.fontSize : 18;
  const reservedHeight =
    typeof flattenedTextStyle.lineHeight === "number"
      ? flattenedTextStyle.lineHeight
      : Math.ceil(fontSize * 1.25);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const nextWord = words[words.indexOf(currentWord) + 1] || words[0];
      setCurrentWord(nextWord);
    }, duration);

    return () => window.clearTimeout(timeout);
  }, [currentWord, duration, words]);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        style={{
          ...(flattenedTextStyle as React.CSSProperties),
          display: "flex",
          width: "100%",
          minHeight: reservedHeight,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          position: "relative",
          paddingLeft: 8,
          paddingRight: 8,
          textAlign: "center",
        }}
        initial={{
          opacity: 0,
          y: 10,
        }}
        animate={{
          opacity: 1,
          y: 0,
        }}
        transition={{
          type: "spring",
          stiffness: 100,
          damping: 10,
        }}
        exit={{
          opacity: 0,
          y: -40,
          x: 40,
          filter: "blur(8px)",
          scale: 2,
          position: "absolute",
        }}
        key={currentWord}
      >
        {/* edit suggested by Sajal: https://x.com/DewanganSajal */}
        {currentWord.split(" ").map((word, wordIndex) => (
          <motion.span
            key={word + wordIndex}
            initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
            animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            transition={{
              delay: wordIndex * 0.3,
              duration: 0.3,
            }}
            style={{ display: "inline-block", whiteSpace: "nowrap" }}
          >
            {word.split("").map((letter, letterIndex) => (
              <motion.span
                key={word + letterIndex}
                initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{
                  delay: wordIndex * 0.3 + letterIndex * 0.05,
                  duration: 0.2,
                }}
                style={{ display: "inline-block" }}
              >
                {letter}
              </motion.span>
            ))}
            <span style={{ display: "inline-block" }}>&nbsp;</span>
          </motion.span>
        ))}
      </motion.div>
    </AnimatePresence>
  );
};

export default FlipWords;
