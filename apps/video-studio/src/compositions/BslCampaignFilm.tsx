import React from "react";
import {AbsoluteFill, Audio, Img, interpolate, staticFile, useCurrentFrame} from "remotion";
import type {BslCampaignFilmProps} from "../types/BslCampaign.types";

const BslCampaignFilm: React.FC<BslCampaignFilmProps> = ({film, audioFile, metricValues = {}}) => {
  const frame = useCurrentFrame();
  const seconds = film.durationSeconds;
  const pulse = 1 + Math.sin(frame / 35) * 0.015;
  const metric = film.id === "recap" ? metricValues.newUsers : undefined;
  return (
    <AbsoluteFill style={{backgroundColor: "#06111F", color: "#FFFFFF", fontFamily: "Arial, sans-serif", overflow: "hidden"}}>
      <Img src={staticFile("discovery/bogota-cityscape.jpg")} style={{position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", transform: `scale(${pulse})`, opacity: 0.62}} />
      <AbsoluteFill style={{background: "linear-gradient(90deg, rgba(6,17,31,.94), rgba(6,17,31,.24))"}} />
      <AbsoluteFill style={{padding: 96, justifyContent: "space-between"}}>
        <div style={{display: "flex", justifyContent: "space-between", alignItems: "center"}}>
          <Img src={staticFile("brand/logo-full-hashpass-white.svg")} style={{width: 260}} />
          <div style={{color: "#F5C542", fontSize: 24, letterSpacing: 6}}>BSL ON TOUR · BOGOTÁ</div>
        </div>
        <div style={{maxWidth: 1400}}>
          <div style={{color: "#00D9E8", fontSize: 28, letterSpacing: 4, marginBottom: 28}}>NOVEMBER 4–6 · UNIVERSIDAD EXTERNADO</div>
          <div style={{fontSize: 88, fontWeight: 800, lineHeight: 1.05}}>{film.title}</div>
          <div style={{fontSize: 42, marginTop: 32, lineHeight: 1.35}}>{film.caption}</div>
          {metric !== undefined ? <div style={{fontSize: 128, color: "#00D9E8", fontWeight: 800, marginTop: 24}}>{Math.round(metric * Math.min(1, frame / 45)).toLocaleString("en-US")}</div> : null}
        </div>
        <div style={{fontSize: 30, color: "#F5C542", borderLeft: "4px solid #00D9E8", paddingLeft: 24}}>bsl.hashpass.tech</div>
      </AbsoluteFill>
      <Audio src={staticFile(audioFile)} volume={0.86} />
      <Audio src={staticFile("audio/music/elegant-bed.mp3")} volume={0.1} />
      <div style={{position: "absolute", bottom: 0, left: 0, height: 6, width: `${interpolate(frame, [0, seconds * 30], [0, 100], {extrapolateLeft: "clamp", extrapolateRight: "clamp"})}%`, background: "#F5C542"}} />
    </AbsoluteFill>
  );
};

export default BslCampaignFilm;
