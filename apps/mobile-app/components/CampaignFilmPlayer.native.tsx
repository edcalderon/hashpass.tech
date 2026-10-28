import React, {useEffect} from "react";
import {useLingui} from "@lingui/react";
import {AppState, View} from "react-native";
import {useVideoPlayer, VideoView} from "expo-video";
import {uiTokens} from "@hashpass/ui/tokens";
import {preferredCampaignPlayback} from "../lib/event-video-campaign";
import type {EventVideoCampaignFilm} from "../types/event-video-campaign";

export default function CampaignFilmPlayer({film}: {film: EventVideoCampaignFilm}) {
  const {i18n} = useLingui();
  const playback = preferredCampaignPlayback(film, i18n.locale);
  const player = useVideoPlayer(playback.url, (instance) => {
    instance.loop = false;
    instance.muted = false;
  });
  useEffect(() => {
    const listener = AppState.addEventListener("change", (state) => {
      if (state !== "active") player.pause();
    });
    return () => {
      player.pause();
      listener.remove();
    };
  }, [player]);
  return (
    <View style={{width: "100%", aspectRatio: 16 / 9, backgroundColor: uiTokens.colors.dark.canvas}}>
      <VideoView
        accessibilityLabel={playback.title ?? film.title}
        player={player}
        nativeControls
        contentFit="contain"
        style={{width: "100%", height: "100%"}}
      />
    </View>
  );
}
