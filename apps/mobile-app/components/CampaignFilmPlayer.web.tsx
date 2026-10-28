import React, {useEffect, useRef, useState} from "react";
import {Text, View} from "react-native";
import {uiTokens} from "@hashpass/ui/tokens";
import type {EventVideoCampaignFilm, EventVideoCampaignFilmMedia} from "../types/event-video-campaign";

function preferredPlayback(film: EventVideoCampaignFilm): EventVideoCampaignFilmMedia {
  const language = typeof navigator === "undefined" ? "" : navigator.language.toLowerCase();
  return language.startsWith("en") && film.alternateLocales?.en ? film.alternateLocales.en : film;
}

export default function CampaignFilmPlayer({film}: {film: EventVideoCampaignFilm}) {
  const playback = preferredPlayback(film);
  const title = playback.title ?? film.title;
  const video = useRef<HTMLVideoElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); return () => video.current?.pause(); }, [playback.url]);
  const captionTracks = playback.captionTracks?.length
    ? playback.captionTracks
    : [{src: playback.captions, language: "en" as const, label: "English", default: true}];
  return <View style={{width: "100%", aspectRatio: 16 / 9, backgroundColor: uiTokens.colors.dark.canvas}}>
    {React.createElement("video", {
      ref: video, src: playback.url, poster: playback.poster, controls: true, playsInline: true,
      preload: "metadata", "aria-label": title, onError: () => setFailed(true),
      style: {width: "100%", height: "100%", objectFit: "contain"},
    }, captionTracks.map((track) => React.createElement("track", {key: track.src, kind: "subtitles", src: track.src, srcLang: track.language, label: track.label, default: track.default}))) }
    {failed ? <Text accessibilityRole="alert" style={{color: uiTokens.colors.dark.text, padding: 12}}>Video unavailable / Video no disponible</Text> : null}
  </View>;
}
