import React, { useEffect, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { VideoView, useVideoPlayer } from "expo-video";

interface EventBannerBackgroundVideoProps {
  source: string;
  loadingLogo?: string;
  loadingLabel?: string;
}

const CLF_HERO_VIDEO = require("../assets/videos/demos/clf/CriptoLatinFest2026Hero.mp4");

/** Muted local footage keeps the CLF hero available offline on native apps. */
export default function EventBannerBackgroundVideo({
  source,
  loadingLogo,
  loadingLabel = "Loading event film",
}: EventBannerBackgroundVideoProps) {
  const [hasFirstFrame, setHasFirstFrame] = useState(false);
  const player = useVideoPlayer(source || CLF_HERO_VIDEO, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  useEffect(() => {
    setHasFirstFrame(false);
  }, [source]);

  return (
    <>
      <VideoView
        contentFit="cover"
        nativeControls={false}
        onFirstFrameRender={() => setHasFirstFrame(true)}
        player={player}
        style={[styles.video, !hasFirstFrame && styles.hiddenVideo]}
        surfaceType="textureView"
      />
      {!hasFirstFrame && (
        <View
          style={styles.loader}
          pointerEvents="none"
          accessibilityLabel={loadingLabel}
        >
          {loadingLogo ? (
            <Image
              source={{ uri: loadingLogo }}
              style={styles.loaderLogo}
              resizeMode="contain"
            />
          ) : null}
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  video: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.88,
  },
  hiddenVideo: { opacity: 0 },
  loader: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    backgroundColor: "#04101d",
  },
  loaderLogo: { width: 190, height: 110 },
});
