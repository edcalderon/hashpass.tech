import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {BslCampaignWelcomeProps, WelcomeScene} from "../types/BslCampaign.types";

const FPS = 30;
const MIDNIGHT = "#06111F";
const GOLD = "#FFCF3C";
const CYAN = "#48D4FF";

const panelSpeakers = [
  "Luis Botello",
  "Jaime Rincón",
  "Sandra Meza Cuervo",
  "Juan Sebastián Peredo",
  "Nicolás Molina",
];

const SpeakerChips: React.FC<{visible: boolean}> = ({visible}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  if (!visible) return null;

  return (
    <div style={{display: "flex", flexWrap: "wrap", gap: 14, marginTop: 36, maxWidth: 1400}}>
      {panelSpeakers.map((speaker, index) => {
        const progress = spring({
          frame: Math.max(0, frame - 8 - index * 6),
          fps,
          config: {damping: 16, mass: 0.7, stiffness: 160},
        });
        return (
          <div
            key={speaker}
            style={{
              background: "rgba(6, 17, 31, 0.84)",
              border: `1px solid ${index % 2 === 0 ? "rgba(72, 212, 255, .75)" : "rgba(255, 207, 60, .78)"}`,
              borderRadius: 999,
              boxShadow: "0 12px 28px rgba(0, 0, 0, .24)",
              color: "#FFFFFF",
              fontSize: 24,
              fontWeight: 700,
              opacity: progress,
              padding: "15px 20px",
              transform: `translateY(${interpolate(progress, [0, 1], [26, 0])}px)`,
            }}
          >
            {speaker}
          </div>
        );
      })}
    </div>
  );
};

const StoryScene: React.FC<{scene: WelcomeScene; index: number}> = ({scene, index}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();
  const progress = spring({frame, fps, config: {damping: 18, mass: 0.8, stiffness: 130}});
  const exit = interpolate(frame, [Math.max(0, durationInFrames - 14), durationInFrames], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const isPanel = index === 2;
  const isSpeakers = index === 3;
  const isPass = index === 4;
  const direction = index % 2 === 0 ? -1 : 1;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        opacity: exit,
        padding: "174px 128px 180px",
        transform: `translateX(${interpolate(progress, [0, 1], [direction * 70, 0])}px)`,
      }}
    >
      {isPanel ? (
        <div
          style={{
            background: "linear-gradient(112deg, rgba(6,17,31,.93), rgba(10,38,61,.88))",
            border: `2px solid ${GOLD}`,
            borderRadius: 34,
            boxShadow: "0 32px 90px rgba(0,0,0,.34), inset 0 0 0 1px rgba(72,212,255,.28)",
            maxWidth: 1490,
            padding: "48px 56px",
          }}
        >
          <div style={{background: CYAN, borderRadius: 999, height: 8, marginBottom: 30, width: `${interpolate(progress, [0, 1], [0, 320])}px`}} />
          <SceneCopy scene={scene} compact />
        </div>
      ) : (
        <div style={{maxWidth: isSpeakers ? 1500 : 1360}}>
          <SceneCopy scene={scene} />
          <SpeakerChips visible={isSpeakers} />
          {isPass ? <PassFlow progress={progress} /> : null}
        </div>
      )}
    </AbsoluteFill>
  );
};

const SceneCopy: React.FC<{scene: WelcomeScene; compact?: boolean}> = ({scene, compact = false}) => (
  <>
    <div style={{color: GOLD, fontSize: compact ? 22 : 26, fontWeight: 800, letterSpacing: 3.6, marginBottom: compact ? 22 : 28, textShadow: "0 2px 18px rgba(0,0,0,.52)"}}>
      {scene.eyebrow}
    </div>
    <div style={{color: "#FFFFFF", fontSize: compact ? 64 : 76, fontWeight: 800, letterSpacing: -2.8, lineHeight: 1.03, maxWidth: 1320, textShadow: "0 6px 30px rgba(0,0,0,.48)"}}>
      {scene.headline}
    </div>
    <div style={{color: "#D9F7FF", fontSize: compact ? 30 : 34, fontWeight: 600, lineHeight: 1.34, marginTop: 26, maxWidth: 1220, textShadow: "0 3px 22px rgba(0,0,0,.6)"}}>
      {scene.detail}
    </div>
  </>
);

const PassFlow: React.FC<{progress: number}> = ({progress}) => (
  <div style={{display: "flex", gap: 18, marginTop: 42}}>
    {["Agenda", "Personas", "Reuniones"].map((item, index) => (
      <div
        key={item}
        style={{
          background: index === 1 ? "rgba(255, 207, 60, .98)" : "rgba(6, 17, 31, .84)",
          border: `1px solid ${index === 1 ? GOLD : "rgba(72, 212, 255, .85)"}`,
          borderRadius: 18,
          boxShadow: "0 16px 38px rgba(0,0,0,.28)",
          color: index === 1 ? MIDNIGHT : "#FFFFFF",
          fontSize: 25,
          fontWeight: 800,
          opacity: progress,
          padding: "18px 24px",
          transform: `translateY(${interpolate(progress, [0, 1], [20 + index * 7, 0])}px)`,
        }}
      >
        {item}
      </div>
    ))}
  </div>
);

export const BslCampaignWelcome: React.FC<BslCampaignWelcomeProps> = ({content}) => {
  const frame = useCurrentFrame();
  const drift = Math.sin(frame / 75) * 18;
  const progress = interpolate(frame, [0, 50 * FPS], [0, 100], {extrapolateRight: "clamp"});

  return (
    <AbsoluteFill style={{backgroundColor: MIDNIGHT, color: "#FFFFFF", fontFamily: "Arial, sans-serif", overflow: "hidden"}}>
      <Img
        src={staticFile("discovery/bogota-cityscape.jpg")}
        style={{height: "100%", left: 0, objectFit: "cover", opacity: 0.54, position: "absolute", top: 0, transform: `scale(1.08) translateX(${drift}px)`, width: "100%"}}
      />
      <AbsoluteFill style={{background: "linear-gradient(96deg, rgba(3,10,21,.98) 0%, rgba(6,17,31,.86) 46%, rgba(6,17,31,.28) 100%)"}} />
      <AbsoluteFill style={{background: `radial-gradient(circle at ${70 + drift * 0.08}% 34%, rgba(72,212,255,.28), transparent 34%), radial-gradient(circle at 72% 73%, rgba(255,207,60,.23), transparent 33%)`}} />
      <div style={{background: "rgba(3, 10, 21, .74)", borderBottom: "1px solid rgba(255,255,255,.16)", display: "flex", justifyContent: "space-between", left: 0, padding: "38px 64px", position: "absolute", right: 0, top: 0}}>
        <Img src={staticFile("brand/logo-full-hashpass-black.svg")} style={{height: 48, objectFit: "contain", width: 272}} />
        <div style={{alignItems: "center", display: "flex", gap: 28}}>
          <div style={{background: "rgba(255,255,255,.1)", border: "1px solid rgba(255,255,255,.3)", borderRadius: 16, padding: "12px 18px"}}>
            <Img src={staticFile("event-heroes/colombia2026/event-logo.webp")} style={{height: 82, objectFit: "contain", width: 310}} />
          </div>
          <div style={{color: GOLD, fontSize: 20, fontWeight: 800, letterSpacing: 3}}>POWERED BY HASHPASS</div>
        </div>
      </div>
      {content.scenes.map((scene, index) => (
        <Sequence key={`${scene.startSecond}-${scene.headline}`} from={scene.startSecond * FPS} durationInFrames={(scene.endSecond - scene.startSecond) * FPS}>
          <StoryScene scene={scene} index={index} />
          {index > 0 ? <Audio src={staticFile("audio/sfx/transition.mp3")} volume={0.22} /> : null}
        </Sequence>
      ))}
      <div style={{bottom: 60, left: 128, maxWidth: 1220, position: "absolute", right: 128}}>
        {content.scenes.map((scene) => (
          <Sequence key={`caption-${scene.startSecond}`} from={scene.startSecond * FPS} durationInFrames={(scene.endSecond - scene.startSecond) * FPS}>
            <div style={{background: "rgba(3,10,21,.88)", borderLeft: `5px solid ${CYAN}`, borderRadius: 12, boxShadow: "0 12px 30px rgba(0,0,0,.3)", color: "#FFFFFF", fontSize: 26, fontWeight: 600, lineHeight: 1.3, padding: "16px 22px", width: "fit-content"}}>
              {scene.caption}
            </div>
          </Sequence>
        ))}
      </div>
      <div style={{background: GOLD, bottom: 0, height: 8, left: 0, position: "absolute", width: `${progress}%`}} />
      <Audio src={staticFile(content.audioFile)} volume={0.92} />
      <Audio src={staticFile("audio/music/elegant-bed.mp3")} volume={0.1} />
    </AbsoluteFill>
  );
};
