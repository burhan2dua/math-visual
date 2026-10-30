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
import type { Caption, TemplateData } from "../../types";

/* ───────────────────────── Konstanta ───────────────────────── */

const W = 1080;
const H = 1920;
const SC = { x: 540, y: 800 }; // pusat area adegan
const HEADER_Y = 250;

const PLUS = { c: "#2fe6ff", l: "#dcfbff" };
const MINUS = { c: "#ff3fb0", l: "#ffdcf0" };
const GOOD = "#6dffb0";
const AMBER = "#ffd34d";

const FONT =
  '"Orbitron", "Rajdhani", "Segoe UI", system-ui, -apple-system, sans-serif';

// Adegan kelompok
const ROW_Y = [540, 760, 980];
const ROW_X0 = 140;
const ROW_W = 800;
const ROW_H = 190;
const ORB_R = 46;

// Adegan batang
const BAR_Y = 560;
const SEG_W = 120;
const SEG_GAP = 10;
const PIECE_BASE_X = [280, 540, 800];
const REST_Y = [740, 910, 1080];
const CUT_X = [410, 670];

const OUTLINE = {
  stroke: "rgba(0,0,0,0.65)",
  strokeWidth: 7,
  paintOrder: "stroke" as const,
};

/* ───────────────────────── Util ───────────────────────── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
/** 0→1 di awal (fi detik), 1→0 menjelang b (fo detik) */
const win = (t: number, a: number, b: number, fi = 0.5, fo = 0.5) =>
  clamp01((t - a) / fi) * (1 - clamp01((t - (b - fo)) / fo));

/** Jatuh dipercepat + memantul kecil setelah mendarat pada waktu tl */
const dropY = (t: number, tl: number, from: number, to: number, dur = 0.55) => {
  const t0 = tl - dur;
  if (t < t0) return { y: from, o: 0 };
  if (t < tl) {
    const u = (t - t0) / dur;
    return { y: from + (to - from) * u * u, o: clamp01((t - t0) / 0.15) };
  }
  const k = t - tl;
  return { y: to - 20 * Math.exp(-k * 5) * Math.abs(Math.sin(k * 13)), o: 1 };
};

type KF = { t: number; x: number; y: number; s: number };

const camAt = (t: number, kfs: KF[]) => {
  if (t <= kfs[0].t) return kfs[0];
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i];
    const b = kfs[i + 1];
    if (t < b.t) {
      const e = easeInOut(clamp01((t - a.t) / Math.max(0.001, b.t - a.t)));
      return {
        t,
        x: a.x + (b.x - a.x) * e,
        y: a.y + (b.y - a.y) * e,
        s: a.s + (b.s - a.s) * e,
      };
    }
  }
  return kfs[kfs.length - 1];
};

/** Keyframe kamera, semua waktu mengikuti tag event di data.json */
const buildCamera = (T: (tag: string) => number, dur: number): KF[] => {
  const k: KF[] = [];
  const add = (t: number, x: number, y: number, s: number) =>
    k.push({ t, x, y, s });

  add(0, SC.x, SC.y, 1);

  const qh = T("question-hit");
  add(qh - 0.05, SC.x, SC.y, 1.12);
  add(qh + 0.12, SC.x, SC.y, 1.38);
  add(qh + 1.7, SC.x, SC.y, 1);

  for (const n of [1, 2]) {
    const tc = T(`cancel-${n}`);
    add(tc - 1.0, SC.x, 740, 1);
    add(tc + 0.1, SC.x, 740, 1.6);
    add(tc + 1.7, SC.x, SC.y, 1);
  }

  for (const kind of ["plus", "minus"] as const) {
    const ab = kind === "plus" ? "a" : "b";
    add(T(`times-${ab}`) - 0.1, SC.x, SC.y, 1);
    for (let p = 0; p < 3; p++) {
      add(T(`${kind}-drop-${2 * p + 1}`) - 0.7, 540, ROW_Y[p], 1.28);
    }
    const tr = T(`${kind}-result`);
    add(tr - 0.2, 540, 900, 0.95);
    add(tr + 0.6, SC.x, SC.y, 1);
  }

  add(T("bar-in") - 0.1, 540, 700, 1);
  add(T("cut-1") - 0.5, CUT_X[0], BAR_Y, 1.75);
  add(T("cut-2") - 0.5, CUT_X[1], BAR_Y, 1.75);
  add(T("cut-2") + 0.9, 540, 850, 1);
  add(T("regroup"), 540, 900, 0.95);

  const rs = T("resolve");
  add(rs - 0.1, SC.x, SC.y, 1);
  add(rs + 0.15, SC.x, SC.y, 1.4);
  add(rs + 3.6, SC.x, SC.y, 0.9);
  add(dur, SC.x, SC.y, 0.86);

  return k.sort((a, b) => a.t - b.t);
};

/* ───────────────────────── Elemen visual ───────────────────────── */

const Glyph: React.FC<{ r: number; plus: boolean }> = ({ r, plus }) => (
  <g fill="#fff">
    <rect x={-r * 0.46} y={-r * 0.1} width={r * 0.92} height={r * 0.2} rx={r * 0.1} />
    {plus && (
      <rect x={-r * 0.1} y={-r * 0.46} width={r * 0.2} height={r * 0.92} rx={r * 0.1} />
    )}
  </g>
);

const Orb: React.FC<{
  x: number;
  y: number;
  r: number;
  kind: "plus" | "minus";
  o?: number;
  s?: number;
  spin?: number;
}> = ({ x, y, r, kind, o = 1, s = 1, spin = 0 }) => {
  const pal = kind === "plus" ? PLUS : MINUS;
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
      <circle r={r * 3} fill={`url(#halo-${kind})`} />
      <g filter="url(#glow)">
        <circle
          r={r}
          fill={`url(#orb-${kind})`}
          stroke={pal.l}
          strokeOpacity="0.85"
          strokeWidth="2"
        />
      </g>
      <circle
        r={r + 10}
        fill="none"
        stroke={pal.c}
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${r * 0.9} ${r * 2.6}`}
        opacity="0.85"
        transform={`rotate(${spin})`}
      />
      <ellipse
        cx={-r * 0.32}
        cy={-r * 0.42}
        rx={r * 0.26}
        ry={r * 0.14}
        fill="#fff"
        opacity="0.55"
        transform={`rotate(-30 ${-r * 0.32} ${-r * 0.42})`}
      />
      <Glyph r={r} plus={kind === "plus"} />
    </g>
  );
};

const Trail: React.FC<{
  pts: { x: number; y: number }[];
  r: number;
  color: string;
}> = ({ pts, r, color }) => (
  <g filter="url(#blur6)">
    {pts.map((p, i) => {
      const f = 1 - i / pts.length;
      return (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={r * (0.2 + 0.7 * f)}
          fill={color}
          opacity={0.35 * f}
        />
      );
    })}
  </g>
);

const Burst: React.FC<{
  x: number;
  y: number;
  t0: number;
  t: number;
  color: string;
  seed: string;
  n?: number;
  spread?: number;
  life?: number;
}> = ({ x, y, t0, t, color, seed, n = 22, spread = 190, life = 1.0 }) => {
  const k = (t - t0) / life;
  if (k < 0 || k > 1) return null;
  const e = easeOut(k);
  return (
    <g>
      <circle
        cx={x}
        cy={y}
        r={20 + spread * 0.7 * e}
        fill="none"
        stroke={color}
        strokeWidth={5 * (1 - k)}
        opacity={1 - k}
      />
      {Array.from({ length: n }).map((_, i) => {
        const a = random(`${seed}-a-${i}`) * Math.PI * 2;
        const d = spread * (0.35 + random(`${seed}-d-${i}`) * 0.65) * e;
        const s = 1.5 + random(`${seed}-s-${i}`) * 3.5;
        return (
          <circle
            key={i}
            cx={x + Math.cos(a) * d}
            cy={y + Math.sin(a) * d + 30 * k * k}
            r={s * (1 - k)}
            fill={i % 3 === 0 ? "#fff" : color}
            opacity={1 - k}
          />
        );
      })}
    </g>
  );
};

/* ───────────────────────── Komponen utama ───────────────────────── */

export const MinusTimesPlus: React.FC<{ data: TemplateData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const accent = data.accent;
  const captions: Caption[] = data.captions ?? [];

  const T = useMemo(() => {
    const m: Record<string, number> = {};
    (data.events ?? []).forEach((e) => {
      if (e.tag) m[e.tag] = e.t;
    });
    return (tag: string) => {
      const v = m[tag];
      if (v === undefined) {
        throw new Error(`Event bertag "${tag}" tidak ada di data.json`);
      }
      return v;
    };
  }, [data]);

  const kfs = useMemo(
    () => buildCamera(T, data.durationInSeconds),
    [T, data.durationInSeconds],
  );

  const stars = useMemo(
    () =>
      Array.from({ length: 110 }, (_, i) => ({
        x: random(`sx${i}`) * W,
        y: random(`sy${i}`) * H,
        r: 0.6 + random(`sr${i}`) * 1.6,
        ph: random(`sp${i}`) * Math.PI * 2,
      })),
    [],
  );
  const shapes = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        x: random(`gx${i}`) * W,
        y: random(`gy${i}`) * H,
        size: 36 + random(`gs${i}`) * 80,
        sides: 3 + Math.floor(random(`gn${i}`) * 4),
        rot: random(`gr${i}`) * 360,
        spin: (random(`gv${i}`) - 0.5) * 20,
        speed: 10 + random(`gp${i}`) * 18,
        col: i % 2 === 0 ? PLUS.c : MINUS.c,
      })),
    [],
  );

  const cam = camAt(t, kfs);
  const par = 1 + (cam.s - 1) * 0.22;

  /* ── jendela tiap adegan ── */
  const sHook = win(t, -1, T("plus-in-1") - 0.2);
  const sPair = win(t, T("plus-in-1") - 0.2, T("cancel-2") + 2.4);
  const sA = win(t, T("times-a") - 0.3, T("plus-result") + 1.2);
  const sB = win(t, T("times-b") - 0.3, T("minus-result") + 3.8);
  const sBar = win(t, T("bar-in") - 0.3, T("resolve") - 0.1);
  const resolveT = T("resolve");
  const sEnd = ramp(t, resolveT - 0.3, resolveT + 0.25);

  /* ───────── Adegan 1: hook ───────── */
  const qHit = T("question-hit");
  const qk = t - qHit;
  const hookPulse = qk >= 0 ? 1 + 0.15 * Math.exp(-qk * 8) : 1;
  const hook = sHook > 0.003 && (
    <g opacity={sHook}>
      <Orb
        x={300 + Math.sin(t * 1.1) * 26}
        y={640 + Math.sin(t * 1.7) * 30}
        r={70}
        kind="plus"
        o={ramp(t, 0.1, 0.7)}
        s={hookPulse}
        spin={t * 40}
      />
      <Orb
        x={780 - Math.sin(t * 1.1) * 26}
        y={640 + Math.sin(t * 1.5 + 1) * 30}
        r={70}
        kind="minus"
        o={ramp(t, 0.1, 0.7)}
        s={hookPulse}
        spin={-t * 40}
      />
      <text
        x={540}
        y={690}
        textAnchor="middle"
        fontSize={120}
        fontWeight={800}
        fill="#fff"
        filter="url(#glow)"
        opacity={ramp(t, 1.0, 1.6)}
      >
        ×
      </text>
      {qk >= 0 && (
        <g
          transform={`translate(${540 + Math.sin(qk * 80) * 14 * Math.exp(-qk * 8)} 1010) scale(${1 + 1.8 * Math.exp(-qk * 10)})`}
          opacity={Math.min(1, qk * 20)}
        >
          <text
            textAnchor="middle"
            fontSize={340}
            fontWeight={900}
            fill={AMBER}
            filter="url(#glowBig)"
          >
            ?
          </text>
        </g>
      )}
      <Burst x={540} y={900} t0={qHit} t={t} color={AMBER} seed="q" n={30} spread={320} life={1.0} />
    </g>
  );

  /* ───────── Adegan 2: uang + utang saling menghapus ───────── */
  const pairNodes =
    sPair > 0.003 &&
    [
      { k: 1, r: 52, v: 1 },
      { k: 2, r: 64, v: 2 },
    ].map(({ k, r, v }) => {
      const tp = T(`plus-in-${k}`);
      const tm = T(`minus-in-${k}`);
      const tc = T(`cancel-${k}`);
      const mk = (from: number, t0: number, target: number) => (tt: number) => {
        const u = clamp01((tt - t0) / (tc - t0));
        return {
          x: from + (target - from) * easeInOut(u),
          y: 740 + Math.sin(tt * 3 + k) * 34 * (1 - u),
        };
      };
      const fp = mk(-120, tp, 540 - r * 0.95);
      const fm = mk(W + 120, tm, 540 + r * 0.95);

      const one = (
        f: (tt: number) => { x: number; y: number },
        t0: number,
        kind: "plus" | "minus",
        label: string,
      ) => {
        if (t < t0 || t >= tc) return null;
        const p = f(t);
        const pts: { x: number; y: number }[] = [];
        for (let i = 1; i <= 16; i++) {
          const ts = t - i * 0.05;
          if (ts < t0) break;
          pts.push(f(ts));
        }
        const pal = kind === "plus" ? PLUS : MINUS;
        return (
          <g key={kind}>
            <Trail pts={pts} r={r} color={pal.c} />
            <Orb
              x={p.x}
              y={p.y}
              r={r}
              kind={kind}
              o={clamp01((t - t0) / 0.35)}
              spin={t * 50}
            />
            <text
              x={p.x}
              y={p.y + r + 50}
              textAnchor="middle"
              fontSize={30}
              fontWeight={700}
              fill={pal.l}
              opacity={clamp01((t - t0) / 0.5)}
              {...OUTLINE}
            >
              {label}
            </text>
          </g>
        );
      };

      const kc = t - tc;
      return (
        <g key={k}>
          {one(fp, tp, "plus", `uang +${v}`)}
          {one(fm, tm, "minus", `utang −${v}`)}
          {kc >= 0 && (
            <g>
              <Burst x={540} y={740} t0={tc} t={t} color="#fff" seed={`c${k}w`} n={26} spread={230} />
              <Burst x={540} y={740} t0={tc} t={t} color={PLUS.c} seed={`c${k}p`} n={16} spread={170} />
              <Burst x={540} y={740} t0={tc} t={t} color={MINUS.c} seed={`c${k}m`} n={16} spread={200} />
              {kc < 1.9 && (
                <g
                  transform={`translate(540 800) scale(${1 - Math.exp(-14 * kc) * Math.cos(20 * kc)})`}
                  opacity={1 - ramp(kc, 1.3, 1.9)}
                >
                  <text
                    textAnchor="middle"
                    fontSize={230}
                    fontWeight={900}
                    fill="#fff"
                    filter="url(#glowBig)"
                  >
                    0
                  </text>
                </g>
              )}
            </g>
          )}
        </g>
      );
    });

  /* ───────── Adegan 3: kelompok (plus & minus) ───────── */
  const groups = (kind: "plus" | "minus", op: number) => {
    if (op <= 0.003) return null;
    const pal = kind === "plus" ? PLUS : MINUS;
    const ab = kind === "plus" ? "a" : "b";
    const sign = kind === "plus" ? "+" : "−";
    const tStart = T(`times-${ab}`);
    const tRes = T(`${kind}-result`);
    const drops = [1, 2, 3, 4, 5, 6].map((n) => T(`${kind}-drop-${n}`));
    const landed = drops.filter((d) => t >= d).length;
    const lastLand = landed > 0 ? drops[landed - 1] : 0;
    const pop = landed > 0 ? 1 + 0.2 * Math.exp(-(t - lastLand) * 9) : 1;

    return (
      <g opacity={op}>
        <text
          x={540}
          y={400}
          textAnchor="middle"
          fontSize={88}
          fontWeight={800}
          filter="url(#glow)"
          opacity={ramp(t, tStart, tStart + 0.5)}
        >
          <tspan fill={pal.c}>{`(${sign}2)`}</tspan>
          <tspan fill="#fff">{" × "}</tspan>
          <tspan fill={PLUS.c}>{"(+3)"}</tspan>
        </text>

        {ROW_Y.map((ry, i) => {
          const ts = T(`slot-${ab}-${i + 1}`);
          const k = ramp(t, ts, ts + 0.5);
          if (k <= 0) return null;
          const dx = -260 * (1 - easeOut(k));
          const tl2 = drops[2 * i + 1];
          const tagK = t - tl2;
          return (
            <g key={i} opacity={k}>
              <rect
                x={ROW_X0 + dx}
                y={ry - ROW_H / 2}
                width={ROW_W}
                height={ROW_H}
                rx={34}
                fill="none"
                stroke={pal.c}
                strokeWidth={8}
                opacity={0.35}
                filter="url(#blur6)"
              />
              <rect
                x={ROW_X0 + dx}
                y={ry - ROW_H / 2}
                width={ROW_W}
                height={ROW_H}
                rx={34}
                fill="rgba(255,255,255,0.04)"
                stroke={pal.c}
                strokeOpacity={0.7}
                strokeWidth={2.5}
                strokeDasharray="16 10"
              />
              <text
                x={ROW_X0 + dx + 28}
                y={ry - ROW_H / 2 + 38}
                fontSize={24}
                fontWeight={700}
                fill={pal.c}
                opacity={0.85}
              >
                {`KELOMPOK ${i + 1}`}
              </text>
              {tagK >= 0 && (
                <g
                  transform={`translate(${ROW_X0 + ROW_W - 96} ${ry + 24}) scale(${1 - Math.exp(-14 * tagK) * Math.cos(20 * tagK)})`}
                >
                  <text
                    textAnchor="middle"
                    fontSize={70}
                    fontWeight={800}
                    fill={pal.c}
                    filter="url(#glow)"
                  >
                    {`${sign}2`}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {drops.map((tl, n) => {
          if (t < tl - 0.55) return null;
          const row = Math.floor(n / 2);
          const ry = ROW_Y[row];
          const x = 540 + (n % 2 === 0 ? -62 : 62);
          const d = dropY(t, tl, ry - 640, ry, 0.55);
          return (
            <g key={n}>
              {t < tl && (
                <g filter="url(#blur6)">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <circle
                      key={i}
                      cx={x}
                      cy={d.y - (i + 1) * 26}
                      r={ORB_R * (1 - i * 0.12)}
                      fill={pal.c}
                      opacity={0.28 * (1 - i / 6) * d.o}
                    />
                  ))}
                </g>
              )}
              <Orb x={x} y={d.y} r={ORB_R} kind={kind} o={d.o} spin={t * 60} />
              <Burst x={x} y={ry + 8} t0={tl} t={t} color={pal.c} seed={`${kind}-b${n}`} n={12} spread={110} life={0.8} />
            </g>
          );
        })}

        {landed > 0 && (
          <g transform={`translate(540 1200) scale(${pop})`}>
            <text
              y={60}
              textAnchor="middle"
              fontSize={170}
              fontWeight={900}
              fill={pal.c}
              filter="url(#glowBig)"
            >
              {`${sign}${landed}`}
            </text>
          </g>
        )}
        <Burst x={540} y={1200} t0={tRes} t={t} color="#fff" seed={`${kind}-rw`} n={28} spread={260} life={1.1} />
        <Burst x={540} y={1200} t0={tRes} t={t} color={pal.c} seed={`${kind}-rc`} n={20} spread={200} life={1.1} />
      </g>
    );
  };

  /* ───────── Adegan 4: batang dipotong, potongan jatuh ───────── */
  const barScene = () => {
    if (sBar <= 0.003) return null;
    const tb = T("bar-in");
    const c1 = T("cut-1");
    const c2 = T("cut-2");
    const falls = [1, 2, 3].map((n) => T(`fall-${n}`));
    const tg = T("regroup");
    const gap1 = 44 * easeOut(ramp(t, c1 + 0.2, c1 + 0.7));
    const gap2 = 44 * easeOut(ramp(t, c2 + 0.2, c2 + 0.7));
    const dxs = [-gap1, 0, gap2];

    const laser = (c: number, cx: number, key: string) => {
      if (t < c || t > c + 0.9) return null;
      const len = Math.max(1, 380 * easeInOut(ramp(t, c, c + 0.3)));
      const o = 1 - ramp(t, c + 0.3, c + 0.9);
      return (
        <g key={key} opacity={o}>
          <rect x={cx - 3} y={BAR_Y - 190} width={6} height={len} rx={3} fill="#fff" filter="url(#glow)" />
          <circle cx={cx} cy={BAR_Y - 190 + len} r={14} fill="#fff" filter="url(#glowBig)" />
          <Burst x={cx} y={BAR_Y} t0={c + 0.15} t={t} color={MINUS.l} seed={key} n={16} spread={120} life={0.8} />
        </g>
      );
    };

    return (
      <g opacity={sBar}>
        <text
          x={540}
          y={410}
          textAnchor="middle"
          fontSize={130}
          fontWeight={900}
          fill={MINUS.c}
          filter="url(#glowBig)"
          opacity={ramp(t, tb + 0.4, tb + 1.0) * (1 - ramp(t, falls[0] - 0.6, falls[0] - 0.2))}
        >
          −6
        </text>

        {[0, 1, 2].map((i) => {
          const base = PIECE_BASE_X[i] + dxs[i];
          const tf = falls[i];
          const u = easeInOut(ramp(t, tf - 0.6, tf));
          const x = base + (540 - base) * u;
          const y = dropY(t, tf, BAR_Y, REST_Y[i], 0.6).y;
          const cutT = i === 0 ? c1 : c2;
          const labO = ramp(t, cutT + 0.5, cutT + 1.0);
          const lx = x + 210 * u;
          const ly = y - 80 + 100 * u;
          return (
            <g key={i}>
              <g transform={`translate(${x} ${y})`}>
                <g filter="url(#glow)">
                  {[0, 1].map((j) => {
                    const cx = -65 + j * 130;
                    const so = ramp(t, tb + 0.08 * (2 * i + j), tb + 0.08 * (2 * i + j) + 0.4);
                    const sc = 0.5 + 0.5 * easeOut(so);
                    return (
                      <g
                        key={j}
                        opacity={so}
                        transform={`translate(${cx} 0) scale(${sc}) translate(${-cx} 0)`}
                      >
                        <rect
                          x={cx - SEG_W / 2}
                          y={-SEG_W / 2}
                          width={SEG_W}
                          height={SEG_W}
                          rx={26}
                          fill="url(#seg)"
                          stroke={MINUS.l}
                          strokeOpacity={0.85}
                          strokeWidth={2}
                        />
                        <rect x={cx - 30} y={-8} width={60} height={16} rx={8} fill="#fff" />
                      </g>
                    );
                  })}
                </g>
              </g>
              <text
                x={lx}
                y={ly}
                textAnchor="middle"
                fontSize={58}
                fontWeight={800}
                fill={MINUS.c}
                filter="url(#glow)"
                opacity={labO}
              >
                −2
              </text>
              <Burst x={540} y={REST_Y[i] + 60} t0={tf} t={t} color={MINUS.c} seed={`fall${i}`} n={14} spread={130} life={0.8} />
            </g>
          );
        })}

        {laser(c1, CUT_X[0], "laser1")}
        {laser(c2, CUT_X[1], "laser2")}

        {[825, 995].map((py, i) => (
          <text
            key={i}
            x={540}
            y={py + 22}
            textAnchor="middle"
            fontSize={64}
            fontWeight={800}
            fill="#fff"
            filter="url(#glow)"
            opacity={ramp(t, tg, tg + 0.4)}
          >
            +
          </text>
        ))}

        <text
          x={540}
          y={1260}
          textAnchor="middle"
          fontSize={82}
          fontWeight={800}
          filter="url(#glow)"
          opacity={ramp(t, tg, tg + 0.5)}
        >
          <tspan fill={MINUS.c}>−2</tspan>
          <tspan fill="#fff">{" × "}</tspan>
          <tspan fill={PLUS.c}>3</tspan>
          <tspan fill="#fff">{" = "}</tspan>
          <tspan fill={MINUS.c}>−6</tspan>
        </text>
      </g>
    );
  };

  /* ───────── Adegan 5: penutup ───────── */
  const endScene = () => {
    if (sEnd <= 0.003) return null;
    const ang = t * 1.1;
    const orbitAt = (a: number) => ({
      x: 540 + Math.cos(a) * 330,
      y: 620 + Math.sin(a) * 120,
    });
    const pp = orbitAt(ang);
    const pts: { x: number; y: number }[] = [];
    for (let i = 1; i <= 22; i++) pts.push(orbitAt(ang - i * 0.05));
    const front = Math.sin(ang) > 0;
    const plusOrb = (
      <g>
        <Trail pts={pts} r={44} color={PLUS.c} />
        <Orb x={pp.x} y={pp.y} r={44} kind="plus" spin={t * 80} />
      </g>
    );
    return (
      <g opacity={sEnd}>
        {[0, 1, 2].map((i) => {
          const k = (t * 0.45 + i / 3) % 1;
          return (
            <circle
              key={i}
              cx={540}
              cy={620}
              r={150 + 280 * k}
              fill="none"
              stroke={MINUS.c}
              strokeWidth={3}
              opacity={(1 - k) * 0.5}
            />
          );
        })}
        {!front && plusOrb}
        <Orb x={540} y={620} r={150} kind="minus" s={1 + 0.03 * Math.sin(t * 3)} spin={t * 30} />
        {front && plusOrb}
        <Burst x={540} y={620} t0={resolveT} t={t} color="#fff" seed="endw" n={40} spread={420} life={1.4} />
        <Burst x={540} y={620} t0={resolveT} t={t} color={MINUS.c} seed="endm" n={30} spread={320} life={1.4} />
        <text
          x={540}
          y={1010}
          textAnchor="middle"
          fontSize={104}
          fontWeight={800}
          filter="url(#glow)"
        >
          <tspan fill={MINUS.c}>−2</tspan>
          <tspan fill="#fff">{" × "}</tspan>
          <tspan fill={PLUS.c}>3</tspan>
          <tspan fill="#fff">{" = "}</tspan>
          <tspan fill={MINUS.c}>−6</tspan>
        </text>
      </g>
    );
  };

  /* ───────── Header: − × + = − ??? ───────── */
  const kR = t - resolveT;
  const solved = t >= resolveT;
  const checkScale = solved ? 1 - Math.exp(-14 * kR) * Math.cos(20 * kR) : 0;
  const qOpacity = solved ? 1 - ramp(t, resolveT, resolveT + 0.15) : 1;
  const glitch = t < 0.7 ? (Math.sin(t * 90) > 0.3 ? 1 : 0.35) : 1;
  const HEAD = [
    { ch: "−", x: 125, c: MINUS.c },
    { ch: "×", x: 265, c: "#ffffff" },
    { ch: "+", x: 405, c: PLUS.c },
    { ch: "=", x: 545, c: "#ffffff" },
    { ch: "−", x: 685, c: MINUS.c },
  ];

  /* ───────── Render ───────── */
  return (
    <AbsoluteFill style={{ background: data.background, fontFamily: FONT }}>
      {data.audioSrc ? <Audio src={staticFile(data.audioSrc)} /> : null}

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <radialGradient id="aurC">
            <stop offset="0" stopColor={PLUS.c} stopOpacity="0.16" />
            <stop offset="1" stopColor={PLUS.c} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurM">
            <stop offset="0" stopColor={MINUS.c} stopOpacity="0.14" />
            <stop offset="1" stopColor={MINUS.c} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurV">
            <stop offset="0" stopColor="#8a5cff" stopOpacity="0.16" />
            <stop offset="1" stopColor="#8a5cff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vignette" cx="50%" cy="48%" r="75%">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.6" />
          </radialGradient>
          <linearGradient id="hdr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#02040c" stopOpacity="0.96" />
            <stop offset="0.7" stopColor="#02040c" stopOpacity="0.85" />
            <stop offset="1" stopColor="#02040c" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="seg" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={MINUS.l} stopOpacity="0.95" />
            <stop offset="1" stopColor={MINUS.c} stopOpacity="0.6" />
          </linearGradient>
          {(["plus", "minus"] as const).map((k) => {
            const p = k === "plus" ? PLUS : MINUS;
            return (
              <React.Fragment key={k}>
                <radialGradient id={`orb-${k}`} cx="38%" cy="32%">
                  <stop offset="0" stopColor={p.l} stopOpacity="0.98" />
                  <stop offset="0.5" stopColor={p.c} stopOpacity="0.72" />
                  <stop offset="1" stopColor={p.c} stopOpacity="0.25" />
                </radialGradient>
                <radialGradient id={`halo-${k}`}>
                  <stop offset="0.25" stopColor={p.c} stopOpacity="0.45" />
                  <stop offset="1" stopColor={p.c} stopOpacity="0" />
                </radialGradient>
              </React.Fragment>
            );
          })}
          <filter id="glow" x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="6" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="glowBig" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="16" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="blur6" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="6" />
          </filter>
        </defs>

        {/* Latar: aurora + bentuk geometri melayang (parallax) */}
        <g transform={`translate(540 960) scale(${par}) translate(-540 -960)`}>
          <ellipse cx={300 + Math.sin(t * 0.13) * 140} cy={520 + Math.sin(t * 0.2) * 60} rx={560} ry={420} fill="url(#aurC)" />
          <ellipse cx={800 + Math.sin(t * 0.1 + 2) * 150} cy={1000 + Math.cos(t * 0.17) * 80} rx={600} ry={460} fill="url(#aurM)" />
          <ellipse cx={540 + Math.cos(t * 0.09) * 200} cy={1500} rx={700} ry={380} fill="url(#aurV)" />
          {shapes.map((s, i) => {
            const y = ((((s.y - t * s.speed) % (H + 240)) + (H + 240)) % (H + 240)) - 120;
            const pts = Array.from({ length: s.sides })
              .map((_, j) => {
                const a = (j / s.sides) * Math.PI * 2 - Math.PI / 2;
                return `${Math.cos(a) * s.size},${Math.sin(a) * s.size}`;
              })
              .join(" ");
            return (
              <polygon
                key={i}
                points={pts}
                transform={`translate(${s.x + Math.sin(t * 0.3 + i) * 30} ${y}) rotate(${s.rot + t * s.spin})`}
                fill="none"
                stroke={s.col}
                strokeWidth={2}
                opacity={0.14}
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

        {/* Dunia adegan (kamera zoom in/out) */}
        <g
          transform={`translate(${SC.x} ${SC.y}) scale(${cam.s}) translate(${-cam.x} ${-cam.y})`}
        >
          {hook}
          {pairNodes}
          {groups("plus", sA)}
          {groups("minus", sB)}
          {barScene()}
          {endScene()}
        </g>

        <rect width={W} height={H} fill="url(#vignette)" />

        {/* Header tetap */}
        <rect width={W} height={340} fill="url(#hdr)" />
        <text
          x={540}
          y={130}
          textAnchor="middle"
          fontSize={26}
          letterSpacing={10}
          fill={accent}
          opacity={0.85}
        >
          BUKTI VISUAL
        </text>
        <g opacity={glitch} filter="url(#glow)">
          {HEAD.map((h, i) => (
            <text
              key={i}
              x={h.x}
              y={HEADER_Y}
              textAnchor="middle"
              fontSize={150}
              fontWeight={900}
              fill={h.c}
            >
              {h.ch}
            </text>
          ))}
          <g
            transform={`translate(885 ${HEADER_Y - 52}) scale(${1 + 0.06 * Math.sin(t * 5)})`}
            opacity={qOpacity}
          >
            <text
              textAnchor="middle"
              y={52}
              fontSize={150}
              fontWeight={900}
              fill={AMBER}
            >
              ???
            </text>
          </g>
          {solved && (
            <g transform={`translate(885 ${HEADER_Y - 52}) scale(${checkScale})`}>
              <path
                d="M -58 0 L -16 46 L 62 -56"
                fill="none"
                stroke={GOOD}
                strokeWidth={26}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </g>
          )}
        </g>

        {/* Kilatan saat jawaban terungkap */}
        {solved && (
          <rect width={W} height={H} fill="#fff" opacity={0.28 * Math.exp(-kR * 6)} />
        )}
      </svg>

      {/* Panel caption (kaca) */}
      <div
        style={{
          position: "absolute",
          left: 60,
          top: 1330,
          width: 960,
          height: 250,
          borderRadius: 34,
          background:
            "linear-gradient(135deg, rgba(10,20,44,0.62), rgba(10,20,44,0.38))",
          border: `1px solid ${accent}66`,
          boxShadow: `0 0 40px ${accent}22, inset 0 0 30px ${accent}10`,
        }}
      />
      {captions.map((c, i) => {
        const op = win(t, c.from, c.to, 0.35, 0.35);
        if (op <= 0.01) return null;
        const lift = (1 - easeOut(clamp01((t - c.from) / 0.5))) * 24;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: 60,
              top: 1330,
              width: 960,
              height: 250,
              boxSizing: "border-box",
              padding: "0 36px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              opacity: op,
              transform: `translateY(${lift}px)`,
              fontFamily: FONT,
            }}
          >
            <div
              style={{
                fontSize: 54,
                fontWeight: 800,
                lineHeight: 1.15,
                color: "#fff",
                textShadow: `0 0 24px ${accent}88`,
              }}
            >
              {c.title}
            </div>
            {c.sub && (
              <div
                style={{
                  marginTop: 14,
                  fontSize: 33,
                  lineHeight: 1.3,
                  color: accent,
                  opacity: 0.95,
                }}
              >
                {c.sub}
              </div>
            )}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};