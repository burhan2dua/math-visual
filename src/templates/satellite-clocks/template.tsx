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

type ColorKey = "earth" | "sat" | "speed" | "gravity" | "text";

type SweepTarget =
  | "rule"
  | "clocks"
  | "orbit"
  | "field"
  | "barS"
  | "barG"
  | "barN"
  | "panel"
  | "signal"
  | "finalLine";

type Sweep = {
  cue: string;
  target: SweepTarget;
  dur: number; // dalam beat
  delay?: number; // dalam beat
  color: ColorKey;
};

type SatData = {
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
  effects: { speed: number; gravity: number };
  unit: string;
  driftKm: number;
  speedKmh: number;
  draftOpacity: number;
  labels: {
    earth: string;
    satellite: string;
    perDay: string;
    notToScale: string;
    rowSpeed: string;
    rowGravity: string;
    rowNet: string;
    truePin: string;
    errPin: string;
    zeroKm: string;
    unknown: string;
  };
  stages: Array<{ from: string; text: string }>;
  captions: Array<{ text: string; from: string; to?: string }>;
  finalLines: string[];
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

const circ = (cx: number, cy: number, r: number, n = 72): Pt[] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const a = -Math.PI / 2 + (i / n) * 2 * Math.PI;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });

/* titik pada jarum jam: 0° = jam 12, searah jarum jam */
const hp = (cx: number, cy: number, L: number, deg: number): Pt => {
  const r = (deg * Math.PI) / 180;
  return { x: cx + L * Math.sin(r), y: cy - L * Math.cos(r) };
};

const sect = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const d = a1 - a0;
  if (Math.abs(d) < 0.5) return "";
  const p0 = hp(cx, cy, r, a0);
  const p1 = hp(cx, cy, r, a1);
  return `M ${cx} ${cy} L ${p0.x} ${p0.y} A ${r} ${r} 0 ${Math.abs(d) > 180 ? 1 : 0} ${d > 0 ? 1 : 0} ${p1.x} ${p1.y} Z`;
};

const rectPts = (x0: number, y0: number, x1: number, y1: number): Pt[] => [
  { x: x0, y: y0 },
  { x: x1, y: y0 },
  { x: x1, y: y1 },
  { x: x0, y: y1 },
  { x: x0, y: y0 },
];

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

export const Template: React.FC<{ data: SatData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const C = data.colors;
  const TEXT = C.text;
  const GOLD = data.accent;
  const D = data.draftOpacity;
  const U = data.unit;
  const L = data.labels;

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
  const pulseAny = (prefix: string, dur: number) => {
    let m = 0;
    for (let i = 0; cueMap.has(`${prefix}${i}`); i++) m = Math.max(m, pulse(`${prefix}${i}`, dur));
    return m;
  };

  const fit = (text: string, maxSize: number, frac: number, k = 0.56) =>
    Math.min(maxSize, (W * frac) / (Math.max(text.length, 1) * k));
  const tw = (text: string, size: number) => text.length * size * 0.58;

  /* ───────── angka (semua dari data.json) ───────── */
  const speedUs = data.effects.speed;
  const gravUs = data.effects.gravity;
  const netUs = speedUs + gravUs;
  const fill = (s: string) =>
    s
      .replace(/\{net\}/g, String(netUs))
      .replace(/\{speed\}/g, String(Math.abs(speedUs)))
      .replace(/\{grav\}/g, String(gravUs))
      .replace(/\{km\}/g, String(data.driftKm))
      .replace(/\{kmh\}/g, data.speedKmh.toLocaleString("en-US"));
  const sgn = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v)}`;

  /* ───────── geometri ───────── */
  const titleY = H / PHI ** 5 + 20;
  const subY = titleY + 66;
  const ruleY = subY + 50;
  const titleSize = fit(data.title, 62, 0.9, 0.6);
  const subSize = fit(data.subtitle, 34, 0.9, 0.56);

  const clkY = 600;
  const clkR = 95;
  const clkXE = 270;
  const clkXS = 690;

  const ox = 540;
  const oy = 990;
  const earthR = 85;
  const ro = 215;

  const axisX = 260;
  const maxMag = Math.max(Math.abs(speedUs), Math.abs(gravUs), Math.abs(netUs));
  const barScale = 630 / maxMag;
  const rowY = [1290, 1360, 1430];
  const barH = 44;
  const stageY = 1510;
  const captionY = 1620;

  const panel = { x0: 110, y0: 770, x1: 930, y1: 1200 };
  const truePin: Pt = { x: 430, y: 1010 };
  const kmPx = 300;
  const vec: Pt = { x: Math.cos((20 * Math.PI) / 180) * kmPx, y: Math.sin((20 * Math.PI) / 180) * kmPx };
  const satIcon: Pt = { x: 860, y: 815 };

  /* ───────── tahap animasi ───────── */
  const rA = ramp(beat, at("clk_go"), at("clk_go") + 3, easeOut);
  const reset = ramp(beat, at("split"), at("split") + 1, easeInOut);
  const sp = ramp(beat, at("speed_bar"), at("speed_bar") + 1.2, easeOut);
  const gr = ramp(beat, at("grav_bar"), at("grav_bar") + 2, easeOut);
  const nt = ramp(beat, at("net"), at("net") + 1.5, easeOut);
  const syncT = ramp(beat, at("sync"), at("sync") + 1.2, easeInOut);
  const K = 1.3; // derajat jarum per µs (diperbesar, "not to scale")
  const wedge = K * (netUs * rA * (1 - reset) + speedUs * sp + gravUs * gr) * (1 - syncT);
  const ea = 45 * beat;
  const sa = ea + wedge;

  const mapT = ramp(beat, at("map"), at("map") + 0.8) * (1 - syncT);
  const og = 1 - 0.82 * mapT;
  const grLit = prog("grav", 0.6);
  const driftT = ramp(beat, at("drift"), at("drift") + 3, easeInOut);
  const fixT = ramp(beat, at("fix"), at("fix") + 1.8, easeInOut);
  const errT = driftT * (1 - fixT);
  const errPin: Pt = { x: truePin.x + vec.x * errT, y: truePin.y + vec.y * errT };
  const scanT = ramp(beat, at("fix"), at("fix") + 2, easeInOut);
  const ckPulse = pulseAny("ck_", 0.3);

  const th = -90 + 24 * beat;
  const thRad = (th * Math.PI) / 180;
  const sat: Pt = { x: ox + ro * Math.cos(thRad), y: oy + ro * Math.sin(thRad) };
  const surf: Pt = { x: ox + earthR * Math.cos(thRad), y: oy + earthR * Math.sin(thRad) };

  /* ───────── garis target untuk kilatan ───────── */
  const barEnds = {
    S: { x0: axisX + speedUs * barScale, x1: axisX },
    G: { x0: axisX, x1: axisX + gravUs * barScale },
    N: { x0: axisX, x1: axisX + netUs * barScale },
  };
  const fieldLines: Pt[][] = Array.from({ length: 12 }, (_, i) => {
    const a = (i * 30 * Math.PI) / 180;
    return [
      { x: ox + (earthR + 14) * Math.cos(a), y: oy + (earthR + 14) * Math.sin(a) },
      { x: ox + (ro + 55) * Math.cos(a), y: oy + (ro + 55) * Math.sin(a) },
    ];
  });
  const lines: Record<SweepTarget, Pt[][]> = {
    rule: [
      [{ x: W / 2, y: ruleY }, { x: W / 2 - W * 0.4, y: ruleY }],
      [{ x: W / 2, y: ruleY }, { x: W / 2 + W * 0.4, y: ruleY }],
    ],
    clocks: [circ(clkXE, clkY, clkR), circ(clkXS, clkY, clkR)],
    orbit: [circ(ox, oy, ro, 96)],
    field: fieldLines,
    barS: [rectPts(Math.min(barEnds.S.x0, barEnds.S.x1), rowY[0] - barH / 2, Math.max(barEnds.S.x0, barEnds.S.x1), rowY[0] + barH / 2)],
    barG: [rectPts(barEnds.G.x0, rowY[1] - barH / 2, barEnds.G.x1, rowY[1] + barH / 2)],
    barN: [rectPts(barEnds.N.x0, rowY[2] - barH / 2, barEnds.N.x1, rowY[2] + barH / 2)],
    panel: [rectPts(panel.x0, panel.y0, panel.x1, panel.y1)],
    signal: [[satIcon, truePin]],
    finalLine: [[{ x: W / 2 - 380, y: 1600 }, { x: W / 2 + 380, y: 1600 }]],
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

  /* ───────── jam analog ───────── */
  const clock = (cx: number, color: string, angle: number, ref: number | null) => {
    const tip = hp(cx, clkY, 72, angle);
    const refTip = ref === null ? null : hp(cx, clkY, 72, ref);
    return (
      <g key={`clk${cx}`}>
        <circle cx={cx} cy={clkY} r={clkR} fill={color} fillOpacity={0.06} stroke={color} strokeWidth={5} />
        {Array.from({ length: 12 }, (_, i) => {
          const a = hp(cx, clkY, clkR - 16, i * 30);
          const b = hp(cx, clkY, clkR - 6, i * 30);
          return <line key={`tk${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={color} strokeWidth={3} strokeLinecap="round" opacity={0.8} />;
        })}
        {ref !== null && <path d={sect(cx, clkY, 72, ref, angle)} fill={GOLD} fillOpacity={0.26} />}
        {refTip && (
          <line x1={cx} y1={clkY} x2={refTip.x} y2={refTip.y} stroke={C.earth} strokeWidth={3} strokeDasharray="6 7" opacity={0.8} />
        )}
        <line x1={cx} y1={clkY} x2={tip.x} y2={tip.y} stroke={TEXT} strokeWidth={6 + 3 * ckPulse} strokeLinecap="round" />
        <circle cx={cx} cy={clkY} r={7} fill={TEXT} />
      </g>
    );
  };

  /* ───────── bar chart ───────── */
  const barRect = (
    key: string,
    row: number,
    xa: number,
    xb: number,
    color: string,
    grown: number,
    fullX0: number,
    fullX1: number,
  ) => (
    <g key={key}>
      <rect
        x={Math.min(fullX0, fullX1)}
        y={row - barH / 2}
        width={Math.abs(fullX1 - fullX0)}
        height={barH}
        rx={8}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeDasharray="9 8"
        opacity={D * (1 - grown)}
      />
      {grown > 0.001 && (
        <rect
          x={Math.min(xa, xb)}
          y={row - barH / 2}
          width={Math.abs(xb - xa)}
          height={barH}
          rx={8}
          fill={color}
          fillOpacity={0.3}
          stroke={color}
          strokeWidth={4}
        />
      )}
    </g>
  );
  const sW = Math.abs(speedUs) * barScale * sp;
  const gW = gravUs * barScale * gr;
  const nW = netUs * barScale * nt;

  /* ───────── gerak satelit: ekor komet ───────── */
  const trail = Array.from({ length: 5 }, (_, i) => {
    const a0 = th - 46 + i * 9;
    const a1 = th - 46 + (i + 1) * 9;
    const r0 = (a0 * Math.PI) / 180;
    const r1 = (a1 * Math.PI) / 180;
    return (
      <path
        key={`tr${i}`}
        d={`M ${ox + ro * Math.cos(r0)} ${oy + ro * Math.sin(r0)} A ${ro} ${ro} 0 0 1 ${ox + ro * Math.cos(r1)} ${oy + ro * Math.sin(r1)}`}
        fill="none"
        stroke={GOLD}
        strokeWidth={5 + i}
        strokeLinecap="round"
        opacity={(0.12 + 0.2 * i) * og}
      />
    );
  });

  /* ───────── teks celah jam ───────── */
  let gapText = L.unknown;
  let gapOp = D + 0.1;
  if (beat >= at("sync")) {
    gapText = "0";
    gapOp = 1;
  } else if (beat >= at("net")) {
    gapText = sgn(netUs);
    gapOp = 1;
  } else if (beat >= at("split")) {
    gapText = L.unknown;
    gapOp = 0.9;
  } else if (beat >= at("clk_go")) {
    gapText = sgn(netUs);
    gapOp = lerp(D + 0.1, 1, rA);
  }
  const gapPulse = Math.max(pulse("gap_lbl", 0.5), pulse("net", 0.6), pulse("sync", 0.6));

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

  // teks pertama tampak penuh di frame 0 (tanpa fade-in)
  const fadeIn = (id: string, dur = 0.5) => (at(id) <= 0 ? 1 : prog(id, dur));
  const capOpacity = (c: { from: string; to?: string }) => {
    const s = at(c.from);
    const e = c.to ? at(c.to) : 1e9;
    const fin = s <= 0 ? 1 : ramp(beat, s + 0.3, s + 1.1);
    return fin * (1 - ramp(beat, e - 0.8, e - 0.1));
  };
  const finalT = prog("final", 0.7, backOut);

  const stageOpacity = (i: number) => {
    const st = data.stages[i];
    const next = data.stages[i + 1];
    const fin = fadeIn(st.from, 0.5);
    const fout = next ? ramp(beat, at(next.from), at(next.from) + 0.35) : 0;
    return fin * (1 - fout) * (1 - finalT);
  };

  const kmMid: Pt = { x: (truePin.x + errPin.x) / 2, y: (truePin.y + errPin.y) / 2 };

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
              id="sat-glow"
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

          <g filter="url(#sat-glow)">
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

            {/* dua jam */}
            {clock(clkXE, C.earth, ea, null)}
            {clock(clkXS, GOLD, sa, ea)}

            {/* orbit, medan gravitasi, Bumi, satelit */}
            <g opacity={og}>
              <circle
                cx={ox}
                cy={oy}
                r={ro}
                fill="none"
                stroke={TEXT}
                strokeWidth={3}
                strokeDasharray="10 12"
                opacity={0.4}
              />

              {fieldLines.map((ln, i) => {
                const level = lerp(0.22, 1, grLit) * (1 - 0.4 * prog("net", 0.6));
                const a = ln[0];
                const b = ln[1];
                const segs = [0, 1, 2].map((k) => {
                  const t0 = k / 3;
                  const t1 = (k + 1) / 3;
                  return (
                    <line
                      key={`fs${i}-${k}`}
                      x1={lerp(a.x, b.x, t0)}
                      y1={lerp(a.y, b.y, t0)}
                      x2={lerp(a.x, b.x, t1)}
                      y2={lerp(a.y, b.y, t1)}
                      stroke={C.gravity}
                      strokeWidth={4 - k}
                      strokeLinecap="round"
                      opacity={[0.95, 0.55, 0.25][k] * level}
                    />
                  );
                });
                return <g key={`fl${i}`}>{segs}</g>;
              })}

              <circle cx={ox} cy={oy} r={earthR} fill={C.earth} fillOpacity={0.12} stroke={C.earth} strokeWidth={5} />
              <ellipse cx={ox} cy={oy} rx={earthR * 0.45} ry={earthR} fill="none" stroke={C.earth} strokeWidth={2} opacity={0.35} />
              <line x1={ox - earthR} y1={oy} x2={ox + earthR} y2={oy} stroke={C.earth} strokeWidth={2} opacity={0.35} />

              {/* sinyal GPS bayangan */}
              <line
                x1={sat.x}
                y1={sat.y}
                x2={surf.x}
                y2={surf.y}
                stroke={C.earth}
                strokeWidth={3}
                strokeDasharray="8 9"
                opacity={D + 0.15}
              />

              {trail}
              <g transform={`translate(${sat.x} ${sat.y}) rotate(${th + 90})`}>
                <line x1={-26} y1={0} x2={26} y2={0} stroke={GOLD} strokeWidth={5} strokeLinecap="round" />
                <rect x={-10} y={-9} width={20} height={18} rx={4} fill={GOLD} fillOpacity={0.3} stroke={GOLD} strokeWidth={4} />
              </g>
            </g>

            {/* bar efek: Speed, Gravity, Net */}
            <g opacity={1 - 0.5 * mapT}>
              <line x1={axisX} y1={rowY[0] - 40} x2={axisX} y2={rowY[2] + 40} stroke={TEXT} strokeWidth={3} opacity={0.6} />
              {barRect("bs", rowY[0], axisX - sW, axisX, C.speed, sp, barEnds.S.x0, barEnds.S.x1)}
              {barRect("bg", rowY[1], axisX, axisX + gW, C.gravity, gr, barEnds.G.x0, barEnds.G.x1)}
              {barRect("bn", rowY[2], axisX, axisX + nW, GOLD, nt, barEnds.N.x0, barEnds.N.x1)}
            </g>

            {/* peta GPS */}
            {mapT > 0.001 && (
              <g opacity={mapT}>
                <rect
                  x={panel.x0}
                  y={panel.y0}
                  width={panel.x1 - panel.x0}
                  height={panel.y1 - panel.y0}
                  rx={22}
                  fill="#0a1226"
                  fillOpacity={0.92}
                  stroke={TEXT}
                  strokeWidth={3}
                  opacity={0.9}
                />
                {Array.from({ length: 7 }, (_, i) => (
                  <line
                    key={`gv${i}`}
                    x1={panel.x0 + ((panel.x1 - panel.x0) * i) / 6}
                    y1={panel.y0}
                    x2={panel.x0 + ((panel.x1 - panel.x0) * i) / 6}
                    y2={panel.y1}
                    stroke={TEXT}
                    strokeWidth={1.5}
                    strokeDasharray="6 10"
                    opacity={0.18}
                  />
                ))}
                {Array.from({ length: 4 }, (_, j) => (
                  <line
                    key={`gh${j}`}
                    x1={panel.x0}
                    y1={panel.y0 + ((panel.y1 - panel.y0) * j) / 3}
                    x2={panel.x1}
                    y2={panel.y0 + ((panel.y1 - panel.y0) * j) / 3}
                    stroke={TEXT}
                    strokeWidth={1.5}
                    strokeDasharray="6 10"
                    opacity={0.18}
                  />
                ))}

                {/* penggaris skala */}
                <line x1={150} y1={1170} x2={150 + kmPx} y2={1170} stroke={TEXT} strokeWidth={4} strokeLinecap="round" />
                <line x1={150} y1={1158} x2={150} y2={1182} stroke={TEXT} strokeWidth={4} strokeLinecap="round" />
                <line x1={150 + kmPx} y1={1158} x2={150 + kmPx} y2={1182} stroke={TEXT} strokeWidth={4} strokeLinecap="round" />

                {/* satelit & titik sinyal bergerak */}
                <g transform={`translate(${satIcon.x} ${satIcon.y}) rotate(-35)`}>
                  <line x1={-26} y1={0} x2={26} y2={0} stroke={GOLD} strokeWidth={5} strokeLinecap="round" />
                  <rect x={-10} y={-9} width={20} height={18} rx={4} fill={GOLD} fillOpacity={0.3} stroke={GOLD} strokeWidth={4} />
                </g>
                <line
                  x1={satIcon.x}
                  y1={satIcon.y}
                  x2={truePin.x}
                  y2={truePin.y}
                  stroke={C.earth}
                  strokeWidth={3}
                  strokeDasharray="8 9"
                  opacity={0.7}
                />
                {[0, 1, 2].map((i) => {
                  const f = (beat * 0.6 + i / 3) % 1;
                  return (
                    <circle
                      key={`sd${i}`}
                      cx={lerp(satIcon.x, truePin.x, f)}
                      cy={lerp(satIcon.y, truePin.y, f)}
                      r={7}
                      fill={TEXT}
                      opacity={Math.sin(Math.PI * f)}
                    />
                  );
                })}

                {/* garis kesalahan & pin */}
                {errT > 0.001 && (
                  <line
                    x1={truePin.x}
                    y1={truePin.y}
                    x2={errPin.x}
                    y2={errPin.y}
                    stroke={C.speed}
                    strokeWidth={5}
                    strokeDasharray="10 8"
                    strokeLinecap="round"
                  />
                )}
                <circle cx={truePin.x} cy={truePin.y} r={13} fill={C.earth} fillOpacity={0.35} stroke={C.earth} strokeWidth={5} />
                <circle
                  cx={errPin.x}
                  cy={errPin.y}
                  r={13}
                  fill={C.speed}
                  fillOpacity={0.35}
                  stroke={C.speed}
                  strokeWidth={5}
                  opacity={clamp01(driftT * 4 + (1 - fixT) * 0) * (fixT >= 1 ? 0 : 1)}
                />
                {/* garis koreksi menyapu panel */}
                {scanT > 0.001 && scanT < 0.999 && (
                  <g>
                    <rect
                      x={lerp(panel.x0, panel.x1, scanT) - 120}
                      y={panel.y0}
                      width={120}
                      height={panel.y1 - panel.y0}
                      fill={GOLD}
                      fillOpacity={0.12}
                    />
                    <line
                      x1={lerp(panel.x0, panel.x1, scanT)}
                      y1={panel.y0}
                      x2={lerp(panel.x0, panel.x1, scanT)}
                      y2={panel.y1}
                      stroke={TEXT}
                      strokeWidth={6}
                      strokeLinecap="round"
                    />
                  </g>
                )}
              </g>
            )}

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

        {/* label jam & celah */}
        <Txt x={clkXE} y={clkY + clkR + 38} size={34} color={C.earth} k={0.7}>
          {L.earth}
        </Txt>
        <Txt x={clkXS} y={clkY + clkR + 38} size={34} color={GOLD} k={0.7}>
          {L.satellite}
        </Txt>
        <Txt x={W / 2} y={clkY - 14} size={44} color={GOLD} opacity={gapOp} scale={1 + 0.18 * gapPulse} k={0.9}>
          {gapText === L.unknown || gapText === "0" ? `${gapText} ${U}` : `${gapText} ${U}`}
        </Txt>
        <Txt x={W / 2} y={clkY + 24} size={24} color={TEXT} weight={600} opacity={0.8} k={0.3}>
          {L.perDay}
        </Txt>
        <Txt x={W / 2} y={clkY + 60} size={20} color={TEXT} weight={500} opacity={0.45} k={0.2}>
          {L.notToScale}
        </Txt>

        {/* label bar */}
        {[
          { row: rowY[0], name: L.rowSpeed, val: `${sgn(speedUs)} ${U}`, w: sW, side: "L" as const, color: C.speed, litId: "speed_val" },
          { row: rowY[1], name: L.rowGravity, val: `${sgn(gravUs)} ${U}`, w: gW, side: "R" as const, color: C.gravity, litId: "grav_val" },
          { row: rowY[2], name: L.rowNet, val: `${sgn(netUs)} ${U}`, w: nW, side: "R" as const, color: GOLD, litId: "net_p" },
        ].map((b, i) => {
          const nameSize = 30;
          const valSize = 34;
          const nameOp = lerp(D + 0.2, 1, b.w > 1 ? 1 : 0) * (1 - 0.5 * mapT);
          const valOp = prog(b.litId, 0.4) * (1 - 0.5 * mapT);
          const nameX = axisX + 18 + tw(b.name, nameSize) / 2;
          const valX =
            b.side === "L"
              ? axisX - b.w - 12 - tw(b.val, valSize) / 2
              : axisX + b.w - 12 - tw(b.val, valSize) / 2;
          return (
            <React.Fragment key={`bl${i}`}>
              <Txt x={nameX} y={b.row} size={nameSize} color={TEXT} weight={700} opacity={nameOp} k={0.4}>
                {b.name}
              </Txt>
              <Txt x={valX} y={b.row} size={valSize} color={b.color} opacity={valOp} scale={1 + 0.12 * pulse(b.litId, 0.5)} k={0.8}>
                {b.val}
              </Txt>
            </React.Fragment>
          );
        })}

        {/* label peta */}
        <Txt x={truePin.x} y={truePin.y + 44} size={26} color={C.earth} weight={700} opacity={mapT} k={0.5}>
          {L.truePin}
        </Txt>
        <Txt
          x={errPin.x}
          y={errPin.y + 44}
          size={26}
          color={C.speed}
          weight={700}
          opacity={mapT * clamp01(errT * 3)}
          k={0.5}
        >
          {L.errPin}
        </Txt>
        <Txt
          x={kmMid.x}
          y={kmMid.y - 40}
          size={42}
          color={C.speed}
          opacity={mapT * prog("km_lbl", 0.4) * (1 - ramp(beat, at("fix") + 1.2, at("fix") + 1.8))}
          scale={1 + 0.12 * pulse("km_lbl", 0.5)}
          k={0.8}
        >
          {`≈ ${data.driftKm} km`}
        </Txt>
        <Txt
          x={truePin.x}
          y={truePin.y - 44}
          size={42}
          color={C.earth}
          opacity={mapT * ramp(beat, at("fix") + 1.6, at("fix") + 2.2)}
          scale={1 + 0.12 * pulse("fix_b", 0.5)}
          k={0.8}
        >
          {L.zeroKm}
        </Txt>
        <Txt x={150 + kmPx / 2} y={1140} size={26} color={TEXT} weight={700} opacity={mapT * 0.9} k={0.4}>
          {`${data.driftKm} km`}
        </Txt>

        {/* teks tahap (langkah penjelasan) */}
        {data.stages.map((st, i) => (
          <Txt
            key={`st${i}`}
            x={W / 2}
            y={stageY}
            size={fit(fill(st.text), 44, 0.9, 0.56)}
            color={TEXT}
            glow={GOLD}
            opacity={stageOpacity(i)}
            k={0.6}
          >
            {fill(st.text)}
          </Txt>
        ))}

        {/* penutup */}
        {data.finalLines.map((line, i) => (
          <Txt
            key={`fn${i}`}
            x={W / 2}
            y={1500 + i * 64}
            size={fit(line, 54, 0.9, 0.58)}
            color={i === 0 ? TEXT : GOLD}
            glow={GOLD}
            opacity={prog("final", 0.6, easeOut, i * 0.4)}
            scale={0.9 + 0.1 * prog("final", 0.6, backOut, i * 0.4)}
            k={0.8}
          >
            {line}
          </Txt>
        ))}

        {/* caption singkat */}
        {data.captions.map((c, i) => (
          <Txt
            key={`cp${i}`}
            x={W / 2}
            y={captionY + 40}
            size={fit(c.text, 32, 0.88, 0.56)}
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