import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

type Cue = {
  id: string;
  beat: number;
  voice: string;
  notes?: number[];
  gain?: number;
  pan?: number;
};

type PiData = {
  title: string;
  subtitle: string;
  background: string;
  accent: string;
  durationInSeconds: number;
  width?: number;
  height?: number;
  fps?: number;
  bpm: number;
  audio: string;
  sound?: unknown; // dibaca generator audio
  pads?: unknown[]; // dibaca generator audio
  colors: { wheel: string; bar: string; text: string };
  piValue: number;
  wholeBars: number;
  labels: {
    diameter: string;
    bar: string;
    remainder: string;
    total: string;
    turn: string;
    pi: string;
    unknown: string;
  };
  piDigits: string;
  brightDigits: number;
  digitsTail: string;
  captions: Array<{ text: string; from: string; to?: string }>;
  camera: Array<{ cue: string; power: number }>;
  unrollSparks: string[];
  cues: Cue[];
};

const PHI = 1.6180339887;
const FONT = "'Poppins','Inter','Segoe UI',system-ui,sans-serif";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const backOut = Easing.out(Easing.back(1.7));

const ramp = (
  v: number,
  a: number,
  b: number,
  easing: (t: number) => number = Easing.linear,
) => {
  if (b <= a) return v >= b ? 1 : 0;
  return interpolate(v, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });
};

const Txt: React.FC<{
  x: number;
  y: number;
  size: number;
  color: string;
  glow?: string;
  opacity?: number;
  scale?: number;
  weight?: number;
  k?: number;
  children: React.ReactNode;
}> = ({ x, y, size, color, glow, opacity = 1, scale = 1, weight = 800, k = 1, children }) => {
  if (opacity <= 0.001) return null;
  const g = glow ?? color;
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        transform: `translate(-50%, -50%) scale(${scale})`,
        whiteSpace: "nowrap",
        fontFamily: FONT,
        fontWeight: weight,
        fontSize: size,
        lineHeight: 1,
        opacity: clamp01(opacity),
        color,
        textShadow: `0 0 ${6 * k}px ${g}, 0 0 ${18 * k}px ${g}88`,
      }}
    >
      {children}
    </div>
  );
};

export const Template: React.FC<{ data: PiData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const WHEEL = data.colors.wheel;
  const BAR = data.colors.bar;
  const TEXT = data.colors.text;
  const GOLD = data.accent;
  const NB = data.wholeBars;

  /* ───────── timeline: semua visual dikunci ke cue di data.json ───────── */
  const beat = (frame / fps) * (data.bpm / 60);
  const cueMap = useMemo(
    () => new Map(data.cues.map((c) => [c.id, c.beat] as const)),
    [data.cues],
  );
  const at = (id: string) => cueMap.get(id) ?? 1e9;
  const prog = (
    id: string,
    dur = 0.5,
    easing: (t: number) => number = easeOut,
    offset = 0,
  ) => ramp(beat, at(id) + offset, at(id) + offset + dur, easing);
  const pulse = (id: string, dur = 0.6) =>
    beat < at(id) ? 0 : 1 - clamp01((beat - at(id)) / dur);

  const fit = (text: string, maxSize: number, frac: number, k = 0.56) =>
    Math.min(maxSize, (W * frac) / (Math.max(text.length, 1) * k));

  /* ───────── geometri (golden ratio) ───────── */
  const margin = W / PHI ** 6; // ≈ 60 px
  const x0 = margin;
  const D = (W - 2 * margin) / (data.piValue + 0.5);
  const R = D / 2;
  const xs = x0 + R; // titik sentuh roda = awal garis
  const L = Math.PI * D; // keliling roda yang dibentangkan
  const remW = L - NB * D; // sisa kecil (≈ 0.14 D)
  const dRad = D / R; // sudut busur sepanjang satu diameter (2 rad)
  const TWO_PI = 2 * Math.PI;

  const titleY = H / PHI ** 5;
  const subY = H / PHI ** 4;
  const ruleY = subY + 55;
  const wheelY = H / PHI ** 2;
  const pathY = wheelY + R;
  const barsY = pathY + 144;
  const barH = 55;
  const bracketY = barsY + barH / 2 + 34;
  const counterY = bracketY + 105;
  const piY = counterY + 270;
  const digitsY = piY + 170;
  const captionY = H - 120;
  const gapCx = xs + NB * D + remW / 2;
  const endX = xs + L;
  const remLabelX = Math.min(gapCx, W - margin - 62);

  /* ───────── gerak roda ───────── */
  const slideT = ramp(beat, at("slide"), at("slide") + 1.5, easeInOut);
  const wx = lerp(W / 2, xs, slideT);
  const P = (phi: number) => ({
    x: wx + R * Math.sin(phi),
    y: wheelY + R * Math.cos(phi),
  });

  /* ───────── proses membuka rim jadi garis ───────── */
  const unIds = ["un_0", ...Array.from({ length: NB }, (_, i) => `un_${i + 1}`), "un_end"];
  const marks = [...Array.from({ length: NB + 1 }, (_, i) => i * D), L];
  const sOf = (b: number) => {
    for (let i = 0; i < unIds.length - 1; i++) {
      if (b < at(unIds[i + 1])) {
        return lerp(marks[i], marks[i + 1], ramp(b, at(unIds[i]), at(unIds[i + 1]), easeInOut));
      }
    }
    return L;
  };
  const sNow = sOf(beat);
  const phiS = sNow / R;
  const unrollP = ramp(beat, at("un_0"), at("un_end"));
  const tipX = xs + sNow;

  const chunks = [
    ...Array.from({ length: NB }, (_, i) => ({
      a: dRad * i,
      b: dRad * (i + 1),
      id: `cmk_${i + 1}`,
      color: BAR,
      s0: i * D,
      s1: (i + 1) * D,
    })),
    { a: dRad * NB, b: TWO_PI, id: "cmk_r", color: GOLD, s0: NB * D, s1: L },
  ];

  const dimD = 1 - 0.55 * prog("pi_in", 1);
  const fadeDim = 1 - ramp(beat, at("un_0") - 0.8, at("un_0") - 0.1);

  /* ───────── judul ───────── */
  const tIn = prog("title_in", 1.2, backOut);
  const sIn = prog("sub_in", 1, easeOut);
  const ulT = ramp(beat, at("title_line"), at("title_line") + 2, easeInOut);
  const titleSize = fit(data.title, 89, 0.9, 0.62);
  const subSize = fit(data.subtitle, 34, 0.9, 0.56);

  /* ───────── roda ───────── */
  const circleP = ramp(beat, at("wheel_draw"), at("wheel_close"), easeInOut);
  const closeT = prog("wheel_close", 0.8);
  const hubT = prog("wheel_hub", 0.5, backOut);
  const baseOp = 1 - 0.8 * prog("cmk_r", 0.6);
  const wheelPath = `M ${wx} ${wheelY - R} A ${R} ${R} 0 1 1 ${wx} ${wheelY + R} A ${R} ${R} 0 1 1 ${wx} ${wheelY - R}`;
  const headA = circleP * 2 * Math.PI;
  const head = { x: wx + R * Math.sin(headA), y: wheelY - R * Math.cos(headA) };
  const dP = ramp(beat, at("diam_draw"), at("diam_end1"), easeInOut);

  /* ───────── garis dimensi D ───────── */
  const dimY = wheelY - R - 34;
  const dimDraw = ramp(beat, at("dim_draw"), at("dim_draw") + 1, easeOut);
  const dimLabelX = Math.max(wx, x0 + 170);
  const dimLabelT = prog("dim_label", 0.6, backOut);
  const dimLabelSize = fit(data.labels.diameter, 55, 0.4, 0.58);

  /* ───────── penggaris ───────── */
  const pathP = ramp(beat, at("path_draw"), at("path_end"));
  const endT = prog("path_end", 0.3, backOut);

  /* ───────── batang ───────── */
  const landed = Array.from({ length: NB }, (_, i) => beat >= at(`bar_${i}`)).filter(Boolean).length;
  const gapLanded = beat >= at("gap_land");
  const gapDropT = ramp(beat, at("gap_drop"), at("gap_land"), easeOut);
  const gapPulse = pulse("gap_land", 0.5);
  const bracketP = ramp(beat, at("bracket_draw"), at("total"), easeInOut);
  const counterPulse = Math.max(
    ...Array.from({ length: NB }, (_, i) => pulse(`bar_${i}`, 0.4)),
    pulse("gap_land", 0.5),
    pulse("total", 0.8),
  );
  const counterText = gapLanded ? data.labels.total : landed > 0 ? `${landed} ${data.labels.bar}` : "";
  const counterColor = gapLanded ? GOLD : BAR;
  const counterSize = fit(counterText || data.labels.total, 144, 0.5, 0.62);
  const remLblT = prog("gap_lbl", 0.4, backOut);

  /* ───────── pi ───────── */
  const digitsAll = data.piDigits + data.digitsTail;
  const digitsSize = Math.min(110, (W * 0.9) / (Math.max(digitsAll.length, 1) * 0.62));
  const piSymT = prog("pi_sym", 0.8, backOut);

  /* ───────── gelombang kejut ───────── */
  const ring = (
    key: string,
    start: number,
    x: number,
    y: number,
    r0: number,
    grow: number,
    dur: number,
    color: string,
  ) => {
    const age = (beat - start) / dur;
    if (age <= 0 || age >= 1) return null;
    return (
      <circle
        key={key}
        cx={x}
        cy={y}
        r={r0 * (1 + grow * easeOut(age))}
        fill="none"
        stroke={color}
        strokeWidth={4}
        opacity={1 - age}
      />
    );
  };

  /* ───────── kamera: zoom in-out + getar halus ───────── */
  let camZ = 0;
  let camX = 0;
  let camY = 0;
  let camR = 0;
  data.camera.forEach((c, i) => {
    const dt = ((beat - at(c.cue)) * 60) / data.bpm;
    if (dt < 0 || dt > 1.8) return;
    const env = (1 - Math.exp(-dt * 30)) * Math.exp(-dt * 4.2);
    camZ += env * c.power * 0.014;
    camX += env * c.power * 7 * Math.sin(dt * 72 + i * 1.9);
    camY += env * c.power * 7 * Math.cos(dt * 61 + i * 2.7);
    camR += env * c.power * 0.25 * Math.sin(dt * 47 + i);
  });
  camZ = Math.min(camZ, 0.02);
  const unrollEnv = Math.sin(Math.PI * unrollP);
  const panX = -(tipX - W / 2) * 0.02 * unrollEnv;
  const scaleAll = 1 + 0.006 * Math.sin(beat * 0.35) + 0.01 * unrollEnv + camZ;

  const capOpacity = (c: { from: string; to?: string }) => {
    const s = at(c.from);
    const e = c.to ? at(c.to) : 1e9;
    return ramp(beat, s + 0.3, s + 1.1) * (1 - ramp(beat, e - 0.8, e - 0.1));
  };

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 42%, #0b1630 0%, ${data.background} 72%)`,
        overflow: "hidden",
      }}
    >
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "50% 50%",
          transform: `translate(${camX + panX}px, ${camY}px) rotate(${camR}deg) scale(${scaleAll})`,
        }}
      >
        {/* debu halus */}
        {Array.from({ length: 22 }, (_, i) => {
          const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * W;
          const y0 = (Math.sin(i * 37.3 + 1) * 0.5 + 0.5) * H;
          const y = (((y0 - beat * (5 + (i % 5) * 3)) % H) + H) % H;
          const s = 3 + (i % 3) * 2;
          return (
            <div
              key={i}
              style={{
                position: "absolute",
                left: x,
                top: y,
                width: s,
                height: s,
                borderRadius: "50%",
                background: TEXT,
                opacity: (0.2 + 0.2 * Math.sin(beat * 1.5 + i)) * 0.5,
              }}
            />
          );
        })}

        {/* ───────── shape & garis (border glow tipis) ───────── */}
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} style={{ position: "absolute", left: 0, top: 0 }}>
          <defs>
            <filter
              id="pi-glow"
              filterUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={W}
              height={H}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g filter="url(#pi-glow)">
            {/* garis putus-putus di bawah subjudul */}
            {ulT > 0 && (
              <>
                <line
                  x1={W / 2}
                  y1={ruleY}
                  x2={W / 2 - W * 0.4 * ulT}
                  y2={ruleY}
                  stroke={GOLD}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="10 12"
                />
                <line
                  x1={W / 2}
                  y1={ruleY}
                  x2={W / 2 + W * 0.4 * ulT}
                  y2={ruleY}
                  stroke={GOLD}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="10 12"
                />
              </>
            )}

            <g opacity={dimD}>
              {/* penggaris putus-putus + tanda tiap D */}
              {pathP > 0.001 && (
                <line
                  x1={xs}
                  y1={pathY}
                  x2={xs + L * pathP}
                  y2={pathY}
                  stroke="#9fc4ff"
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="12 12"
                  opacity={0.55}
                />
              )}
              {Array.from({ length: NB + 1 }, (_, k) => {
                const id = k === 0 ? "path_start" : `path_t${k}`;
                const t = prog(id, 0.3, backOut);
                if (t <= 0) return null;
                return (
                  <line
                    key={`tk${k}`}
                    x1={xs + k * D}
                    y1={pathY - 15 * t}
                    x2={xs + k * D}
                    y2={pathY + 15 * t}
                    stroke={TEXT}
                    strokeWidth={4}
                    strokeLinecap="round"
                  />
                );
              })}
              {endT > 0 && (
                <line
                  x1={endX}
                  y1={pathY - 20 * endT}
                  x2={endX}
                  y2={pathY + 20 * endT}
                  stroke={GOLD}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
              )}

              {/* garis dimensi D di atas roda */}
              {dimDraw > 0.001 && (
                <g opacity={fadeDim}>
                  <line
                    x1={wx - R}
                    y1={wheelY - 6}
                    x2={wx - R}
                    y2={lerp(wheelY - 6, dimY, dimDraw)}
                    stroke={TEXT}
                    strokeWidth={2}
                    strokeDasharray="7 8"
                    opacity={0.6}
                  />
                  <line
                    x1={wx + R}
                    y1={wheelY - 6}
                    x2={wx + R}
                    y2={lerp(wheelY - 6, dimY, dimDraw)}
                    stroke={TEXT}
                    strokeWidth={2}
                    strokeDasharray="7 8"
                    opacity={0.6}
                  />
                  <line x1={wx} y1={dimY} x2={wx - R * dimDraw} y2={dimY} stroke={TEXT} strokeWidth={4} strokeLinecap="round" />
                  <line x1={wx} y1={dimY} x2={wx + R * dimDraw} y2={dimY} stroke={TEXT} strokeWidth={4} strokeLinecap="round" />
                  <line x1={wx - R * dimDraw} y1={dimY - 12} x2={wx - R * dimDraw} y2={dimY + 12} stroke={TEXT} strokeWidth={4} strokeLinecap="round" />
                  <line x1={wx + R * dimDraw} y1={dimY - 12} x2={wx + R * dimDraw} y2={dimY + 12} stroke={TEXT} strokeWidth={4} strokeLinecap="round" />
                </g>
              )}

              {/* roda merah */}
              {circleP > 0.001 && (
                <g>
                  <circle cx={wx} cy={wheelY} r={R} fill={WHEEL} fillOpacity={0.1 * closeT} />
                  <circle
                    cx={wx}
                    cy={wheelY}
                    r={R - 16}
                    fill="none"
                    stroke={WHEEL}
                    strokeWidth={2}
                    opacity={0.35 * closeT}
                  />
                  <path
                    d={wheelPath}
                    fill="none"
                    stroke={WHEEL}
                    strokeWidth={6}
                    strokeLinecap="round"
                    pathLength={1}
                    strokeDasharray={circleP >= 1 ? undefined : "1 1"}
                    strokeDashoffset={1 - circleP}
                    opacity={baseOp}
                  />
                  {circleP < 0.999 && <circle cx={head.x} cy={head.y} r={11} fill={TEXT} />}

                  {/* diameter horizontal */}
                  <g opacity={fadeDim}>
                    {dP > 0.001 && (
                      <line
                        x1={wx - R}
                        y1={wheelY}
                        x2={wx - R + 2 * R * dP}
                        y2={wheelY}
                        stroke={TEXT}
                        strokeWidth={4}
                        strokeLinecap="round"
                      />
                    )}
                    {beat >= at("diam_end0") && (
                      <circle cx={wx - R} cy={wheelY} r={9 * prog("diam_end0", 0.3, backOut)} fill={TEXT} />
                    )}
                    {beat >= at("diam_end1") && (
                      <circle cx={wx + R} cy={wheelY} r={9 * prog("diam_end1", 0.3, backOut)} fill={TEXT} />
                    )}
                  </g>

                  {/* busur rim per panjang diameter: biru, biru, biru, sisa emas */}
                  {chunks.map((c) => {
                    const e = c.a + (c.b - c.a) * prog(c.id, 0.5);
                    const st = Math.max(c.a, phiS);
                    if (e - st < 0.002) return null;
                    const p = P(st);
                    const q = P(e);
                    return (
                      <path
                        key={`rim-${c.id}`}
                        d={`M ${p.x} ${p.y} A ${R} ${R} 0 ${e - st > Math.PI ? 1 : 0} 0 ${q.x} ${q.y}`}
                        fill="none"
                        stroke={c.color}
                        strokeWidth={8}
                        strokeLinecap="round"
                      />
                    );
                  })}

                  {/* titik batas busur di rim */}
                  {chunks.slice(0, NB).map((c) => {
                    const t = prog(c.id, 0.3, backOut);
                    if (t <= 0 || phiS >= c.b) return null;
                    const p = P(c.b);
                    return <circle key={`bd-${c.id}`} cx={p.x} cy={p.y} r={9 * t} fill={TEXT} />;
                  })}

                  {/* titik kupas di rim */}
                  {sNow > 0.5 && sNow < L - 0.5 && (
                    <circle cx={P(phiS).x} cy={P(phiS).y} r={11} fill={TEXT} />
                  )}
                  <circle cx={wx} cy={wheelY} r={10 * hubT} fill={TEXT} />
                </g>
              )}

              {/* garis hasil buka rim: segmen biru dan sisa emas */}
              {chunks.map((c) => {
                if (sNow <= c.s0 + 0.5) return null;
                return (
                  <line
                    key={`ln-${c.id}`}
                    x1={xs + c.s0}
                    y1={pathY}
                    x2={xs + Math.min(sNow, c.s1)}
                    y2={pathY}
                    stroke={c.color}
                    strokeWidth={8}
                    strokeLinecap="round"
                  />
                );
              })}
              {sNow > 0.5 && sNow < L - 0.5 && <circle cx={tipX} cy={pathY} r={11} fill={TEXT} />}

              {/* batang biru D */}
              {Array.from({ length: NB }, (_, i) => {
                const id = `bar_${i}`;
                const t = ramp(beat, at(`${id}_drop`), at(id), easeOut);
                if (t <= 0) return null;
                const lp = pulse(id, 0.4);
                const y = barsY - (1 - t) * 70;
                return (
                  <rect
                    key={id}
                    x={xs + i * D + 2}
                    y={y - barH / 2 - 2 * lp}
                    width={D - 4}
                    height={barH + 4 * lp}
                    rx={12}
                    fill={BAR}
                    fillOpacity={0.14 + 0.14 * lp}
                    stroke={BAR}
                    strokeWidth={4}
                    opacity={clamp01(t * 2)}
                  />
                );
              })}

              {/* sisa kecil 0.14 D */}
              {gapDropT > 0 && (
                <rect
                  x={xs + NB * D + 2}
                  y={barsY - (1 - gapDropT) * 70 - barH / 2 - 2 * gapPulse}
                  width={Math.max(remW - 4, 4)}
                  height={barH + 4 * gapPulse}
                  rx={10}
                  fill={GOLD}
                  fillOpacity={0.25 + 0.2 * gapPulse}
                  stroke={GOLD}
                  strokeWidth={4}
                  opacity={clamp01(gapDropT * 2)}
                />
              )}

              {/* kurung total */}
              {bracketP > 0.001 && (
                <g>
                  <line x1={xs} y1={bracketY} x2={xs + L * bracketP} y2={bracketY} stroke={GOLD} strokeWidth={5} strokeLinecap="round" />
                  <line x1={xs} y1={bracketY - 16} x2={xs} y2={bracketY + 4} stroke={GOLD} strokeWidth={5} strokeLinecap="round" />
                  {bracketP >= 0.999 && (
                    <line x1={endX} y1={bracketY - 16} x2={endX} y2={bracketY + 4} stroke={GOLD} strokeWidth={5} strokeLinecap="round" />
                  )}
                </g>
              )}
            </g>

            {/* cincin cahaya sinkron cue */}
            {ring("k-wc", at("wheel_close"), wx, wheelY, R, 0.5, 1.0, WHEEL)}
            {ring("k-cr", at("cmk_r"), wx, wheelY, R, 0.45, 1.1, GOLD)}
            {Array.from({ length: NB }, (_, k) =>
              ring(`k-un${k + 1}`, at(`un_${k + 1}`), xs + (k + 1) * D, pathY, 14, 3, 0.9, BAR),
            )}
            {ring("k-ue", at("un_end"), endX, pathY, 14, 3.5, 1.2, GOLD)}
            {data.unrollSparks.map((id, i) => {
              const age = (beat - at(id)) / 0.7;
              if (age <= 0 || age >= 1) return null;
              return (
                <circle
                  key={`sp${i}`}
                  cx={xs + sOf(at(id))}
                  cy={pathY}
                  r={10 + 30 * easeOut(age)}
                  fill="none"
                  stroke={TEXT}
                  strokeWidth={3}
                  opacity={1 - age}
                />
              );
            })}
            {ring("k-gl", at("gap_land"), gapCx, barsY, 20, 3, 0.8, GOLD)}
            {ring("k-to", at("total"), xs + L / 2, bracketY, 40, 3, 1.4, GOLD)}
            {ring("k-pi", at("pi_sym"), W / 2, piY, 80, 2.2, 1.4, GOLD)}
            {ring("k-fi", at("final"), W / 2, digitsY, 150, 1.4, 1.8, GOLD)}
          </g>
        </svg>

        {/* ───────── teks & angka ───────── */}
        <Txt
          x={W / 2}
          y={titleY - (1 - clamp01(tIn)) * 36}
          size={titleSize}
          color={TEXT}
          glow={GOLD}
          opacity={clamp01(tIn * 1.5)}
          scale={0.9 + 0.1 * Math.min(tIn, 1)}
        >
          {data.title}
        </Txt>
        <Txt x={W / 2} y={subY} size={subSize} color={GOLD} weight={600} opacity={sIn * 0.95} k={0.5}>
          {data.subtitle}
        </Txt>

        {/* label diameter */}
        <Txt
          x={dimLabelX}
          y={dimY - 62}
          size={dimLabelSize}
          color={TEXT}
          glow={TEXT}
          opacity={dimLabelT * fadeDim}
          scale={0.7 + 0.3 * clamp01(dimLabelT)}
          k={0.6}
        >
          {data.labels.diameter}
        </Txt>

        {/* angka penggaris: 0, 1, 2, 3 (satuan D) */}
        {Array.from({ length: NB + 1 }, (_, k) => {
          const id = k === 0 ? "path_start" : `path_t${k}`;
          const t = prog(id, 0.3, backOut);
          return (
            <Txt
              key={`rn${k}`}
              x={xs + k * D}
              y={pathY + 46}
              size={34}
              color={TEXT}
              weight={700}
              opacity={t * dimD * 0.9}
              scale={0.7 + 0.3 * clamp01(t)}
              k={0.4}
            >
              {k}
            </Txt>
          );
        })}

        {/* ujung penggaris: ? lalu 0.14 D */}
        <Txt
          x={endX}
          y={pathY - 54}
          size={44}
          color={GOLD}
          glow={GOLD}
          opacity={prog("end_q", 0.4) * (1 - remLblT) * dimD}
          scale={0.7 + 0.3 * prog("end_q", 0.4, backOut)}
        >
          {data.labels.unknown}
        </Txt>
        <Txt
          x={remLabelX}
          y={pathY - 54}
          size={34}
          color={GOLD}
          glow={GOLD}
          opacity={remLblT * dimD}
          scale={0.7 + 0.3 * clamp01(remLblT)}
          k={0.7}
        >
          {data.labels.remainder}
        </Txt>

        {/* nomor busur di dalam roda */}
        {chunks.slice(0, NB).map((c, i) => {
          const mid = P((c.a + c.b) / 2);
          const inward = {
            x: lerp(wx, mid.x, (R - 44) / R),
            y: lerp(wheelY, mid.y, (R - 44) / R),
          };
          const t = prog(c.id, 0.4, backOut);
          return (
            <Txt
              key={`cn${i}`}
              x={inward.x}
              y={inward.y}
              size={36}
              color={BAR}
              glow={BAR}
              opacity={clamp01(t * 1.5) * (1 - ramp(phiS, c.a, c.b)) * dimD}
              scale={0.7 + 0.3 * clamp01(t)}
              k={0.6}
            >
              {i + 1}
            </Txt>
          );
        })}

        {/* label 1 turn */}
        <Txt
          x={xs + 1.8 * D}
          y={pathY - 54}
          size={34}
          color={TEXT}
          weight={700}
          opacity={prog("roll_label", 0.5) * dimD}
          scale={0.8 + 0.2 * prog("roll_label", 0.5, backOut)}
          k={0.5}
        >
          {data.labels.turn}
        </Txt>

        {/* label D di dalam batang */}
        {Array.from({ length: NB }, (_, i) => (
          <Txt
            key={`bl${i}`}
            x={xs + i * D + D / 2}
            y={barsY}
            size={34}
            color={TEXT}
            weight={700}
            opacity={prog(`bar_${i}_lbl`, 0.3) * dimD}
            scale={0.7 + 0.3 * prog(`bar_${i}_lbl`, 0.3, backOut)}
            k={0.5}
          >
            {data.labels.bar}
          </Txt>
        ))}

        {/* penghitung / total */}
        <Txt
          x={xs + L / 2}
          y={counterY}
          size={counterSize}
          color={counterColor}
          glow={counterColor}
          opacity={(counterText ? 1 : 0) * dimD}
          scale={1 + 0.14 * counterPulse}
        >
          {counterText}
        </Txt>

        {/* pi */}
        <Txt
          x={W / 2}
          y={piY}
          size={144}
          color={GOLD}
          glow={GOLD}
          opacity={piSymT}
          scale={(0.6 + 0.4 * clamp01(piSymT)) * (1 + 0.08 * pulse("final", 0.8))}
        >
          {data.labels.pi}
        </Txt>
        <div
          style={{
            position: "absolute",
            left: W / 2,
            top: digitsY,
            transform: "translate(-50%, -50%)",
            whiteSpace: "nowrap",
            fontFamily: FONT,
            fontWeight: 800,
            fontSize: digitsSize,
            lineHeight: 1,
          }}
        >
          {data.piDigits.split("").map((ch, i) => {
            const t = prog(`pi_d${i}`, 0.35, backOut);
            const bright = i < data.brightDigits;
            return (
              <span
                key={`dg${i}`}
                style={{
                  display: "inline-block",
                  opacity: clamp01(t * 1.5) * (bright ? 1 : 0.6),
                  transform: `scale(${0.6 + 0.4 * clamp01(t)})`,
                  color: bright ? GOLD : TEXT,
                  textShadow: bright
                    ? `0 0 8px ${GOLD}, 0 0 22px ${GOLD}88`
                    : `0 0 6px ${TEXT}66`,
                }}
              >
                {ch}
              </span>
            );
          })}
          <span
            style={{
              display: "inline-block",
              opacity: clamp01(prog("pi_dots", 0.5) * 1.5) * 0.6,
              color: TEXT,
              textShadow: `0 0 6px ${TEXT}66`,
            }}
          >
            {data.digitsTail}
          </span>
        </div>

        {/* caption singkat */}
        {data.captions.map((c, i) => (
          <Txt
            key={`cp${i}`}
            x={W / 2}
            y={captionY}
            size={fit(c.text, 34, 0.9, 0.56)}
            color={TEXT}
            weight={600}
            opacity={capOpacity(c)}
            k={0.4}
          >
            {c.text}
          </Txt>
        ))}
      </div>
    </AbsoluteFill>
  );
};