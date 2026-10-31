import { Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TemplateData } from "../../types";
import illustration from "./assets/illustration.svg";

export const SalamTemplate = ({ data }: { data: TemplateData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, 18], [0, 1], {
    extrapolateRight: "clamp",
  });
  const rise = interpolate(frame, [0, 24], [35, 0], {
    extrapolateRight: "clamp",
  });
  const pulse = 1 + Math.sin((frame / fps) * Math.PI * 2) * 0.025;

  return (
    <div
      style={{
        alignItems: "center",
        background: `radial-gradient(circle at 75% 20%, ${data.accent}55, transparent 38%), ${data.background}`,
        color: "white",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        overflow: "hidden",
        position: "relative",
        textAlign: "center",
      }}
    >
      <Img
        src={illustration}
        style={{
          height: 190,
          opacity: opacity * 0.9,
          position: "absolute",
          right: 100,
          top: 80,
          transform: `scale(${pulse})`,
          width: 190,
        }}
      />
      <div
        style={{
          maxWidth: 1000,
          opacity,
          transform: `translateY(${rise}px)`,
        }}
      >
        <Img
          src="/shared/spark.svg"
          style={{ height: 44, marginBottom: 28, width: 44 }}
        />
        <h1
          style={{
            fontFamily: "Arial, sans-serif",
            fontSize: 88,
            letterSpacing: -3,
            margin: 0,
          }}
        >
          {data.title}
        </h1>
        <p
          style={{
            color: "#d8d9e8",
            fontFamily: "Arial, sans-serif",
            fontSize: 27,
            marginTop: 24,
          }}
        >
          {data.subtitle}
        </p>
      </div>
    </div>
  );
};
