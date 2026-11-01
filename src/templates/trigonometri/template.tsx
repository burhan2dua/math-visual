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

type SweepTarget =
  | "rule"
  | "ground"
  | "dist"
  | "wall"
  | "tri"
  | "building"
  | "formulaLine"
  | "calcLine"
  | "answerLine";

type ColorKey = "dist" | "angle" | "height" | "building" | "text";

type Sweep = {
  cue: string;
  target: SweepTarget;
  dur: number; // dalam beat
  delay?: number; // dalam beat
  color: ColorKey;
};

type TrigData = {
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
  colors: Record<ColorKey, string>;
  distance: number;
  angleDeg: number;
  unit: string;
  draftOpacity: number;
  layout: { groundY: number; observerX: number; wallX: number; buildingWidth: number };
  labels: {
    distance: string;
    angle: string;
    height: string;
    unknown: string;
    formula: string;
  };
  captions: Array<{ text: string; from: string; to?: string }>;
  camera: Array<{ cue: string; power: number }>;
  sweeps: Sweep[];
  cues: Cue[];
};

type Pt = { x: number; y: number };

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

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);

const polyLength = (pts: Pt[]) => {
  let s = 0;
  for (let i = 0; i < pts.length - 1; i++) s += dist(pts[i], pts[i + 1]);
  return s;
};

/* potongan polyline antara jarak a..b dari titik awal */
const subPath = (pts: Pt[], a: number, b: number) => {
  let d = "";
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const p = pts[i];
    const q = pts[i + 1];
    const L = dist(p, q);
    const s0 = acc;
    const s1 = acc + L;
    acc = s1;
    if (L <= 0 || s1 < a || s0 > b) continue;
    const ta = Math.max(0, (a - s0) / L);
    const tb = Math.min(1, (b - s0) / L);
    const A = { x: lerp(p.x, q.x, ta), y: lerp(p.y, q.y, ta) };
    const B = { x: lerp(p.x, q.x, tb), y: lerp(p.y, q.y, tb) };
    d += d === "" ? `M ${A.x} ${A.y} L ${B.x} ${B.y}` : ` L ${A.x} ${A.y} L ${B.x} ${B.y}`;
  }
  return d;
};

const pointAtDist = (pts: Pt[], s: number): Pt => {
  let acc = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const L = dist(pts[i], pts[i + 1]);
    if (s <= acc + L && L > 0) {
      const t = (s - acc) / L;
      return { x: lerp(pts[i].x, pts[i + 1].x, t), y: lerp(pts[i].y, pts[i + 1].y, t) };
    }
    acc += L;
  }
  return pts[pts.length - 1];
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

const Row: React.FC<{
  y: number;
  width: number;
  size: number;
  opacity?: number;
  scale?: number;
  children: React.ReactNode;
}> = ({ y, width, size, opacity = 1, scale = 1, children }) =>
  opacity <= 0.001 ? null : (
    <div
      style={{
        position: "absolute",
        left: 0,
        width,
        top: y,
        textAlign: "center",
        transform: `translateY(-50%) scale(${scale})`,
        fontFamily: FONT,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        whiteSpace: "nowrap",
        opacity: clamp01(opacity),
      }}
    >
      {children}
    </div>
  );

export const Template: React.FC<{ data: TrigData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const C = data.colors;
  const TEXT = C.text;
  const GOLD = data.accent;
  const D = data.draftOpacity;

  const glow = (c: string, k = 1): React.CSSProperties => ({
    color: c,
    textShadow: `0 0 ${6 * k}px ${c}, 0 0 ${18 * k}px ${c}88`,
  });
  const S: React.FC<{ c: string; children: React.ReactNode }> = ({ c, children }) => (
    <span style={glow(c)}>{children}</span>
  );

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

  /* ───────── matematika (dari data.json) ───────── */
  const thetaRad = (data.angleDeg * Math.PI) / 180;
  const hm = data.distance * Math.tan(thetaRad);
  const tanVal = Math.tan(thetaRad);

  /* ───────── geometri ───────── */
  const gy = data.layout.groundY;
  const ox = data.layout.observerX;
  const wx = data.layout.wallX;
  const bw = data.layout.buildingWidth;
  const dpx = wx - ox;
  const ppm = dpx / data.distance;
  const hpx = hm * ppm;
  const topY = gy - hpx;

  const titleY = H / PHI ** 5 + 20;
  const subY = titleY + 66;
  const ruleY = subY + 50;
  const formulaY = gy + 190;
  const calcY = gy + 285;
  const answerY = gy + 400;
  const captionY = gy + 500;
  const titleSize = fit(data.title, 62, 0.9, 0.6);
  const subSize = fit(data.subtitle, 34, 0.9, 0.56);

  /* ───────── tahap animasi ───────── */
  const sweepP = ramp(beat, at("sweep"), at("sweep_end"), easeInOut);
  const alpha = data.angleDeg * sweepP;
  const alphaRad = (alpha * Math.PI) / 180;
  const endY = gy - dpx * Math.tan(alphaRad);
  const litDist = prog("base_line", 0.6);
  const litTri = prog("tri", 0.7);
  const litRa = prog("ra", 0.5);
  const litFormula = prog("formula", 0.7);
  const fadeT = prog("fade", 1.2);
  const keep = 1 - 0.8 * fadeT;
  const fillT = ramp(beat, at("fill"), at("fill") + 2.5, easeOut);
  const answered = beat >= at("answer");
  const ansPulse = pulse("answer", 0.9);

  let swingCount = 0;
  while (cueMap.has(`sw_${swingCount}`)) swingCount += 1;
  let swingPulse = 0;
  for (let k = 0; k < swingCount; k++) swingPulse = Math.max(swingPulse, pulse(`sw_${k}`, 0.45));

  /* ───────── busur sudut ───────── */
  const arcR = 120;
  const arcPath = (deg: number) => {
    const d = Math.max(deg, 0);
    if (d < 0.2) return "";
    const r = (d * Math.PI) / 180;
    const ex = ox + arcR * Math.cos(r);
    const ey = gy - arcR * Math.sin(r);
    return `M ${ox + arcR} ${gy} A ${arcR} ${arcR} 0 0 0 ${ex} ${ey}`;
  };
  const midR = (data.angleDeg * Math.PI) / 360;
  const angLbl = { x: ox + 190 * Math.cos(midR), y: gy - 190 * Math.sin(midR) + 6 };

  /* ───────── garis target untuk kilatan ───────── */
  const lines: Record<SweepTarget, Pt[][]> = {
    rule: [
      [{ x: W / 2, y: ruleY }, { x: W / 2 - W * 0.4, y: ruleY }],
      [{ x: W / 2, y: ruleY }, { x: W / 2 + W * 0.4, y: ruleY }],
    ],
    ground: [[{ x: 60, y: gy }, { x: 950, y: gy }]],
    dist: [[{ x: ox, y: gy + 50 }, { x: wx, y: gy + 50 }]],
    wall: [[{ x: wx, y: gy }, { x: wx, y: topY }]],
    tri: [[{ x: ox, y: gy }, { x: wx, y: gy }, { x: wx, y: topY }, { x: ox, y: gy }]],
    building: [
      [
        { x: wx, y: gy },
        { x: wx, y: topY },
        { x: wx + bw, y: topY },
        { x: wx + bw, y: gy },
        { x: wx, y: gy },
      ],
    ],
    formulaLine: [[{ x: W / 2 - 400, y: formulaY + 48 }, { x: W / 2 + 400, y: formulaY + 48 }]],
    calcLine: [[{ x: W / 2 - 400, y: calcY + 42 }, { x: W / 2 + 400, y: calcY + 42 }]],
    answerLine: [[{ x: W / 2 - 380, y: answerY + 66 }, { x: W / 2 + 380, y: answerY + 66 }]],
  };

  const glints: React.ReactNode[] = [];
  data.sweeps.forEach((sw, si) => {
    const tt = (beat - at(sw.cue) - (sw.delay ?? 0)) / sw.dur;
    if (tt <= 0 || tt >= 1) return;
    const e = easeInOut(tt);
    const col = C[sw.color];
    lines[sw.target].forEach((line, li) => {
      const total = polyLength(line);
      if (total <= 0) return;
      const len = Math.max(90, total * 0.16);
      const s = e * (total + len);
      const a = Math.max(0, s - len);
      const b = Math.min(total, s);
      if (b <= a) return;
      const d = subPath(line, a, b);
      if (!d) return;
      const head = pointAtDist(line, b);
      glints.push(
        <g key={`gl${si}-${li}`}>
          <path d={d} fill="none" stroke={col} strokeWidth={16} strokeLinecap="round" opacity={0.28} />
          <path d={d} fill="none" stroke={TEXT} strokeWidth={6} strokeLinecap="round" />
          <circle cx={head.x} cy={head.y} r={7} fill={TEXT} />
        </g>,
      );
    });
  });

  /* ───────── teks rumus ───────── */
  const calcText = beat >= at("tan");
  const buildingLblSize = Math.min(40, (bw - 16) / (7 * 0.58));
  const hLabel = answered ? `${hm.toFixed(1)} ${data.unit}` : `${data.labels.height} = ${data.labels.unknown}`;
  const fSize = 62;

  /* ───────── kamera: zoom in-out + getar halus ───────── */
  let camZ = 0;
  let camX = 0;
  let camY = 0;
  let camR = 0;
  data.camera.forEach((c, i) => {
    const dt = ((beat - at(c.cue)) * 60) / data.bpm;
    if (dt < 0 || dt > 1.8) return;
    const env = (1 - Math.exp(-dt * 30)) * Math.exp(-dt * 4.2);
    camZ += env * c.power * 0.013;
    camX += env * c.power * 6 * Math.sin(dt * 72 + i * 1.9);
    camY += env * c.power * 6 * Math.cos(dt * 61 + i * 2.7);
    camR += env * c.power * 0.2 * Math.sin(dt * 47 + i);
  });
  camZ = Math.min(camZ, 0.02);
  const scaleAll = 1 + 0.005 * Math.sin(beat * 0.35) + camZ;

  // caption pertama tampak penuh di frame 0
  const capOpacity = (c: { from: string; to?: string }) => {
    const s = at(c.from);
    const e = c.to ? at(c.to) : 1e9;
    const fin = s <= 0 ? 1 : ramp(beat, s + 0.3, s + 1.1);
    return fin * (1 - ramp(beat, e - 0.8, e - 0.1));
  };

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 46%, #0d1630 0%, ${data.background} 72%)`,
        overflow: "hidden",
      }}
    >
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "50% 50%",
          transform: `translate(${camX}px, ${camY}px) rotate(${camR}deg) scale(${scaleAll})`,
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
              id="trig-glow"
              filterUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={W}
              height={H}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="3.5" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g filter="url(#trig-glow)">
            {/* garis putus-putus di bawah subjudul */}
            <line
              x1={W / 2 - W * 0.4}
              y1={ruleY}
              x2={W / 2 + W * 0.4}
              y2={ruleY}
              stroke={GOLD}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="10 12"
            />

            {/* garis tanah */}
            <line x1={60} y1={gy} x2={950} y2={gy} stroke={TEXT} strokeWidth={4} strokeLinecap="round" opacity={0.85} />

            {/* isi gedung naik dari bawah */}
            {fillT > 0.001 && (
              <rect
                x={wx}
                y={gy - hpx * fillT}
                width={bw}
                height={hpx * fillT}
                fill={C.height}
                fillOpacity={0.32}
                stroke="none"
              />
            )}

            {/* gedung */}
            <rect
              x={wx}
              y={topY}
              width={bw}
              height={hpx}
              fill={C.building}
              fillOpacity={0.06}
              stroke={C.building}
              strokeWidth={5}
              strokeLinejoin="round"
              opacity={0.9}
            />

            {/* segitiga: draft redup → menyala */}
            <g opacity={lerp(D, 1, litTri) * keep}>
              <polygon
                points={`${ox},${gy} ${wx},${gy} ${wx},${topY}`}
                fill={GOLD}
                fillOpacity={0.14 * litTri}
                stroke={GOLD}
                strokeWidth={4}
                strokeLinejoin="round"
                strokeDasharray={litTri > 0.5 ? undefined : "12 10"}
              />
            </g>

            {/* tanda siku-siku */}
            <polyline
              points={`${wx - 30},${gy} ${wx - 30},${gy - 30} ${wx},${gy - 30}`}
              fill="none"
              stroke={TEXT}
              strokeWidth={4}
              strokeLinejoin="round"
              opacity={lerp(D, 1, litRa) * keep}
            />

            {/* garis jarak d (di bawah tanah) */}
            <g opacity={lerp(D, 1, litDist) * keep}>
              <line x1={ox} y1={gy + 50} x2={wx} y2={gy + 50} stroke={C.dist} strokeWidth={5} strokeLinecap="round" />
              <line x1={ox} y1={gy + 36} x2={ox} y2={gy + 64} stroke={C.dist} strokeWidth={5} strokeLinecap="round" />
              <line x1={wx} y1={gy + 36} x2={wx} y2={gy + 64} stroke={C.dist} strokeWidth={5} strokeLinecap="round" />
            </g>

            {/* sinar pandang: draft penuh redup, lalu sinar terang berputar naik */}
            <line
              x1={ox}
              y1={gy}
              x2={wx}
              y2={topY}
              stroke={GOLD}
              strokeWidth={4}
              strokeDasharray="12 10"
              strokeLinecap="round"
              opacity={D * (1 - sweepP) * keep}
            />
            {sweepP > 0.001 && (
              <g opacity={keep}>
                <line x1={ox} y1={gy} x2={wx} y2={endY} stroke={GOLD} strokeWidth={6} strokeLinecap="round" />
                <circle cx={wx} cy={endY} r={9} fill={TEXT} />
                <line
                  x1={wx - 36 - 34 * swingPulse}
                  y1={endY}
                  x2={wx + 36 + 34 * swingPulse}
                  y2={endY}
                  stroke={TEXT}
                  strokeWidth={4}
                  strokeLinecap="round"
                  opacity={0.4 + 0.6 * swingPulse}
                />
              </g>
            )}

            {/* busur sudut */}
            <path
              d={arcPath(data.angleDeg)}
              fill="none"
              stroke={GOLD}
              strokeWidth={4}
              strokeDasharray="8 8"
              opacity={D * (1 - sweepP) * keep}
            />
            {sweepP > 0.001 && (
              <path
                d={arcPath(alpha)}
                fill="none"
                stroke={TEXT}
                strokeWidth={6}
                strokeLinecap="round"
                opacity={keep}
              />
            )}

            {/* titik pengamat */}
            <circle cx={ox} cy={gy} r={11} fill={TEXT} />

            {/* kilatan di sepanjang garis, sinkron dengan suara */}
            {glints}
          </g>
        </svg>

        {/* ───────── teks & angka ───────── */}
        <Txt x={W / 2} y={titleY} size={titleSize} color={TEXT} glow={GOLD}>
          {data.title}
        </Txt>
        <Txt x={W / 2} y={subY} size={subSize} color={GOLD} weight={600} opacity={0.95} k={0.5}>
          {data.subtitle}
        </Txt>

        {/* label jarak d */}
        <Txt
          x={(ox + wx) / 2}
          y={gy + 100}
          size={44}
          color={C.dist}
          opacity={lerp(D + 0.1, 1, prog("d_lbl", 0.4)) * keep}
          scale={1 + 0.14 * pulse("d_lbl", 0.5)}
          k={0.8}
        >
          {beat >= at("d_lbl") ? `${data.labels.distance} = ${data.distance} ${data.unit}` : data.labels.distance}
        </Txt>

        {/* label sudut θ (menghitung naik saat sinar berputar) */}
        <Txt
          x={angLbl.x}
          y={angLbl.y}
          size={46}
          color={GOLD}
          opacity={(sweepP > 0.001 ? 1 : D + 0.15) * keep}
          scale={1 + 0.1 * swingPulse}
          k={0.8}
        >
          {sweepP > 0.001 ? `${Math.round(alpha)}°` : data.labels.angle}
        </Txt>

        {/* label tinggi h di dalam gedung */}
        <Txt
          x={wx + bw / 2}
          y={gy - hpx / 2}
          size={buildingLblSize}
          color={answered ? TEXT : C.height}
          glow={C.height}
          opacity={0.95}
          scale={1 + 0.2 * ansPulse}
          k={0.8}
        >
          {hLabel}
        </Txt>

        {/* rumus */}
        <Row y={formulaY} width={W} size={fSize} opacity={lerp(D, 1, litFormula) * (1 - 0.6 * fadeT)}>
          <S c={C.height}>{data.labels.height}</S>
          <S c={TEXT}> = </S>
          <S c={C.dist}>{data.labels.distance}</S>
          <S c={TEXT}> × {data.labels.formula} </S>
          <S c={GOLD}>{data.labels.angle}</S>
        </Row>
        <Row
          y={calcY}
          width={W}
          size={52}
          opacity={prog("calc", 0.5) * (1 - 0.6 * fadeT)}
          scale={0.9 + 0.1 * prog("calc", 0.5, backOut)}
        >
          <S c={C.height}>{data.labels.height}</S>
          <S c={TEXT}> = </S>
          {calcText ? (
            <>
              <S c={C.dist}>{data.distance}</S>
              <S c={TEXT}> × </S>
              <S c={GOLD}>{tanVal.toFixed(2)}</S>
            </>
          ) : (
            <>
              <S c={C.dist}>{data.distance}</S>
              <S c={TEXT}> × {data.labels.formula} </S>
              <S c={GOLD}>{data.angleDeg}°</S>
            </>
          )}
        </Row>
        <Row
          y={answerY}
          width={W}
          size={89}
          opacity={prog("answer", 0.5)}
          scale={(0.85 + 0.15 * prog("answer", 0.5, backOut)) * (1 + 0.1 * ansPulse)}
        >
          <S c={C.height}>
            {data.labels.height} ≈ {hm.toFixed(1)} {data.unit}
          </S>
        </Row>

        {/* caption singkat */}
        {data.captions.map((c, i) => (
          <Txt
            key={`cp${i}`}
            x={W / 2}
            y={captionY}
            size={fit(c.text, 34, 0.88, 0.56)}
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