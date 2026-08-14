import React, { useEffect, useRef, useState } from "react";

interface EventBannerBackgroundVideoProps {
  source: string;
  loadingLogo?: string;
  loadingLabel?: string;
  preferBundledSource?: boolean;
}

/**
 * Muted inline hero footage. `play()` is invoked after the element is ready
 * as well as through `autoPlay`: some mobile WebViews ignore declarative
 * autoplay after a carousel slide has mounted.
 */
export default function EventBannerBackgroundVideo({
  source,
  loadingLogo,
  loadingLabel = "Loading event film",
}: EventBannerBackgroundVideoProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasFirstFrame, setHasFirstFrame] = useState(false);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    setHasFirstFrame(false);

    const startPlayback = () => {
      video.muted = true;
      video.defaultMuted = true;
      const playback = video.play();
      if (playback) playback.catch(() => {});
    };
    const revealFirstFrame = () => {
      startPlayback();
      setHasFirstFrame(true);
    };

    startPlayback();
    video.addEventListener("canplay", startPlayback);
    video.addEventListener("loadeddata", revealFirstFrame);
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
      revealFirstFrame();
    }

    return () => {
      video.removeEventListener("canplay", startPlayback);
      video.removeEventListener("loadeddata", revealFirstFrame);
    };
  }, [source]);

  return (
    <>
      <video
        ref={videoRef}
        aria-hidden
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        src={source}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          // The rendered CLF lower third sits near the bottom of frame. Keep
          // it in view when the 16:9 film fills the taller Explorer hero.
          objectPosition: "center bottom",
          opacity: hasFirstFrame ? 0.88 : 0,
          pointerEvents: "none",
          transition: "opacity 180ms ease-out",
        }}
      />
      {!hasFirstFrame && (
        <div
          aria-label={loadingLabel}
          style={{
            position: "absolute",
            inset: 0,
            zIndex: 1,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 12,
            background:
              "radial-gradient(circle at center, #0a294a 0%, #04101d 68%)",
            pointerEvents: "none",
            transition: "opacity 180ms ease-out",
          }}
        >
          {loadingLogo ? (
            <img
              src={loadingLogo}
              alt=""
              style={{
                width: 190,
                maxWidth: "54%",
                height: "auto",
                maxHeight: 110,
                objectFit: "contain",
                filter: "drop-shadow(0 10px 24px rgba(0,0,0,.38))",
              }}
            />
          ) : null}
          <span
            style={{
              width: 22,
              height: 22,
              borderRadius: "50%",
              border: "2px solid rgba(255,255,255,.25)",
              borderTopColor: "#fff",
              animation: "event-banner-loader-spin 750ms linear infinite",
            }}
          />
          <style>{`@keyframes event-banner-loader-spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}
    </>
  );
}
