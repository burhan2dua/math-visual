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

type SweepTarget = "rule" | "axisX" | "axisY" | "guide" | "curve" | "area" | "stairs";

type Sweep = {
  cue: string;
  target: SweepTarget;
  dur: number; // dalam beat
  delay?: number; // dalam beat
  color: "text" | "bars" | "curve" | "gold";
  step?: number;
};

type CalcData = {
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
  colors: { curve: string; bars: string; text: string };
  curve: {
    coef: number;
    power: number;
    from: number;
    to: number;
    xMax: number;
    yMax: number;
    xTicks: number[];
    yTicks: number[];
  };
  steps: number[];
  previewOpacity: number;
  labels: { fn: string; n: string; limit: string; formula: string; unknown: string };
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

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

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

export const Template: React.FC<{ data: CalcData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const CURVE = data.colors.curve;
  const BARS = data.colors.bars;
  const TEXT = data.colors.text;
  const GOLD = data.accent;
  const cv = data.curve;
  const steps = data.steps;
  const colorOf = { text: TEXT, bars: BARS, curve: CURVE, gold: GOLD };

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

  /* ───────── matematika (semua dari data.json) ───────── */
  const f = (x: number) => cv.coef * Math.pow(x, cv.power);
  const exact =
    (cv.coef * (Math.pow(cv.to, cv.power + 1) - Math.pow(cv.from, cv.power + 1))) /
    (cv.power + 1);
  const leftSum = (n: number) => {
    const dx = (cv.to - cv.from) / n;
    let s = 0;
    for (let j = 0; j < n; j++) s += f(cv.from + j * dx) * dx;
    return s;
  };
  const sums = steps.map(leftSum);

  /* ───────── geometri (animasi berpusat di tengah, safe zone kanan) ───────── */
  const px0 = 96;
  const pw = W - px0 - 130; // sisi kanan bebas tombol platform
  const base = 1250;
  const ph = 600;
  const X = (x: number) => px0 + (x / cv.xMax) * pw;
  const Y = (y: number) => base - (y / cv.yMax) * ph;
  const titleY = H / PHI ** 5 + 20;
  const subY = titleY + 66;
  const ruleY = subY + 50;
  const nY = base + 105;
  const areaY = base + 215;
  const captionY = base + 330;
  const titleSize = fit(data.title, 62, 0.9, 0.6);
  const subSize = fit(data.subtitle, 34, 0.9, 0.56);

  /* ───────── kurva ───────── */
  const NP = 120;
  const pts: Pt[] = Array.from({ length: NP + 1 }, (_, i) => {
    const x = lerp(cv.from, cv.to, i / NP);
    return { x: X(x), y: Y(f(x)) };
  });
  const curveD = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
  const areaD = `M ${X(cv.from)} ${base} ${pts.map((p) => `L ${p.x} ${p.y}`).join(" ")} L ${X(cv.to)} ${base} Z`;
  const fnPulse = pulse("curve_lbl", 0.5);

  /* ───────── batang Riemann ───────── */
  let cur = -1;
  steps.forEach((_, i) => {
    if (beat >= at(`step_${i}`)) cur = i;
  });
  const limitT = ramp(beat, at("limit"), at("fill"), easeInOut);
  const fillT = ramp(beat, at("fill"), at("fill") + 1.5, easeOut);
  const barsOp = 1 - 0.9 * limitT;

  // pratinjau batang tipis sejak frame pertama
  const prevN = steps[Math.min(2, steps.length - 1)];
  const prevOp = data.previewOpacity * (1 - ramp(beat, at("step_0") - 0.4, at("step_0")));
  const previewBars: React.ReactNode[] = [];
  if (prevOp > 0.001) {
    const pdx = (cv.to - cv.from) / prevN;
    for (let j = 0; j < prevN; j++) {
      const xl = cv.from + j * pdx;
      previewBars.push(
        <rect
          key={`pv${j}`}
          x={X(xl)}
          y={Y(f(xl))}
          width={X(xl + pdx) - X(xl)}
          height={base - Y(f(xl))}
          fill={BARS}
          fillOpacity={0.5}
          stroke={BARS}
          strokeWidth={2}
          strokeLinejoin="round"
        />,
      );
    }
  }

  const bars: React.ReactNode[] = [];
  if (cur >= 0) {
    const n = steps[cur];
    const dx = (cv.to - cv.from) / n;
    const pN = cur > 0 ? steps[cur - 1] : 0;
    const pdx = pN ? (cv.to - cv.from) / pN : 1;
    const s0 = at(`step_${cur}`);
    const stag = Math.min(0.05, 0.9 / n);
    const sw = n > 30 ? 1.4 : n > 10 ? 2.2 : 3.5;
    // jumlah cue kedipan untuk tahap ini (s{cur}_{i})
    let m = 0;
    while (cueMap.has(`s${cur}_${m}`)) m += 1;
    for (let j = 0; j < n; j++) {
      const xl = cv.from + j * dx;
      const hT = f(xl);
      const hP = pN ? f(cv.from + Math.floor((xl - cv.from + 1e-9) / pdx) * pdx) : 0;
      const t = ramp(beat - j * stag, s0, s0 + 0.9, easeOut);
      const h = lerp(hP, hT, t);
      const hp = base - Y(h);
      if (hp < 0.5) continue;
      const flash = m > 0 ? pulse(`s${cur}_${Math.min(m - 1, Math.floor((j * m) / n))}`, 0.45) : 0;
      bars.push(
        <rect
          key={`b${j}`}
          x={X(xl)}
          y={Y(h)}
          width={X(xl + dx) - X(xl)}
          height={hp}
          fill={flash > 0.05 ? TEXT : BARS}
          fillOpacity={0.16 + 0.3 * flash}
          stroke={flash > 0.05 ? TEXT : BARS}
          strokeWidth={sw + 3 * flash}
          strokeLinejoin="round"
        />,
      );
    }
  }

  /* ───────── angka luas & n ───────── */
  const sumVal = (() => {
    if (cur < 0) return 0;
    const prev = cur > 0 ? sums[cur - 1] : 0;
    let v = lerp(prev, sums[cur], ramp(beat, at(`step_${cur}`) + 0.3, at(`step_${cur}`) + 1.8, easeOut));
    if (beat >= at("fill")) v = lerp(sums[steps.length - 1], exact, fillT);
    return v;
  })();
  const stepPulse = cur >= 0 ? pulse(`step_${cur}`, 0.6) : 0;
  const ansPulse = pulse("answer", 0.9);
  const limitLbl = ramp(beat, at("limit"), at("limit") + 0.6);
  const nText = cur >= 0 ? `${data.labels.n} = ${steps[cur]}` : "";
  const formulaT = prog("formula", 0.8, Easing.out(Easing.back(1.7)));
  const done = beat >= at("answer");
  const areaText = done ? fmt(exact) : cur < 0 ? data.labels.unknown : `≈ ${fmt(sumVal)}`;

  /* ───────── kilatan garis (menggantikan cincin) ───────── */
  const targetLines = (sw: Sweep): Pt[][] => {
    switch (sw.target) {
      case "rule":
        return [
          [{ x: W / 2, y: ruleY }, { x: W / 2 - W * 0.4, y: ruleY }],
          [{ x: W / 2, y: ruleY }, { x: W / 2 + W * 0.4, y: ruleY }],
        ];
      case "axisX":
        return [[{ x: px0, y: base }, { x: px0 + pw, y: base }]];
      case "axisY":
        return [[{ x: px0, y: base }, { x: px0, y: base - ph }]];
      case "guide":
        return [[{ x: X(cv.to), y: Y(f(cv.to)) }, { x: X(cv.to), y: base }]];
      case "curve":
        return [pts];
      case "area":
        return [[...pts, { x: X(cv.to), y: base }, { x: X(cv.from), y: base }]];
      case "stairs": {
        const n = steps[Math.min(sw.step ?? 0, steps.length - 1)];
        const dx = (cv.to - cv.from) / n;
        const line: Pt[] = [];
        for (let j = 0; j < n; j++) {
          const xl = cv.from + j * dx;
          line.push({ x: X(xl), y: Y(f(xl)) });
          line.push({ x: X(xl + dx), y: Y(f(xl)) });
          line.push({ x: X(xl + dx), y: Y(f(xl + dx)) });
        }
        return [line];
      }
      default:
        return [];
    }
  };

  const glints: React.ReactNode[] = [];
  data.sweeps.forEach((sw, si) => {
    const tt = (beat - at(sw.cue) - (sw.delay ?? 0)) / sw.dur;
    if (tt <= 0 || tt >= 1) return;
    const e = easeInOut(tt);
    const col = colorOf[sw.color];
    targetLines(sw).forEach((line, li) => {
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

  // caption pertama langsung tampak di frame 0 (tanpa fade-in)
  const capOpacity = (c: { from: string; to?: string }) => {
    const s = at(c.from);
    const e = c.to ? at(c.to) : 1e9;
    const fin = s <= 0 ? 1 : ramp(beat, s + 0.3, s + 1.1);
    return fin * (1 - ramp(beat, e - 0.8, e - 0.1));
  };

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 50%, #0d1630 0%, ${data.background} 72%)`,
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
              id="calc-glow"
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

          <g filter="url(#calc-glow)">
            {/* garis putus-putus di bawah subjudul (langsung tampak) */}
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

            {/* area di bawah kurva (hasil akhir) */}
            {fillT > 0.001 && <path d={areaD} fill={GOLD} fillOpacity={0.22 * fillT} stroke="none" />}

            {/* pratinjau batang tipis + batang Riemann */}
            <g opacity={prevOp > 0.001 ? 1 : 0}>{previewBars}</g>
            <g opacity={barsOp}>{bars}</g>

            {/* sumbu */}
            <line x1={px0} y1={base} x2={px0 + pw} y2={base} stroke={TEXT} strokeWidth={4} strokeLinecap="round" opacity={0.85} />
            <line x1={px0} y1={base} x2={px0} y2={base - ph} stroke={TEXT} strokeWidth={4} strokeLinecap="round" opacity={0.85} />

            {/* tanda sumbu: menyala sebentar saat berbunyi */}
            {cv.xTicks.map((v, i) => {
              const p = pulse(`xt_${i}`, 0.5);
              return (
                <line
                  key={`xtk${i}`}
                  x1={X(v)}
                  y1={base - 12 - 8 * p}
                  x2={X(v)}
                  y2={base + 12 + 8 * p}
                  stroke={TEXT}
                  strokeWidth={3 + 5 * p}
                  strokeLinecap="round"
                />
              );
            })}
            {cv.yTicks.map((v, i) => {
              const p = pulse(`yt_${i}`, 0.5);
              return (
                <line
                  key={`ytk${i}`}
                  x1={px0 - 12 - 8 * p}
                  y1={Y(v)}
                  x2={px0 + 12 + 8 * p}
                  y2={Y(v)}
                  stroke={TEXT}
                  strokeWidth={3 + 5 * p}
                  strokeLinecap="round"
                />
              );
            })}

            {/* garis batas x = to */}
            <line
              x1={X(cv.to)}
              y1={Y(f(cv.to))}
              x2={X(cv.to)}
              y2={base}
              stroke={CURVE}
              strokeWidth={3}
              strokeLinecap="round"
              strokeDasharray="9 10"
              opacity={0.8}
            />

            {/* kurva (langsung tampak penuh) */}
            <path
              d={curveD}
              fill="none"
              stroke={CURVE}
              strokeWidth={6}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

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

        {/* angka tanda sumbu */}
        {cv.xTicks.map((v, i) => (
          <Txt
            key={`xn${i}`}
            x={X(v)}
            y={base + 40}
            size={30}
            color={TEXT}
            weight={700}
            opacity={0.9}
            scale={1 + 0.3 * pulse(`xt_${i}`, 0.5)}
            k={0.4}
          >
            {v}
          </Txt>
        ))}
        {cv.yTicks.map((v, i) => (
          <Txt
            key={`yn${i}`}
            x={px0 - 38}
            y={Y(v)}
            size={30}
            color={TEXT}
            weight={700}
            opacity={0.9}
            scale={1 + 0.3 * pulse(`yt_${i}`, 0.5)}
            k={0.4}
          >
            {v}
          </Txt>
        ))}

        {/* label fungsi */}
        <Txt x={X(1.15)} y={Y(8.3)} size={44} color={CURVE} glow={CURVE} scale={1 + 0.12 * fnPulse} k={0.8}>
          {data.labels.fn}
        </Txt>

        {/* n (jumlah batang) → "n → ∞" → rumus integral */}
        <Txt
          x={W / 2}
          y={nY}
          size={44}
          color={BARS}
          glow={BARS}
          weight={700}
          opacity={(cur >= 0 ? 1 : 0) * (1 - limitLbl) * (1 - prog("formula", 0.3))}
          scale={1 + 0.1 * stepPulse}
          k={0.7}
        >
          {nText}
        </Txt>
        <Txt
          x={W / 2}
          y={nY}
          size={44}
          color={BARS}
          glow={BARS}
          weight={700}
          opacity={limitLbl * (1 - prog("formula", 0.3))}
          scale={0.8 + 0.2 * limitLbl}
          k={0.7}
        >
          {data.labels.limit}
        </Txt>
        <Txt
          x={W / 2}
          y={nY}
          size={fit(data.labels.formula, 62, 0.8, 0.6)}
          color={TEXT}
          glow={GOLD}
          opacity={prog("formula", 0.5)}
          scale={0.8 + 0.2 * clamp01(formulaT)}
          k={0.8}
        >
          {data.labels.formula}
        </Txt>

        {/* angka luas ("?" di frame pertama) */}
        <Txt
          x={W / 2}
          y={areaY}
          size={89}
          color={done ? GOLD : TEXT}
          glow={GOLD}
          scale={1 + 0.08 * stepPulse + 0.22 * ansPulse}
        >
          {areaText}
        </Txt>

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