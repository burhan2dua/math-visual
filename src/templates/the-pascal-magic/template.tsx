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
  oddColor: string; // #rrggbb
  evenColor: string; // #rrggbb
  numberRows: number; // baris yang ditampilkan dengan angka (8)
  totalRows: number; // total baris fraktal (kelipatan 4, maks 40)
  durationInSeconds: number;
  bpm: number;
  audio?: string;
  cues: Cue[];
};

/* ───────────────────────── Golden ratio layout ───────────────────────── */

const PHI = (1 + Math.sqrt(5)) / 2;
const W = 1080;
const H = 1920;
const CX = W / 2;

const HDR_H = Math.round(H / PHI ** 3); // 453
const CY = Math.round(HDR_H + (H - HDR_H) / PHI ** 2); // 1013
const SYM_Y = Math.round(HDR_H * 0.7); // 317
const EQ_Y = Math.round(H - H / PHI ** 4); // 1640

// Skala tipografi: setiap tingkat × φ
const F1 = 36;
const F2 = 58;
const F3 = 94;
const F4 = 152;

// Blok segitiga selalu selebar SPAN dan setinggi HGT (zoom otomatis lewat jumlah baris)
const SPAN = 880;
const HGT = (SPAN * Math.sqrt(3)) / 2;
const HR = 50; // radius disc header

const AMBER = "#ffd34d";
const FONT =
  '"Orbitron", "Rajdhani", "Segoe UI", system-ui, -apple-system, sans-serif';

/* ───────────────────────── Util ───────────────────────── */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const ramp = (t: number, a: number, b: number) => clamp01((t - a) / (b - a));
const spring = (k: number) =>
  k <= 0 ? 0 : 1 - Math.exp(-13 * k) * Math.cos(19 * k);

/** Campur dua warna #rrggbb, hasil #rrggbb */
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

const popcount = (n: number) => {
  let c = 0;
  let v = n;
  while (v) {
    c += v & 1;
    v >>= 1;
  }
  return c;
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
        r={14 + spread * 0.7 * e}
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
        const py = y + Math.sin(a) * d + 22 * k * k;
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

const Disc: React.FC<{
  x: number;
  y: number;
  r: number;
  stroke: string;
  fill: string;
  fo: number;
  label: string;
  fs: number;
  s?: number;
  o?: number;
}> = ({ x, y, r, stroke, fill, fo, label, fs, s = 1, o = 1 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o}>
    <circle r={r} fill={fill} fillOpacity={fo} />
    <circle r={r} fill="none" stroke={stroke} strokeWidth={4} filter="url(#glow)" />
    <text
      textAnchor="middle"
      y={fs * 0.36}
      fontSize={fs}
      fontWeight={800}
      fill="#fff"
    >
      {label}
    </text>
  </g>
);

const Plus: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#glow)" fill="#fff">
    <rect x={-26} y={-6} width={52} height={12} rx={6} />
    <rect x={-6} y={-26} width={12} height={52} rx={6} />
  </g>
);

const Equals: React.FC<{ x: number; y: number; s: number }> = ({ x, y, s }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`} filter="url(#glow)" fill="#fff">
    <rect x={-26} y={-18} width={52} height={11} rx={5} />
    <rect x={-26} y={7} width={52} height={11} rx={5} />
  </g>
);

/* ───────────────────────── Template ───────────────────────── */

export const Template = ({ data }: { data: TemplateData }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const NR = data.numberRows;
  const NT = data.totalRows;
  const ACC = data.accent;
  const ODD = data.oddColor;
  const ODD_L = mixHex(ODD, "#ffffff", 0.45);
  const EVEN = data.evenColor;
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

  // waktu kemunculan tiap baris
  const rowT = useMemo(
    () =>
      Array.from({ length: NT }, (_, n) =>
        T(`${n < NR ? "a" : "g"}-row-${n}`),
      ),
    [T, NR, NT],
  );

  // tabel Pascal (angka dipakai untuk baris berangka)
  const vals = useMemo(() => {
    const rows: number[][] = [];
    for (let n = 0; n < NT; n++) {
      const r: number[] = [];
      for (let k = 0; k <= n; k++) {
        r.push(k === 0 || k === n ? 1 : rows[n - 1][k - 1] + rows[n - 1][k]);
      }
      rows.push(r);
    }
    return rows;
  }, [NT]);

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
    const add = (tt: number, x: number, y: number, s: number) =>
      k.push({ t: tt, x, y, s });
    add(0, CX, CY, 1);

    const ad = T("a-done");
    add(ad - 0.2, CX, CY, 1);
    add(ad + 0.3, CX, CY, 1.05);
    add(ad + 2.2, CX, CY, 1);

    const ss = T("sweep-start");
    const se = T("sweep-end");
    add(ss - 0.3, CX, CY, 1);
    add(ss + 0.6, CX, CY - 50, 1.05);
    add(se - 0.2, CX, CY + 50, 1.05);
    add(se + 1.6, CX, CY, 1);

    const ef = T("even-fade");
    add(ef - 0.2, CX, CY, 1);
    add(ef + 0.4, CX, CY, 1.04);
    add(ef + 2.0, CX, CY, 1);

    const di = T("dissolve");
    add(di - 0.2, CX, CY, 1);
    add(di + 0.4, CX, CY, 1.04);
    add(di + 2.0, CX, CY, 1);

    const mo = T("morph");
    add(mo - 0.2, CX, CY, 1);
    add(mo + 0.3, CX, CY, 1.08);
    add(mo + 2.4, CX, CY, 1);

    const r1 = T("rec-1");
    const r2 = T("rec-2");
    const r3 = T("rec-3");
    const fin = T("finale");
    add(r1 - 0.3, CX, CY, 1);
    add(r1 + 0.9, CX, CY, 1.03);
    add(r2 + 0.9, CX, CY, 1.05);
    add(r3 + 0.9, CX, CY, 1.07);
    add(fin - 0.2, CX, CY, 1.07);
    add(fin + 0.3, CX, CY, 1.08);
    add(fin + 3.5, CX, CY, 1);
    add(data.durationInSeconds, CX, CY, 0.95);

    return k.sort((a, b) => a.t - b.t);
  }, [T, data.durationInSeconds]);

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
        useOdd: i % 2 === 1,
      })),
    [],
  );
  const titleLines = useMemo(() => wrapTitle(data.title, 20), [data.title]);

  /* ── Waktu kunci ── */
  const tSS = T("sweep-start");
  const tSE = T("sweep-end");
  const tEF = T("even-fade");
  const tDI = T("dissolve");
  const tMO = T("morph");
  const tAD = T("a-done");
  const tFin = T("finale");
  const tR1 = T("rec-1");
  const tR2 = T("rec-2");
  const tR3 = T("rec-3");

  /* ── Kamera + getaran ── */
  const cam = camAt(t, kfs);
  const sh = shakeAt(t, hits);
  const sx = sh.x + Math.sin(t * 0.7) * 3;
  const sy = sh.y + Math.cos(t * 0.9) * 3;
  const camS = cam.s + 0.008 * Math.sin(t * 0.5);
  const par = 1 + (camS - 1) * 0.25;

  /* ── Layout segitiga: jumlah baris efektif N menentukan ukuran sel (zoom out halus) ── */
  let N = NR;
  for (let n = NR; n < NT; n++) {
    N += easeInOut(ramp(t, rowT[n] - 0.25, rowT[n] + 0.55));
  }
  const p = SPAN / N;
  const h = p * 0.8660254;
  const TOPY = CY - HGT / 2 + (2 * h) / 3;
  const cx = (n: number, k: number) => CX + (k - n / 2) * p;
  const cyy = (n: number) => TOPY + n * h;
  const sw = Math.max(1.3, p * 0.04);

  const triPts = `0,${-(2 * h) / 3} ${-p * 0.46},${h / 3} ${p * 0.46},${h / 3}`;
  const tri = (
    key: string,
    x: number,
    y: number,
    sc: number,
    op: number,
    stroke: string,
    fill: string,
    fo: number,
  ) => (
    <g key={key} transform={`translate(${x} ${y}) scale(${sc})`} opacity={op}>
      <polygon
        points={triPts}
        fill={fill}
        fillOpacity={fo}
        stroke={stroke}
        strokeWidth={sw}
        strokeLinejoin="round"
      />
    </g>
  );

  /* ── Sel, angka, sinar penjumlahan, percikan ── */
  const cells: React.ReactNode[] = [];
  const texts: React.ReactNode[] = [];
  const rays: React.ReactNode[] = [];
  const bursts: React.ReactNode[] = [];
  let built = 0;
  let oddCnt = 0;
  let allCnt = 0;

  for (let n = 0; n < NT; n++) {
    if (t < rowT[n] - 0.6) break;
    if (t >= rowT[n]) {
      built = n + 1;
      oddCnt += 2 ** popcount(n);
      allCnt += n + 1;
    }

    for (let k = 0; k <= n; k++) {
      const odd = (n & k) === k; // Lucas: C(n,k) ganjil
      const x = cx(n, k);
      const y = cyy(n);

      if (n < NR) {
        /* sinar: dua angka di atas bertemu di angka baru */
        if (n >= 1) {
          const prog = ramp(t, rowT[n] - 0.55, rowT[n]);
          const op = 1 - ramp(t, rowT[n] + 0.15, rowT[n] + 1.0);
          if (prog > 0 && op > 0.01) {
            [k - 1, k].forEach((pk) => {
              if (pk < 0 || pk > n - 1) return;
              const px = cx(n - 1, pk);
              const py = cyy(n - 1);
              rays.push(
                <line
                  key={`ray${n}-${k}-${pk}`}
                  x1={px}
                  y1={py}
                  x2={px + (x - px) * prog}
                  y2={py + (y - py) * prog}
                  stroke={ACC}
                  strokeWidth={3}
                  strokeLinecap="round"
                  opacity={op * 0.9}
                />,
              );
            });
          }
        }

        const tA = rowT[n] + k * 0.07;
        const ap = spring((t - tA) / 0.5);
        if (ap <= 0.001) continue;

        const ts = tSS + (n / (NR - 1)) * (tSE - tSS - 0.8);
        const sp = ramp(t, ts, ts + 0.6);
        const pulse = t >= tAD ? 1 + 0.07 * Math.exp(-(t - tAD) * 5) : 1;
        const sweepPop = 1 + 0.16 * Math.sin(Math.PI * sp);
        let sc = ap * pulse * sweepPop;
        let fade = 1;

        if (!odd) {
          if (t >= tEF) {
            bursts.push(
              <Burst
                key={`ev${n}-${k}`}
                x={x}
                y={y}
                t0={tEF + n * 0.05}
                t={t}
                color={EVEN}
                seed={`ev${n}-${k}`}
                n={8}
                spread={60}
                life={0.9}
              />,
            );
          }
          const ef = ramp(t, tEF, tEF + 1.6);
          fade = 1 - easeInOut(ef);
          sc *= 1 - 0.25 * ef;
        }
        if (fade <= 0.003) continue;

        const m = easeInOut(ramp(t, tMO + n * 0.05, tMO + n * 0.05 + 0.9));
        const strokeCol = odd ? mixHex(ACC, ODD_L, sp) : mixHex(ACC, EVEN, sp);
        const fillCol = odd ? mixHex(ACC, ODD, sp) : mixHex(ACC, EVEN, sp);
        const fo = odd ? 0.1 + 0.5 * sp : 0.1;

        if (m < 0.999) {
          cells.push(
            <g
              key={`c${n}-${k}`}
              transform={`translate(${x} ${y}) scale(${sc * (1 - 0.3 * m)})`}
              opacity={(1 - m) * fade}
            >
              <circle
                r={p * 0.42}
                fill={fillCol}
                fillOpacity={fo}
                stroke={strokeCol}
                strokeWidth={Math.max(2, p * 0.04)}
              />
            </g>,
          );
        }
        if (odd && m > 0.001) {
          cells.push(
            tri(`t${n}-${k}`, x, y, sc * (0.6 + 0.4 * m), m, ODD_L, ODD, 0.6),
          );
        }

        const numDis = odd
          ? easeInOut(ramp(t, tDI + n * 0.08, tDI + n * 0.08 + 0.9))
          : 0;
        if (numDis < 0.999) {
          const fs = p * 0.38;
          texts.push(
            <g
              key={`n${n}-${k}`}
              transform={`translate(${x} ${y}) scale(${sc * (1 - numDis)})`}
              opacity={fade * (1 - numDis)}
            >
              <text
                textAnchor="middle"
                y={fs * 0.36}
                fontSize={fs}
                fontWeight={800}
                fill={WHITE}
              >
                {vals[n][k]}
              </text>
            </g>,
          );
        }
      } else {
        /* baris fraktal: hanya sel ganjil (yang genap menjadi lubang) */
        if (!odd) continue;
        const tA = rowT[n] + Math.abs(k - n / 2) * 0.018;
        const ap = spring((t - tA) / 0.45);
        if (ap <= 0.001) continue;
        const flash = 1 - ramp(t, tA, tA + 0.9);
        const shim =
          t >= tFin
            ? clamp01(1 - (t - tFin) / 6) *
              Math.max(0, Math.sin((t - tFin) * 4 - n * 0.4))
            : 0;
        const glowK = Math.max(flash * 0.9, shim * 0.8);
        cells.push(
          tri(
            `g${n}-${k}`,
            x,
            y,
            ap * (1 + 0.12 * shim),
            clamp01(ap),
            mixHex(ODD_L, WHITE, glowK),
            ODD,
            0.55 + 0.3 * flash,
          ),
        );
      }
    }
  }

  /* shimmer juga untuk sel ganjil dari baris berangka setelah morph */
  // (baris berangka sudah ikut berkilau lewat warna stroke tetap; cukup untuk efek halus)

  /* ── Pita cahaya penyapu ── */
  const bandOp =
    ramp(t, tSS - 0.2, tSS + 0.3) * (1 - ramp(t, tSE, tSE + 0.5));
  const bandY =
    cyy(0) + ((t - tSS - 0.2) / (tSE - tSS - 0.8)) * (NR - 1) * h;

  /* ── Garis tepi rekursif ── */
  const tri3 = (r0: number, c0: number, s: number) => {
    const r1 = r0 + s - 1;
    return {
      ax: cx(r0, c0),
      ay: cyy(r0) - (2 * h) / 3,
      lx: cx(r1, c0) - p / 2,
      ly: cyy(r1) + h / 3,
      rx: cx(r1, c0 + s - 1) + p / 2,
    };
  };
  const recs: React.ReactNode[] = [];
  const addStage = (
    list: [number, number][],
    size: number,
    t0: number,
    step: number,
    color: string,
    nextT: number,
    key: string,
  ) => {
    list.forEach(([r0, c0], j) => {
      const ts = t0 + j * step;
      const prog = easeInOut(ramp(t, ts, ts + 0.9));
      if (prog <= 0.001) return;
      const g = tri3(r0, c0, size);
      const dim = 1 - 0.78 * ramp(t, nextT, nextT + 0.8);
      const gone = 1 - ramp(t, tFin, tFin + 1.2);
      if (dim * gone <= 0.01) return;
      const pw = 1.2 * Math.sin(t * 3 + j);
      recs.push(
        <polygon
          key={`${key}${j}`}
          points={`${g.ax},${g.ay} ${g.lx},${g.ly} ${g.rx},${g.ly}`}
          fill="none"
          stroke={color}
          strokeWidth={4.5 + pw}
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="1 1"
          strokeDashoffset={1 - prog}
          opacity={dim * gone}
        />,
      );
    });
  };
  const s2 = NT / 2;
  const s4 = NT / 4;
  const halves: [number, number][] = [
    [0, 0],
    [s2, 0],
    [s2, s2],
  ];
  const quarters: [number, number][] = [];
  halves.forEach(([r0, c0]) => {
    quarters.push([r0, c0], [r0 + s4, c0], [r0 + s4, c0 + s4]);
  });
  addStage([[0, 0]], NT, tR1, 0, AMBER, tR2, "r1-");
  addStage(halves, s2, tR2, 0.25, ACC, tR3, "r2-");
  addStage(quarters, s4, tR3, 0.15, WHITE, tFin, "r3-");

  /* ── Header ── */
  const hs = (i: number) => spring((t - (T("hdr-in") + 0.13 * i)) / 0.5);
  const titleY0 = 96;
  const titleStep = Math.round(F2 * 1.15);
  const subY = titleY0 + (titleLines.length - 1) * titleStep + 54;

  const nStar = built - 1;
  const ruleOn = nStar >= 2 && nStar < NR;
  const ruleOp = ruleOn ? 1 - ramp(t, tSS, tSS + 0.5) : 0;
  const kk = Math.floor(nStar / 2);
  const ra = ruleOn ? vals[nStar - 1][kk - 1] : 0;
  const rb = ruleOn ? vals[nStar - 1][kk] : 0;
  const rc = ruleOn ? vals[nStar][kk] : 0;
  const rulePop = ruleOn ? spring((t - rowT[nStar]) / 0.5) : 0;
  const legOp = ramp(t, tSS + 0.2, tSS + 0.8);
  const cntPop = built > 0 ? spring((t - rowT[built - 1]) / 0.5) : 0;
  const footOp = ramp(t, tMO + 1.0, tMO + 1.6);

  /* ───────── Render ───────── */
  return (
    <AbsoluteFill style={{ background: data.background, fontFamily: FONT }}>
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}

      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <radialGradient id="aurC">
            <stop offset="0" stopColor={ACC} stopOpacity="0.12" />
            <stop offset="1" stopColor={ACC} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurM">
            <stop offset="0" stopColor={ODD} stopOpacity="0.2" />
            <stop offset="1" stopColor={ODD} stopOpacity="0" />
          </radialGradient>
          <radialGradient id="aurV">
            <stop offset="0" stopColor="#8a5cff" stopOpacity="0.12" />
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
          <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={ACC} stopOpacity="0" />
            <stop offset="0.5" stopColor={ACC} stopOpacity="0.28" />
            <stop offset="1" stopColor={ACC} stopOpacity="0" />
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
                stroke={s.useOdd ? ODD_L : ACC}
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

        {/* Dunia adegan: kamera zoom halus + getaran */}
        <g
          transform={`translate(${CX + sx} ${CY + sy}) rotate(${sh.r}) scale(${camS * (1 + sh.z)}) translate(${-cam.x} ${-cam.y})`}
        >
          {/* pita penyapu */}
          {bandOp > 0.01 && (
            <g opacity={bandOp}>
              <rect x={CX - 540} y={bandY - 90} width={1080} height={180} fill="url(#band)" />
              <line
                x1={CX - 470}
                x2={CX + 470}
                y1={bandY}
                y2={bandY}
                stroke={WHITE}
                strokeWidth={4}
                strokeLinecap="round"
                filter="url(#glow)"
              />
            </g>
          )}

          <g filter="url(#glow)">{rays}</g>
          <g filter="url(#glow)">{cells}</g>
          <g>{texts}</g>

          {/* garis frontier baris baru saat fraktal tumbuh */}
          {NT > NR &&
            rowT.map((rt, n) => {
              if (n < NR) return null;
              const d = t - rt;
              if (d < 0 || d > 0.7) return null;
              const half = (n * p) / 2 + p / 2;
              return (
                <line
                  key={`fr${n}`}
                  x1={CX - half}
                  x2={CX + half}
                  y1={cyy(n) + h / 3}
                  y2={cyy(n) + h / 3}
                  stroke={WHITE}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  opacity={(1 - d / 0.7) * 0.9}
                  filter="url(#glow)"
                />
              );
            })}

          <g filter="url(#glow)">{bursts}</g>

          <g filter="url(#glowBig)">{recs}</g>

          {/* percikan penanda */}
          <Burst x={CX} y={CY} t0={tAD} t={t} color={ACC} seed="ad" n={26} spread={380} life={1.3} />
          <Burst x={CX} y={CY} t0={tMO} t={t} color={WHITE} seed="mo" n={34} spread={400} life={1.3} />
          <Burst x={CX} y={CY} t0={tMO} t={t} color={ODD_L} seed="mo2" n={22} spread={300} life={1.3} />
          <Burst x={CX} y={CY} t0={tFin} t={t} color={WHITE} seed="fw" n={40} spread={440} life={1.5} />
          <Burst x={CX} y={CY} t0={tFin} t={t} color={ODD_L} seed="fo" n={28} spread={340} life={1.5} />
        </g>

        <rect width={W} height={H} fill="url(#vignette)" />

        {/* Header tetap */}
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
              opacity={hs(0)}
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
            fill={ACC}
            opacity={0.85 * clamp01(hs(1))}
          >
            {data.subtitle.toUpperCase()}
          </text>

          {/* aturan penjumlahan: [a] + [b] = [c] */}
          {ruleOp > 0.01 && (
            <g opacity={ruleOp}>
              <Disc x={140} y={SYM_Y} r={HR} stroke={ACC} fill={ACC} fo={0.1} label={`${ra}`} fs={44} s={rulePop} />
              <Plus x={262} y={SYM_Y} s={rulePop} />
              <Disc x={384} y={SYM_Y} r={HR} stroke={ACC} fill={ACC} fo={0.1} label={`${rb}`} fs={44} s={rulePop} />
              <Equals x={506} y={SYM_Y} s={rulePop} />
              <Disc x={628} y={SYM_Y} r={HR} stroke={ACC} fill={ACC} fo={0.1} label={`${rc}`} fs={44} s={rulePop} />
            </g>
          )}

          {/* legenda ganjil / genap */}
          {legOp > 0.01 && (
            <g opacity={legOp}>
              <Disc x={190} y={SYM_Y - 14} r={HR} stroke={ODD_L} fill={ODD} fo={0.6} label="3" fs={44} />
              <text x={190} y={SYM_Y + 82} textAnchor="middle" fontSize={F1} fontWeight={700} fill={ODD_L} filter="url(#glow)">
                ODD
              </text>
              <Disc x={450} y={SYM_Y - 14} r={HR} stroke={EVEN} fill={EVEN} fo={0.1} label="2" fs={44} />
              <text x={450} y={SYM_Y + 82} textAnchor="middle" fontSize={F1} fontWeight={700} fill={EVEN} filter="url(#glow)">
                EVEN
              </text>
            </g>
          )}

          {/* penghitung baris */}
          {built > 0 && (
            <g transform={`translate(880 ${SYM_Y}) scale(${cntPop})`}>
              <text
                textAnchor="middle"
                y={F4 * 0.36}
                fontSize={F4}
                fontWeight={900}
                fill={WHITE}
                filter="url(#glowBig)"
              >
                {built}
              </text>
              <text
                textAnchor="middle"
                y={F4 * 0.36 + 56}
                fontSize={F1}
                fontWeight={700}
                fill={ACC}
                opacity={0.85}
              >
                ROWS
              </text>
            </g>
          )}
        </g>

        {/* Footer: sel ganjil / total sel */}
        {footOp > 0.01 && (
          <g transform={`translate(${sh.x * 0.4} ${sh.y * 0.4})`} opacity={footOp}>
            <text
              x={CX}
              y={EQ_Y}
              textAnchor="middle"
              fontSize={F3}
              fontWeight={800}
              filter="url(#glow)"
            >
              <tspan fill={ODD_L}>{oddCnt}</tspan>
              <tspan fill={WHITE}>{` / ${allCnt}`}</tspan>
            </text>
            <text
              x={CX}
              y={EQ_Y + 56}
              textAnchor="middle"
              fontSize={F1}
              fontWeight={700}
              fill={WHITE}
              opacity={0.6}
            >
              ODD / ALL
            </text>
          </g>
        )}

        {/* Kilatan finale */}
        {t >= tFin && (
          <rect width={W} height={H} fill="#fff" opacity={0.2 * Math.exp(-(t - tFin) * 5)} />
        )}
      </svg>
    </AbsoluteFill>
  );
};