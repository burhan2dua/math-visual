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

/* ───────────────────────── Layout ───────────────────────── */

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 1080;
const H = 1920;
const CX = W / 2;

const F1 = 36;
const F2 = Math.round(F1 * PHI); // 58

// Orbit (center-up)
const OX = CX;
const OY = 700;
const R = 270;
const EQ_Y = 1360;

// Slot blok 6 jam
const SLOT_Y = 1130;
const SLOT_W = 150;
const SLOT_H = 110;
const SLOT_G = 14;
const SLOT_L = (W - (4 * SLOT_W + 3 * SLOT_G)) / 2;
const slotCx = (i: number) => SLOT_L + i * (SLOT_W + SLOT_G) + SLOT_W / 2;
const FLY = 0.7; // lama blok terbang dari Bumi ke slot

// Kalender Februari
const CELL_W = 96;
const CELL_H = 70;
const CELL_G = 10;
const CAL_L = (W - (7 * CELL_W + 6 * CELL_G)) / 2;
const CAL_T = 505;
const cellPos = (d: number) => {
  const col = (d - 1) % 7;
  const row = Math.floor((d - 1) / 7);
  return {
    x: CAL_L + col * (CELL_W + CELL_G) + CELL_W / 2,
    y: CAL_T + row * (CELL_H + CELL_G) + CELL_H / 2,
    col,
    row,
  };
};

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

/** Busur lingkaran dari "turn" a ke b (0 = puncak, searah jarum jam) */
const arcBetween = (r: number, a: number, b: number) => {
  if (b - a <= 0.0005) return "";
  const pt = (k: number) => {
    const ang = -Math.PI / 2 + 2 * Math.PI * k;
    return `${OX + r * Math.cos(ang)} ${OY + r * Math.sin(ang)}`;
  };
  if (b - a >= 0.999) {
    return `M ${OX} ${OY - r} A ${r} ${r} 0 1 1 ${OX} ${OY + r} A ${r} ${r} 0 1 1 ${OX} ${OY - r}`;
  }
  return `M ${pt(a)} A ${r} ${r} 0 ${b - a > 0.5 ? 1 : 0} 1 ${pt(b)}`;
};

/* ───────────────────────── Elemen visual ───────────────────────── */

const CBox: React.FC<{
  cx: number;
  cy: number;
  w: number;
  h: number;
  color: string;
  glowK?: number;
  op?: number;
  label?: string;
  fs?: number;
  lop?: number;
  rx?: number;
  dash?: string;
  fillK?: number;
}> = ({ cx, cy, w, h, color, glowK = 0.2, op = 1, label, fs = 40, lop = 1, rx = 18, dash, fillK = 1 }) => (
  <g opacity={op}>
    <rect
      x={cx - w / 2}
      y={cy - h / 2}
      width={w}
      height={h}
      rx={rx}
      fill={color}
      fillOpacity={(0.07 + 0.28 * glowK) * fillK}
      stroke={mixHex(color, WHITE, glowK * 0.75)}
      strokeWidth={4}
      strokeDasharray={dash}
      filter="url(#glow)"
    />
    {label && lop > 0.001 && (
      <text
        x={cx}
        y={cy + fs * 0.36}
        textAnchor="middle"
        fontSize={fs}
        fontWeight={800}
        fill={WHITE}
        opacity={lop}
      >
        {label}
      </text>
    )}
  </g>
);

const Badge: React.FC<{ x: number; y: number; k: number; ok: boolean }> = ({ x, y, k, ok }) => {
  if (k <= 0.001) return null;
  const c = ok ? GOOD : RED;
  return (
    <g transform={`translate(${x} ${y}) scale(${k})`} filter="url(#glow)">
      <circle r={24} fill="#02040c" fillOpacity={0.92} stroke={c} strokeWidth={4} />
      {ok ? (
        <path
          d="M -11 1 L -3 10 L 12 -9"
          fill="none"
          stroke={c}
          strokeWidth={5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <g stroke={c} strokeWidth={5} strokeLinecap="round">
          <line x1={-9} y1={-9} x2={9} y2={9} />
          <line x1={9} y1={-9} x2={-9} y2={9} />
        </g>
      )}
    </g>
  );
};

/** Serpihan garis + belah ketupat */
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
}> = ({ x, y, t0, t, color, seed, n = 14, spread = 130, life = 0.9 }) => {
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

/* ───────────────────────── Template ───────────────────────── */

export const Template = ({ data }: { data: TemplateData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const ACC = data.accent;
  const ACC2 = data.accent2;

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

  /* ── Waktu kunci ── */
  const tStart = T("start");
  const tLap1 = T("lap1-end");
  const tGap = T("gap");
  const tClose0 = T("gap-close");
  const land = [1, 2, 3, 4].map((n) => T(`blk-${n}`));
  const spawn = land.map((l) => l - FLY);
  const ys = [T("y2-start"), T("y3-start"), T("y4-start")];
  const tMerge = T("merge");
  const tSnap = T("snap");
  const tCal = T("cal-in");
  const tFly = T("fly");
  const tLand = T("land");
  const tCent = T("cent-in");
  const t96 = T("c-1896");
  const t00 = T("c-1900");
  const t04 = T("c-1904");
  const tFill = T("fill");
  const tSkip = T("skip");
  const t2000 = T("c-2000");
  const tOk = T("ok");
  const tFin = T("fin");
  const tNum = T("fin-num");
  const tSweep = T("fin-sweep");
  const tEnd = T("end");

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
    [1, 2, 3, 4].forEach((n) => bump(T(`blk-${n}`), 1.04, 0.9));
    bump(T("snap"), 1.05, 1.3);
    bump(T("land"), 1.06, 1.6);
    bump(T("skip"), 1.04, 1.2);
    bump(T("ok"), 1.05, 1.2);
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

  /* ── Gerak Bumi (e, dalam putaran) dan penanda kalender (m) ── */
  let e: number;
  if (t >= tFin) {
    e = 4 + 0.2 * (t - tFin);
  } else if (t < tLap1) {
    e = 0.9 * ramp(t, tStart, tLap1);
  } else if (t < ys[0]) {
    e = 0.9 + 0.1 * easeInOut(ramp(t, tClose0, spawn[0]));
  } else {
    let k = 0;
    while (k < 2 && t >= ys[k + 1]) k++;
    e = k + 1 + easeInOut(ramp(t, ys[k], spawn[k + 1]));
  }
  const mTurn = t >= tFin ? e : ramp(t, tStart, tLap1);
  const arcT = t >= tFin ? 1 : e < 0.001 ? 0 : e - Math.floor(e - 1e-9);
  const earthAng = -Math.PI / 2 + 2 * Math.PI * e;
  const ex = OX + R * Math.cos(earthAng);
  const ey = OY + R * Math.sin(earthAng);
  const markAng = -Math.PI / 2 + 2 * Math.PI * mTurn;
  const mx = OX + (R + 36) * Math.cos(markAng);
  const my = OY + (R + 36) * Math.sin(markAng);
  const day = t < tLap1 ? Math.round(365 * ramp(t, tStart, tLap1)) : 365;

  const orbitOp = clamp01(1 - ramp(t, tMerge, tSnap) + ramp(t, tFin, tFin + 0.6));
  const year = t < ys[0] ? 1 : t < ys[1] ? 2 : t < ys[2] ? 3 : 4;

  /* ───────── Adegan: orbit ───────── */
  const orbitNodes = orbitOp > 0.003 && (
    <g opacity={orbitOp}>
      {Array.from({ length: 12 }).map((_, i) => {
        const a = -Math.PI / 2 + (i * Math.PI) / 6;
        return (
          <line
            key={i}
            x1={OX + (R - 14) * Math.cos(a)}
            y1={OY + (R - 14) * Math.sin(a)}
            x2={OX + R * Math.cos(a)}
            y2={OY + R * Math.sin(a)}
            stroke={ACC}
            strokeOpacity={0.28}
            strokeWidth={3}
          />
        );
      })}
      <circle cx={OX} cy={OY} r={R} fill="none" stroke={ACC} strokeOpacity={0.22} strokeWidth={3} />
      <circle
        cx={OX}
        cy={OY}
        r={R + 36}
        fill="none"
        stroke={ACC2}
        strokeOpacity={0.25}
        strokeWidth={2}
        strokeDasharray="4 10"
      />

      {/* jalur penanda kalender (amber) dan Bumi (cyan) */}
      <path
        d={arcBetween(R + 36, 0, t >= tFin ? 1 : mTurn)}
        fill="none"
        stroke={AMBER}
        strokeWidth={5}
        strokeLinecap="round"
        opacity={t >= tFin ? 0.8 : 0.85 - 0.55 * ramp(t, tLap1 + 0.4, tLap1 + 1.2)}
        filter="url(#glow)"
      />
      <path
        d={arcBetween(R, 0, arcT)}
        fill="none"
        stroke={t >= tFin ? mixHex(ACC, WHITE, 0.3) : ACC}
        strokeWidth={t >= tFin ? 10 : 8}
        strokeLinecap="round"
        opacity={0.9}
        filter="url(#glow)"
      />

      {/* celah yang belum tertutup: +6h */}
      {t >= tLap1 && t < spawn[0] + 0.5 && e < 0.999 && (
        <g
          opacity={ramp(t, tLap1, tLap1 + 0.3) * (1 - ramp(t, spawn[0] - 0.1, spawn[0] + 0.4))}
        >
          <path
            d={arcBetween(R, e, 1)}
            fill="none"
            stroke={AMBER}
            strokeWidth={9 + 3 * Math.sin((t - tGap) * 8)}
            strokeLinecap="round"
            strokeDasharray="14 10"
            filter="url(#glow)"
          />
          {(() => {
            const a = -Math.PI / 2 + 2 * Math.PI * ((e + 1) / 2);
            return (
              <text
                x={OX + (R + 84) * Math.cos(a)}
                y={OY + (R + 84) * Math.sin(a) + F2 * 0.36}
                textAnchor="middle"
                fontSize={F2}
                fontWeight={800}
                fill={AMBER}
                filter="url(#glow)"
                transform={`scale(${1 + 0.1 * Math.exp(-(t - tGap) * 4)})`}
                style={{ transformOrigin: `${OX}px ${OY - R - 84}px` }}
              >
                +6h
              </text>
            );
          })()}
        </g>
      )}

      {/* sapuan cahaya saat penutup */}
      {t >= tSweep && t < tSweep + 1.8 && (
        <path
          d={arcBetween(R + 36, 0, 0.14)}
          fill="none"
          stroke={WHITE}
          strokeWidth={8}
          strokeLinecap="round"
          opacity={Math.sin(Math.PI * ramp(t, tSweep, tSweep + 1.8))}
          filter="url(#glowBig)"
          transform={`rotate(${360 * 1.5 * easeInOut(ramp(t, tSweep, tSweep + 1.6))} ${OX} ${OY})`}
        />
      )}

      {/* Matahari */}
      <g>
        {Array.from({ length: 12 }).map((_, i) => {
          const a = (i * Math.PI) / 6 + t * 0.18;
          return (
            <line
              key={i}
              x1={OX + 98 * Math.cos(a)}
              y1={OY + 98 * Math.sin(a)}
              x2={OX + 118 * Math.cos(a)}
              y2={OY + 118 * Math.sin(a)}
              stroke={AMBER}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={0.7}
              filter="url(#glow)"
            />
          );
        })}
        <circle cx={OX} cy={OY} r={76} fill={AMBER} fillOpacity={0.1} stroke={AMBER} strokeWidth={4} filter="url(#glow)" />
        <text x={OX} y={OY + F2 * 0.36} textAnchor="middle" fontSize={F2} fontWeight={800} fill={WHITE}>
          {day}
        </text>
      </g>

      {/* sinkron: garis penghubung Bumi ↔ kalender */}
      {t >= tFin && (
        <line
          x1={ex}
          y1={ey}
          x2={mx}
          y2={my}
          stroke={WHITE}
          strokeWidth={3}
          opacity={ramp(t, tFin, tFin + 0.6) * 0.8}
          filter="url(#glow)"
        />
      )}

      {/* penanda kalender (belah ketupat) */}
      <g transform={`translate(${mx} ${my}) rotate(45)`} filter="url(#glow)">
        <rect x={-12} y={-12} width={24} height={24} fill={AMBER} fillOpacity={0.25} stroke={AMBER} strokeWidth={4} />
      </g>
      {/* Bumi */}
      <g transform={`translate(${ex} ${ey})`} filter="url(#glow)">
        <circle r={26} fill={ACC} fillOpacity={0.2} stroke={ACC} strokeWidth={4} />
        <circle r={7} fill={WHITE} />
      </g>

      {/* legenda tahun 1, lalu label tahun */}
      <g opacity={1 - ramp(t, ys[0] - 0.4, ys[0])}>
        <g transform="translate(236 1010) rotate(45)">
          <rect x={-9} y={-9} width={18} height={18} fill="none" stroke={AMBER} strokeWidth={3} />
        </g>
        <text x={262} y={1021} fontSize={30} fontWeight={700} fill={AMBER}>
          CALENDAR
        </text>
        <circle cx={600} cy={1010} r={11} fill="none" stroke={ACC} strokeWidth={3} />
        <text x={625} y={1021} fontSize={30} fontWeight={700} fill={ACC}>
          EARTH
        </text>
      </g>
      <text
        x={CX}
        y={1022}
        textAnchor="middle"
        fontSize={F1}
        fontWeight={800}
        fill={WHITE}
        letterSpacing={3}
        opacity={ramp(t, ys[0] - 0.2, ys[0] + 0.2)}
        filter="url(#glow)"
      >
        {`YEAR ${year}`}
      </text>
    </g>
  );

  /* ───────── Adegan: slot + blok 6 jam + blok 24 jam ───────── */
  const blockNodes: React.ReactNode[] = [];
  const mer = easeInOut(ramp(t, tMerge, tSnap));
  const ghostOp = 1 - ramp(t, tMerge, tMerge + 0.4);
  if (ghostOp > 0.003) {
    for (let i = 0; i < 4; i++) {
      blockNodes.push(
        <CBox
          key={`g${i}`}
          cx={slotCx(i)}
          cy={SLOT_Y}
          w={SLOT_W}
          h={SLOT_H}
          color={AMBER}
          glowK={0.05}
          fillK={0.4}
          op={ghostOp * 0.5}
          dash="12 10"
        />,
      );
    }
  }
  for (let i = 0; i < 4; i++) {
    const l = land[i];
    if (t >= spawn[i] && t < l) {
      const posAt = (uu: number) => {
        const eu = easeInOut(uu);
        const side = i < 2 ? -1 : 1;
        return {
          x: lerp(OX, slotCx(i), eu) + side * 140 * Math.sin(Math.PI * uu),
          y: lerp(OY - R, SLOT_Y, eu),
          s: 0.35 + 0.65 * eu,
        };
      };
      const u = ramp(t, spawn[i], l);
      const p = posAt(u);
      for (let j = 4; j >= 1; j--) {
        const q = posAt(Math.max(0, u - j * 0.05));
        blockNodes.push(
          <rect
            key={`tr${i}${j}`}
            x={q.x - (SLOT_W * q.s) / 2}
            y={q.y - (SLOT_H * q.s) / 2}
            width={SLOT_W * q.s}
            height={SLOT_H * q.s}
            rx={18}
            fill="none"
            stroke={AMBER}
            strokeWidth={2.5}
            opacity={0.3 * (1 - j / 5)}
          />,
        );
      }
      blockNodes.push(
        <CBox
          key={`f${i}`}
          cx={p.x}
          cy={p.y}
          w={SLOT_W * p.s}
          h={SLOT_H * p.s}
          color={AMBER}
          glowK={0.4}
          label="6h"
          fs={44 * p.s}
        />,
      );
    } else if (t >= l && t < tSnap) {
      const k = t - l;
      const left = lerp(SLOT_L + i * (SLOT_W + SLOT_G), CX - 300 + i * SLOT_W, mer);
      const cxp = left + SLOT_W / 2;
      const cyp = SLOT_Y - 16 * Math.exp(-k * 5) * Math.abs(Math.sin(k * 13));
      const sc = 1 + 0.12 * Math.exp(-k * 9);
      blockNodes.push(
        <g key={`l${i}`} transform={`translate(${cxp} ${cyp}) scale(${sc}) translate(${-cxp} ${-cyp})`}>
          <CBox cx={cxp} cy={cyp} w={SLOT_W} h={SLOT_H} color={AMBER} glowK={0.3 + 0.5 * Math.exp(-k * 4)} label="6h" fs={44} />
        </g>,
      );
    }
  }
  if (t >= tSnap && t < tFly) {
    const sc = 1 + 0.08 * Math.exp(-(t - tSnap) * 7);
    blockNodes.push(
      <g key="mb" transform={`translate(${CX} ${SLOT_Y}) scale(${sc}) translate(${-CX} ${-SLOT_Y})`}>
        <CBox cx={CX} cy={SLOT_Y} w={4 * SLOT_W} h={SLOT_H} color={GOOD} glowK={0.4 + 0.3 * Math.sin(t * 3)} label="24h" fs={64} lop={spring((t - tSnap) / 0.5)} />
      </g>,
    );
  }
  if (t >= tFly && t < tLand) {
    const u = easeInOut(ramp(t, tFly, tLand));
    const c29 = cellPos(29);
    const w = lerp(4 * SLOT_W, CELL_W, u);
    const h = lerp(SLOT_H, CELL_H, u);
    blockNodes.push(
      <CBox
        key="fb"
        cx={lerp(CX, c29.x, u)}
        cy={lerp(SLOT_Y, c29.y, u) - 80 * Math.sin(Math.PI * u)}
        w={w}
        h={h}
        color={GOOD}
        glowK={0.5}
        label="24h"
        fs={lerp(64, 30, u)}
        lop={1 - u}
      />,
    );
  }

  /* ───────── Adegan: kalender Februari ───────── */
  const calOp = ramp(t, tCal, tCal + 0.6) * (1 - ramp(t, tCent - 0.5, tCent + 0.1));
  const calNodes: React.ReactNode[] = [];
  if (calOp > 0.003) {
    const pulse = 0.3 * Math.exp(-Math.max(0, t - tLand) * 4) * (t >= tLand ? 1 : 0);
    calNodes.push(
      <text
        key="feb"
        x={CX}
        y={CAL_T - 42}
        textAnchor="middle"
        fontSize={F2}
        fontWeight={800}
        fill={WHITE}
        letterSpacing={6}
        filter="url(#glow)"
      >
        FEB
      </text>,
    );
    for (let d = 1; d <= 28; d++) {
      const p = cellPos(d);
      const k = spring((t - (tCal + (d - 1) * 0.02)) / 0.4);
      if (k <= 0.001) continue;
      calNodes.push(
        <g key={`d${d}`} transform={`translate(${p.x} ${p.y}) scale(${k})`}>
          <CBox
            cx={0}
            cy={0}
            w={CELL_W}
            h={CELL_H}
            color={mixHex(ACC, ACC2, (p.col + p.row) / 9)}
            glowK={0.2 + pulse}
            label={`${d}`}
            fs={32}
            rx={14}
          />
        </g>,
      );
    }
    const c29 = cellPos(29);
    if (t < tLand && t >= tFly - 0.5) {
      calNodes.push(
        <CBox
          key="g29"
          cx={c29.x}
          cy={c29.y}
          w={CELL_W}
          h={CELL_H}
          color={AMBER}
          glowK={0.2 + 0.2 * Math.sin(t * 8)}
          fillK={0.4}
          op={ramp(t, tFly - 0.5, tFly) * 0.9}
          dash="10 8"
          rx={14}
        />,
      );
    }
    if (t >= tLand) {
      const k = spring((t - tLand) / 0.5);
      calNodes.push(
        <g key="c29" transform={`translate(${c29.x} ${c29.y}) scale(${k})`}>
          <CBox cx={0} cy={0} w={CELL_W} h={CELL_H} color={GOOD} glowK={0.55 + 0.3 * Math.sin(t * 3)} label="29" fs={38} rx={14} />
        </g>,
      );
    }
  }

  /* ───────── Adegan: aturan abad ───────── */
  const centOp = ramp(t, tCent, tCent + 0.4) * (1 - ramp(t, tFin - 0.6, tFin));
  const yb = (
    key: string,
    cx: number,
    cy: number,
    year0: string,
    tA: number,
    colorK: number,
    colOverride: string | null,
    badgeT: number | null,
    ok: boolean,
    dim: number,
    barP: number | null,
    barCol: string,
    sub: string | null,
    subCol: string,
  ) => {
    const k = spring((t - tA) / 0.5);
    if (k <= 0.001) return null;
    const col = colOverride ?? mixHex(ACC, AMBER, colorK);
    return (
      <g key={key} opacity={ramp(t, tA, tA + 0.2) * dim}>
        <g transform={`translate(${cx} ${cy}) scale(${k})`}>
          <rect
            x={-115}
            y={-60}
            width={230}
            height={120}
            rx={18}
            fill={col}
            fillOpacity={0.08 + 0.2 * colorK}
            stroke={col}
            strokeWidth={4}
            filter="url(#glow)"
          />
          <text textAnchor="middle" y={52 * 0.36} fontSize={52} fontWeight={800} fill={WHITE}>
            {year0}
          </text>
        </g>
        {badgeT !== null && <Badge x={cx + 112} y={cy - 58} k={spring((t - badgeT) / 0.4)} ok={ok} />}
        {barP !== null && (
          <g>
            <rect x={cx - 115} y={cy + 84} width={230} height={14} rx={7} fill="none" stroke={barCol} strokeOpacity={0.5} strokeWidth={2} />
            <rect x={cx - 115} y={cy + 84} width={Math.max(0.01, 230 * barP)} height={14} rx={7} fill={barCol} filter="url(#glow)" />
          </g>
        )}
        {sub && (
          <text x={cx} y={cy + 138} textAnchor="middle" fontSize={32} fontWeight={700} fill={subCol} filter="url(#glow)">
            {sub}
          </text>
        )}
      </g>
    );
  };
  const fill1900 = ramp(t, tFill, tSkip);
  const fill2000 = ramp(t, t2000 + 0.7, tOk - 0.1);
  const centNodes =
    centOp > 0.003 ? (
      <g opacity={centOp}>
        {yb("y1896", 270, 610, "1896", t96, 0, null, t96 + 0.5, true, 1, null, ACC, null, ACC)}
        {yb(
          "y1900",
          540,
          610,
          "1900",
          t00,
          fill1900,
          null,
          tSkip,
          false,
          t >= tSkip ? 1 - 0.45 * ramp(t, tSkip, tSkip + 0.5) : 1,
          fill1900,
          AMBER,
          t < tSkip ? "+11 min/yr" : "÷ 100",
          AMBER,
        )}
        {yb("y1904", 810, 610, "1904", t04, 0, null, t04 + 0.5, true, 1, null, ACC, null, ACC)}
        {yb("y1996", 270, 840, "1996", t2000, 0, null, t2000 + 0.5, true, 1, null, ACC, null, ACC)}
        {yb(
          "y2000",
          540,
          840,
          "2000",
          t2000 + 0.25,
          t >= tOk ? 0 : fill2000,
          t >= tOk ? GOOD : null,
          tOk,
          true,
          1,
          t >= tOk ? 1 : fill2000,
          t >= tOk ? GOOD : AMBER,
          t >= tOk ? "÷ 400" : null,
          GOOD,
        )}
        {yb("y2004", 810, 840, "2004", t2000 + 0.5, 0, null, t2000 + 1.0, true, 1, null, ACC, null, ACC)}
      </g>
    ) : null;

  /* ───────── Adegan: penutup ───────── */
  const finOp = ramp(t, tNum, tNum + 0.5);
  const finNodes =
    finOp > 0.003 ? (
      <g opacity={finOp}>
        <g transform={`translate(${CX} 1120) scale(${0.8 + 0.2 * spring((t - tNum) / 0.6)})`}>
          <text textAnchor="middle" y={120 * 0.36} fontSize={120} fontWeight={900} fill={GOOD} filter="url(#glowBig)">
            365.2425
          </text>
        </g>
        <text
          x={CX}
          y={1200}
          textAnchor="middle"
          fontSize={F1}
          fontWeight={700}
          fill={ACC}
          letterSpacing={4}
          opacity={ramp(t, tNum + 0.3, tNum + 0.8)}
        >
          DAYS PER YEAR
        </text>
      </g>
    ) : null;

  /* ───────── Persamaan bawah ───────── */
  const eqSteps: { t: number; parts: [string, string][] }[] = [
    { t: 0, parts: [["365 days", WHITE]] },
    { t: spawn[0], parts: [["365 d", WHITE], [" + ", WHITE], ["6 h", AMBER]] },
    { t: land[3], parts: [["4 × 6 h", AMBER], [" = ", WHITE], ["24 h", GOOD]] },
    { t: tSnap, parts: [["24 h", GOOD], [" = ", WHITE], ["1 day", GOOD]] },
    { t: tLand, parts: [["FEB ", WHITE], ["29", GOOD]] },
    { t: tCent, parts: [["every ", WHITE], ["4", ACC], [" years", WHITE]] },
    { t: tSkip, parts: [["1900: ", WHITE], ["skip", AMBER]] },
    { t: tOk, parts: [["2000: ", WHITE], ["leap", GOOD]] },
    { t: tFin, parts: [["CALENDAR", AMBER], [" = ", WHITE], ["EARTH", ACC]] },
  ];
  let eqIdx = 0;
  eqSteps.forEach((s, i) => {
    if (t >= s.t) eqIdx = i;
  });
  const eqCur = eqSteps[eqIdx];

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
          {orbitNodes}
          {blockNodes}
          {calOp > 0.003 && <g opacity={calOp}>{calNodes}</g>}
          {centNodes}
          {finNodes}

          {land.map((l, i) => (
            <Shards key={`bl${i}`} x={slotCx(i)} y={SLOT_Y} t0={l} t={t} color={AMBER} seed={`bl${i}`} n={14} spread={120} />
          ))}
          <Shards x={CX} y={SLOT_Y} t0={tSnap} t={t} color={WHITE} seed="sn" n={24} spread={380} life={1.2} />
          <Shards x={CX} y={SLOT_Y} t0={tSnap} t={t} color={GOOD} seed="sn2" n={16} spread={280} life={1.2} />
          <Shards x={cellPos(29).x} y={cellPos(29).y} t0={tLand} t={t} color={GOOD} seed="ld" n={26} spread={360} life={1.3} />
          <Shards x={540} y={610} t0={tSkip} t={t} color={RED} seed="sk" n={20} spread={240} life={1.1} />
          <Shards x={540} y={840} t0={tOk} t={t} color={GOOD} seed="ok" n={24} spread={300} life={1.2} />
          <Shards x={OX} y={OY} t0={tFin} t={t} color={WHITE} seed="fn" n={34} spread={420} life={1.4} />
          <Shards x={OX} y={OY} t0={tEnd} t={t} color={ACC2} seed="en" n={18} spread={300} life={1.2} />
        </g>

        <rect width={W} height={H} fill="url(#vignette)" />

        {/* Header: sudah tampil sejak frame pertama */}
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

          <g
            transform={`translate(${CX} ${EQ_Y}) scale(${0.8 + 0.2 * spring((t - eqCur.t) / 0.45)})`}
            opacity={ramp(t, eqCur.t, eqCur.t + 0.15)}
          >
            <text textAnchor="middle" fontSize={F2} fontWeight={800} filter="url(#glow)">
              {eqCur.parts.map(([s, c], i) => (
                <tspan key={i} fill={c}>
                  {s}
                </tspan>
              ))}
            </text>
          </g>
        </g>

        {/* Kilatan pada momen kunci */}
        {t >= tSnap && <rect width={W} height={H} fill="#fff" opacity={0.14 * Math.exp(-(t - tSnap) * 6)} />}
        {t >= tLand && <rect width={W} height={H} fill="#fff" opacity={0.16 * Math.exp(-(t - tLand) * 6)} />}
        {t >= tOk && <rect width={W} height={H} fill="#fff" opacity={0.12 * Math.exp(-(t - tOk) * 6)} />}
        {t >= tFin && <rect width={W} height={H} fill="#fff" opacity={0.16 * Math.exp(-(t - tFin) * 6)} />}
      </svg>
    </AbsoluteFill>
  );
};

const CY_CAM = 800; // titik pusat kamera