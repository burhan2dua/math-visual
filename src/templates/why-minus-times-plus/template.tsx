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
  accent: string;
  plusColor: string; // format #rrggbb
  minusColor: string; // format #rrggbb
  durationInSeconds: number;
  bpm: number;
  audio?: string;
  cues: Cue[];
};

type Pal = { c: string; l: string };
type Kind = "plus" | "minus";

/* ───────────────────────── Golden ratio layout ───────────────────────── */

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 1080;
const H = 1920;
const CX = W / 2;

// Zona header = H/φ³; titik fokus panggung = bagian emas dari sisa layar
const HDR_H = Math.round(H / PHI ** 3); // 453
const CY = Math.round(HDR_H + (H - HDR_H) / PHI ** 2); // 1013
const SYM_Y = Math.round(HDR_H * 0.7); // baris simbol di header

// Skala tipografi: setiap tingkat × φ
const F1 = 36; // subtitle, label kecil
const F2 = 58; // judul header, persamaan, label
const F3 = 94; // judul adegan, label angka
const F4 = 152; // angka hasil
const F5 = 246; // ? dan 0 besar

// Skala radius orb: × φ
const R2 = 58; // standar
const R3 = 94; // hook
const R4 = 152; // penutup

// Kelompok
const ROW_W = 800;
const ROW_X0 = (W - ROW_W) / 2;
const ROW_H = Math.round(ROW_W / PHI ** 3); // 189
const ROW_GAP = Math.round(ROW_H / PHI ** 3); // 45
const ROW_PITCH = ROW_H + ROW_GAP;
const ROW_Y = [CY - ROW_PITCH, CY, CY + ROW_PITCH];
const TITLE_Y = Math.round(ROW_Y[0] - ROW_H / 2 - 56);
const COUNT_Y = Math.round(ROW_Y[2] + ROW_H / 2 + F4);
const EQ_Y = Math.round(H - H / PHI ** 4); // 1640, persamaan selalu di sini

// Tangga
const BX = [195, 425, 655, 885];
const BY = 1050;
const UNIT = 54;
const BAR_W = 130;
const BAR_VAL = [6, 3, 0, -3];
const MULT = ["+2", "+1", "0", "−1"];
const STAIR_TITLE_Y = 600;

const AMBER = "#ffd34d";
const GOOD = "#6dffb0";
const FONT =
  '"Orbitron", "Rajdhani", "Segoe UI", system-ui, -apple-system, sans-serif';

const OUTLINE = {
  stroke: "rgba(0,0,0,0.65)",
  strokeWidth: 7,
  paintOrder: "stroke" as const,
};

/* ───────────────────────── Util ───────────────────────── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = Easing.out(Easing.cubic);
const easeIn = Easing.in(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const win = (t: number, a: number, b: number, fi = 0.5, fo = 0.5) =>
  clamp01((t - a) / fi) * (1 - clamp01((t - (b - fo)) / fo));
/** Pegas: 0 → overshoot kecil → 1 */
const spring = (k: number) =>
  k <= 0 ? 0 : 1 - Math.exp(-13 * k) * Math.cos(19 * k);

const mix = (hex: string, to: number, k: number) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) =>
    Math.round(v + (to - v) * k),
  );
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
};

const wrapTitle = (s: string, max: number) => {
  const lines: string[] = [];
  let cur = "";
  for (const w of s.toUpperCase().split(" ")) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? cur + " " + w : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
};

/** Jatuh dipercepat lalu memantul kecil setelah mendarat pada waktu tl */
const dropY = (t: number, tl: number, from: number, to: number, dur = 0.55) => {
  const t0 = tl - dur;
  if (t < t0) return { y: from, o: 0 };
  if (t < tl) {
    const u = (t - t0) / dur;
    return { y: from + (to - from) * u * u, o: clamp01((t - t0) / 0.15) };
  }
  const k = t - tl;
  return { y: to - 14 * Math.exp(-k * 5) * Math.abs(Math.sin(k * 13)), o: 1 };
};

type KF = { t: number; x: number; y: number; s: number };

const camAt = (t: number, kfs: KF[]): KF => {
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

/** Keyframe kamera. Zoom dibatasi ≤ 1,12 agar konten tidak keluar layar */
const buildCamera = (T: (id: string) => number, dur: number): KF[] => {
  const k: KF[] = [];
  const add = (t: number, x: number, y: number, s: number) =>
    k.push({ t, x, y, s });
  const FOCUS = 1.05;

  add(0, CX, CY, 1);

  // Hook
  const qh = T("hook-q-hit");
  add(qh - 0.5, CX, CY, 1);
  add(qh - 0.05, CX, CY, 1.04);
  add(qh + 0.15, CX, CY, 1.12);
  add(qh + 1.6, CX, CY, 1);

  // +1 bertemu −1
  const mc = T("meet-cancel");
  add(T("meet-approach"), CX, CY, 1);
  add(mc - 0.3, CX, CY, 1.05);
  add(mc + 0.12, CX, CY, 1.1);
  add(mc + 1.8, CX, CY, 1);

  // Kelompok (+) dan (−)
  for (const p of ["c", "d"]) {
    add(T(`${p}-title`) - 0.1, CX, CY, 1);
    for (let g = 0; g < 3; g++) {
      add(T(`${p}-drop-${2 * g + 1}`) - 0.7, CX, CY + (ROW_Y[g] - CY) * 0.3, FOCUS);
    }
    const tr = T(`${p}-result`);
    add(tr - 0.3, CX, CY, 1);
    add(tr + 0.12, CX, CY, 1.08);
    add(tr + 1.6, CX, CY, 1);
  }

  // Pembuktian
  add(T("e-title") - 0.1, CX, CY, 1);
  add(T("e-approach"), CX, CY, 1.02);
  add(T("e-hit-1") - 0.5, CX, CY + (ROW_Y[0] - CY) * 0.3, FOCUS);
  add(T("e-hit-3") - 0.4, CX, CY, FOCUS);
  add(T("e-hit-5") - 0.4, CX, CY + (ROW_Y[2] - CY) * 0.3, FOCUS);
  add(T("e-zero") - 0.2, CX, CY, 1.04);
  add(T("e-zero") + 0.15, CX, CY, 1.12);
  add(T("e-zero") + 1.8, CX, CY, 1);

  // Pola tangga
  add(T("f-title") - 0.1, CX, CY, 1);
  BX.forEach((bx, i) => {
    add(T(`f-bar-${i + 1}`) - 0.4, CX + (bx - CX) * 0.2, CY, FOCUS);
  });
  add(T("f-bar-4") + 0.15, CX + (BX[3] - CX) * 0.2, CY, 1.1);
  add(T("f-bar-4") + 1.5, CX, CY, 1);

  // Penutup
  const rs = T("g-resolve");
  add(rs - 0.1, CX, CY, 1);
  add(rs + 0.15, CX, CY, 1.12);
  add(rs + 3.2, CX, CY, 1);
  add(dur, CX, CY, 0.94);

  return k.sort((a, b) => a.t - b.t);
};

/** Getaran kamera dari hantaman (thud/pop) */
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

/* ───────────────────────── Elemen visual (flat + border glow) ───────────────────────── */

const Orb: React.FC<{
  x: number;
  y: number;
  r: number;
  kind: Kind;
  pal: Pal;
  o?: number;
  s?: number;
}> = ({ x, y, r, kind, pal, o = 1, s = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <circle r={r} fill={pal.c} fillOpacity={0.1} />
    <circle
      r={r}
      fill="none"
      stroke={pal.c}
      strokeWidth={4}
      filter="url(#glow)"
    />
    <g fill={pal.l} filter="url(#glow)">
      <rect x={-r * 0.44} y={-r * 0.09} width={r * 0.88} height={r * 0.18} rx={r * 0.09} />
      {kind === "plus" && (
        <rect x={-r * 0.09} y={-r * 0.44} width={r * 0.18} height={r * 0.88} rx={r * 0.09} />
      )}
    </g>
  </g>
);

/** Ekor berupa cincin garis yang memudar (tanpa blur) */
const Trail: React.FC<{
  pts: { x: number; y: number }[];
  r: number;
  color: string;
}> = ({ pts, r, color }) => (
  <g>
    {pts.map((p, i) => {
      const f = 1 - i / Math.max(1, pts.length);
      return (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={r * (0.5 + 0.4 * f)}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          opacity={0.3 * f * f}
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
}> = ({ x, y, t0, t, color, seed, n = 18, spread = 150, life = 1.0 }) => {
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
        strokeWidth={4 * (1 - k)}
        opacity={1 - k}
      />
      {Array.from({ length: n }).map((_, i) => {
        const a = random(`${seed}-a-${i}`) * Math.PI * 2;
        const d = spread * (0.35 + random(`${seed}-d-${i}`) * 0.65) * e;
        const sz = 1.5 + random(`${seed}-s-${i}`) * 3;
        const px = x + Math.cos(a) * d;
        const py = y + Math.sin(a) * d + 24 * k * k;
        if (i % 4 === 0) {
          return (
            <rect
              key={i}
              x={px - sz * 1.5}
              y={py - sz * 1.5}
              width={sz * 3}
              height={sz * 3}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              opacity={1 - k}
              transform={`rotate(${a * 57 + k * 240} ${px} ${py})`}
            />
          );
        }
        return (
          <circle
            key={i}
            cx={px}
            cy={py}
            r={sz * (1 - k)}
            fill={i % 3 === 0 ? "#fff" : color}
            opacity={1 - k}
          />
        );
      })}
    </g>
  );
};

const Eq: React.FC<{
  parts: [string, string][];
  y: number;
  k: number;
  size?: number;
  big?: boolean;
}> = ({ parts, y, k, size = F2, big = false }) => {
  if (k <= 0) return null;
  return (
    <g transform={`translate(${CX} ${y}) scale(${k})`}>
      <text
        textAnchor="middle"
        fontSize={size}
        fontWeight={800}
        filter={big ? "url(#glowBig)" : "url(#glow)"}
      >
        {parts.map(([s, c], i) => (
          <tspan key={i} fill={c}>
            {s}
          </tspan>
        ))}
      </text>
    </g>
  );
};

/* ───────────────────────── Template ───────────────────────── */

export const Template = ({ data }: { data: TemplateData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const accent = data.accent;

  const PLUS: Pal = { c: data.plusColor, l: mix(data.plusColor, 255, 0.78) };
  const MINUS: Pal = { c: data.minusColor, l: mix(data.minusColor, 255, 0.78) };
  const WHITE = "#ffffff";

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
        useMinus: i % 2 === 1,
      })),
    [],
  );
  const titleLines = useMemo(() => wrapTitle(data.title, 20), [data.title]);

  /* ── Kamera + getaran ── */
  const cam = camAt(t, kfs);
  const sh = shakeAt(t, hits);
  const sx = sh.x + Math.sin(t * 0.7) * 3;
  const sy = sh.y + Math.cos(t * 0.9) * 3;
  const par = 1 + (cam.s - 1) * 0.25;
  const rs = T("g-resolve");

  /* ───────── Adegan 1: hook ───────── */
  const hookScene = () => {
    const s = win(t, -1, T("meet-plus-in") - 0.1, 0.5, 0.6);
    if (s <= 0.003) return null;
    const HY = CY - 250;
    const qh = T("hook-q-hit");
    const qk = t - qh;
    const pl = spring((t - T("hook-plus")) / 0.7);
    const mi = spring((t - T("hook-minus")) / 0.7);
    const cr = spring((t - T("hook-times")) / 0.6);
    const pulse = qk >= 0 ? 1 + 0.1 * Math.exp(-qk * 8) : 1;
    const QY = CY + 217;
    return (
      <g opacity={s}>
        {pl > 0 && (
          <Orb
            x={290 + Math.sin(t * 1.1) * 18}
            y={HY + Math.sin(t * 1.7) * 22}
            r={R3}
            kind="plus"
            pal={PLUS}
            s={pl * pulse}
          />
        )}
        {mi > 0 && (
          <Orb
            x={790 - Math.sin(t * 1.1) * 18}
            y={HY + Math.sin(t * 1.5 + 1) * 22}
            r={R3}
            kind="minus"
            pal={MINUS}
            s={mi * pulse}
          />
        )}
        {cr > 0 && (
          <g transform={`translate(${CX} ${HY}) scale(${cr * pulse})`} filter="url(#glow)">
            <rect x={-52} y={-8} width={104} height={16} rx={8} fill={WHITE} transform="rotate(45)" />
            <rect x={-52} y={-8} width={104} height={16} rx={8} fill={WHITE} transform="rotate(-45)" />
          </g>
        )}
        {qk >= 0 && (
          <g
            transform={`translate(${CX + Math.sin(qk * 80) * 10 * Math.exp(-qk * 8)} ${QY}) scale(${1 + 1.0 * Math.exp(-qk * 10)})`}
            opacity={Math.min(1, qk * 20)}
          >
            <text
              textAnchor="middle"
              y={F5 * 0.36}
              fontSize={F5}
              fontWeight={900}
              fill={AMBER}
              filter="url(#glowBig)"
            >
              ?
            </text>
          </g>
        )}
        <Burst x={CX} y={QY} t0={qh} t={t} color={AMBER} seed="q" n={26} spread={280} life={1.0} />
      </g>
    );
  };

  /* ───────── Adegan 2: +1 bertemu −1 ───────── */
  const meetScene = () => {
    const tp = T("meet-plus-in");
    const tm = T("meet-minus-in");
    const tw = T("meet-approach");
    const tc = T("meet-cancel");
    const tcw = T("c-whoosh");
    const s = win(t, tp - 0.3, tcw - 0.2, 0.3, 0.6);
    if (s <= 0.003) return null;
    const r = R2;
    const mk = (side: number, t0: number) => (tt: number) => {
      const from = side < 0 ? -150 : W + 150;
      const rest = side < 0 ? 250 : 830;
      const meet = CX + side * r * 0.95;
      let x = from + (rest - from) * easeOut(ramp(tt, t0, t0 + 1.1));
      const b = easeIn(ramp(tt, tw, tc));
      x = x + (meet - x) * b;
      const y = CY + Math.sin(tt * 2.4 + side) * 28 * (1 - b);
      return { x, y, b };
    };
    const fp = mk(-1, tp);
    const fm = mk(1, tm);

    const one = (
      f: (tt: number) => { x: number; y: number; b: number },
      t0: number,
      kind: Kind,
      pal: Pal,
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
      return (
        <g key={kind}>
          <Trail pts={pts} r={r} color={pal.c} />
          <Orb x={p.x} y={p.y} r={r} kind={kind} pal={pal} o={clamp01((t - t0) / 0.35)} />
          <text
            x={p.x}
            y={p.y + r + 64}
            textAnchor="middle"
            fontSize={F2}
            fontWeight={800}
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
    const pa = t >= tp && t < tc ? fp(t) : null;
    const pb = t >= tm && t < tc ? fm(t) : null;
    const zeroO = 1 - ramp(t, tcw - 1.0, tcw - 0.4);
    return (
      <g opacity={s}>
        {pa && pb && t >= tw && (
          <g filter="url(#glow)">
            <line
              x1={pa.x}
              y1={pa.y}
              x2={(pa.x + pb.x) / 2}
              y2={(pa.y + pb.y) / 2}
              stroke={PLUS.c}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={pa.b * 0.9}
            />
            <line
              x1={pb.x}
              y1={pb.y}
              x2={(pa.x + pb.x) / 2}
              y2={(pa.y + pb.y) / 2}
              stroke={MINUS.c}
              strokeWidth={4}
              strokeLinecap="round"
              opacity={pa.b * 0.9}
            />
          </g>
        )}
        {one(fp, tp, "plus", PLUS, "+1")}
        {one(fm, tm, "minus", MINUS, "−1")}
        {kc >= 0 && (
          <g>
            <Burst x={CX} y={CY} t0={tc} t={t} color={WHITE} seed="m-w" n={24} spread={230} />
            <Burst x={CX} y={CY} t0={tc} t={t} color={PLUS.c} seed="m-p" n={14} spread={170} />
            <Burst x={CX} y={CY} t0={tc} t={t} color={MINUS.c} seed="m-m" n={14} spread={200} />
            <g
              transform={`translate(${CX} ${CY}) scale(${spring(kc / 0.9)})`}
              opacity={zeroO}
            >
              <text
                textAnchor="middle"
                y={F5 * 0.36}
                fontSize={F5}
                fontWeight={900}
                fill={WHITE}
                filter="url(#glowBig)"
              >
                0
              </text>
            </g>
          </g>
        )}
        <Eq
          y={EQ_Y}
          k={spring((t - T("meet-formula")) / 0.5)}
          parts={[
            ["(+1)", PLUS.c],
            [" + ", WHITE],
            ["(−1)", MINUS.c],
            [" = 0", WHITE],
          ]}
        />
      </g>
    );
  };

  /* ───────── Adegan 3 & 4: tiga kelompok ───────── */
  const groups = (prefix: "c" | "d", kind: Kind, pal: Pal, op: number) => {
    if (op <= 0.003) return null;
    const sign = kind === "plus" ? "+" : "−";
    const tTitle = T(`${prefix}-title`);
    const tRes = T(`${prefix}-result`);
    const drops = [1, 2, 3, 4, 5, 6].map((n) => T(`${prefix}-drop-${n}`));
    const landed = drops.filter((d) => t >= d).length;
    const lastLand = landed > 0 ? drops[landed - 1] : 0;
    const pop = landed > 0 ? 1 + 0.16 * Math.exp(-(t - lastLand) * 9) : 1;
    const flare = t >= tRes ? 1 + 0.2 * Math.exp(-(t - tRes) * 7) : 1;

    return (
      <g opacity={op}>
        <text
          x={CX}
          y={TITLE_Y}
          textAnchor="middle"
          fontSize={F3}
          fontWeight={800}
          filter="url(#glow)"
          opacity={ramp(t, tTitle, tTitle + 0.5)}
        >
          <tspan fill={pal.c}>{`(${sign}2)`}</tspan>
          <tspan fill={WHITE}>{" × "}</tspan>
          <tspan fill={PLUS.c}>{"(+3)"}</tspan>
        </text>

        {ROW_Y.map((ry, i) => {
          const ts = T(`${prefix}-slot-${i + 1}`);
          const k = ramp(t, ts, ts + 0.5);
          if (k <= 0) return null;
          const dx = -240 * (1 - easeOut(k));
          const tagK = t - drops[2 * i + 1];
          return (
            <g key={i} opacity={k}>
              <rect
                x={ROW_X0 + dx}
                y={ry - ROW_H / 2}
                width={ROW_W}
                height={ROW_H}
                rx={34}
                fill={pal.c}
                fillOpacity={0.04}
                stroke={pal.c}
                strokeOpacity={0.75}
                strokeWidth={3}
                strokeDasharray="16 10"
                filter="url(#glow)"
              />
              {tagK >= 0 && (
                <g
                  transform={`translate(${ROW_X0 + ROW_W - 100} ${ry + 24}) scale(${spring(tagK / 0.5)})`}
                >
                  <text
                    textAnchor="middle"
                    fontSize={F3}
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
          const ry = ROW_Y[Math.floor(n / 2)];
          const x = CX + (n % 2 === 0 ? -(R2 + 10) : R2 + 10);
          const d = dropY(t, tl, ry - 600, ry, 0.55);
          return (
            <g key={n}>
              {t < tl && (
                <g>
                  {Array.from({ length: 5 }).map((_, i) => (
                    <circle
                      key={i}
                      cx={x}
                      cy={d.y - (i + 1) * 34}
                      r={R2 * (1 - i * 0.1)}
                      fill="none"
                      stroke={pal.c}
                      strokeWidth={2.5}
                      opacity={0.24 * (1 - i / 5) * d.o}
                    />
                  ))}
                </g>
              )}
              <Orb x={x} y={d.y} r={R2} kind={kind} pal={pal} o={d.o} />
              <Burst x={x} y={ry + 8} t0={tl} t={t} color={pal.c} seed={`${prefix}-b${n}`} n={12} spread={110} life={0.8} />
            </g>
          );
        })}

        {landed > 0 && (
          <g transform={`translate(${CX} ${COUNT_Y}) scale(${pop * flare})`}>
            <text
              textAnchor="middle"
              fontSize={F4}
              fontWeight={900}
              fill={pal.c}
              filter="url(#glowBig)"
            >
              {`${sign}${landed}`}
            </text>
          </g>
        )}
        <Burst x={CX} y={COUNT_Y - 50} t0={tRes} t={t} color={WHITE} seed={`${prefix}-rw`} n={24} spread={240} life={1.1} />
        <Burst x={CX} y={COUNT_Y - 50} t0={tRes} t={t} color={pal.c} seed={`${prefix}-rc`} n={18} spread={190} life={1.1} />

        <Eq
          y={EQ_Y}
          k={spring((t - T(`${prefix}-formula`)) / 0.5)}
          parts={[
            [`(${sign}2)`, pal.c],
            [" × ", WHITE],
            ["(+3)", PLUS.c],
            [" = ", WHITE],
            [`${sign}6`, pal.c],
          ]}
        />
      </g>
    );
  };

  /* ───────── Adegan 5: bukti, +6 dan −6 saling menghapus ───────── */
  const cancelScene = () => {
    const s = win(t, T("e-whoosh") - 0.1, T("f-whoosh") + 0.3, 0.4, 0.7);
    if (s <= 0.003) return null;
    const te = T("e-title");
    const tz = T("e-zero");
    const tf = T("e-formula");
    const tfin = T("e-final");
    const apP = T("e-appear-plus");
    const apM = T("e-appear-minus");
    const hit = [1, 2, 3, 4, 5, 6].map((n) => T(`e-hit-${n}`));
    const r = R2;
    const remain = hit.filter((h) => t < h).length;
    const done = hit.filter((h) => t >= h);
    const lastHit = done.length ? done[done.length - 1] : -99;
    const pulse = lastHit > -90 ? 1 + 0.2 * Math.exp(-(t - lastHit) * 9) : 1;
    const cntO = (1 - ramp(t, hit[5], hit[5] + 0.3)) * ramp(t, apP, apP + 0.4);
    const kz = t - tz;

    const orbs: React.ReactNode[] = [];
    for (let k = 0; k < 6; k++) {
      const row = Math.floor(k / 2);
      const inner = k % 2 === 0;
      const ty = ROW_Y[row];
      (["plus", "minus"] as const).forEach((kind) => {
        const side = kind === "plus" ? -1 : 1;
        const pal = kind === "plus" ? PLUS : MINUS;
        const sxp = side < 0 ? (inner ? 300 : 170) : inner ? 780 : 910;
        const meet = CX + side * r * 0.95;
        const ap = (kind === "plus" ? apP : apM) + 0.08 * k;
        const f = (tt: number) => {
          const b = easeIn(ramp(tt, hit[k] - 0.9, hit[k]));
          return {
            x: sxp + (meet - sxp) * b,
            y: ty + Math.sin(tt * 2.2 + k + side) * 12 * (1 - b),
            b,
          };
        };
        if (t < ap || t >= hit[k]) return;
        const p = f(t);
        const pts: { x: number; y: number }[] = [];
        if (p.b > 0) {
          for (let i = 1; i <= 10; i++) pts.push(f(t - i * 0.04));
        }
        orbs.push(
          <g key={`${kind}${k}`}>
            {pts.length > 0 && <Trail pts={pts} r={r} color={pal.c} />}
            <Orb x={p.x} y={p.y} r={r} kind={kind} pal={pal} s={spring((t - ap) / 0.6)} />
          </g>,
        );
      });
    }

    return (
      <g opacity={s}>
        <text
          x={CX}
          y={TITLE_Y}
          textAnchor="middle"
          fontSize={F3}
          fontWeight={800}
          filter="url(#glow)"
          opacity={ramp(t, te, te + 0.5)}
        >
          <tspan fill={PLUS.c}>{"(+6)"}</tspan>
          <tspan fill={WHITE}>{" + "}</tspan>
          <tspan fill={MINUS.c}>{"(−6)"}</tspan>
        </text>

        <g opacity={cntO}>
          <g transform={`translate(270 ${COUNT_Y}) scale(${pulse})`}>
            <text textAnchor="middle" fontSize={F4} fontWeight={900} fill={PLUS.c} filter="url(#glow)">
              {`+${remain}`}
            </text>
          </g>
          <g transform={`translate(810 ${COUNT_Y}) scale(${pulse})`}>
            <text textAnchor="middle" fontSize={F4} fontWeight={900} fill={MINUS.c} filter="url(#glow)">
              {`−${remain}`}
            </text>
          </g>
        </g>

        {orbs}

        {hit.map((h, k) => {
          const ty = ROW_Y[Math.floor(k / 2)];
          return (
            <g key={k}>
              <Burst x={CX} y={ty} t0={h} t={t} color={WHITE} seed={`e${k}w`} n={16} spread={160} life={0.9} />
              <Burst x={CX} y={ty} t0={h} t={t} color={PLUS.c} seed={`e${k}p`} n={9} spread={120} life={0.9} />
              <Burst x={CX} y={ty} t0={h} t={t} color={MINUS.c} seed={`e${k}m`} n={9} spread={140} life={0.9} />
            </g>
          );
        })}

        {kz >= 0 && (
          <g>
            <Burst x={CX} y={CY} t0={tz} t={t} color={WHITE} seed="ez-w" n={34} spread={380} life={1.3} />
            <Burst x={CX} y={CY} t0={tz} t={t} color={AMBER} seed="ez-a" n={20} spread={290} life={1.3} />
            <g transform={`translate(${CX} ${CY}) scale(${spring(kz / 0.8)})`}>
              <text
                textAnchor="middle"
                y={F5 * 0.36}
                fontSize={F5}
                fontWeight={900}
                fill={WHITE}
                filter="url(#glowBig)"
              >
                0
              </text>
            </g>
          </g>
        )}

        <Eq
          y={EQ_Y - 84}
          k={spring((t - tf) / 0.5)}
          parts={[
            ["+6", PLUS.c],
            [" + ", WHITE],
            ["(−6)", MINUS.c],
            [" = 0", WHITE],
          ]}
        />
        <Eq
          y={EQ_Y}
          k={spring((t - tfin) / 0.5)}
          big
          parts={[
            ["(−2)", MINUS.c],
            [" × ", WHITE],
            ["(+3)", PLUS.c],
            [" = ", WHITE],
            ["−6", MINUS.c],
          ]}
        />
      </g>
    );
  };

  /* ───────── Adegan 6: tangga pola ───────── */
  const stairScene = () => {
    const s = win(t, T("f-whoosh") - 0.1, rs - 0.1, 0.4, 0.5);
    if (s <= 0.003) return null;
    const tt = T("f-title");
    const tb = [1, 2, 3, 4].map((n) => T(`f-bar-${n}`));
    const tsx = [1, 2, 3].map((n) => T(`f-step-${n}`));
    const topY = BAR_VAL.map((v) => BY - v * UNIT);

    return (
      <g opacity={s}>
        <g transform={`translate(${CX} ${STAIR_TITLE_Y}) scale(${spring((t - tt) / 0.6)})`}>
          <text textAnchor="middle" fontSize={F4} fontWeight={900} filter="url(#glowBig)">
            <tspan fill={WHITE}>{"×"}</tspan>
            <tspan fill={PLUS.c}>{" 3"}</tspan>
          </text>
        </g>

        <line
          x1={90}
          x2={990}
          y1={BY}
          y2={BY}
          stroke={WHITE}
          strokeOpacity={0.6}
          strokeWidth={3}
          filter="url(#glow)"
          opacity={ramp(t, tt, tt + 0.5)}
        />

        {[0, 1, 2].map((i) => {
          const p = ramp(t, tsx[i] - 0.25, tsx[i] + 0.35);
          if (p <= 0) return null;
          const x1 = BX[i];
          const y1 = topY[i];
          const x2 = x1 + (BX[i + 1] - x1) * p;
          const y2 = y1 + (topY[i + 1] - y1) * p;
          const col = i < 2 ? PLUS.c : MINUS.c;
          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={col}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray="2 14"
              filter="url(#glow)"
            />
          );
        })}

        {BAR_VAL.map((v, i) => {
          const g = easeOut(ramp(t, tb[i] - 0.15, tb[i] + 0.45));
          if (g <= 0) return null;
          const px = Math.abs(v) * UNIT * g;
          const kind: Kind = v < 0 ? "minus" : "plus";
          const pal = v < 0 ? MINUS : PLUS;
          const x = BX[i];
          const sp = spring((t - (tb[i] + 0.2)) / 0.5);
          const lbl = v > 0 ? `+${v}` : v < 0 ? `−${Math.abs(v)}` : "0";
          const ly = v > 0 ? BY - px - 24 : v < 0 ? BY + px + 90 : BY - 50;
          return (
            <g key={i}>
              {v !== 0 ? (
                <rect
                  x={x - BAR_W / 2}
                  y={v > 0 ? BY - px : BY}
                  width={BAR_W}
                  height={Math.max(1, px)}
                  rx={26}
                  fill={pal.c}
                  fillOpacity={0.1}
                  stroke={pal.c}
                  strokeWidth={4}
                  filter="url(#glow)"
                />
              ) : (
                <circle
                  cx={x}
                  cy={BY}
                  r={26 * spring((t - tb[i]) / 0.5)}
                  fill="none"
                  stroke={WHITE}
                  strokeWidth={4}
                  filter="url(#glow)"
                />
              )}
              <g transform={`translate(${x} ${ly}) scale(${sp})`}>
                <text
                  textAnchor="middle"
                  fontSize={F3}
                  fontWeight={900}
                  fill={v === 0 ? WHITE : pal.c}
                  filter="url(#glow)"
                  {...OUTLINE}
                >
                  {lbl}
                </text>
              </g>
              <g transform={`translate(${x} 1420) scale(${spring((t - (tb[i] - 0.2)) / 0.5)})`}>
                <text
                  textAnchor="middle"
                  fontSize={F3}
                  fontWeight={800}
                  fill={i === 3 ? MINUS.c : i === 2 ? WHITE : PLUS.c}
                  filter="url(#glow)"
                >
                  {MULT[i]}
                </text>
                <text
                  y={F1 + 14}
                  textAnchor="middle"
                  fontSize={F1}
                  fontWeight={700}
                  fill={WHITE}
                  opacity={0.6}
                >
                  {"× 3"}
                </text>
              </g>
              {/* kind dipakai agar tipe eksplisit */}
              {kind === "minus" && null}
            </g>
          );
        })}

        {[0, 1, 2].map((i) => {
          const k = t - tsx[i];
          if (k < 0) return null;
          const mx = (BX[i] + BX[i + 1]) / 2;
          const my = (topY[i] + topY[i + 1]) / 2 - 34;
          return (
            <g key={i} transform={`translate(${mx} ${my}) scale(${spring(k / 0.45)})`}>
              <text
                textAnchor="middle"
                fontSize={F2}
                fontWeight={900}
                fill={AMBER}
                filter="url(#glow)"
                {...OUTLINE}
              >
                {"−3"}
              </text>
            </g>
          );
        })}
        <Burst x={BX[3]} y={BY + 3 * UNIT} t0={tb[3]} t={t} color={MINUS.c} seed="f4" n={22} spread={220} life={1.0} />

        <Eq
          y={EQ_Y}
          k={spring((t - T("f-result")) / 0.5)}
          parts={[
            ["(−1)", MINUS.c],
            [" × ", WHITE],
            ["3", PLUS.c],
            [" = ", WHITE],
            ["−3", MINUS.c],
          ]}
        />
      </g>
    );
  };

  /* ───────── Adegan 7: penutup ───────── */
  const endScene = () => {
    const s = ramp(t, rs - 0.3, rs + 0.25);
    if (s <= 0.003) return null;
    const EY = CY - 60;
    const ang = t * 1.2;
    const orbitAt = (a: number) => ({
      x: CX + Math.cos(a) * 330,
      y: EY + Math.sin(a) * 120,
    });
    const pp = orbitAt(ang);
    const pts: { x: number; y: number }[] = [];
    for (let i = 1; i <= 20; i++) pts.push(orbitAt(ang - i * 0.05));
    const front = Math.sin(ang) > 0;
    const plusOrb = (
      <g>
        <Trail pts={pts} r={R2} color={PLUS.c} />
        <Orb x={pp.x} y={pp.y} r={R2} kind="plus" pal={PLUS} />
      </g>
    );
    return (
      <g opacity={s}>
        {[0, 1, 2].map((i) => {
          const k = (t * 0.45 + i / 3) % 1;
          return (
            <circle
              key={i}
              cx={CX}
              cy={EY}
              r={R4 + 260 * k}
              fill="none"
              stroke={MINUS.c}
              strokeWidth={3}
              opacity={(1 - k) * 0.45}
            />
          );
        })}
        {!front && plusOrb}
        <Orb x={CX} y={EY} r={R4} kind="minus" pal={MINUS} s={1 + 0.025 * Math.sin(t * 3)} />
        {front && plusOrb}
        <Burst x={CX} y={EY} t0={rs} t={t} color={WHITE} seed="endw" n={38} spread={400} life={1.4} />
        <Burst x={CX} y={EY} t0={rs} t={t} color={MINUS.c} seed="endm" n={26} spread={320} life={1.4} />
        <Burst x={CX} y={EY} t0={T("g-orbit")} t={t} color={PLUS.c} seed="endo" n={20} spread={280} life={1.2} />
        <Eq
          y={EQ_Y - 104}
          size={F3}
          big
          k={spring((t - (rs + 0.4)) / 0.6)}
          parts={[
            ["−", MINUS.c],
            [" × ", WHITE],
            ["+", PLUS.c],
            [" = ", WHITE],
            ["−", MINUS.c],
          ]}
        />
        <Eq
          y={EQ_Y}
          k={spring((t - (rs + 1.0)) / 0.6)}
          parts={[
            ["(−2)", MINUS.c],
            [" × ", WHITE],
            ["(+3)", PLUS.c],
            [" = ", WHITE],
            ["−6", MINUS.c],
          ]}
        />
      </g>
    );
  };

  /* ───────── Header: judul + − × + = − ? ───────── */
  const kR = t - rs;
  const solved = t >= rs;
  const check = solved ? spring(kR / 0.5) : 0;
  const qOpacity = solved ? 1 - ramp(t, rs, rs + 0.12) : 1;
  const glitch = t < 0.9 ? (Math.sin(t * 90) > 0.2 ? 1 : 0.3) : 1;
  const hs = (i: number) => spring((t - (T("hdr-in") + 0.13 * i)) / 0.5);
  const titleY0 = 96;
  const titleStep = Math.round(F2 * 1.15);
  const subY = titleY0 + (titleLines.length - 1) * titleStep + 54;

  /* ───────── Render ───────── */
  return (
    <AbsoluteFill style={{ background: data.background, fontFamily: FONT }}>
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <radialGradient id="aurC">
            <stop offset="0" stopColor={PLUS.c} stopOpacity="0.13" />
            <stop offset="1" stopColor={PLUS.c} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurM">
            <stop offset="0" stopColor={MINUS.c} stopOpacity="0.12" />
            <stop offset="1" stopColor={MINUS.c} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurV">
            <stop offset="0" stopColor="#8a5cff" stopOpacity="0.13" />
            <stop offset="1" stopColor="#8a5cff" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="vignette" cx="50%" cy="48%" r="75%">
            <stop offset="0.55" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.6" />
          </radialGradient>
          <linearGradient id="hdr" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={data.background} stopOpacity="0.97" />
            <stop offset="0.75" stopColor={data.background} stopOpacity="0.9" />
            <stop offset="1" stopColor={data.background} stopOpacity="0" />
          </linearGradient>
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

        {/* Latar: aurora + bentuk geometri melayang (parallax) */}
        <g transform={`translate(${CX} 960) scale(${par}) translate(${-CX} -960)`}>
          <ellipse cx={300 + Math.sin(t * 0.13) * 140} cy={520 + Math.sin(t * 0.2) * 60} rx={560} ry={420} fill="url(#aurC)" />
          <ellipse cx={800 + Math.sin(t * 0.1 + 2) * 150} cy={1000 + Math.cos(t * 0.17) * 80} rx={600} ry={460} fill="url(#aurM)" />
          <ellipse cx={540 + Math.cos(t * 0.09) * 200} cy={1500} rx={700} ry={380} fill="url(#aurV)" />
          {shapes.map((sh2, i) => {
            const y = ((((sh2.y - t * sh2.speed) % (H + 240)) + (H + 240)) % (H + 240)) - 120;
            const pts = Array.from({ length: sh2.sides })
              .map((_, j) => {
                const a = (j / sh2.sides) * Math.PI * 2 - Math.PI / 2;
                return `${Math.cos(a) * sh2.size},${Math.sin(a) * sh2.size}`;
              })
              .join(" ");
            return (
              <polygon
                key={i}
                points={pts}
                transform={`translate(${sh2.x + Math.sin(t * 0.3 + i) * 30} ${y}) rotate(${sh2.rot + t * sh2.spin})`}
                fill="none"
                stroke={sh2.useMinus ? MINUS.c : PLUS.c}
                strokeWidth={2}
                opacity={0.12}
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

        {/* Dunia adegan: kamera zoom in/out halus + getaran */}
        <g
          transform={`translate(${CX + sx} ${CY + sy}) rotate(${sh.r}) scale(${cam.s * (1 + sh.z)}) translate(${-cam.x} ${-cam.y})`}
        >
          {hookScene()}
          {meetScene()}
          {groups("c", "plus", PLUS, win(t, T("c-whoosh") - 0.1, T("d-whoosh") + 0.1, 0.4, 0.5))}
          {groups("d", "minus", MINUS, win(t, T("d-whoosh") - 0.1, T("e-whoosh") + 0.1, 0.4, 0.5))}
          {cancelScene()}
          {stairScene()}
          {endScene()}
        </g>

        <rect width={W} height={H} fill="url(#vignette)" />

        {/* Header tetap: judul + − × + = − ? */}
        <g transform={`translate(${sh.x * 0.4} ${sh.y * 0.4})`}>
          <rect width={W} height={HDR_H} fill="url(#hdr)" />
          {titleLines.map((ln, i) => (
            <text
              key={i}
              x={CX}
              y={titleY0 + i * titleStep}
              textAnchor="middle"
              fontSize={F2}
              fontWeight={800}
              fill={WHITE}
              filter="url(#glow)"
            >
              {ln}
            </text>
          ))}
          <text
            x={CX}
            y={subY}
            textAnchor="middle"
            fontSize={F1}
            letterSpacing={1}
            fill={accent}
            opacity={0.85}
          >
            {data.subtitle.toUpperCase()}
          </text>

          <g opacity={glitch}>
            <Orb x={130} y={SYM_Y} r={R2} kind="minus" pal={MINUS} s={hs(0)} />
            <g transform={`translate(270 ${SYM_Y}) scale(${hs(1)})`} filter="url(#glow)">
              <rect x={-32} y={-7} width={64} height={14} rx={7} fill={WHITE} transform="rotate(45)" />
              <rect x={-32} y={-7} width={64} height={14} rx={7} fill={WHITE} transform="rotate(-45)" />
            </g>
            <Orb x={410} y={SYM_Y} r={R2} kind="plus" pal={PLUS} s={hs(2)} />
            <g transform={`translate(550 ${SYM_Y}) scale(${hs(3)})`} filter="url(#glow)">
              <rect x={-32} y={-22} width={64} height={13} rx={6} fill={WHITE} />
              <rect x={-32} y={9} width={64} height={13} rx={6} fill={WHITE} />
            </g>
            <Orb x={690} y={SYM_Y} r={R2} kind="minus" pal={MINUS} s={hs(4)} />

            <g
              transform={`translate(880 ${SYM_Y}) scale(${hs(5) * (1 + 0.05 * Math.sin(t * 5))})`}
              opacity={qOpacity}
            >
              <text
                textAnchor="middle"
                y={F4 * 0.36}
                fontSize={F4}
                fontWeight={900}
                fill={AMBER}
                filter="url(#glowBig)"
              >
                ?
              </text>
            </g>
            {solved && (
              <g transform={`translate(880 ${SYM_Y}) scale(${check})`} filter="url(#glow)">
                <path
                  d="M -46 2 L -12 38 L 50 -42"
                  fill="none"
                  stroke={GOOD}
                  strokeWidth={22}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </g>
            )}
          </g>
        </g>

        {/* Kilatan saat jawaban terungkap */}
        {solved && (
          <rect width={W} height={H} fill="#fff" opacity={0.24 * Math.exp(-kR * 6)} />
        )}
      </svg>
    </AbsoluteFill>
  );
};