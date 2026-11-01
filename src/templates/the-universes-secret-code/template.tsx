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

type ColorKey = "sq" | "gold" | "text" | "star";
type SweepTarget = "rule" | "numLine" | "squares" | "spiral" | "arms" | "body" | "finalLine";

type Sweep = {
  cue: string;
  target: SweepTarget;
  dur: number; // dalam beat
  delay?: number; // dalam beat
  color: ColorKey;
};

type FibData = {
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
  colors: { sq: string; star: string; text: string };
  sequence: number[];
  draftOpacity: number;
  layout: {
    rectTop: number;
    maxWidth: number;
    rectHeight: number;
    numberRowY: number;
    ratioY: number;
    phiY: number;
    labelY: number;
    askY: number;
    captionY: number;
  };
  labels: { shell: string; galaxy: string; ask: string; phi: string };
  nature: {
    center: [number, number];
    shellWidth: number;
    galaxyRadius: number;
    arms: number;
    inwardArcs: number;
    collapseSteps: number;
  };
  flow: {
    dotSpacing: number;
    dotSpeed: number;
    dashLength: number;
    dashGap: number;
    dashSpeed: number;
  };
  snail: { body: Array<[number, number]>; stalks: Array<Array<[number, number]>> };
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

const polyD = (pts: Pt[]) => pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");

/* ───────── geometri Fibonacci ─────────
   Busur dibangun dengan syarat garis singgung sama di tiap sambungan
   (pusat busur berikutnya segaris dengan pusat sebelumnya, di sisi yang sama),
   jadi spiral selalu mulus. Spiral ke dalam diteruskan dengan rasio 1/φ
   sampai ke "mata" spiral. */

const rotCCW = (v: Pt): Pt => ({ x: -v.y, y: v.x });
const rotBy = (v: Pt, a: number): Pt => ({
  x: v.x * Math.cos(a) - v.y * Math.sin(a),
  y: v.x * Math.sin(a) + v.y * Math.cos(a),
});
const arcPts = (c: Pt, from: Pt, steps = 40): Pt[] =>
  Array.from({ length: steps + 1 }, (_, j) => {
    const r = rotBy({ x: from.x - c.x, y: from.y - c.y }, (j / steps) * (Math.PI / 2));
    return { x: c.x + r.x, y: c.y + r.y };
  });

type Geo = {
  squares: Array<{ pts: Pt[]; ctr: Pt; s: number }>;
  spiralIn: Pt[]; // koordinat layar, dari luar ke dalam
  knots: number[]; // jarak awal tiap busur luar, awal ekor, total
  total: number;
  pole: Pt;
  u: number;
  rmax: number;
  bbox: { cx: number; cy: number; w: number; h: number };
};

const buildGeometry = (
  seq: number[],
  maxW: number,
  rectH: number,
  W: number,
  top: number,
  inward: number,
): Geo => {
  const n = seq.length;
  let c: Pt = { x: seq[0], y: seq[0] };
  let P: Pt = { x: 0, y: seq[0] };
  const c0 = c;
  const P0 = P;

  const sq: Array<{ pts: Pt[]; ctr: Pt; s: number }> = [];
  const arcs: Pt[][] = [];
  for (let k = 0; k < n; k++) {
    const s = seq[k];
    const v = { x: P.x - c.x, y: P.y - c.y };
    const ve = rotCCW(v);
    const Pn = { x: c.x + ve.x, y: c.y + ve.y };
    sq.push({
      pts: [
        c,
        { x: c.x + v.x, y: c.y + v.y },
        { x: c.x + v.x + ve.x, y: c.y + v.y + ve.y },
        { x: c.x + ve.x, y: c.y + ve.y },
      ],
      ctr: { x: c.x + (v.x + ve.x) / 2, y: c.y + (v.y + ve.y) / 2 },
      s,
    });
    arcs.push(arcPts(c, P));
    if (k < n - 1) {
      const r = seq[k + 1] / s;
      c = { x: Pn.x + (c.x - Pn.x) * r, y: Pn.y + (c.y - Pn.y) * r };
    }
    P = Pn;
  }

  // spiral ke dalam: busur makin kecil dengan rasio 1/φ, tetap bersinggungan mulus
  const inArcs: Pt[][] = [];
  let ci = c0;
  let Pi = P0;
  for (let m = 0; m < inward; m++) {
    const cn = { x: Pi.x + (ci.x - Pi.x) / PHI, y: Pi.y + (ci.y - Pi.y) / PHI };
    const d = { x: Pi.x - cn.x, y: Pi.y - cn.y };
    const Pn = { x: cn.x + d.y, y: cn.y - d.x };
    inArcs.push(arcPts(cn, Pn, 24));
    ci = cn;
    Pi = Pn;
  }
  const poleRaw = Pi;

  // putar 90° agar persegi panjang besar terbentang lebar di layar vertikal
  const r90 = (p: Pt): Pt => ({ x: -p.y, y: p.x });

  let minx = Infinity;
  let maxx = -Infinity;
  let miny = Infinity;
  let maxy = -Infinity;
  sq.forEach((s) =>
    s.pts.forEach((p) => {
      const q = r90(p);
      minx = Math.min(minx, q.x);
      maxx = Math.max(maxx, q.x);
      miny = Math.min(miny, q.y);
      maxy = Math.max(maxy, q.y);
    }),
  );
  const bw = maxx - minx;
  const bh = maxy - miny;
  const u = Math.min(maxW / bw, rectH / bh);
  const ox = (W - bw * u) / 2;
  const map = (p: Pt): Pt => {
    const q = r90(p);
    return { x: ox + (q.x - minx) * u, y: top + (maxy - q.y) * u };
  };

  const squares = sq.map((s) => ({ pts: s.pts.map(map), ctr: map(s.ctr), s: s.s }));
  const mArcs = arcs.map((a) => a.map(map));
  const mIn = inArcs.map((a) => a.map(map));

  const parts: Pt[][] = [];
  for (let j = 0; j < n; j++) parts.push([...mArcs[n - 1 - j]].reverse());
  for (let m = 0; m < inward; m++) parts.push([...mIn[m]].reverse());

  const spiralIn: Pt[] = [];
  const knots: number[] = [];
  let acc = 0;
  parts.forEach((part, idx) => {
    if (idx <= n) knots.push(acc);
    acc += polyLength(part);
    spiralIn.push(...(idx === 0 ? part : part.slice(1)));
  });
  knots.push(acc);

  let sx0 = Infinity;
  let sx1 = -Infinity;
  let sy0 = Infinity;
  let sy1 = -Infinity;
  spiralIn.forEach((p) => {
    sx0 = Math.min(sx0, p.x);
    sx1 = Math.max(sx1, p.x);
    sy0 = Math.min(sy0, p.y);
    sy1 = Math.max(sy1, p.y);
  });
  const pole = map(poleRaw);
  let rmax = 1;
  spiralIn.forEach((p) => {
    rmax = Math.max(rmax, dist(p, pole));
  });

  return {
    squares,
    spiralIn,
    knots,
    total: acc,
    pole,
    u,
    rmax,
    bbox: { cx: (sx0 + sx1) / 2, cy: (sy0 + sy1) / 2, w: sx1 - sx0, h: sy1 - sy0 },
  };
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

export const Template: React.FC<{ data: FibData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const C = data.colors;
  const TEXT = C.text;
  const GOLD = data.accent;
  const D = data.draftOpacity;
  const L = data.layout;
  const nat = data.nature;
  const flow = data.flow;
  const seq = data.sequence;
  const n = seq.length;
  const phiVal = (1 + Math.sqrt(5)) / 2;
  const colorOf: Record<ColorKey, string> = { sq: C.sq, gold: GOLD, text: TEXT, star: C.star };
  const armColors = [GOLD, C.star, C.sq, TEXT];

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

  const geo = useMemo(
    () => buildGeometry(seq, L.maxWidth, L.rectHeight, W, L.rectTop, nat.inwardArcs),
    [seq, L.maxWidth, L.rectHeight, L.rectTop, W, nat.inwardArcs],
  );
  const spiralD = useMemo(() => polyD(geo.spiralIn), [geo]);
  const pole = geo.pole;

  /* ───────── geometri teks ───────── */
  const titleY = H / PHI ** 5 + 20;
  const subY = titleY + 66;
  const ruleY = subY + 50;
  const titleSize = fit(data.title, 62, 0.9, 0.6);
  const subSize = fit(data.subtitle, 34, 0.9, 0.56);
  const rowStep = Math.min(128, 780 / Math.max(n - 1, 1));
  const numX = (i: number) => W / 2 + (i - (n - 1) / 2) * rowStep;
  const numLineY = L.numberRowY + 55;

  /* ───────── kepala gambar spiral: jarak mulus yang dikunci ke cue ───────── */
  const knotTimes = [
    ...Array.from({ length: n }, (_, j) => at(`arc_${j}`)),
    at("tail"),
    at("tail_end"),
  ];
  const headF = (t: number) => {
    if (t <= knotTimes[0]) return 0;
    if (t >= knotTimes[knotTimes.length - 1]) return geo.total;
    for (let i = 0; i < knotTimes.length - 1; i++) {
      if (t < knotTimes[i + 1]) {
        return lerp(geo.knots[i], geo.knots[i + 1], (t - knotTimes[i]) / (knotTimes[i + 1] - knotTimes[i]));
      }
    }
    return geo.total;
  };
  const hd =
    beat >= knotTimes[knotTimes.length - 1]
      ? geo.total
      : (headF(beat - 0.18) + headF(beat) + headF(beat + 0.18)) / 3;
  const drawn = hd >= geo.total - 0.5;
  const spiralLit = prog("spiral", 0.6);

  /* ───────── tahap alam: parameter transformasi satu spiral yang sama ───────── */
  const mShell = ramp(beat, at("nat"), at("nat") + 2.5, easeInOut);
  const mGal = ramp(beat, at("galaxy"), at("galaxy") + 2.2, easeInOut);
  const kT = ramp(beat, at("core"), at("core") + 2.4, easeInOut);
  const Ssh = nat.shellWidth / geo.bbox.w;
  const Sga = nat.galaxyRadius / geo.rmax;
  const ScNc = lerp(lerp(1, Ssh, mShell), Sga, mGal);
  const kTurn = nat.collapseSteps * kT;
  const Sc = Math.max(
    0.012,
    ScNc * Math.pow(PHI, -kTurn) * (1 + 0.012 * Math.sin(beat * 1.3) * mGal * (1 - kT)),
  );
  const rot = -90 * kTurn; // gulungan: putar balik + kecilkan = spiral menggulung ke jalurnya sendiri
  const ox = geo.bbox.cx - pole.x;
  const oy = geo.bbox.cy - pole.y;
  const tNcX = lerp(pole.x, nat.center[0] - ox * ScNc * (1 - mGal), mShell);
  const tNcY = lerp(pole.y, nat.center[1] - oy * ScNc * (1 - mGal), mShell);
  const Tx = lerp(tNcX, nat.center[0], kT);
  const Ty = lerp(tNcY, nat.center[1], kT);
  const inv = 1 / Sc;
  const armsOp = 1 - ramp(kT, 0.7, 1);
  const natOn = beat >= at("nat");
  const gridFade = 1 - ramp(beat, at("nat"), at("nat") + 1.2);

  const xf = (pts: Pt[], extraDeg: number): Pt[] => {
    const r = ((rot + extraDeg) * Math.PI) / 180;
    const cr = Math.cos(r);
    const sr = Math.sin(r);
    return pts.map((p) => {
      const x = p.x - pole.x;
      const y = p.y - pole.y;
      return { x: Tx + Sc * (x * cr - y * sr), y: Ty + Sc * (x * sr + y * cr) };
    });
  };

  /* ───────── aliran titik di sepanjang spiral ───────── */
  const flowOn = ramp(beat, at("flow"), at("flow") + 1.2);
  const flowT = beat - at("flow");
  const dotsAll = ramp(beat, at("galaxy"), at("galaxy") + 2, easeOut);

  let starCount = 0;
  while (cueMap.has(`g_${starCount}`)) starCount += 1;
  const starPts = Array.from({ length: starCount }, (_, k) =>
    pointAtDist(geo.spiralIn, geo.total * (0.1 + (0.62 * (k + 0.5)) / Math.max(starCount, 1))),
  );

  const arms = Math.max(1, nat.arms);
  const armAng = (i: number) => i * (360 / arms) * mGal;

  /* ───────── siput ───────── */
  const hw = nat.shellWidth / 2;
  const hh = (geo.bbox.h * Ssh) / 2;
  const bodyPts: Pt[] = data.snail.body.map(([x, y]) => ({
    x: nat.center[0] + x * hw,
    y: nat.center[1] + y * hh,
  }));
  const bodyLen = polyLength(bodyPts);
  const bodyDraw = bodyLen * ramp(beat, at("shell"), at("shell") + 1.8, easeOut);
  const bodyOp = prog("shell", 0.4) * (1 - ramp(beat, at("galaxy"), at("galaxy") + 1));
  const shellLbl = prog("shell", 0.6) * (1 - ramp(beat, at("galaxy"), at("galaxy") + 0.6));
  const galLbl = prog("galaxy", 0.6) * (1 - ramp(beat, at("core"), at("core") + 0.6));
  const askT = prog("ask", 0.7, backOut);

  /* ───────── kotak, rasio ───────── */
  let lastSq = -1;
  seq.forEach((_, k) => {
    if (beat >= at(`sq_${k}`)) lastSq = k;
  });
  const ratioText =
    lastSq >= 1 ? `${seq[lastSq]} ÷ ${seq[lastSq - 1]} = ${(seq[lastSq] / seq[lastSq - 1]).toFixed(3)}` : "";
  const ratioOp = lastSq >= 1 ? prog(`sq_${lastSq}`, 0.3) : 0;
  const phiT = prog("phi", 0.7, backOut);

  /* ───────── garis target untuk kilatan ───────── */
  const armLines: Pt[][] = Array.from({ length: arms }, (_, i) => xf(geo.spiralIn, armAng(i))).filter(
    (_, i) => i === 0 || mGal > 0.02,
  );
  const lines: Record<SweepTarget, Pt[][]> = {
    rule: [
      [{ x: W / 2, y: ruleY }, { x: W / 2 - W * 0.4, y: ruleY }],
      [{ x: W / 2, y: ruleY }, { x: W / 2 + W * 0.4, y: ruleY }],
    ],
    numLine: [[{ x: 100, y: numLineY }, { x: 950, y: numLineY }]],
    squares: geo.squares.map((s) => [...s.pts, s.pts[0]]),
    spiral: [xf(geo.spiralIn, 0)],
    arms: armLines,
    body: [bodyPts],
    finalLine: [[{ x: W / 2 - 380, y: L.askY + 62 }, { x: W / 2 + 380, y: L.askY + 62 }]],
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

  // caption pertama tampak penuh di frame 0 (tanpa fade-in)
  const capOpacity = (c: { from: string; to?: string }) => {
    const s = at(c.from);
    const e = c.to ? at(c.to) : 1e9;
    const fin = s <= 0 ? 1 : ramp(beat, s + 0.3, s + 1.1);
    return fin * (1 - ramp(beat, e - 0.8, e - 0.1));
  };

  const headPt = pointAtDist(geo.spiralIn, hd);
  const coreOn = kT > 0.001;

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
              id="fib-glow"
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
            {/* pemudaran ke arah luar: titik aliran memudar di ujung lengan */}
            {[TEXT, ...armColors.slice(0, arms)].map((col, i) => (
              <radialGradient
                key={`rg${i}`}
                id={`fib-fade${i}`}
                gradientUnits="userSpaceOnUse"
                cx={pole.x}
                cy={pole.y}
                r={geo.rmax}
              >
                <stop offset="0%" stopColor={col} stopOpacity={1} />
                <stop offset="70%" stopColor={col} stopOpacity={0.85} />
                <stop offset="100%" stopColor={col} stopOpacity={0} />
              </radialGradient>
            ))}
            <radialGradient id="fib-core">
              <stop offset="0%" stopColor={GOLD} stopOpacity={0.9} />
              <stop offset="45%" stopColor={GOLD} stopOpacity={0.25} />
              <stop offset="100%" stopColor={GOLD} stopOpacity={0} />
            </radialGradient>
          </defs>

          <circle
            cx={nat.center[0]}
            cy={nat.center[1]}
            r={nat.galaxyRadius * 0.62}
            fill="url(#fib-core)"
            opacity={mGal * 0.18 * (1 - kT)}
          />

          <g filter="url(#fib-glow)">
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

            {/* garis di bawah baris angka */}
            <line
              x1={100}
              y1={numLineY}
              x2={950}
              y2={numLineY}
              stroke={TEXT}
              strokeWidth={3}
              strokeLinecap="round"
              opacity={0.35 * gridFade}
            />

            {/* kotak Fibonacci: bayangan redup → menyala; berkedip saat spiral lewat */}
            <g opacity={gridFade}>
              {geo.squares.map((sq, k) => {
                const lit = prog(`sq_${k}`, 0.5);
                const fl = pulse(`sq_${k}`, 0.5);
                const ap = pulse(`arc_${n - 1 - k}`, 0.8);
                return (
                  <polygon
                    key={`sq${k}`}
                    points={sq.pts.map((p) => `${p.x},${p.y}`).join(" ")}
                    fill={ap > 0.05 ? GOLD : C.sq}
                    fillOpacity={0.14 * lit + 0.2 * ap}
                    stroke={ap > 0.1 ? GOLD : fl > 0.3 ? TEXT : C.sq}
                    strokeWidth={(lit > 0.5 ? 4 : 3) + 2 * ap}
                    strokeLinejoin="round"
                    strokeDasharray={lit > 0.5 ? undefined : "10 9"}
                    opacity={lerp(D, 1, lit)}
                  />
                );
              })}
            </g>

            {/* spiral: satu path yang sama dari awal sampai akhir */}
            <g transform={`translate(${Tx} ${Ty}) rotate(${rot}) scale(${Sc}) translate(${-pole.x} ${-pole.y})`}>
              {Array.from({ length: arms }, (_, i) => {
                if (i > 0 && mGal < 0.02) return null;
                const col = armColors[i % armColors.length];
                const op = (i === 0 ? 1 : mGal) * armsOp;
                const full = i > 0 || drawn;
                return (
                  <g key={`arm${i}`} transform={`rotate(${armAng(i)} ${pole.x} ${pole.y})`} opacity={op}>
                    {/* bayangan putus-putus sebelum digambar */}
                    {i === 0 && !natOn && (
                      <path
                        d={spiralD}
                        fill="none"
                        stroke={GOLD}
                        strokeWidth={3 * inv}
                        strokeDasharray={`${9 * inv} ${9 * inv}`}
                        opacity={D * (1 - spiralLit)}
                      />
                    )}

                    {(full || hd > 1) && (
                      <>
                        <path
                          d={spiralD}
                          fill="none"
                          stroke={col}
                          strokeWidth={14 * inv}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={full ? undefined : `${hd} ${geo.total * 3}`}
                          opacity={0.22}
                        />
                        <path
                          d={spiralD}
                          fill="none"
                          stroke={col}
                          strokeWidth={5.5 * inv}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeDasharray={full ? undefined : `${hd} ${geo.total * 3}`}
                        />
                      </>
                    )}

                    {/* kepala gambar */}
                    {i === 0 && !drawn && hd > 1 && (
                      <circle cx={headPt.x} cy={headPt.y} r={8 * inv} fill={TEXT} />
                    )}

                    {/* aliran titik cahaya menuju pusat */}
                    {full && flowOn > 0.001 && (
                      <>
                        <path
                          d={spiralD}
                          fill="none"
                          stroke={`url(#fib-fade${i + 1})`}
                          strokeWidth={4.5 * inv}
                          strokeLinecap="round"
                          strokeDasharray={`${flow.dashLength} ${flow.dashGap}`}
                          strokeDashoffset={-flow.dashSpeed * flowT + i * 37}
                          opacity={flowOn * (0.55 + 0.45 * dotsAll)}
                        />
                        <path
                          d={spiralD}
                          fill="none"
                          stroke="url(#fib-fade0)"
                          strokeWidth={7.5 * inv}
                          strokeLinecap="round"
                          strokeDasharray={`0.01 ${flow.dotSpacing}`}
                          strokeDashoffset={-flow.dotSpeed * flowT + i * 23}
                          opacity={flowOn * (0.7 + 0.3 * dotsAll)}
                        />
                      </>
                    )}

                    {/* bintang yang berkedip */}
                    {starPts.map((p, k) => {
                      const t = prog(`g_${k}`, 0.4, backOut);
                      if (t <= 0) return null;
                      const tw = 1 + 0.35 * Math.sin(beat * 3.2 + k * 1.7 + i);
                      return (
                        <circle
                          key={`st${i}-${k}`}
                          cx={p.x}
                          cy={p.y}
                          r={(4.5 + (k % 3) * 1.5) * inv * clamp01(t) * tw}
                          fill={i === 0 ? TEXT : col}
                        />
                      );
                    })}
                  </g>
                );
              })}
            </g>

            {/* tubuh siput minimalis */}
            {bodyOp > 0.001 && (
              <g opacity={bodyOp}>
                <polyline
                  points={bodyPts.map((p) => `${p.x},${p.y}`).join(" ")}
                  fill="none"
                  stroke={C.sq}
                  strokeWidth={6}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={`${bodyDraw} ${bodyLen * 2}`}
                />
                {data.snail.stalks.map((st, i) => {
                  const q = prog(`sh_${i}`, 0.4, backOut);
                  const a: Pt = { x: nat.center[0] + st[0][0] * hw, y: nat.center[1] + st[0][1] * hh };
                  const b: Pt = { x: nat.center[0] + st[1][0] * hw, y: nat.center[1] + st[1][1] * hh };
                  return (
                    <g key={`stalk${i}`} opacity={clamp01(q * 2)}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={lerp(a.x, b.x, clamp01(q))}
                        y2={lerp(a.y, b.y, clamp01(q))}
                        stroke={C.sq}
                        strokeWidth={5}
                        strokeLinecap="round"
                      />
                      <circle cx={b.x} cy={b.y} r={8 * clamp01(q)} fill={TEXT} />
                    </g>
                  );
                })}
              </g>
            )}

            {/* titik cahaya hangat di pusat */}
            {coreOn && (
              <>
                <circle
                  cx={nat.center[0]}
                  cy={nat.center[1]}
                  r={95}
                  fill="url(#fib-core)"
                  opacity={kT * 0.85}
                />
                <circle
                  cx={nat.center[0]}
                  cy={nat.center[1]}
                  r={(5 + 9 * kT) * (1 + 0.08 * Math.sin(beat * 2.4))}
                  fill={TEXT}
                  opacity={kT}
                />
              </>
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

        {/* baris angka Fibonacci */}
        {seq.map((v, i) => {
          const lit = prog(`n_${i}`, 0.4);
          return (
            <Txt
              key={`nr${i}`}
              x={numX(i)}
              y={L.numberRowY}
              size={62}
              color={TEXT}
              glow={GOLD}
              opacity={lerp(D + 0.15, 1, lit) * gridFade}
              scale={1 + 0.22 * pulse(`n_${i}`, 0.5)}
              k={0.8}
            >
              {v}
            </Txt>
          );
        })}

        {/* angka di dalam kotak */}
        {geo.squares.map((sq, k) => {
          const lit = prog(`sq_${k}`, 0.4, backOut);
          const size = Math.max(22, Math.min(80, sq.s * geo.u * 0.5));
          return (
            <Txt
              key={`sl${k}`}
              x={sq.ctr.x}
              y={sq.ctr.y}
              size={size}
              color={TEXT}
              glow={C.sq}
              opacity={clamp01(lit * 1.5) * gridFade}
              scale={0.7 + 0.3 * clamp01(lit)}
              k={0.7}
            >
              {sq.s}
            </Txt>
          );
        })}

        {/* rasio tetangga */}
        <Txt
          x={W / 2}
          y={L.ratioY}
          size={fit(ratioText || "0", 50, 0.8, 0.58)}
          color={TEXT}
          glow={GOLD}
          opacity={ratioOp * gridFade}
          scale={1 + 0.1 * (lastSq >= 0 ? pulse(`sq_${lastSq}`, 0.4) : 0)}
          k={0.7}
        >
          {ratioText}
        </Txt>

        {/* φ: bayangan redup di frame 0 → menyala saat spiral selesai */}
        <Txt
          x={W / 2}
          y={L.phiY}
          size={72}
          color={GOLD}
          glow={GOLD}
          opacity={lerp(D, 1, clamp01(phiT)) * gridFade}
          scale={(0.9 + 0.1 * clamp01(phiT)) * (1 + 0.1 * pulse("phi", 0.6))}
          k={0.9}
        >
          {`${data.labels.phi}${phiVal.toFixed(3)}`}
        </Txt>

        {/* label alam */}
        <Txt
          x={W / 2}
          y={L.labelY}
          size={56}
          color={TEXT}
          glow={C.sq}
          opacity={shellLbl}
          scale={0.9 + 0.1 * prog("shell", 0.6, backOut)}
          k={0.8}
        >
          {data.labels.shell}
        </Txt>
        <Txt
          x={W / 2}
          y={L.labelY}
          size={56}
          color={TEXT}
          glow={C.star}
          opacity={galLbl}
          scale={0.9 + 0.1 * prog("galaxy", 0.6, backOut)}
          k={0.8}
        >
          {data.labels.galaxy}
        </Txt>

        {/* pertanyaan penutup */}
        <Txt
          x={W / 2}
          y={L.askY}
          size={fit(data.labels.ask, 60, 0.9, 0.58)}
          color={TEXT}
          glow={GOLD}
          opacity={askT}
          scale={0.9 + 0.1 * clamp01(askT)}
          k={0.9}
        >
          {data.labels.ask}
        </Txt>

        {/* caption singkat */}
        {data.captions.map((c, i) => {
          const text = c.text.replace(/\{phi\}/g, phiVal.toFixed(3));
          return (
            <Txt
              key={`cp${i}`}
              x={W / 2}
              y={L.captionY}
              size={fit(text, 34, 0.88, 0.56)}
              color={TEXT}
              weight={600}
              opacity={capOpacity(c)}
              k={0.4}
            >
              {text}
            </Txt>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};