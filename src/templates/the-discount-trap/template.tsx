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
  | "blocks"
  | "ghost"
  | "arrow1"
  | "arrow2"
  | "band"
  | "trap"
  | "final3"
  | "finalLine";

type ColorKey = "price" | "cut" | "gold" | "text";

type Sweep = {
  cue: string;
  target: SweepTarget;
  dur: number; // dalam beat
  delay?: number; // dalam beat
  color: ColorKey;
};

type DiscountData = {
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
  colors: { price: string; cut: string; text: string };
  price: number;
  discounts: number[];
  currency: string;
  draftOpacity: number;
  layout: { baseY: number; cols: number[]; blockWidth: number; blockHeight: number };
  labels: { sale: string; finalPrefix: string; finalSuffix: string };
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

const round1 = (v: number) => Math.round(v * 10) / 10;
const fm = (v: number) => {
  const r = round1(v);
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};
const money = (cur: string, n: number) =>
  `${cur} ${Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

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

export const Template: React.FC<{ data: DiscountData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const C = data.colors;
  const TEXT = C.text;
  const GOLD = data.accent;
  const D = data.draftOpacity;
  const colorOf: Record<ColorKey, string> = { price: C.price, cut: C.cut, gold: GOLD, text: TEXT };

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

  /* ───────── matematika (semua dari data.json) ───────── */
  const [d1, d2] = data.discounts;
  const price = data.price;
  const after1 = price * (1 - d1 / 100);
  const cut2v = (after1 * d2) / 100;
  const finalP = after1 - cut2v;
  const pct = (v: number) => (v / price) * 100;
  const p1 = pct(after1);
  const p2 = pct(finalP);
  const slice2pct = pct(cut2v);
  const naive = d1 + d2;
  const naivePrice = price * (1 - naive / 100);
  const realOff = 100 - p2;
  const gapPct = p2 - pct(naivePrice);

  /* ───────── geometri ───────── */
  const gy = data.layout.baseY;
  const bw = data.layout.blockWidth;
  const fullH = data.layout.blockHeight;
  const [c0, c1, c2] = data.layout.cols;
  const hh = (v: number) => (fullH * v) / price;
  const H0 = fullH;
  const H1 = hh(after1);
  const H2 = hh(finalP);
  const Hn = hh(naivePrice);

  const titleY = H / PHI ** 5 + 20;
  const subY = titleY + 66;
  const ruleY = subY + 50;
  const tagY = gy - fullH - 70;
  const trapY = gy + 235;
  const stepY = gy + 325;
  const finalY = gy + 435;
  const captionY = gy + 530;
  const arrowY = gy - 130;
  const titleSize = fit(data.title, 62, 0.9, 0.6);
  const subSize = fit(data.subtitle, 34, 0.9, 0.56);

  const box = (cx: number, h: number): Pt[] => [
    { x: cx - bw / 2, y: gy },
    { x: cx - bw / 2, y: gy - h },
    { x: cx + bw / 2, y: gy - h },
    { x: cx + bw / 2, y: gy },
    { x: cx - bw / 2, y: gy },
  ];
  const arrowLine = (xa: number, xb: number): Pt[] => [
    { x: xa + bw / 2 + 14, y: arrowY },
    { x: xb - bw / 2 - 14, y: arrowY },
  ];

  /* ───────── tahap animasi ───────── */
  const cutT1 = at("cut1_hit");
  const cutT2 = at("cut2_hit");
  const m1 = ramp(beat, at("move1"), at("move1") + 1.5, easeInOut);
  const m2 = ramp(beat, at("move2"), at("move2") + 1.5, easeInOut);
  const keepH = beat >= cutT2 ? H2 : beat >= cutT1 ? H1 : H0;
  const keepX = c0 + (c1 - c0) * m1 + (c2 - c1) * m2;
  const litNaive = prog("naive", 0.6);
  const litGap = prog("gap", 0.6);
  const a1 = prog("arrive1", 0.6);
  const a2 = prog("arrive2", 0.6);
  const finalT = prog("final", 0.7, backOut);
  const finalPulse = pulse("final", 0.9);
  const strikeT = ramp(beat, at("strike"), at("strike") + 1.2, easeInOut);

  /* ───────── garis target untuk kilatan ───────── */
  const lines: Record<SweepTarget, Pt[][]> = {
    rule: [
      [{ x: W / 2, y: ruleY }, { x: W / 2 - W * 0.4, y: ruleY }],
      [{ x: W / 2, y: ruleY }, { x: W / 2 + W * 0.4, y: ruleY }],
    ],
    blocks: [box(c0, H0), box(c1, H1), box(c2, H2)],
    ghost: [box(c2, Hn)],
    arrow1: [arrowLine(c0, c1)],
    arrow2: [arrowLine(c1, c2)],
    band: [
      [
        { x: c2 - bw / 2, y: gy - Hn },
        { x: c2 - bw / 2, y: gy - H2 },
        { x: c2 + bw / 2, y: gy - H2 },
        { x: c2 + bw / 2, y: gy - Hn },
        { x: c2 - bw / 2, y: gy - Hn },
      ],
    ],
    trap: [[{ x: W / 2 - 360, y: trapY }, { x: W / 2 + 360, y: trapY }]],
    final3: [box(c2, H2)],
    finalLine: [[{ x: W / 2 - 380, y: finalY + 62 }, { x: W / 2 + 380, y: finalY + 62 }]],
  };

  const glints: React.ReactNode[] = [];
  data.sweeps.forEach((sw, si) => {
    const tt = (beat - at(sw.cue) - (sw.delay ?? 0)) / sw.dur;
    if (tt <= 0 || tt >= 1) return;
    const e = easeInOut(tt);
    const col = colorOf[sw.color];
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

  /* ───────── garis potong & irisan ───────── */
  const cutLine = (cx: number, y: number, startId: string, hitId: number) => {
    const t = ramp(beat, at(startId), hitId, easeOut);
    const op = 1 - ramp(beat, hitId, hitId + 0.6);
    if (t <= 0 || op <= 0.01) return null;
    return (
      <line
        key={`cl-${startId}`}
        x1={cx - bw / 2 - 16}
        y1={y}
        x2={lerp(cx - bw / 2 - 16, cx + bw / 2 + 16, t)}
        y2={y}
        stroke={TEXT}
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray="10 8"
        opacity={op}
      />
    );
  };

  const s1 = ramp(beat, cutT1, cutT1 + 1.2, easeOut);
  const s2 = ramp(beat, cutT2, cutT2 + 1.2, easeOut);
  const slice1 = beat >= cutT1 && s1 < 1;
  const slice2 = beat >= cutT2 && s2 < 1;
  const slice1H = H0 - H1;
  const slice2H = H1 - H2;

  /* ───────── teks langkah hitung ───────── */
  const stage = beat >= at("calc3") ? 3 : beat >= at("calc2") ? 2 : beat >= at("calc1") ? 1 : 0;
  const stageId = ["", "calc1", "calc2", "calc3"][stage];
  const stageOp = stage > 0 ? prog(stageId, 0.4) : 0;
  const stagePulse = stage > 0 ? pulse(stageId, 0.5) : 0;

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

  const colPct = [100, p1, p2];
  const colPrice = [price, after1, finalP];
  const colX = [c0, c1, c2];
  const colLit = [1, a1, a2];
  const colId = ["", "arrive1", "arrive2"];

  const arrowHead = (xb: number, y: number) =>
    `${xb},${y} ${xb - 18},${y - 11} ${xb - 18},${y + 11}`;
  const lit1 = prog("cut1", 0.5);
  const lit2 = prog("cut2", 0.5);

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
              id="disc-glow"
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

          <g filter="url(#disc-glow)">
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

            {/* banner SALE */}
            <rect
              x={W / 2 - 300}
              y={tagY - 40}
              width={600}
              height={80}
              rx={18}
              fill={GOLD}
              fillOpacity={0.1}
              stroke={GOLD}
              strokeWidth={4}
            />

            {/* garis tanah */}
            <line x1={60} y1={gy} x2={950} y2={gy} stroke={TEXT} strokeWidth={4} strokeLinecap="round" opacity={0.85} />

            {/* bayangan alur: balok 100% (asli), 50%, 40% */}
            {[
              { cx: c0, h: H0 },
              { cx: c1, h: H1 },
              { cx: c2, h: H2 },
            ].map((b, i) => (
              <rect
                key={`dr${i}`}
                x={b.cx - bw / 2}
                y={gy - b.h}
                width={bw}
                height={b.h}
                rx={8}
                fill="none"
                stroke={C.price}
                strokeWidth={3}
                strokeDasharray="10 9"
                opacity={D}
              />
            ))}

            {/* bayangan jebakan: bayar 30% kalau benar 70% off */}
            <rect
              x={c2 - bw / 2}
              y={gy - Hn}
              width={bw}
              height={Hn}
              rx={8}
              fill={C.cut}
              fillOpacity={0.14 * litNaive}
              stroke={C.cut}
              strokeWidth={4}
              strokeDasharray="10 9"
              opacity={lerp(D, 1, litNaive)}
            />

            {/* selisih 10% */}
            {litGap > 0.001 && (
              <rect
                x={c2 - bw / 2}
                y={gy - H2}
                width={bw}
                height={H2 - Hn}
                fill={GOLD}
                fillOpacity={0.38 * litGap}
                stroke={GOLD}
                strokeWidth={4}
                opacity={litGap}
              />
            )}

            {/* panah antar kolom */}
            {[
              { xa: c0, xb: c1, lit: lit1 },
              { xa: c1, xb: c2, lit: lit2 },
            ].map((a, i) => (
              <g key={`ar${i}`} opacity={lerp(D, 1, a.lit)}>
                <line
                  x1={a.xa + bw / 2 + 14}
                  y1={arrowY}
                  x2={a.xb - bw / 2 - 32}
                  y2={arrowY}
                  stroke={TEXT}
                  strokeWidth={5}
                  strokeLinecap="round"
                />
                <polygon points={arrowHead(a.xb - bw / 2 - 14, arrowY)} fill={TEXT} />
              </g>
            ))}

            {/* garis potong */}
            {cutLine(c0, gy - H1, "cut1", cutT1)}
            {cutLine(c1, gy - H2, "cut2", cutT2)}

            {/* balok harga yang tersisa (bergeser antar kolom) */}
            <rect
              x={keepX - bw / 2}
              y={gy - keepH}
              width={bw}
              height={keepH}
              rx={8}
              fill={C.price}
              fillOpacity={0.14}
              stroke={C.price}
              strokeWidth={5 + 3 * finalPulse}
              strokeLinejoin="round"
            />

            {/* irisan diskon yang terlepas */}
            {slice1 && (
              <rect
                x={c0 - bw / 2}
                y={gy - H0 - 60 * s1}
                width={bw}
                height={slice1H}
                rx={8}
                fill={C.cut}
                fillOpacity={0.3}
                stroke={C.cut}
                strokeWidth={5}
                opacity={1 - s1}
              />
            )}
            {slice2 && (
              <rect
                x={c1 - bw / 2}
                y={gy - H1 - 60 * s2}
                width={bw}
                height={slice2H}
                rx={8}
                fill={C.cut}
                fillOpacity={0.3}
                stroke={C.cut}
                strokeWidth={5}
                opacity={1 - s2}
              />
            )}

            {/* coretan pada jebakan 70% */}
            {strikeT > 0.001 && (
              <line
                x1={W / 2 - 360}
                y1={trapY}
                x2={lerp(W / 2 - 360, W / 2 + 360, strikeT)}
                y2={trapY}
                stroke={C.cut}
                strokeWidth={6}
                strokeLinecap="round"
              />
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

        <Txt x={W / 2} y={tagY} size={54} color={GOLD} glow={GOLD}>
          {`${data.labels.sale} ${d1}% + ${d2}%`}
        </Txt>

        {/* label di dalam balok dan bayangan */}
        <Txt
          x={c2}
          y={gy - Hn / 2}
          size={34}
          color={C.cut}
          opacity={lerp(D + 0.15, 1, litNaive)}
          scale={1 + 0.1 * pulse("naive", 0.5)}
          k={0.7}
        >
          {`${naive}% off?`}
        </Txt>
        <Txt
          x={c2}
          y={gy - (H2 + Hn) / 2}
          size={Math.min(34, ((H2 - Hn) * 0.7))}
          color={TEXT}
          glow={GOLD}
          opacity={litGap}
          scale={1 + 0.15 * pulse("gap", 0.5)}
          k={0.8}
        >
          {`${fm(gapPct)}%`}
        </Txt>
        {slice1 && (
          <Txt x={c0} y={gy - H0 - 60 * s1 + slice1H / 2} size={44} color={TEXT} glow={C.cut} opacity={1 - s1}>
            {`−${d1}%`}
          </Txt>
        )}
        {slice2 && (
          <Txt x={c1} y={gy - H1 - 60 * s2 + slice2H / 2} size={30} color={TEXT} glow={C.cut} opacity={1 - s2}>
            {`−${fm(slice2pct)}%`}
          </Txt>
        )}

        {/* label panah */}
        <Txt x={(c0 + c1) / 2} y={arrowY - 44} size={36} color={C.cut} opacity={lerp(D + 0.1, 1, lit1)} k={0.7}>
          {`−${d1}%`}
        </Txt>
        <Txt x={(c1 + c2) / 2} y={arrowY - 44} size={36} color={C.cut} opacity={lerp(D + 0.1, 1, lit2)} k={0.7}>
          {`−${d2}%`}
        </Txt>

        {/* label kolom: persen dan harga */}
        {colX.map((x, i) => {
          const lit = colLit[i];
          const p = i === 0 ? 0 : pulse(colId[i], 0.5);
          return (
            <React.Fragment key={`cl${i}`}>
              <Txt
                x={x}
                y={gy + 62}
                size={46}
                color={C.price}
                opacity={lerp(D + 0.15, 1, lit)}
                scale={1 + 0.15 * p}
                k={0.8}
              >
                {`${fm(colPct[i])}%`}
              </Txt>
              <Txt
                x={x}
                y={gy + 116}
                size={30}
                color={TEXT}
                weight={700}
                opacity={lerp(D + 0.15, 1, lit)}
                k={0.4}
              >
                {money(data.currency, colPrice[i])}
              </Txt>
            </React.Fragment>
          );
        })}

        {/* jebakan: 50% + 20% = 70% ? (dicoret di akhir) */}
        <Row y={trapY} width={W} size={54} opacity={1 - 0.55 * strikeT}>
          <S c={TEXT}>{`${d1}% + ${d2}% = `}</S>
          <S c={C.cut}>{`${naive}% ?`}</S>
        </Row>

        {/* langkah hitung */}
        <Row
          y={stepY}
          width={W}
          size={52}
          opacity={stageOp * (1 - 0.5 * finalT)}
          scale={(0.92 + 0.08 * stageOp) * (1 + 0.08 * stagePulse)}
        >
          {stage === 1 && (
            <>
              <S c={TEXT}>{`100% − `}</S>
              <S c={C.cut}>{`${d1}%`}</S>
              <S c={TEXT}>{` = `}</S>
              <S c={C.price}>{`${fm(p1)}%`}</S>
            </>
          )}
          {stage === 2 && (
            <>
              <S c={C.cut}>{`${d2}%`}</S>
              <S c={TEXT}>{` of ${fm(p1)}% = `}</S>
              <S c={C.cut}>{`${fm(slice2pct)}%`}</S>
            </>
          )}
          {stage === 3 && (
            <>
              <S c={TEXT}>{`${fm(p1)}% − `}</S>
              <S c={C.cut}>{`${fm(slice2pct)}%`}</S>
              <S c={TEXT}>{` = `}</S>
              <S c={C.price}>{`${fm(p2)}%`}</S>
            </>
          )}
        </Row>

        {/* hasil akhir */}
        <Row y={finalY} width={W} size={89} opacity={finalT} scale={(0.85 + 0.15 * clamp01(finalT)) * (1 + 0.08 * finalPulse)}>
          <S c={GOLD}>{`${data.labels.finalPrefix}${fm(realOff)}${data.labels.finalSuffix}`}</S>
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