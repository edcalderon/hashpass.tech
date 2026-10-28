import React, {useEffect, useRef, useState} from "react";
import {Text, View} from "react-native";
import {uiTokens} from "@hashpass/ui/tokens";
import type {EventVideoCampaignFilm} from "../types/event-video-campaign";

export default function CampaignFilmPlayer({film}: {film: EventVideoCampaignFilm}) {
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); return () => video.current?.pause(); }, [film.url]);
  return <View style={{width: "100%", aspectRatio: 16 / 9, backgroundColor: uiTokens.colors.dark.canvas}}>
    {React.createElement("video", {
      ref: video, src: film.url, poster: film.poster, controls: true, playsInline: true,
      preload: "metadata", "aria-label": film.title, onError: () => setFailed(true),
      style: {width: "100%", height: "100%", objectFit: "contain"},
    }, React.createElement("track", {kind: "subtitles", src: film.captions, srcLang: "en", label: "English"}))}
    {failed ? <Text accessibilityRole="alert" style={{color: uiTokens.colors.dark.text, padding: 12}}>Video unavailable / Video no disponible</Text> : null}
  </View>;
}
