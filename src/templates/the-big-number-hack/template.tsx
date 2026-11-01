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
  bigNumber: number; // kelipatan 16
  durationInSeconds: number;
  bpm: number;
  audio?: string;
  cues: Cue[];
};

/* ───────────────────────── Layout ───────────────────────── */

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 1080;
const H = 1920;
const CX = W / 2;
const CY = 840; // pusat animasi ≈ 44% tinggi layar (center-up)
const EQ_Y = 1360;

// Skala tipografi: setiap tingkat × φ
const F1 = 36;
const F2 = Math.round(F1 * PHI); // 58
const F3 = Math.round(F2 * PHI); // 94

const BW = 720;
const BH = 760;
const CW = BW / 4; // lebar kolom 180
const RH = BH / 4; // tinggi baris 190
const G = 16; // celah antar kotak
const EXP_W = 560; // lebar kolom saat fokus
const SEL = 1; // kolom yang di-zoom

const AMBER = "#ffd34d";
const GOOD = "#6dffb0";
const WHITE = "#ffffff";
const FONT =
  '"Orbitron", "Rajdhani", "Segoe UI", system-ui, -apple-system, sans-serif';

/* ───────────────────────── Util ───────────────────────── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
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

const fmt = (n: number) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");

type KF = { t: number; s: number };
const camAt = (t: number, kfs: KF[]) => {
  if (t <= kfs[0].t) return kfs[0].s;
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t < b.t) {
      const e = easeInOut(clamp01((t - a.t) / Math.max(0.001, b.t - a.t)));
      return a.s + (b.s - a.s) * e;
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

/* ───────────────────────── Elemen visual ───────────────────────── */

const Box: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  glowK?: number;
  op?: number;
  label?: string;
  fs?: number;
  ls?: number;
  lop?: number;
}> = ({ x, y, w, h, color, glowK = 0.2, op = 1, label, fs = 40, ls = 1, lop = 1 }) => (
  <g opacity={op}>
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={18}
      fill={color}
      fillOpacity={0.07 + 0.28 * glowK}
      stroke={mixHex(color, WHITE, glowK * 0.75)}
      strokeWidth={4}
      filter="url(#glow)"
    />
    {label && ls > 0.001 && lop > 0.001 && (
      <g
        transform={`translate(${x + w / 2} ${y + h / 2}) scale(${ls})`}
        opacity={lop}
      >
        <text
          textAnchor="middle"
          y={fs * 0.36}
          fontSize={fs}
          fontWeight={800}
          fill={WHITE}
        >
          {label}
        </text>
      </g>
    )}
  </g>
);

const Laser: React.FC<{
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  p: number;
  color: string;
}> = ({ x1, y1, x2, y2, p, color }) => {
  const hx = x1 + (x2 - x1) * p;
  const hy = y1 + (y2 - y1) * p;
  return (
    <g filter="url(#glow)">
      <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={color} strokeWidth={7} strokeLinecap="round" opacity={0.55} />
      <line x1={x1} y1={y1} x2={hx} y2={hy} stroke={WHITE} strokeWidth={2.5} strokeLinecap="round" />
      <rect x={hx - 7} y={hy - 7} width={14} height={14} fill={WHITE} transform={`rotate(45 ${hx} ${hy})`} />
    </g>
  );
};

/** Serpihan garis + belah ketupat (tanpa cincin) */
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
}> = ({ x, y, t0, t, color, seed, n = 12, spread = 110, life = 0.8 }) => {
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
        const py = y + s * d1 + 18 * k * k;
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
            y2={py - 0}
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

/* ───────────────────────── Template ───────────────────────── */

export const Template = ({ data }: { data: TemplateData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const ACC = data.accent;
  const ACC2 = data.accent2;

  if (data.bigNumber % 16 !== 0) {
    throw new Error("bigNumber harus kelipatan 16");
  }
  const big = data.bigNumber;
  const v1 = big / 4;
  const v2 = big / 16;

  // id cue → detik
  const T = useMemo(() => {
    const m: Record<string, number> = {};
    data.cues.forEach((c) => {
      m[c.id] = (c.beat * 60) / data.bpm;
    });
    return (id: string) => {
      const v = m[id];
      if (v === undefined) {
        throw new Error(`Cue "${id}" tidak ada di data.json`);
      }
      return v;
    };
  }, [data]);

  const tCut1 = [T("cut1-0"), T("cut1-1"), T("cut1-2")];
  const tOpen1 = T("open1");
  const tFocus = T("focus");
  const tCollapse = T("collapse");
  const tGrid = T("grid");
  const tSweep = T("sweep");
  const tMerge = T("merge");
  const tSnap = T("merge-snap");
  const tShrink = T("shrink");
  const tEnd = T("end-chime");

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
    add(0, 1);
    add(tOpen1 - 0.1, 1);
    add(tOpen1 + 0.25, 1.05);
    add(tOpen1 + 1.6, 1);
    add(tFocus - 0.1, 1);
    add(tFocus + 0.5, 1.03);
    add(tFocus + 1.4, 1);
    add(T("open2") - 0.1, 1);
    add(T("open2") + 0.25, 1.05);
    add(T("open2") + 1.6, 1);
    add(T("s3-0") - 0.1, 1);
    add(T("s3-2") + 0.5, 1.04);
    add(tGrid + 0.3, 1.06);
    add(tGrid + 2.0, 1);
    add(tMerge - 0.1, 1);
    add(tSnap, 1.03);
    add(tSnap + 0.4, 1.05);
    add(tShrink + 1.0, 1);
    add(data.durationInSeconds, 0.97);
    return k.sort((a, b) => a.t - b.t);
  }, [T, tOpen1, tFocus, tGrid, tMerge, tSnap, tShrink, data.durationInSeconds]);

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

  /* ── Fase ── */
  const open1P = easeOut(ramp(t, tOpen1, tOpen1 + 0.55));
  const fP =
    easeInOut(ramp(t, tFocus, tFocus + 0.9)) -
    easeInOut(ramp(t, tCollapse, tCollapse + 0.9));
  const m = easeInOut(ramp(t, tMerge, tSnap));
  const unified = t >= tSnap;
  const shrinkP = easeInOut(ramp(t, tShrink, tShrink + 1.0));

  const colInfo = [0, 1, 2, 3].map((i) => {
    if (i === SEL) {
      return {
        cutT: [T("cut2-0"), T("cut2-1"), T("cut2-2")],
        openT: T("open2"),
        rowLab: [0, 1, 2, 3].map((r) => T(`lab2-${r}`)),
      };
    }
    const k = i < SEL ? i : i - 1;
    const ts = T(`s3-${k}`);
    return {
      cutT: [ts, ts + 0.06, ts + 0.12],
      openT: ts + 0.38,
      rowLab: [0, 1, 2, 3].map((r) => ts + 0.42 + 0.07 * r),
    };
  });

  const colColor = (i: number, row: number) =>
    mixHex(ACC, ACC2, clamp01((i + row) / 6));

  // sapuan cahaya diagonal
  const sweepEnv =
    ramp(t, tSweep, tSweep + 0.15) * (1 - ramp(t, tSweep + 1.5, tSweep + 1.8));
  const bandPos = -0.25 + 1.5 * ramp(t, tSweep, tSweep + 1.6);
  const inten = (i: number, r: number) =>
    sweepEnv * Math.max(0, 1 - Math.abs((i + r) / 6 - bandPos) * 3.2);

  /* ───────── Adegan ───────── */
  const sceneNodes = () => {
    const out: React.ReactNode[] = [];
    const bx = CX - BW / 2;
    const by = CY - BH / 2;

    if (t < tOpen1) {
      /* Balok besar + laser vertikal */
      const labO = 1 - ramp(t, tCut1[0], tOpen1);
      const pulse = 1 + 0.08 * Math.exp(-t * 4);
      out.push(
        <Box
          key="blk"
          x={bx}
          y={by}
          w={BW}
          h={BH}
          color={ACC}
          glowK={0.32 + 0.18 * Math.sin(t * 2.2)}
          label={fmt(big)}
          fs={120}
          ls={pulse}
          lop={labO}
        />,
      );
      out.push(
        <rect
          key="shim"
          x={bx}
          y={by}
          width={BW}
          height={BH}
          rx={18}
          fill="none"
          stroke={WHITE}
          strokeWidth={4}
          pathLength={1}
          strokeDasharray="0.1 0.9"
          strokeDashoffset={-((t * 0.3) % 1)}
          opacity={0.8 * (1 - ramp(t, tCut1[0], tCut1[0] + 0.3))}
          filter="url(#glow)"
        />,
      );
      for (let j = 0; j < 3; j++) {
        const lx = bx + (j + 1) * CW;
        const p = easeInOut(ramp(t, tCut1[j], tCut1[j] + 0.3));
        if (p > 0) {
          out.push(
            <Laser key={`l1${j}`} x1={lx} y1={by} x2={lx} y2={by + BH} p={p} color={ACC} />,
          );
          out.push(
            <Shards key={`s1${j}`} x={lx} y={CY} t0={tCut1[j] + 0.15} t={t} color={ACC} seed={`s1${j}`} n={12} spread={110} />,
          );
        }
      }
    } else if (!unified) {
      /* Kolom → baris */
      const gx = G * open1P * (1 - m);
      const colsLeft = CX - (BW + 3 * gx) / 2;
      for (let i = 0; i < 4; i++) {
        const info = colInfo[i];
        const rowP = easeOut(ramp(t, info.openT, info.openT + 0.5));
        const gy = G * rowP * (1 - m);
        const slotC = colsLeft + i * (CW + gx) + CW / 2;
        let w = CW;
        let cxx = slotC;
        let op = 1;
        if (i === SEL) {
          w = CW + (EXP_W - CW) * fP;
          cxx = slotC + (CX - slotC) * fP;
        } else {
          cxx = slotC + (i < SEL ? -170 : 170) * fP;
          op = 1 - 0.92 * fP;
        }
        const left = cxx - w / 2;
        const split = t >= info.openT;

        if (!split) {
          const labO = 1 - ramp(t, info.cutT[0], info.openT);
          out.push(
            <Box
              key={`c${i}`}
              x={left}
              y={by}
              w={w}
              h={BH}
              color={colColor(i, 1.5)}
              glowK={0.2 + (i === SEL ? 0.5 * fP : 0)}
              op={op}
              label={fmt(v1)}
              fs={Math.min(w * 0.23, 120)}
              ls={spring((t - T(`lab1-${i}`)) / 0.45)}
              lop={labO}
            />,
          );
          for (let r = 1; r <= 3; r++) {
            const yL = by + r * RH;
            const c0 = info.cutT[r - 1];
            const p = easeInOut(ramp(t, c0, c0 + 0.25));
            if (p > 0) {
              out.push(
                <g key={`lr${i}${r}`} opacity={op}>
                  <Laser x1={left} y1={yL} x2={left + w} y2={yL} p={p} color={colColor(i, 1.5)} />
                </g>,
              );
              out.push(
                <Shards key={`sr${i}${r}`} x={cxx} y={yL} t0={c0 + 0.12} t={t} color={colColor(i, 1.5)} seed={`sr${i}${r}`} n={9} spread={90} />,
              );
            }
          }
        } else {
          const top = CY - (BH + 3 * gy) / 2;
          for (let r = 0; r < 4; r++) {
            out.push(
              <Box
                key={`k${i}${r}`}
                x={left}
                y={top + r * (RH + gy)}
                w={w}
                h={RH}
                color={colColor(i, r)}
                glowK={0.2 + inten(i, r) * 0.8 + (i === SEL ? 0.3 * fP : 0)}
                op={op}
                label={fmt(v2)}
                fs={Math.min(w * 0.23, RH * 0.45, 120)}
                ls={spring((t - info.rowLab[r]) / 0.4)}
                lop={1 - ramp(t, tMerge, tMerge + 0.7)}
              />,
            );
          }
        }
      }
    } else {
      /* Balok menyatu → mengecil → melayang */
      const sc = 1 - 0.68 * shrinkP;
      const bob = Math.sin(t * 1.6) * 10 * shrinkP;
      const glowK = 0.35 + 0.2 * Math.sin(t * 2.4) + 0.4 * Math.exp(-(t - tSnap) * 4);
      out.push(
        <g key="fin" transform={`translate(${CX} ${CY + bob}) scale(${sc})`}>
          <rect
            x={-BW / 2}
            y={-BH / 2}
            width={BW}
            height={BH}
            rx={18}
            fill={ACC}
            fillOpacity={0.07 + 0.28 * glowK}
            stroke={mixHex(ACC, WHITE, glowK * 0.75)}
            strokeWidth={4}
            vectorEffect="non-scaling-stroke"
            filter="url(#glow)"
          />
          <text
            textAnchor="middle"
            y={120 * 0.36}
            fontSize={120}
            fontWeight={800}
            fill={WHITE}
            opacity={1 - shrinkP}
          >
            {fmt(big)}
          </text>
          <g transform={`scale(${0.8 + 0.2 * spring((t - tShrink - 0.4) / 0.5)})`} opacity={shrinkP}>
            <text
              textAnchor="middle"
              y={230 * 0.36}
              fontSize={230}
              fontWeight={900}
              fill={GOOD}
            >
              {fmt(v2)}
            </text>
          </g>
        </g>,
      );
      /* partikel belah ketupat mengorbit setelah mengecil */
      for (let i = 0; i < 6; i++) {
        const a = t * 1.3 + (i * Math.PI) / 3;
        const px = CX + Math.cos(a) * 210;
        const py = CY + Math.sin(a) * 120 + bob;
        out.push(
          <rect
            key={`orb${i}`}
            x={px - 9}
            y={py - 9}
            width={18}
            height={18}
            fill="none"
            stroke={mixHex(ACC, ACC2, i / 5)}
            strokeWidth={3}
            transform={`rotate(45 ${px} ${py})`}
            opacity={shrinkP * (0.5 + 0.5 * Math.sin(t * 3 + i))}
            filter="url(#glow)"
          />,
        );
      }
    }
    return out;
  };

  /* pita cahaya diagonal */
  const gl = CX - (BW + 3 * G) / 2;
  const gt = CY - (BH + 3 * G) / 2;
  const sIso = bandPos * 6;
  const isoPt = (row: number) => ({
    x: gl + (sIso - row + 0.5) * (CW + G),
    y: gt + (row + 0.5) * (RH + G),
  });
  const bandA = isoPt(-0.7);
  const bandB = isoPt(3.7);

  /* persamaan di bawah */
  const eqSteps = [
    { t: T("eq-0"), parts: [[fmt(big), WHITE], [" ÷ 16 = ", WHITE], ["?", AMBER]] },
    { t: tOpen1, parts: [[fmt(big), WHITE], [" ÷ 4 = ", WHITE], [fmt(v1), ACC]] },
    { t: T("open2"), parts: [[fmt(v1), WHITE], [" ÷ 4 = ", WHITE], [fmt(v2), ACC2]] },
    { t: tGrid, parts: [[fmt(big), WHITE], [" ÷ 16 = ", WHITE], [fmt(v2), GOOD]] },
  ] as { t: number; parts: [string, string][] }[];
  let eqIdx = -1;
  eqSteps.forEach((e, i) => {
    if (t >= e.t) eqIdx = i;
  });
  const eqCur = eqIdx >= 0 ? eqSteps[eqIdx] : null;

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
          <clipPath id="gridClip">
            <rect x={CX - 420} y={CY - 430} width={840} height={860} />
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
          <circle
            key={i}
            cx={s.x}
            cy={s.y}
            r={s.r}
            fill="#fff"
            opacity={0.2 + 0.4 * Math.sin(t * 1.2 + s.ph) ** 2}
          />
        ))}

        {/* Dunia adegan: kamera halus + getaran */}
        <g
          transform={`translate(${CX + sx} ${CY + sy}) rotate(${sh.r}) scale(${camS * (1 + sh.z)}) translate(${-CX} ${-CY})`}
        >
          {sceneNodes()}

          {/* pita cahaya penyapu grid */}
          {sweepEnv > 0.01 && (
            <g clipPath="url(#gridClip)" opacity={sweepEnv}>
              <line x1={bandA.x} y1={bandA.y} x2={bandB.x} y2={bandB.y} stroke={WHITE} strokeOpacity={0.18} strokeWidth={90} strokeLinecap="round" />
              <line x1={bandA.x} y1={bandA.y} x2={bandB.x} y2={bandB.y} stroke={WHITE} strokeWidth={4} strokeLinecap="round" filter="url(#glow)" />
            </g>
          )}

          {/* percikan penanda */}
          <Shards x={CX} y={CY} t0={tOpen1} t={t} color={ACC} seed="o1" n={18} spread={300} life={1.0} />
          <Shards x={CX} y={CY} t0={T("open2")} t={t} color={ACC2} seed="o2" n={18} spread={300} life={1.0} />
          <Shards x={CX} y={CY} t0={tGrid} t={t} color={WHITE} seed="gd" n={26} spread={420} life={1.3} />
          <Shards x={CX} y={CY} t0={tGrid} t={t} color={ACC} seed="gd2" n={18} spread={340} life={1.3} />
          <Shards x={CX} y={CY} t0={tSnap} t={t} color={WHITE} seed="sn" n={24} spread={400} life={1.2} />
          <Shards x={CX} y={CY} t0={tShrink} t={t} color={GOOD} seed="sk" n={20} spread={300} life={1.2} />
          <Shards x={CX} y={CY} t0={tEnd} t={t} color={ACC2} seed="en" n={18} spread={280} life={1.2} />
        </g>

        <rect width={W} height={H} fill="url(#vignette)" />

        {/* Header: judul + subjudul sudah tampil sejak frame pertama */}
        <g transform={`translate(${sh.x * 0.4} ${sh.y * 0.4})`}>
          <text
            x={CX}
            y={175}
            textAnchor="middle"
            fontSize={F2}
            fontWeight={800}
            fill={WHITE}
            textLength={860}
            lengthAdjust="spacingAndGlyphs"
            filter="url(#glow)"
          >
            {data.title.toUpperCase()}
          </text>
          <text
            x={CX}
            y={232}
            textAnchor="middle"
            fontSize={F1}
            letterSpacing={1}
            fill={ACC}
            opacity={0.85}
          >
            {data.subtitle.toUpperCase()}
          </text>

          {/* Persamaan */}
          {eqCur && (
            <g
              transform={`translate(${CX} ${EQ_Y}) scale(${0.8 + 0.2 * spring((t - eqCur.t) / 0.45)})`}
              opacity={ramp(t, eqCur.t, eqCur.t + 0.15)}
            >
              <text
                textAnchor="middle"
                fontSize={F2}
                fontWeight={800}
                filter="url(#glow)"
              >
                {eqCur.parts.map(([s, c], i) => (
                  <tspan key={i} fill={c}>
                    {s}
                  </tspan>
                ))}
              </text>
            </g>
          )}
        </g>

        {/* Kilatan saat grid selesai dan saat menyatu */}
        {t >= tGrid && (
          <rect width={W} height={H} fill="#fff" opacity={0.16 * Math.exp(-(t - tGrid) * 6)} />
        )}
        {t >= tSnap && (
          <rect width={W} height={H} fill="#fff" opacity={0.14 * Math.exp(-(t - tSnap) * 6)} />
        )}
      </svg>
    </AbsoluteFill>
  );
};