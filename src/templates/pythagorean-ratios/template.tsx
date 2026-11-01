import React, { useMemo } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  random,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

/* ───────────────────────── Tipe data (lokal) ───────────────────────── */

type Cue = {
  id: string;
  beat: number;
  voice: string;
  notes?: number[];
  gain?: number;
  pan?: number;
};

type TemplateData = {
  title: string;
  subtitle: string;
  background: string;
  accent: string; // #rrggbb
  accent2: string; // #rrggbb
  durationInSeconds: number;
  bpm: number;
  audio?: string;
  cues: Cue[];
};

/* ───────────────────────── Layout & konstanta ───────────────────────── */

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 1080;
const H = 1920;
const CX = W / 2;
const CY_CAM = 800;

const F1 = 36;
const F2 = Math.round(F1 * PHI); // 58
const F3 = Math.round(F2 * PHI); // 94

const X0 = 130;
const X1 = 950;
const LW = X1 - X0;
const RA = 480;
const RB = 630;
const RC = 780;
const WY = 930;
const WAMP = 100;
const NPTS = 360;
const EQ_Y = 1310;

// Tahap: 0 unison, 1 oktaf, 2 kuint, 3 kuart, 4 septim mayor (disonan), 5 akor
const LENB = [1, 1 / 2, 2 / 3, 3 / 4, 8 / 15, 2 / 3];
const LEN_LAB = ["1", "1/2", "2/3", "3/4", "8/15", "2/3"];
const FM = ["1", "2", "3/2", "4/3", "15/8", "3/2"];
const PQ: [number, number][] = [
  [1, 1],
  [2, 1],
  [3, 2],
  [4, 3],
  [15, 8],
];
const RAT = ["1 : 1", "2 : 1", "3 : 2", "4 : 3", "15 : 8"];
const NAME = ["UNISON", "OCTAVE", "FIFTH", "FOURTH", "MAJOR 7TH"];
const F_BASE = 2; // Hz visual senar penuh

const AMBER = "#ffd34d";
const GOOD = "#6dffb0";
const RED = "#ff4f7b";
const WHITE = "#ffffff";
const FONT =
  '"Orbitron", "Rajdhani", "Segoe UI", system-ui, -apple-system, sans-serif';

/* ───────────────────────── Util ───────────────────────── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const spring = (k: number) =>
  k <= 0 ? 0 : 1 - Math.exp(-13 * k) * Math.cos(19 * k);

const mixHex = (a: string, b: string, k: number) => {
  const kk = clamp01(k);
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (s: number) => {
    const va = (pa >> s) & 255;
    const vb = (pb >> s) & 255;
    return Math.round(va + (vb - va) * kk)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
};

const track = (t: number, pts: [number, number][]) => {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    if (t < pts[i + 1][0]) {
      return lerp(
        pts[i][1],
        pts[i + 1][1],
        easeInOut(ramp(t, pts[i][0], pts[i + 1][0])),
      );
    }
  }
  return pts[pts.length - 1][1];
};

type KF = { t: number; s: number };
const camAt = (t: number, kfs: KF[]) => {
  if (t <= kfs[0].t) return kfs[0].s;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t < b.t) {
      return lerp(a.s, b.s, easeInOut(clamp01((t - a.t) / Math.max(0.001, b.t - a.t))));
    }
  }
  return kfs[kfs.length - 1].s;
};

const shakeAt = (t: number, hits: { t: number; amp: number }[]) => {
  let x = 0;
  let y = 0;
  let r = 0;
  let z = 0;
  for (const h of hits) {
    const d = t - h.t;
    if (d < 0 || d > 0.9) continue;
    const e = Math.exp(-d * 8);
    x += h.amp * e * Math.sin(d * 86);
    y += h.amp * e * Math.cos(d * 73 + 1.3);
    r += h.amp * 0.012 * e * Math.sin(d * 61);
    z += h.amp * 0.0008 * e;
  }
  return { x, y, r, z };
};

/** Getaran senar: amplitudi meluruh setelah dipetik, fase mulai dari simpangan maksimum */
const vib = (t: number, plucks: number[], f: number) => {
  let tp = -1;
  for (const p of plucks) if (p <= t && p > tp) tp = p;
  if (tp < 0) return { a: 3, ph: Math.sin(2 * Math.PI * f * t) };
  const d = t - tp;
  return { a: 3 + 36 * Math.exp(-d * 0.85), ph: Math.cos(2 * Math.PI * f * d) };
};

/* ───────────────────────── Elemen visual ───────────────────────── */

const Shards: React.FC<{
  x: number;
  y: number;
  t0: number;
  t: number;
  color: string;
  seed: string;
  n?: number;
  spread?: number;
  life?: number;
}> = ({ x, y, t0, t, color, seed, n = 14, spread = 120, life = 0.9 }) => {
  const k = (t - t0) / life;
  if (k < 0 || k > 1) return null;
  const e = easeOut(k);
  return (
    <g>
      {Array.from({ length: n }).map((_, i) => {
        const a = random(`${seed}-a-${i}`) * Math.PI * 2;
        const far = spread * (0.45 + random(`${seed}-d-${i}`) * 0.55);
        const d1 = far * e;
        const d0 = Math.max(0, d1 - far * 0.32 * (1 - k));
        const c = Math.cos(a);
        const s = Math.sin(a);
        const px = x + c * d1;
        const py = y + s * d1 + 16 * k * k;
        if (i % 3 === 0) {
          const sz = 4 + random(`${seed}-s-${i}`) * 4;
          return (
            <rect
              key={i}
              x={px - sz}
              y={py - sz}
              width={sz * 2}
              height={sz * 2}
              fill="none"
              stroke={i % 2 ? WHITE : color}
              strokeWidth={2}
              opacity={1 - k}
              transform={`rotate(45 ${px} ${py})`}
            />
          );
        }
        return (
          <line
            key={i}
            x1={x + c * d0}
            y1={y + s * d0}
            x2={px}
            y2={py}
            stroke={i % 2 ? WHITE : color}
            strokeWidth={3 * (1 - k) + 0.6}
            strokeLinecap="round"
            opacity={1 - k}
          />
        );
      })}
    </g>
  );
};

const Badge: React.FC<{ x: number; y: number; k: number; ok: boolean }> = ({ x, y, k, ok }) => {
  if (k <= 0.001) return null;
  const c = ok ? GOOD : RED;
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} filter="url(#glow)">
      <circle r={30} fill="#02040c" fillOpacity={0.92} stroke={c} strokeWidth={4} />
      {ok ? (
        <path d="M -13 1 L -4 12 L 14 -11" fill="none" stroke={c} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <g stroke={c} strokeWidth={6} strokeLinecap="round">
          <line x1={-11} y1={-11} x2={11} y2={11} />
          <line x1={11} y1={-11} x2={-11} y2={11} />
        </g>
      )}
    </g>
  );
};

/* ───────────────────────── Template ───────────────────────── */

export const Template = ({ data }: { data: TemplateData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const ACC = data.accent;
  const ACC2 = data.accent2;

  const T = useMemo(() => {
    const m: Record<string, number> = {};
    data.cues.forEach((c) => {
      m[c.id] = (c.beat * 60) / data.bpm;
    });
    return (id: string) => {
      const v = m[id];
      if (v === undefined) throw new Error(`Cue "${id}" tidak ada di data.json`);
      return v;
    };
  }, [data]);

  /* ── Waktu kunci ── */
  const tL = [0, 1, 2, 3, 4, 5].map((i) => T(`lock-${i}`));
  const tS = [0, ...[1, 2, 3, 4, 5].map((i) => T(`sl-${i}`))];
  const tPB = [0, 1, 2, 3, 4].map((i) => T(`pb-${i}`));
  const tCh = [0, 1, 2, 3, 4].map((i) => T(`ch-${i}`));
  const tWv = [0, 1, 2, 3, 4].map((i) => T(`wv-${i}`));
  const tPA0 = T("pa-0");
  const tAr = [T("ar-1"), T("ar-2"), T("ar-3")];
  const tFin = T("fin");
  const tTxt = T("txt");
  const tSweep = T("sweep");
  const tEnd = T("end");

  const plucksA = [tPA0, ...tCh, tAr[0], tFin];
  const plucksB = [...tPB, ...tCh, tAr[1], tFin];
  const plucksC = [tAr[2], tFin];

  const hits = useMemo(
    () =>
      data.cues
        .filter((c) => c.voice === "thud" || c.voice === "pop")
        .map((c) => ({
          t: (c.beat * 60) / data.bpm,
          amp: (c.voice === "thud" ? 50 : 28) * (c.gain ?? 0.3),
        })),
    [data],
  );

  const kfs = useMemo(() => {
    const k: KF[] = [];
    const add = (tt: number, s: number) => k.push({ t: tt, s });
    const bump = (tt: number, peak: number, back: number) => {
      add(tt - 0.1, 1);
      add(tt + 0.25, peak);
      add(tt + back, 1);
    };
    add(0, 1);
    [1, 2, 3, 4, 5].forEach((i) => bump(T(`lock-${i}`), 1.04, 0.9));
    [0, 1, 2, 3, 4].forEach((i) => bump(T(`ch-${i}`), 1.03, 0.9));
    bump(T("fin"), 1.06, 3);
    add(data.durationInSeconds, 0.97);
    return k.sort((a, b) => a.t - b.t);
  }, [T, data.durationInSeconds]);

  const stars = useMemo(
    () =>
      Array.from({ length: 90 }, (_, i) => ({
        x: random(`sx${i}`) * W,
        y: random(`sy${i}`) * H,
        r: 0.6 + random(`sr${i}`) * 1.5,
        ph: random(`sp${i}`) * Math.PI * 2,
      })),
    [],
  );
  const drifters = useMemo(
    () =>
      Array.from({ length: 12 }, (_, i) => ({
        x: random(`gx${i}`) * W,
        y: random(`gy${i}`) * H,
        w: 40 + random(`gw${i}`) * 110,
        h: 40 + random(`gh${i}`) * 110,
        rot: random(`gr${i}`) * 90,
        spin: (random(`gv${i}`) - 0.5) * 14,
        speed: 10 + random(`gp${i}`) * 16,
        alt: i % 2 === 1,
      })),
    [],
  );

  /* ── Kamera + getaran ── */
  const camS = camAt(t, kfs);
  const sh = shakeAt(t, hits);
  const sx = sh.x + Math.sin(t * 0.7) * 2;
  const sy = sh.y + Math.cos(t * 0.9) * 2;
  const par = 1 + (camS - 1) * 0.25;

  /* ── Tahap saat ini ── */
  let cur = 0;
  for (let i = 1; i <= 4; i++) if (t >= tL[i]) cur = i;
  let lk = 0;
  for (let i = 1; i <= 5; i++) if (t >= tL[i]) lk = i;
  const stage5 = t >= tS[5];
  const [pp, qq] = PQ[cur];
  const bad = cur === 4;

  const lenPts: [number, number][] = [[0, 1]];
  for (let i = 1; i <= 5; i++) {
    lenPts.push([tS[i], LENB[i - 1]], [tL[i], LENB[i]]);
  }
  const lenB = track(t, lenPts);
  const lenC = lerp(1, 1 / 2, easeInOut(ramp(t, tS[5], tL[5])));
  const cOp = ramp(t, tS[5], tS[5] + 0.5);

  const bColor = mixHex(
    ACC2,
    RED,
    ramp(t, tL[4], tL[4] + 0.5) * (1 - ramp(t, tS[5], tS[5] + 0.5)),
  );

  /* ───────── Senar ───────── */
  const stringNode = (
    key: string,
    y: number,
    ls: number,
    pl: number[],
    f: number,
    color: string,
    op: number,
    label: string,
  ) => {
    const { a, ph } = vib(t, pl, f);
    const n = 72;
    let d = "";
    for (let k = 0; k <= n; k++) {
      const u = k / n;
      const x = X0 + ls * u;
      const yy = y - a * Math.sin(Math.PI * u) * ph;
      d += (k ? " L " : "M ") + x.toFixed(1) + " " + yy.toFixed(1);
    }
    const bx = X0 + ls;
    return (
      <g key={key} opacity={op}>
        {LW - ls > 2 && (
          <line x1={bx} y1={y} x2={X1} y2={y} stroke={color} strokeOpacity={0.22} strokeWidth={3} strokeDasharray="6 12" />
        )}
        <line x1={X0} y1={y - 22} x2={X0} y2={y + 22} stroke={WHITE} strokeOpacity={0.6} strokeWidth={4} strokeLinecap="round" />
        <path d={d} fill="none" stroke={color} strokeWidth={7} strokeOpacity={0.5} strokeLinecap="round" filter="url(#glow)" />
        <path d={d} fill="none" stroke={WHITE} strokeWidth={2.5} strokeLinecap="round" />
        <rect
          x={bx - 12}
          y={y - 12}
          width={24}
          height={24}
          fill={color}
          fillOpacity={0.3}
          stroke={color}
          strokeWidth={4}
          transform={`rotate(45 ${bx} ${y})`}
          filter="url(#glow)"
        />
        <text x={X0} y={y - 54} fontSize={28} fontWeight={700} fill={color} filter="url(#glow)">
          {label}
        </text>
      </g>
    );
  };

  /* ───────── Panel gelombang ───────── */
  const waveVis = stage5 ? 1 - ramp(t, tS[5], tS[5] + 0.5) : 1 - ramp(t, tS[cur + 1], tS[cur + 1] + 0.5);
  const panelOp = ramp(t, 0.2, 0.7) * waveVis;
  const kW = ramp(t, tWv[cur], tWv[cur] + 1.6);
  const nRev = Math.floor(kW * NPTS);
  const pathOf = (g: (u: number) => number) => {
    let d = "";
    for (let i = 0; i <= nRev; i++) {
      const u = i / NPTS;
      d += (i ? " L " : "M ") + (X0 + LW * u).toFixed(1) + " " + (WY - WAMP * g(u)).toFixed(1);
    }
    return d;
  };
  const gA = (u: number) => 0.5 * Math.sin(2 * Math.PI * qq * u);
  const gB = (u: number) => 0.5 * Math.sin(2 * Math.PI * pp * u);
  const sumCol = bad ? RED : mixHex(WHITE, GOOD, 0.45);
  const headU = Math.min(1, kW);
  const headY = WY - WAMP * (gA(headU) + gB(headU));
  const ratK = spring((t - tL[cur]) / 0.6);
  const ratOp = ramp(t, tL[cur], tL[cur] + 0.3) * waveVis;
  const syncOp = ramp(t, tWv[cur] + 1.0, tWv[cur] + 1.4) * waveVis;
  const badgeK = spring((t - tCh[cur]) / 0.4);

  const wavePanel =
    panelOp > 0.003 ? (
      <g opacity={panelOp}>
        <line x1={X0} y1={WY} x2={X1} y2={WY} stroke={WHITE} strokeOpacity={0.3} strokeWidth={2} />
        <line x1={X0} y1={WY - WAMP - 6} x2={X0} y2={WY + WAMP + 6} stroke={WHITE} strokeOpacity={0.3} strokeWidth={2} />
        <line x1={X1} y1={WY - WAMP - 6} x2={X1} y2={WY + WAMP + 6} stroke={WHITE} strokeOpacity={0.3} strokeWidth={2} />
        <text x={X0} y={WY - WAMP - 44} fontSize={28} fontWeight={800} fill={ACC}>A</text>
        <text x={X0 + 56} y={WY - WAMP - 44} fontSize={28} fontWeight={800} fill={bColor}>B</text>
        <text x={X0 + 112} y={WY - WAMP - 44} fontSize={28} fontWeight={800} fill={sumCol}>A + B</text>

        {/* penanda siklus: A di atas, B di bawah */}
        {Array.from({ length: qq + 1 }).map((_, j) => {
          const x = X0 + (LW * j) / qq;
          if (x > X0 + LW * kW + 0.5) return null;
          return <line key={`ta${j}`} x1={x} y1={WY - WAMP - 22} x2={x} y2={WY - WAMP - 8} stroke={ACC} strokeWidth={3} strokeLinecap="round" />;
        })}
        {Array.from({ length: pp + 1 }).map((_, j) => {
          const x = X0 + (LW * j) / pp;
          if (x > X0 + LW * kW + 0.5) return null;
          return <line key={`tb${j}`} x1={x} y1={WY + WAMP + 8} x2={x} y2={WY + WAMP + 22} stroke={bColor} strokeWidth={3} strokeLinecap="round" />;
        })}

        {nRev > 1 && (
          <g>
            <path d={pathOf(gA)} fill="none" stroke={ACC} strokeWidth={3} strokeOpacity={0.55} strokeLinejoin="round" />
            <path d={pathOf(gB)} fill="none" stroke={bColor} strokeWidth={3} strokeOpacity={0.55} strokeLinejoin="round" />
            <path
              d={pathOf((u) => gA(u) + gB(u))}
              fill="none"
              stroke={sumCol}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              filter="url(#glowBig)"
            />
            {kW < 1 && (
              <rect
                x={X0 + LW * headU - 8}
                y={headY - 8}
                width={16}
                height={16}
                fill={WHITE}
                transform={`rotate(45 ${X0 + LW * headU} ${headY})`}
                filter="url(#glowBig)"
              />
            )}
          </g>
        )}

        <text x={CX} y={1100} textAnchor="middle" fontSize={34} fontWeight={800} opacity={syncOp} filter="url(#glow)">
          <tspan fill={ACC}>{`${qq} × A`}</tspan>
          <tspan fill={WHITE}>{"  =  "}</tspan>
          <tspan fill={bColor}>{`${pp} × B`}</tspan>
        </text>

        <g transform={`translate(${CX} 1195) scale(${0.8 + 0.2 * ratK})`} opacity={ratOp}>
          <text textAnchor="middle" fontSize={F3} fontWeight={900} fill={bad ? RED : GOOD} filter="url(#glowBig)">
            {RAT[cur]}
          </text>
        </g>
        <text x={CX} y={1250} textAnchor="middle" fontSize={F1} fontWeight={700} letterSpacing={3} opacity={ratOp} filter="url(#glow)">
          <tspan fill={WHITE}>{NAME[cur] + "  ·  "}</tspan>
          <tspan fill={bad ? RED : GOOD}>{bad ? "CLASH" : "SWEET"}</tspan>
        </text>
        <g opacity={ratOp}>
          <Badge x={900} y={1180} k={badgeK} ok={!bad} />
        </g>
      </g>
    ) : null;

  /* ───────── Penutup (tiga senar) ───────── */
  const finK = spring((t - tFin) / 0.6);
  const txtK1 = spring((t - tTxt) / 0.6);
  const txtK2 = spring((t - (tTxt + 0.18)) / 0.6);
  const sp = ramp(t, tSweep, tSweep + 1.8);
  const bandX = lerp(X0 - 160, X1 + 80, easeInOut(sp));
  const sweepOp = Math.sin(Math.PI * sp);

  const endNodes =
    stage5 ? (
      <g>
        {tFin <= t && (
          <g transform={`translate(${CX} 1000) scale(${0.8 + 0.2 * finK})`} opacity={clamp01(finK)}>
            <text textAnchor="middle" fontSize={F3} fontWeight={900} fill={GOOD} filter="url(#glowBig)">
              2 : 3 : 4
            </text>
          </g>
        )}
        <g transform={`translate(${CX} 1110) scale(${0.85 + 0.15 * txtK1})`} opacity={clamp01(txtK1)}>
          <text textAnchor="middle" fontSize={F2} fontWeight={800} fill={WHITE} filter="url(#glow)">
            HARMONY IS
          </text>
        </g>
        <g transform={`translate(${CX} 1186) scale(${0.85 + 0.15 * txtK2})`} opacity={clamp01(txtK2)}>
          <text textAnchor="middle" fontSize={F2} fontWeight={800} fill={GOOD} filter="url(#glowBig)">
            SIMPLE RATIOS.
          </text>
        </g>
        {sp > 0 && sp < 1 && (
          <g clipPath="url(#strClip)" opacity={sweepOp}>
            <polygon
              points={`${bandX - 80},${RC + 90} ${bandX - 10},${RA - 90} ${bandX + 80},${RA - 90} ${bandX + 10},${RC + 90}`}
              fill="url(#band)"
            />
          </g>
        )}
      </g>
    ) : null;

  /* ───────── Persamaan bawah ───────── */
  const eqSteps: { t: number; parts: [string, string][] }[] = [
    { t: 0, parts: [["shorter", ACC], [" string = ", WHITE], ["higher pitch", GOOD]] },
    ...[1, 2, 3, 4].map((i) => ({
      t: tL[i],
      parts: [
        ["length ", WHITE],
        [LEN_LAB[i], ACC],
        ["  →  f × ", WHITE],
        [FM[i], i === 4 ? RED : GOOD],
      ] as [string, string][],
    })),
    { t: tL[5], parts: [["lengths ", WHITE], ["6 : 4 : 3", ACC], ["  →  ", WHITE], ["2 : 3 : 4", GOOD]] },
  ];
  let eqIdx = 0;
  eqSteps.forEach((s, i) => {
    if (t >= s.t) eqIdx = i;
  });
  const eqCur = eqSteps[eqIdx];

  const labB = lk === 0 ? "LENGTH 1 · f" : `LENGTH ${LEN_LAB[lk]} · f × ${FM[lk]}`;

  /* ───────── Render ───────── */
  return (
    <AbsoluteFill style={{ background: data.background, fontFamily: FONT }}>
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <radialGradient id="aurA">
            <stop offset="0" stopColor={ACC} stopOpacity="0.13" />
            <stop offset="1" stopColor={ACC} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurB">
            <stop offset="0" stopColor={ACC2} stopOpacity="0.16" />
            <stop offset="1" stopColor={ACC2} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vignette" cx="50%" cy="48%" r="75%">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.6" />
          </radialGradient>
          <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor={WHITE} stopOpacity="0" />
            <stop offset="0.5" stopColor={WHITE} stopOpacity="0.5" />
            <stop offset="1" stopColor={WHITE} stopOpacity="0" />
          </linearGradient>
          <clipPath id="strClip">
            <rect x={X0 - 40} y={RA - 90} width={LW + 80} height={RC - RA + 180} />
          </clipPath>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowBig" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="8" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Latar */}
        <g transform={`translate(${CX} 960) scale(${par}) translate(${-CX} -960)`}>
          <ellipse cx={300 + Math.sin(t * 0.13) * 140} cy={620 + Math.sin(t * 0.2) * 60} rx={560} ry={420} fill="url(#aurA)" />
          <ellipse cx={800 + Math.sin(t * 0.1 + 2) * 150} cy={1100 + Math.cos(t * 0.17) * 80} rx={600} ry={460} fill="url(#aurB)" />
          {drifters.map((d, i) => {
            const y = ((((d.y - t * d.speed) % (H + 240)) + (H + 240)) % (H + 240)) - 120;
            return (
              <rect
                key={i}
                x={-d.w / 2}
                y={-d.h / 2}
                width={d.w}
                height={d.h}
                rx={8}
                fill="none"
                stroke={d.alt ? ACC2 : ACC}
                strokeWidth={2}
                opacity={0.12}
                transform={`translate(${d.x + Math.sin(t * 0.3 + i) * 26} ${y}) rotate(${d.rot + t * d.spin})`}
              />
            );
          })}
        </g>
        {stars.map((s, i) => (
          <circle key={i} cx={s.x} cy={s.y} r={s.r} fill="#fff" opacity={0.2 + 0.4 * Math.sin(t * 1.2 + s.ph) ** 2} />
        ))}

        {/* Dunia adegan: kamera halus + getaran */}
        <g
          transform={`translate(${CX + sx} ${CY_CAM + sy}) rotate(${sh.r}) scale(${camS * (1 + sh.z)}) translate(${-CX} ${-CY_CAM})`}
        >
          {stringNode("A", RA, LW, plucksA, F_BASE, ACC, 1, "LENGTH 1 · f")}
          {stringNode("B", RB, LW * lenB, plucksB, F_BASE / lenB, bColor, 1, labB)}
          {cOp > 0.003 &&
            stringNode("C", RC, LW * lenC, plucksC, F_BASE / lenC, AMBER, cOp, "LENGTH 1/2 · f × 2")}

          {wavePanel}
          {endNodes}

          {/* percikan penanda */}
          {[1, 2, 3, 4].map((i) => (
            <Shards key={`lk${i}`} x={X0 + LW * LENB[i]} y={RB} t0={tL[i]} t={t} color={i === 4 ? RED : ACC2} seed={`lk${i}`} n={14} spread={120} />
          ))}
          {[0, 1, 2, 3].map((i) => (
            <Shards key={`ch${i}`} x={CX} y={RB} t0={tCh[i]} t={t} color={GOOD} seed={`ch${i}`} n={20} spread={300} life={1.1} />
          ))}
          <Shards x={CX} y={RB} t0={tCh[4]} t={t} color={RED} seed="ch4" n={24} spread={320} life={1.1} />
          <Shards x={X0 + LW * (2 / 3)} y={RB} t0={tL[5]} t={t} color={GOOD} seed="lk5" n={16} spread={140} />
          <Shards x={CX} y={RB} t0={tFin} t={t} color={WHITE} seed="fw" n={34} spread={420} life={1.4} />
          <Shards x={CX} y={RB} t0={tFin} t={t} color={GOOD} seed="fg" n={24} spread={330} life={1.4} />
          <Shards x={CX} y={RB} t0={tEnd} t={t} color={ACC2} seed="en" n={18} spread={300} life={1.2} />
        </g>

        <rect width={W} height={H} fill="url(#vignette)" />

        {/* Header: tampil sejak frame pertama */}
        <g transform={`translate(${sh.x * 0.4} ${sh.y * 0.4})`}>
          <text
            x={CX}
            y={175}
            textAnchor="middle"
            fontSize={F2}
            fontWeight={800}
            fill={WHITE}
            textLength={800}
            lengthAdjust="spacingAndGlyphs"
            filter="url(#glow)"
          >
            {data.title.toUpperCase()}
          </text>
          <text x={CX} y={232} textAnchor="middle" fontSize={F1} letterSpacing={1} fill={ACC} opacity={0.85}>
            {data.subtitle.toUpperCase()}
          </text>

          <g
            transform={`translate(${CX} ${EQ_Y}) scale(${0.8 + 0.2 * spring((t - eqCur.t) / 0.45)})`}
            opacity={ramp(t, eqCur.t, eqCur.t + 0.15)}
          >
            <text textAnchor="middle" fontSize={42} fontWeight={800} filter="url(#glow)">
              {eqCur.parts.map(([s, c], i) => (
                <tspan key={i} fill={c}>
                  {s}
                </tspan>
              ))}
            </text>
          </g>
        </g>

        {/* Kilatan pada momen kunci */}
        {[0, 1, 2, 3].map((i) =>
          t >= tCh[i] ? <rect key={i} width={W} height={H} fill="#fff" opacity={0.06 * Math.exp(-(t - tCh[i]) * 6)} /> : null,
        )}
        {t >= tCh[4] && <rect width={W} height={H} fill={RED} opacity={0.12 * Math.exp(-(t - tCh[4]) * 6)} />}
        {t >= tFin && <rect width={W} height={H} fill="#fff" opacity={0.16 * Math.exp(-(t - tFin) * 6)} />}
      </svg>
    </AbsoluteFill>
  );
};