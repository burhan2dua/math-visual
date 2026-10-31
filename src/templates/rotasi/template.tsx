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

type Scene = [number, number];

type RotasiData = {
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
  sound?: unknown; // dibaca oleh generator audio, bukan template
  pads?: unknown[]; // dibaca oleh generator audio, bukan template
  fullTurn: number;
  scenes: {
    intro: Scene;
    angle: Scene;
    split: Scene;
    divisors: Scene;
    compare: Scene;
    orbit: Scene;
    factors: Scene;
  };
  captions: {
    intro: string;
    start: string;
    angle: string;
    split: string;
    divisors: string;
    compare: string;
    compareScore: string;
    compareCount: string;
    orbit: string;
    factorsHow: string;
    final: string;
  };
  stops: Array<{ angle: number; label: string }>;
  splits: number[];
  compare: number[];
  divisors: number[];
  orbit: { stepDegrees: number };
  factors: Array<{ base: number; exp: number }>;
  cues: Cue[];
};

const WHITE = "#f2ffff";
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

const fmt = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(2));
const fmt1 = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));

const countDivisors = (n: number) => {
  let c = 0;
  for (let i = 1; i <= n; i++) if (n % i === 0) c += 1;
  return c;
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
        textShadow: `0 0 ${10 * k}px ${g}, 0 0 ${30 * k}px ${g}`,
      }}
    >
      {children}
    </div>
  );
};

export const Template: React.FC<{ data: RotasiData }> = ({ data }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const ACC = data.accent;
  const total = data.fullTurn;
  const stops = data.stops;
  const N = data.divisors.length;
  const scenes = data.scenes;

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
  const win = (w: Scene, f = 0.4) =>
    clamp01((beat - w[0]) / f) * clamp01((w[1] - beat) / f);

  const wA = win(scenes.intro);
  const wB = win(scenes.angle);
  const wC = win(scenes.split);
  const wD = win(scenes.divisors);
  const wG = win(scenes.compare);
  const wE = win(scenes.orbit);
  const wF = win(scenes.factors);
  const baseV = 1 - wG; // lingkaran dasar memudar saat adegan perbandingan

  /* ───────── geometri ───────── */
  const cx = width / 2;
  const cy = height * 0.5;
  const R = Math.min(width * 0.3, height * 0.17);
  const RING = R * 1.25;
  const numY = height * 0.78;
  const capY = height * 0.84;

  const pt = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const arc = (r: number, deg: number) => {
    const d = Math.min(Math.max(deg, 0), 359.99);
    if (d < 0.1) return "";
    const p = pt(d, r);
    return `M ${cx + r} ${cy} A ${r} ${r} 0 ${d > 180 ? 1 : 0} 0 ${p.x} ${p.y}`;
  };
  const sector = (r: number, deg: number) => {
    const d = Math.min(Math.max(deg, 0), 359.99);
    if (d < 0.1) return "";
    const p = pt(d, r);
    return `M ${cx} ${cy} L ${cx + r} ${cy} A ${r} ${r} 0 ${d > 180 ? 1 : 0} 0 ${p.x} ${p.y} Z`;
  };
  const fit = (text: string, maxSize: number, frac: number, k = 0.56) =>
    Math.min(maxSize, (width * frac) / (Math.max(text.length, 1) * k));

  /* ───────── judul ───────── */
  const tIn = ramp(beat, at("intro_chime"), at("intro_chime") + 1.2, backOut);
  const sIn = ramp(beat, at("intro_chime") + 0.8, at("intro_chime") + 2, easeOut);
  const ulT = ramp(beat, at("intro_chime") + 0.6, at("intro_chime") + 2.4, easeInOut);
  const titleSize = fit(data.title, 84, 0.9, 0.58);
  const subSize = fit(data.subtitle, 46, 0.92, 0.54);
  const ulY = height * 0.152;

  /* ───────── adegan 1: lingkaran + garis 0° ───────── */
  const circleP = ramp(beat, at("circle_draw"), at("circle_close"), easeInOut);
  const fullCircle = `M ${cx + R} ${cy} A ${R} ${R} 0 1 0 ${cx - R} ${cy} A ${R} ${R} 0 1 0 ${cx + R} ${cy}`;
  const circleOpacity = circleP <= 0.001 ? 0 : circleP >= 1 ? 0.88 + 0.12 * Math.sin(beat * 1.3) : 1;
  const headDeg = circleP * total;
  const centerT = prog("center_dot", 0.5, backOut);
  const rayT = prog("ray0", 1, easeOut);
  const rayOp = 0.45 + 0.55 * clamp01(wA + wB);
  const introNum = beat < at("ray0") ? Math.round(circleP * total) : 0;
  const introNumOp =
    wA * ramp(beat, at("circle_draw"), at("circle_draw") + 0.3) * (1 - prog("ray0", 0.5));
  const capIntroOp = wA * prog("circle_close", 0.6) * (1 - prog("zero_label", 0.5, easeOut, -0.5));
  const capStartOp = wA * prog("zero_label", 0.6);

  /* ───────── adegan 2: sudut berputar ───────── */
  const rayAngle = (() => {
    let a = 0;
    for (let i = 0; i < stops.length; i++) {
      const s = at(`sweep_${i}`);
      const e = at(`stop_${i}`);
      if (beat < s) return a;
      if (beat < e) return lerp(a, stops[i].angle, ramp(beat, s, e, easeInOut));
      a = stops[i].angle;
    }
    return a;
  })();
  let arrived = -1;
  stops.forEach((_, i) => {
    if (beat >= at(`stop_${i}`)) arrived = i;
  });
  const arrPulse = arrived >= 0 ? pulse(`stop_${arrived}`, 0.5) : 0;

  /* ───────── adegan 3: pembagian sama rata ───────── */
  let splitIdx = -1;
  data.splits.forEach((_, i) => {
    if (beat >= at(`split_${i}`)) splitIdx = i;
  });
  const renderSplit = (i: number, mul: number) => {
    const n = data.splits[i];
    const a = total / n;
    const s = at(`split_${i}`);
    const els: React.ReactNode[] = [];
    for (let k = 0; k < n; k++) {
      const t = ramp(beat - 0.05 * k, s, s + 0.5, easeOut);
      if (t <= 0) continue;
      const p = pt(k * a, R * t);
      els.push(
        <line key={`sp${k}`} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke={ACC} strokeWidth={5} strokeLinecap="round" />,
      );
      if (t >= 1) {
        const e = pt(k * a, R);
        els.push(<circle key={`nd${k}`} cx={e.x} cy={e.y} r={9} fill={WHITE} />);
      }
    }
    const sec = ramp(beat, s + 0.2, s + 0.8, easeOut);
    return (
      <g key={`split${i}`} opacity={mul}>
        {els}
        <path d={sector(R * 0.98, a * sec)} fill={ACC} fillOpacity={0.16} />
        <path d={arc(R * 0.34, a * sec)} fill="none" stroke={WHITE} strokeWidth={6} strokeLinecap="round" />
      </g>
    );
  };
  const curN = splitIdx >= 0 ? data.splits[splitIdx] : 1;
  const curA = total / curN;
  const splitPulse = splitIdx >= 0 ? pulse(`split_${splitIdx}`, 0.5) : 0;
  const sliceLabel = pt(curA / 2, R * 0.62);
  const sliceT = splitIdx >= 0 ? ramp(beat, at(`split_${splitIdx}`) + 0.4, at(`split_${splitIdx}`) + 1, easeOut) : 0;

  /* ───────── adegan 4: 24 pembagi ───────── */
  let litCount = 0;
  let lastLit = -1;
  data.divisors.forEach((_, i) => {
    if (beat >= at(`div_${i}`)) {
      litCount += 1;
      lastLit = i;
    }
  });
  const countPulse = lastLit >= 0 ? pulse(`div_${lastLit}`, 0.3) : 0;
  const donePulse = pulse("div_done", 0.8);

  /* ───────── adegan 5: kenapa 24 penting (perbandingan) ───────── */
  const M = data.splits.length;
  const gap = 14;
  const cs = (width * 0.92 - gap * (M - 1)) / M;
  const gridW = M * cs + (M - 1) * gap;
  const gx0 = cx - gridW / 2;
  const cellX = (c: number) => gx0 + c * (cs + gap) + cs / 2;
  const rowY = (r: number) => height * 0.365 + r * height * 0.135;
  const hdrY = height * 0.265;
  const wholeCount = data.compare.map((n) => data.splits.filter((d) => n % d === 0).length);
  const divCount = data.compare.map(countDivisors);
  const cmpLine = `${data.captions.compareCount}: ${data.compare
    .map((n, i) => `${n} → ${divCount[i]}`)
    .join(" · ")}`;
  const hdrLine = prog("cmp_hdr", 1.4, easeInOut);

  /* ───────── adegan 6: orbit 360° ───────── */
  const step = data.orbit.stepDegrees;
  const ticks = Math.round(total / step);
  const spb = Math.max(at("orbit_1") - at("orbit_0"), 0.001);
  const orbitStart = at("orbit_0") - spb;
  const phi = Math.min(total, Math.max(0, ((beat - orbitStart) / spb) * step));

  /* ───────── adegan 7: faktor prima ───────── */
  const pembagi = data.factors.reduce((p, f) => p * (f.exp + 1), 1);
  const line2 = data.factors.map((f) => `(${f.exp}+1)`).join(" × ") + ` = ${pembagi}`;
  const eqSize = 84;
  const l2Size = fit(line2, 60, 0.9, 0.58);
  const finalSize = fit(data.captions.final, 56, 0.92, 0.54);
  const centerF = wF * ramp(beat, scenes.factors[0] + 0.2, scenes.factors[0] + 1.2, easeOut);
  const eq0 = ramp(beat, scenes.factors[0] + 0.2, scenes.factors[0] + 1, easeOut);

  /* ───────── efek gelombang kejut ───────── */
  const shock = (id: string, key: string, dur = 1.2, grow = 0.7, r0 = R) => {
    const age = (beat - at(id)) / dur;
    if (age <= 0 || age >= 1) return null;
    return (
      <circle
        key={key}
        cx={cx}
        cy={cy}
        r={r0 * (1 + grow * easeOut(age))}
        fill="none"
        stroke={ACC}
        strokeWidth={5}
        opacity={1 - age}
      />
    );
  };

  const kick =
    0.02 *
    Math.max(
      pulse("stop_3", 0.5),
      pulse("div_done", 0.5),
      pulse("cmp_score_2", 0.5),
      pulse("orbit_11", 0.5),
      pulse("final_chime", 0.6),
    );
  const breathe = 1.01 + 0.01 * Math.sin(beat * 0.4) + kick;

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 50%, #0a1820 0%, ${data.background} 72%)`,
        overflow: "hidden",
      }}
    >
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}

      <div
        style={{
          position: "absolute",
          inset: 0,
          transformOrigin: "50% 50%",
          transform: `scale(${breathe})`,
        }}
      >
        {/* debu halus */}
        {Array.from({ length: 26 }, (_, i) => {
          const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * width;
          const y0 = (Math.sin(i * 37.3 + 1) * 0.5 + 0.5) * height;
          const y = (((y0 - beat * (5 + (i % 5) * 3)) % height) + height) % height;
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
                background: WHITE,
                opacity: (0.2 + 0.2 * Math.sin(beat * 1.5 + i)) * 0.6,
                boxShadow: `0 0 10px ${ACC}`,
              }}
            />
          );
        })}

        {/* ───────── lapisan shape & garis (glow) ───────── */}
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          style={{ position: "absolute", left: 0, top: 0 }}
        >
          <defs>
            <filter
              id="rotasi-glow"
              filterUnits="userSpaceOnUse"
              x={0}
              y={0}
              width={width}
              height={height}
              colorInterpolationFilters="sRGB"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="14" result="wide" />
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="tight" />
              <feMerge>
                <feMergeNode in="wide" />
                <feMergeNode in="tight" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <g filter="url(#rotasi-glow)">
            {/* garis putus-putus di bawah judul: tumbuh dari tengah */}
            {ulT > 0 && (
              <>
                <line
                  x1={cx}
                  y1={ulY}
                  x2={cx - width * 0.4 * ulT}
                  y2={ulY}
                  stroke={ACC}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="10 12"
                />
                <line
                  x1={cx}
                  y1={ulY}
                  x2={cx + width * 0.4 * ulT}
                  y2={ulY}
                  stroke={ACC}
                  strokeWidth={4}
                  strokeLinecap="round"
                  strokeDasharray="10 12"
                />
              </>
            )}

            {/* lingkaran dasar, titik pusat, garis 0° (memudar saat perbandingan) */}
            <g opacity={baseV}>
              <path
                d={fullCircle}
                pathLength={1}
                fill="none"
                stroke={ACC}
                strokeWidth={6}
                strokeLinecap="round"
                strokeDasharray={circleP >= 1 ? undefined : "1 1"}
                strokeDashoffset={1 - circleP}
                opacity={circleOpacity}
              />
              {circleP > 0.001 && circleP < 0.999 && (
                <circle cx={pt(headDeg, R).x} cy={pt(headDeg, R).y} r={13} fill={WHITE} />
              )}
              {centerT > 0 && <circle cx={cx} cy={cy} r={11 * centerT} fill={WHITE} />}
              {rayT > 0 && (
                <line
                  x1={cx}
                  y1={cy}
                  x2={cx + R * rayT}
                  y2={cy}
                  stroke={ACC}
                  strokeWidth={6}
                  strokeLinecap="round"
                  opacity={rayOp}
                />
              )}
            </g>

            {/* adegan 2: sinar berputar */}
            {wB > 0.001 && (
              <g opacity={wB}>
                <path d={sector(R * 0.98, rayAngle)} fill={ACC} fillOpacity={0.14} />
                <path
                  d={arc(R * 0.3, rayAngle)}
                  fill="none"
                  stroke={WHITE}
                  strokeWidth={7}
                  strokeLinecap="round"
                />
                {stops.map((s, i) => {
                  const t = prog(`stop_${i}`, 0.6, easeOut);
                  if (t <= 0) return null;
                  const ang = s.angle % total;
                  const dot = pt(ang, R);
                  const end = pt(ang, R * 1.16 * t);
                  return (
                    <g key={`ax${i}`}>
                      <line
                        x1={cx}
                        y1={cy}
                        x2={end.x}
                        y2={end.y}
                        stroke={ACC}
                        strokeWidth={3}
                        strokeDasharray="14 14"
                        opacity={0.75}
                      />
                      <circle cx={dot.x} cy={dot.y} r={10} fill={WHITE} />
                    </g>
                  );
                })}
                <line
                  x1={cx}
                  y1={cy}
                  x2={pt(rayAngle, R).x}
                  y2={pt(rayAngle, R).y}
                  stroke={WHITE}
                  strokeWidth={7}
                  strokeLinecap="round"
                />
                <circle cx={pt(rayAngle, R).x} cy={pt(rayAngle, R).y} r={14 + 8 * arrPulse} fill={WHITE} />
              </g>
            )}

            {/* adegan 3: pembagian */}
            {wC > 0.001 && (
              <g opacity={wC}>
                {splitIdx > 0 && renderSplit(splitIdx - 1, 1 - prog(`split_${splitIdx}`, 0.3))}
                {splitIdx >= 0 && renderSplit(splitIdx, 1)}
              </g>
            )}

            {/* adegan 4: cincin pembagi */}
            {wD > 0.001 && (
              <g opacity={wD}>
                {data.divisors.map((_, i) => {
                  const ang = (i * total) / N;
                  const tl = at(`div_${i}`);
                  const t = ramp(beat, tl, tl + 0.35, backOut);
                  const tc = clamp01(t);
                  const a0 = pt(ang, R);
                  const a1 = pt(ang, R + (RING - R) * tc);
                  const nd = pt(ang, RING);
                  const age = (beat - tl) / 0.7;
                  return (
                    <g key={`dv${i}`}>
                      <circle cx={nd.x} cy={nd.y} r={5} fill={ACC} opacity={0.3} />
                      {tc > 0 && (
                        <>
                          <line x1={a0.x} y1={a0.y} x2={a1.x} y2={a1.y} stroke={ACC} strokeWidth={3} />
                          <circle cx={nd.x} cy={nd.y} r={12 * Math.max(t, 0)} fill={WHITE} />
                        </>
                      )}
                      {age > 0 && age < 1 && (
                        <circle
                          cx={nd.x}
                          cy={nd.y}
                          r={12 + 34 * easeOut(age)}
                          fill="none"
                          stroke={ACC}
                          strokeWidth={3}
                          opacity={1 - age}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* adegan 5: kenapa 24 penting — kotak bilangan bulat vs berkoma */}
            {wG > 0.001 && (
              <g opacity={wG}>
                <line
                  x1={cx}
                  y1={hdrY + 44}
                  x2={cx - (gridW / 2) * hdrLine}
                  y2={hdrY + 44}
                  stroke={ACC}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="10 12"
                  opacity={0.8}
                />
                <line
                  x1={cx}
                  y1={hdrY + 44}
                  x2={cx + (gridW / 2) * hdrLine}
                  y2={hdrY + 44}
                  stroke={ACC}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray="10 12"
                  opacity={0.8}
                />
                {data.compare.map((n, r) =>
                  data.splits.map((d, c) => {
                    const id = `cmp_${r}_${c}`;
                    const t = ramp(beat, at(id), at(id) + 0.35, backOut);
                    if (t <= 0) return null;
                    const lit = n % d === 0;
                    const x = cellX(c);
                    const y = rowY(r);
                    const age = (beat - at(id)) / 0.7;
                    return (
                      <g key={id}>
                        <g transform={`translate(${x} ${y}) scale(${Math.max(t, 0)})`}>
                          <rect
                            x={-cs / 2}
                            y={-cs / 2}
                            width={cs}
                            height={cs}
                            rx={16}
                            fill={lit ? ACC : "none"}
                            fillOpacity={lit ? 0.2 : 0}
                            stroke={ACC}
                            strokeWidth={lit ? 4 : 2}
                            strokeDasharray={lit ? undefined : "7 9"}
                            opacity={lit ? 1 : 0.4}
                          />
                        </g>
                        {lit && age > 0 && age < 1 && (
                          <circle
                            cx={x}
                            cy={y}
                            r={cs * 0.5 + 34 * easeOut(age)}
                            fill="none"
                            stroke={ACC}
                            strokeWidth={3}
                            opacity={1 - age}
                          />
                        )}
                      </g>
                    );
                  }),
                )}
              </g>
            )}

            {/* adegan 6: orbit */}
            {wE > 0.001 && (
              <g opacity={wE}>
                <path d={arc(R, phi)} fill="none" stroke={WHITE} strokeWidth={10} strokeLinecap="round" />
                <line
                  x1={cx}
                  y1={cy}
                  x2={pt(phi, R).x}
                  y2={pt(phi, R).y}
                  stroke={ACC}
                  strokeWidth={3}
                  opacity={0.6}
                />
                <circle cx={pt(phi, R).x} cy={pt(phi, R).y} r={16} fill={WHITE} />
                {Array.from({ length: ticks }, (_, j) => {
                  const ang = (j + 1) * step;
                  const tl = at(`orbit_${j}`);
                  const a = pt(ang, R - 20);
                  const b = pt(ang, R + 20);
                  const lit = beat >= tl;
                  const age = (beat - tl) / 0.6;
                  const c = pt(ang, R);
                  return (
                    <g key={`tk${j}`}>
                      <line
                        x1={a.x}
                        y1={a.y}
                        x2={b.x}
                        y2={b.y}
                        stroke={lit ? WHITE : ACC}
                        strokeWidth={lit ? 6 : 3}
                        strokeLinecap="round"
                        opacity={lit ? 1 : 0.35}
                      />
                      {age > 0 && age < 1 && (
                        <circle
                          cx={c.x}
                          cy={c.y}
                          r={14 + 26 * easeOut(age)}
                          fill="none"
                          stroke={ACC}
                          strokeWidth={3}
                          opacity={1 - age}
                        />
                      )}
                    </g>
                  );
                })}
              </g>
            )}

            {/* adegan 7: cincin 24 pembagi muncul lagi */}
            {wF > 0.001 && (
              <g opacity={wF}>
                {data.divisors.map((_, i) => {
                  const ang = (i * total) / N;
                  const s0 = at("final_chime") + i * 0.02;
                  const t = ramp(beat, s0, s0 + 0.4, backOut);
                  if (t <= 0) return null;
                  const a0 = pt(ang, R);
                  const a1 = pt(ang, R + (RING - R) * clamp01(t));
                  const nd = pt(ang, RING);
                  return (
                    <g key={`fn${i}`}>
                      <line x1={a0.x} y1={a0.y} x2={a1.x} y2={a1.y} stroke={ACC} strokeWidth={3} />
                      <circle cx={nd.x} cy={nd.y} r={12 * t} fill={WHITE} />
                    </g>
                  );
                })}
              </g>
            )}

            {/* gelombang kejut sinkron dengan cue */}
            {shock("circle_close", "k0", 1.0, 0.5)}
            {shock("center_dot", "k1", 0.8, 5, 14)}
            {stops.map((_, i) => shock(`stop_${i}`, `ks${i}`, 0.9, 0.3))}
            {shock("div_done", "k3", 1.4, 0.9, RING)}
            {shock("orbit_11", "k4", 1.4, 0.8)}
            {shock("final_chime", "k5", 1.8, 1.0, RING)}
          </g>
        </svg>

        {/* ───────── teks & angka ───────── */}
        <Txt
          x={cx}
          y={height * 0.085 - (1 - clamp01(tIn)) * 36}
          size={titleSize}
          color={WHITE}
          glow={ACC}
          opacity={clamp01(tIn * 1.5)}
          scale={0.9 + 0.1 * Math.min(tIn, 1)}
        >
          {data.title}
        </Txt>
        <Txt x={cx} y={height * 0.125} size={subSize} color={ACC} weight={600} opacity={sIn * 0.95} k={0.6}>
          {data.subtitle}
        </Txt>

        {/* adegan 1 */}
        <Txt x={cx} y={numY} size={120} color={WHITE} glow={ACC} opacity={introNumOp}>
          {`${introNum}°`}
        </Txt>
        <Txt
          x={cx}
          y={capY}
          size={fit(data.captions.intro, 54, 0.92)}
          color={ACC}
          weight={600}
          opacity={capIntroOp}
          k={0.7}
        >
          {data.captions.intro}
        </Txt>
        <Txt
          x={cx}
          y={capY}
          size={fit(data.captions.start, 54, 0.92)}
          color={ACC}
          weight={600}
          opacity={capStartOp}
          k={0.7}
        >
          {data.captions.start}
        </Txt>
        <Txt
          x={cx + R + 78}
          y={cy - 4}
          size={60}
          color={WHITE}
          glow={ACC}
          opacity={prog("zero_label", 0.4) * clamp01(wA + wB * 0.8 + wC * 0.5)}
          scale={0.7 + 0.3 * prog("zero_label", 0.4, backOut)}
        >
          0°
        </Txt>

        {/* adegan 2 */}
        <Txt
          x={cx}
          y={numY}
          size={120}
          color={WHITE}
          glow={ACC}
          opacity={wB}
          scale={1 + 0.14 * arrPulse}
        >
          {`${Math.round(rayAngle)}°`}
        </Txt>
        <Txt
          x={cx}
          y={capY}
          size={fit(data.captions.angle, 50, 0.92)}
          color={ACC}
          weight={600}
          opacity={wB * (1 - prog("stop_0", 0.3))}
          k={0.7}
        >
          {data.captions.angle}
        </Txt>
        {arrived >= 0 && (
          <Txt
            x={cx}
            y={capY}
            size={64}
            color={ACC}
            opacity={wB * prog(`stop_${arrived}`, 0.5)}
            scale={0.8 + 0.2 * prog(`stop_${arrived}`, 0.5, backOut)}
          >
            {stops[arrived].label}
          </Txt>
        )}

        {/* adegan 3 */}
        <Txt
          x={cx}
          y={numY}
          size={96}
          color={WHITE}
          glow={ACC}
          opacity={wC * (splitIdx >= 0 ? 1 : 0)}
          scale={1 + 0.1 * splitPulse}
        >
          {total}
          {" ÷ "}
          <span style={{ color: ACC }}>{curN}</span>
          {" = "}
          <span style={{ color: ACC }}>{`${fmt(curA)}°`}</span>
        </Txt>
        <Txt
          x={sliceLabel.x}
          y={sliceLabel.y}
          size={curA >= 60 ? 56 : 42}
          color={WHITE}
          glow={ACC}
          opacity={wC * sliceT}
          scale={0.7 + 0.3 * sliceT}
        >
          {`${fmt(curA)}°`}
        </Txt>
        <Txt
          x={cx}
          y={capY}
          size={fit(data.captions.split, 50, 0.92)}
          color={ACC}
          weight={600}
          opacity={wC}
          k={0.7}
        >
          {data.captions.split}
        </Txt>

        {/* adegan 4 */}
        {data.divisors.map((d, i) => {
          const ang = (i * total) / N;
          const tl = at(`div_${i}`);
          const t = ramp(beat, tl, tl + 0.35, backOut);
          const p = pt(ang, RING + 52);
          return (
            <Txt
              key={`dl${i}`}
              x={p.x}
              y={p.y}
              size={32}
              color={ACC}
              weight={700}
              opacity={wD * clamp01(t * 1.5)}
              scale={0.7 + 0.3 * clamp01(t)}
              k={0.6}
            >
              {d}
            </Txt>
          );
        })}
        <Txt
          x={cx}
          y={cy}
          size={170}
          color={litCount === N ? ACC : WHITE}
          glow={ACC}
          opacity={wD * (litCount > 0 ? 1 : 0)}
          scale={1 + 0.18 * countPulse + 0.2 * donePulse}
        >
          {litCount}
        </Txt>
        <Txt
          x={cx}
          y={numY}
          size={fit(data.captions.divisors, 52, 0.92)}
          color={ACC}
          weight={600}
          opacity={wD * prog("div_0", 0.5)}
          k={0.7}
        >
          {data.captions.divisors}
        </Txt>

        {/* adegan 5: perbandingan */}
        {data.splits.map((d, c) => (
          <Txt
            key={`ch${c}`}
            x={cellX(c)}
            y={hdrY}
            size={36}
            color={ACC}
            weight={700}
            opacity={wG * prog("cmp_hdr", 0.4, easeOut, c * 0.08)}
            scale={0.7 + 0.3 * prog("cmp_hdr", 0.4, backOut, c * 0.08)}
            k={0.6}
          >
            {`÷${d}`}
          </Txt>
        ))}
        {data.compare.map((n, r) => {
          const rowT = prog(`cmp_row_${r}`, 0.5);
          const scT = prog(`cmp_score_${r}`, 0.5, backOut);
          const perfect = wholeCount[r] === M;
          return (
            <React.Fragment key={`cr${r}`}>
              <Txt
                x={gx0 + 80}
                y={rowY(r) - cs / 2 - 52}
                size={64}
                color={WHITE}
                glow={ACC}
                opacity={wG * rowT}
                scale={0.8 + 0.2 * rowT}
              >
                {n}
              </Txt>
              <Txt
                x={gx0 + gridW - 190}
                y={rowY(r) - cs / 2 - 52}
                size={44}
                color={perfect ? WHITE : ACC}
                glow={ACC}
                opacity={wG * clamp01(scT * 1.5)}
                scale={(0.8 + 0.2 * clamp01(scT)) * (1 + 0.15 * pulse(`cmp_score_${r}`, 0.5))}
                k={perfect ? 1 : 0.5}
              >
                {`${wholeCount[r]}/${M} ${data.captions.compareScore}`}
              </Txt>
              {data.splits.map((d, c) => {
                const t = prog(`cmp_${r}_${c}`, 0.35, backOut);
                const lit = n % d === 0;
                return (
                  <Txt
                    key={`cv${r}_${c}`}
                    x={cellX(c)}
                    y={rowY(r)}
                    size={Number.isInteger(n / d) ? 34 : 28}
                    color={lit ? WHITE : ACC}
                    glow={ACC}
                    weight={lit ? 800 : 600}
                    opacity={wG * clamp01(t * 1.5) * (lit ? 1 : 0.5)}
                    scale={0.7 + 0.3 * clamp01(t)}
                    k={lit ? 0.8 : 0.2}
                  >
                    {fmt1(n / d)}
                  </Txt>
                );
              })}
            </React.Fragment>
          );
        })}
        <Txt
          x={cx}
          y={numY}
          size={fit(data.captions.compare, 50, 0.92)}
          color={ACC}
          weight={600}
          opacity={wG * prog("cmp_hdr", 0.6)}
          k={0.7}
        >
          {data.captions.compare}
        </Txt>
        <Txt
          x={cx}
          y={capY}
          size={fit(cmpLine, 48, 0.92, 0.54)}
          color={WHITE}
          glow={ACC}
          opacity={wG * prog("cmp_sum", 0.6)}
          scale={0.85 + 0.15 * prog("cmp_sum", 0.6, backOut)}
        >
          {cmpLine}
        </Txt>

        {/* adegan 6: orbit */}
        {Array.from({ length: ticks }, (_, j) => {
          const ang = (j + 1) * step;
          const p = pt(ang, R * 1.22);
          const t = prog(`orbit_${j}`, 0.4, backOut);
          return (
            <Txt
              key={`ol${j}`}
              x={p.x}
              y={p.y}
              size={34}
              color={WHITE}
              glow={ACC}
              weight={700}
              opacity={wE * clamp01(t * 1.5)}
              scale={0.7 + 0.3 * clamp01(t)}
              k={0.6}
            >
              {`${ang}°`}
            </Txt>
          );
        })}
        <Txt x={cx} y={numY} size={120} color={WHITE} glow={ACC} opacity={wE}>
          {`${Math.round(phi)}°`}
        </Txt>
        <Txt
          x={cx}
          y={capY}
          size={fit(data.captions.orbit, 46, 0.92, 0.54)}
          color={ACC}
          weight={600}
          opacity={wE}
          k={0.7}
        >
          {data.captions.orbit}
        </Txt>

        {/* adegan 7 */}
        <Txt
          x={cx}
          y={cy}
          size={170}
          color={WHITE}
          glow={ACC}
          opacity={centerF}
          scale={1 + 0.12 * pulse("final_chime", 0.8)}
        >
          {total}
        </Txt>
        <Txt x={cx} y={numY} size={eqSize} color={WHITE} glow={ACC} opacity={wF}>
          <span style={{ opacity: eq0 }}>{`${total} =`}</span>
          {data.factors.map((f, i) => {
            const t = prog(`factor_${i}`, 0.4, backOut);
            return (
              <span
                key={`fc${i}`}
                style={{
                  display: "inline-block",
                  marginLeft: 16,
                  opacity: clamp01(t * 1.5),
                  transform: `scale(${0.7 + 0.3 * clamp01(t)})`,
                }}
              >
                {i > 0 ? "× " : ""}
                <span style={{ color: ACC }}>{f.base}</span>
                {f.exp > 1 && (
                  <sup style={{ fontSize: "0.55em", color: ACC }}>{f.exp}</sup>
                )}
              </span>
            );
          })}
        </Txt>
        <Txt
          x={cx}
          y={numY - 110}
          size={fit(data.captions.factorsHow, 44, 0.92, 0.54)}
          color={ACC}
          weight={600}
          opacity={wF * prog("factor_count", 0.6)}
          k={0.7}
        >
          {data.captions.factorsHow}
        </Txt>
        <Txt
          x={cx}
          y={capY}
          size={l2Size}
          color={WHITE}
          glow={ACC}
          opacity={wF * prog("factor_count", 0.5)}
          scale={0.85 + 0.15 * prog("factor_count", 0.5, backOut)}
        >
          {line2}
        </Txt>
        <Txt
          x={cx}
          y={capY + 110}
          size={finalSize}
          color={ACC}
          opacity={wF * prog("final_chime", 0.8)}
          scale={0.85 + 0.15 * prog("final_chime", 0.8, backOut)}
        >
          {data.captions.final}
        </Txt>
      </div>
    </AbsoluteFill>
  );
};