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

/* ───────────────────────── Layout & matematika ───────────────────────── */

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 1080;
const H = 1920;
const CX = W / 2;
const CY_CAM = 800;

const F1 = 36;
const F2 = Math.round(F1 * PHI); // 58
const F3 = Math.round(F2 * PHI); // 94

// Grafik: f(x) = x² pada [0, 3]; luas eksak = 9
const PX0 = 130;
const PW = 820;
const BASE_Y = 1010;
const YU = 60; // px per unit y
const EXACT = 9;
const F = (x: number) => x * x;
const ox = (x: number) => PX0 + (x / 3) * PW;
const fy = (x: number) => BASE_Y - F(x) * YU;

const NS = [4, 8, 16, 32, 128];
const RATIO = [1, 2, 2, 2, 4];
const GAPS = [8, 6, 5, 3, 0];
const SWD = [4, 3.5, 3, 2, 0];
const STG = [0, 0.15, 0.1, 0.05, 0.025]; // jeda antar laser untuk potongan ke-n

const SUMS = NS.map((n) => {
  let s = 0;
  for (let k = 0; k < n; k++) s += (F((3 * k) / n) * 3) / n;
  return s;
});

const EQ_Y = 1260;
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
      return lerp(pts[i][1], pts[i + 1][1], easeInOut(ramp(t, pts[i][0], pts[i + 1][0])));
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

const curveRange = (a: number, b: number, step = 0.05) => {
  const pts: string[] = [];
  for (let x = a; x < b - 1e-9; x += step) pts.push(`${ox(x)},${fy(x)}`);
  pts.push(`${ox(b)},${fy(b)}`);
  return pts.join(" ");
};
const CURVE_PTS = curveRange(0, 3);
const CURVE_D = "M " + CURVE_PTS.replace(/ /g, " L ");
const REGION_D = `M ${ox(0)} ${BASE_Y} L ${CURVE_PTS.replace(/ /g, " L ")} L ${ox(3)} ${BASE_Y} Z`;

/* ───────────────────────── Elemen visual ───────────────────────── */

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
      <rect x={hx - 6} y={hy - 6} width={12} height={12} fill={WHITE} transform={`rotate(45 ${hx} ${hy})`} />
    </g>
  );
};

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
  const tScan = T("scan");
  const tDrop = [0, 1, 2, 3].map((k) => T(`drop-${k}`));
  const tRes = [0, 1, 2, 3, 4].map((s) => T(`res${s}`));
  const tCut = [0, ...[1, 2, 3, 4].map((s) => T(`cut${s}`))];
  const tOpen = [0, ...[1, 2, 3, 4].map((s) => T(`open${s}`))];
  const tLim = T("lim");
  const tFin = T("fin");
  const tSweep = T("sweep");
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
    [0, 1, 2, 3, 4].forEach((s) => bump(T(`res${s}`), 1.04, 0.9));
    bump(T("lim"), 1.03, 1.0);
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
  for (let s = 1; s <= 4; s++) if (t >= tOpen[s]) cur = s;
  const N = NS[cur];
  const dxp = PW / N;
  const gap = GAPS[cur];
  const uOpen = cur >= 1 ? easeOut(ramp(t, tOpen[cur], tOpen[cur] + 0.7)) : 1;
  const gk = ramp(t, tLim, tLim + 1.2); // transisi ke hijau
  const tResCur = tRes[cur];

  const nodes: React.ReactNode[] = [];

  /* ───────── Persegi panjang ───────── */
  const rects: React.ReactNode[] = [];
  for (let k = 0; k < N; k++) {
    const own = F((3 * k) / N) * YU;
    let h = own;
    let yOff = 0;
    let vis = 1;
    if (cur === 0) {
      const tl = tDrop[k];
      if (t < tl - 0.5) continue;
      if (t < tl) {
        const u = ramp(t, tl - 0.5, tl);
        yOff = -700 * (1 - u * u);
        vis = clamp01((t - (tl - 0.5)) / 0.15);
      } else {
        const kk = t - tl;
        yOff = -14 * Math.exp(-kk * 5) * Math.abs(Math.sin(kk * 13));
      }
    } else {
      const parentH = F((3 * Math.floor(k / RATIO[cur])) / NS[cur - 1]) * YU;
      h = lerp(parentH, own, uOpen);
    }
    const dtF = t - tResCur - (k / N) * 0.6;
    const fl = t >= tResCur && dtF > 0 ? Math.exp(-dtF * 4) : 0;
    const col = mixHex(ACC, ACC2, k / Math.max(1, N - 1));
    const hh = Math.max(h, 2.5);
    rects.push(
      <rect
        key={`r${k}`}
        x={PX0 + k * dxp + gap / 2}
        y={BASE_Y - hh + yOff}
        width={Math.max(0.5, dxp - gap)}
        height={hh}
        rx={cur >= 3 ? 2 : 8}
        fill={col}
        fillOpacity={cur === 4 ? 0.36 + 0.3 * fl : 0.14 + 0.3 * fl}
        stroke={SWD[cur] > 0 ? mixHex(col, WHITE, 0.3 + 0.6 * fl) : "none"}
        strokeWidth={SWD[cur]}
        opacity={vis * (1 - 0.15 * gk)}
      />,
    );
  }

  /* ───────── Laser pemotong ───────── */
  const lasers: React.ReactNode[] = [];
  if (cur < 4 && t >= tCut[cur + 1]) {
    const n = cur + 1;
    for (let j = 0; j < N; j++) {
      const tl = tCut[n] + j * STG[n];
      const p = easeInOut(ramp(t, tl, tl + 0.25));
      if (p <= 0.001) continue;
      const xc = PX0 + (j + 0.5) * dxp;
      const topY = BASE_Y - F((3 * j) / N) * YU;
      const col = mixHex(ACC, ACC2, j / Math.max(1, N - 1));
      if (t < tl + 0.35) {
        lasers.push(
          <Laser key={`l${j}`} x1={xc} y1={topY - 30} x2={xc} y2={BASE_Y + 12} p={p} color={col} />,
        );
        if (N <= 16) {
          lasers.push(
            <Shards key={`s${j}`} x={xc} y={BASE_Y - 40} t0={tl + 0.12} t={t} color={col} seed={`ls${n}${j}`} n={8} spread={80} life={0.7} />,
          );
        }
      } else {
        lasers.push(
          <line key={`sp${j}`} x1={xc} y1={topY} x2={xc} y2={BASE_Y} stroke={WHITE} strokeWidth={2} opacity={0.85} filter="url(#glow)" />,
        );
      }
    }
  }

  /* ───────── Pemindai awal ───────── */
  const scanE = easeInOut(ramp(t, tScan, tScan + 1.8));
  const scanVis = ramp(t, tScan - 0.1, tScan) * (1 - ramp(t, tScan + 1.8, tScan + 2.5));
  const xs = 3 * scanE;

  /* ───────── Sapuan akhir ───────── */
  const sp = ramp(t, tSweep, tSweep + 1.8);
  const sweepNode =
    sp > 0 && sp < 1 ? (
      <polyline
        points={curveRange(Math.max(0, 3 * easeInOut(sp) - 0.6), Math.max(0.05, 3 * easeInOut(sp)), 0.03)}
        fill="none"
        stroke={WHITE}
        strokeWidth={8}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={Math.sin(Math.PI * sp)}
        filter="url(#glowBig)"
      />
    ) : null;

  /* ───────── Angka ───────── */
  const sumNow = track(t, [
    [tDrop[3] - 0.3, 0],
    [tRes[0], SUMS[0]],
    [tOpen[1], SUMS[0]],
    [tRes[1], SUMS[1]],
    [tOpen[2], SUMS[1]],
    [tRes[2], SUMS[2]],
    [tOpen[3], SUMS[2]],
    [tRes[3], SUMS[3]],
    [tOpen[4], SUMS[3]],
    [tRes[4], SUMS[4]],
    [tLim, SUMS[4]],
    [tFin, EXACT],
  ]);
  const missNow = Math.max(0, EXACT - sumNow);
  const numOp =
    ramp(t, tDrop[0] - 0.2, tDrop[0] + 0.3) * (1 - ramp(t, tFin - 0.2, tFin + 0.3));
  const qOp = 1 - ramp(t, tDrop[0] - 0.2, tDrop[0] + 0.3);
  const finOp = ramp(t, tFin, tFin + 0.4);

  /* ───────── Persamaan bawah ───────── */
  const dxStr = (n: number) => parseFloat((3 / n).toFixed(3)).toString();
  const eqSteps: { t: number; parts: [string, string][] }[] = [
    { t: 0, parts: [["y = x²", ACC2], ["  on  ", WHITE], ["[0, 3]", ACC]] },
    { t: tDrop[0] - 0.5, parts: [["n = 4", ACC], ["  ·  Δx = " + dxStr(4), WHITE]] },
    { t: tOpen[1], parts: [["n = 8", ACC], ["  ·  Δx = " + dxStr(8), WHITE]] },
    { t: tOpen[2], parts: [["n = 16", ACC], ["  ·  Δx = " + dxStr(16), WHITE]] },
    { t: tOpen[3], parts: [["n = 32", ACC], ["  ·  Δx = " + dxStr(32), WHITE]] },
    { t: tOpen[4], parts: [["n = 128", ACC], ["  ·  Δx = " + dxStr(128), WHITE]] },
    { t: tLim, parts: [["n → ∞", GOOD], ["  ·  Δx → 0", WHITE]] },
    { t: tFin, parts: [["Σ f·Δx", ACC], ["  →  ", WHITE], ["9", GOOD]] },
  ];
  let eqIdx = 0;
  eqSteps.forEach((s, i) => {
    if (t >= s.t) eqIdx = i;
  });
  const eqCur = eqSteps[eqIdx];

  const regionCol = mixHex(AMBER, GOOD, gk);
  const curveCol = mixHex(ACC, GOOD, gk);

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
          <clipPath id="scanClip">
            <rect x={PX0 - 4} y={400} width={PW * scanE + 8} height={BASE_Y - 396} />
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
          {/* sumbu */}
          <g stroke={WHITE} strokeOpacity={0.55} strokeWidth={3} strokeLinecap="round">
            <line x1={PX0 - 12} y1={BASE_Y} x2={PX0 + PW + 14} y2={BASE_Y} />
            <line x1={PX0} y1={BASE_Y + 12} x2={PX0} y2={430} />
          </g>
          {[0, 1, 2, 3].map((v) => (
            <g key={`xt${v}`}>
              <line x1={ox(v)} y1={BASE_Y} x2={ox(v)} y2={BASE_Y + 12} stroke={WHITE} strokeOpacity={0.55} strokeWidth={3} />
              <text x={ox(v)} y={BASE_Y + 48} textAnchor="middle" fontSize={30} fontWeight={700} fill={WHITE} opacity={0.7}>
                {v}
              </text>
            </g>
          ))}
          {[0, 3, 6, 9].map((v) => (
            <g key={`yt${v}`}>
              <line x1={PX0 - 12} y1={BASE_Y - v * YU} x2={PX0} y2={BASE_Y - v * YU} stroke={WHITE} strokeOpacity={0.55} strokeWidth={3} />
              <text x={PX0 - 22} y={BASE_Y - v * YU + 10} textAnchor="end" fontSize={30} fontWeight={700} fill={WHITE} opacity={0.7}>
                {v}
              </text>
            </g>
          ))}

          {/* daerah di bawah kurva (celah amber, berubah hijau di akhir) */}
          <path
            d={REGION_D}
            fill={regionCol}
            fillOpacity={0.14 + 0.2 * gk + 0.1 * Math.sin(t * 3) * (1 - ramp(t, tDrop[0] - 0.5, tDrop[0]))}
          />

          {/* pemindai awal */}
          {scanVis > 0.003 && (
            <g opacity={scanVis}>
              <g clipPath="url(#scanClip)">
                <path d={REGION_D} fill={ACC} fillOpacity={0.32} />
              </g>
              <line x1={ox(xs)} y1={fy(xs)} x2={ox(xs)} y2={BASE_Y} stroke={WHITE} strokeWidth={3} filter="url(#glow)" />
              <rect
                x={ox(xs) - 8}
                y={fy(xs) - 8}
                width={16}
                height={16}
                fill={WHITE}
                transform={`rotate(45 ${ox(xs)} ${fy(xs)})`}
                filter="url(#glowBig)"
              />
            </g>
          )}

          {/* persegi panjang */}
          <g filter="url(#glow)">{rects}</g>
          {lasers}

          {/* kurva */}
          <path d={CURVE_D} fill="none" stroke={curveCol} strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" filter="url(#glowBig)" />
          {sweepNode}

          {/* percikan penanda */}
          {[1, 2, 3, 4].map((s) => (
            <Shards key={`op${s}`} x={CX} y={820} t0={tOpen[s]} t={t} color={ACC} seed={`op${s}`} n={16} spread={300} life={1.0} />
          ))}
          <Shards x={CX} y={820} t0={tLim} t={t} color={GOOD} seed="lim" n={22} spread={360} life={1.2} />
          <Shards x={CX} y={820} t0={tFin} t={t} color={WHITE} seed="fw" n={34} spread={420} life={1.4} />
          <Shards x={CX} y={820} t0={tFin} t={t} color={GOOD} seed="fg" n={24} spread={330} life={1.4} />
          <Shards x={CX} y={820} t0={tEnd} t={t} color={ACC2} seed="en" n={18} spread={300} life={1.2} />

          {/* angka SUM / MISSING */}
          <g opacity={numOp}>
            <text x={300} y={1100} textAnchor="middle" fontSize={30} fontWeight={700} letterSpacing={4} fill={ACC}>
              SUM
            </text>
            <text x={300} y={1180} textAnchor="middle" fontSize={F3} fontWeight={900} fill={WHITE} filter="url(#glow)">
              {sumNow.toFixed(2)}
            </text>
            <text x={780} y={1100} textAnchor="middle" fontSize={30} fontWeight={700} letterSpacing={4} fill={AMBER}>
              MISSING
            </text>
            <text x={780} y={1180} textAnchor="middle" fontSize={F3} fontWeight={900} fill={mixHex(AMBER, GOOD, gk)} filter="url(#glow)">
              {missNow.toFixed(2)}
            </text>
          </g>
          {qOp > 0.003 && (
            <g opacity={qOp} transform={`translate(${CX} 1160) scale(${1 + 0.04 * Math.sin(t * 5)})`}>
              <text textAnchor="middle" fontSize={F3} fontWeight={900} fill={AMBER} filter="url(#glowBig)">
                AREA = ?
              </text>
            </g>
          )}
          {finOp > 0.003 && (
            <g opacity={finOp} transform={`translate(${CX} 1165) scale(${0.8 + 0.2 * spring((t - tFin) / 0.6)})`}>
              <text textAnchor="middle" fontSize={F3} fontWeight={900} fill={GOOD} filter="url(#glowBig)">
                AREA = 9
              </text>
            </g>
          )}
        </g>

        <rect width={W} height={H} fill="url(#vignette)" />

        {/* Header: tampil sejak frame pertama */}
        <g transform={`translate(${sh.x * 0.4} ${sh.y * 0.4})`}>
          <text x={CX} y={175} textAnchor="middle" fontSize={F2} fontWeight={800} fill={WHITE} filter="url(#glow)">
            {data.title.toUpperCase()}
          </text>
          <text x={CX} y={232} textAnchor="middle" fontSize={F1} letterSpacing={1} fill={ACC} opacity={0.85}>
            {data.subtitle.toUpperCase()}
          </text>

          <g
            transform={`translate(${CX} ${EQ_Y}) scale(${0.8 + 0.2 * spring((t - eqCur.t) / 0.45)})`}
            opacity={ramp(t, eqCur.t, eqCur.t + 0.15)}
          >
            <text textAnchor="middle" fontSize={52} fontWeight={800} filter="url(#glow)">
              {eqCur.parts.map(([s, c], i) => (
                <tspan key={i} fill={c}>
                  {s}
                </tspan>
              ))}
            </text>
          </g>
        </g>

        {/* Kilatan pada momen kunci */}
        {[tRes[0], tRes[4]].map((tt, i) =>
          t >= tt ? <rect key={i} width={W} height={H} fill="#fff" opacity={0.08 * Math.exp(-(t - tt) * 6)} /> : null,
        )}
        {t >= tFin && <rect width={W} height={H} fill="#fff" opacity={0.16 * Math.exp(-(t - tFin) * 6)} />}
      </svg>
    </AbsoluteFill>
  );
};