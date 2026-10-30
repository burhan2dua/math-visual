import { Img, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { TemplateData } from "../../types";
import product from "./assets/product.svg";

export const PromoTemplate = ({ data }: { data: TemplateData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0, fps * 0.8], [0, 1], {
    extrapolateRight: "clamp",
  });
  const float = Math.sin((frame / fps) * Math.PI * 2) * 12;

  return (
    <div
      style={{
        alignItems: "center",
        background: `linear-gradient(130deg, ${data.background} 35%, ${data.accent}55)`,
        color: "white",
        display: "flex",
        height: "100%",
        justifyContent: "space-between",
        overflow: "hidden",
        padding: "0 120px",
      }}
    >
      <div style={{ maxWidth: 720 }}>
        <div
          style={{
            background: data.accent,
            borderRadius: 999,
            color: data.background,
            display: "inline-block",
            font: "700 20px Arial, sans-serif",
            marginBottom: 34,
            opacity: progress,
            padding: "12px 20px",
          }}
        >
          CERITAKAN IDEMU
        </div>
        <h1
          style={{
            font: "700 76px/1.08 Arial, sans-serif",
            letterSpacing: -3,
            margin: 0,
            opacity: progress,
            transform: `translateX(${(1 - progress) * -60}px)`,
          }}
        >
          {data.title}
          <br />
          <span style={{ color: data.accent }}>{data.subtitle}</span>
        </h1>
        <p
          style={{
            color: "#d6e5e1",
            font: "24px Arial, sans-serif",
            marginTop: 36,
          }}
        >
          Satu folder, satu template, satu cerita.
        </p>
      </div>
      <Img
        src={product}
        style={{
          height: 390,
          transform: `translateY(${float}px) rotate(-5deg)`,
          width: 390,
        }}
      />
    </div>
  );
};
