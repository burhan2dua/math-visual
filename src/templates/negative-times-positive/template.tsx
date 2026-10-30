import React from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { TemplateData } from "../../types";

const POS = "#22e6ff";
const NEG = "#ff2bd6";
const WHITE = "#e8f4ff";
const CX = 540;
const CY = 960;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = Easing.out(Easing.cubic);
const easeInOut = Easing.inOut(Easing.cubic);
const backOut = Easing.out(Easing.back(1.8));
const win = (beat: number, a: number, b: number, f = 0.5) =>
  clamp01((beat - a) / f) * clamp01((b - beat) / f);

/* ───────────── timeline: semua visual dikunci ke cue di data.json ───────────── */

const useTimeline = (data: TemplateData) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const bpm = data.bpm ?? 90;
  const beat = (frame / fps) * (bpm / 60);
  const at = (id: string) => data.cues?.find((c) => c.id === id)?.beat ?? 1e9;
  const prog = (
    id: string,
    dur = 0.5,
    ease: (t: number) => number = easeOut,
    offset = 0,
  ) => ease(clamp01((beat - at(id) - offset) / dur));
  const pulse = (id: string, dur = 0.6) =>
    beat < at(id) ? 0 : 1 - clamp01((beat - at(id)) / dur);
  return { beat, at, prog, pulse, zero: data.accent };
};
type TL = ReturnType<typeof useTimeline>;

/* ───────────── shape glow-in-the-dark ───────────── */

const Unit: React.FC<{
  x: number;
  y: number;
  size: number;
  sign: "+" | "-";
  scale?: number;
  opacity?: number;
  rotate?: number;
  k?: number;
}> = ({ x, y, size, sign, scale = 1, opacity = 1, rotate = 0, k = 1 }) => {
  const c = sign === "+" ? POS : NEG;
  const bw = Math.max(3, size * 0.04);
  const th = Math.max(4, size * 0.08);
  const bar: React.CSSProperties = {
    position: "absolute",
    borderRadius: th,
    background: c,
    boxShadow: `0 0 ${th * 2}px ${c}`,
  };
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        boxSizing: "border-box",
        borderRadius: size * 0.16,
        border: `${bw}px solid ${c}`,
        background: `${c}0d`,
        boxShadow: `0 0 ${14 * k}px ${c}, 0 0 ${40 * k}px ${c}88, inset 0 0 ${16 * k}px ${c}66`,
        transform: `scale(${scale}) rotate(${rotate}deg)`,
        opacity,
      }}
    >
      <div style={{ ...bar, left: "25%", top: `calc(50% - ${th / 2}px)`, width: "50%", height: th }} />
      {sign === "+" && (
        <div style={{ ...bar, top: "25%", left: `calc(50% - ${th / 2}px)`, height: "50%", width: th }} />
      )}
    </div>
  );
};

const Ring: React.FC<{
  x: number;
  y: number;
  d: number;
  color: string;
  scale?: number;
  opacity?: number;
  fill?: boolean;
  bw?: number;
  k?: number;
}> = ({ x, y, d, color, scale = 1, opacity = 1, fill = false, bw = 6, k = 1 }) => (
  <div
    style={{
      position: "absolute",
      left: x - d / 2,
      top: y - d / 2,
      width: d,
      height: d,
      boxSizing: "border-box",
      borderRadius: "50%",
      border: `${bw}px solid ${color}`,
      background: fill ? `${color}55` : "transparent",
      boxShadow: `0 0 ${18 * k}px ${color}, 0 0 ${50 * k}px ${color}88, inset 0 0 ${18 * k}px ${color}66`,
      transform: `scale(${scale})`,
      opacity,
    }}
  />
);

const Rect: React.FC<{
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  opacity?: number;
  fill?: boolean;
  radius?: number;
  bw?: number;
  dashed?: boolean;
  k?: number;
  rot?: number;
}> = ({ x, y, w, h, color, opacity = 1, fill = true, radius = 999, bw = 4, dashed = false, k = 1, rot = 0 }) => (
  <div
    style={{
      position: "absolute",
      left: x,
      top: y,
      width: w,
      height: h,
      boxSizing: "border-box",
      borderRadius: radius,
      ...(fill ? { background: color } : { border: `${bw}px ${dashed ? "dashed" : "solid"} ${color}` }),
      boxShadow: `0 0 ${12 * k}px ${color}, 0 0 ${34 * k}px ${color}88`,
      transform: rot ? `rotate(${rot}deg)` : undefined,
      opacity,
    }}
  />
);

const Dust: React.FC<{ beat: number }> = ({ beat }) => (
  <>
    {Array.from({ length: 28 }).map((_, i) => {
      const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * 1080;
      const y0 = (Math.sin(i * 37.3 + 1) * 0.5 + 0.5) * 1920;
      const y = (((y0 - beat * (6 + (i % 5) * 3)) % 1920) + 1920) % 1920;
      const s = 4 + (i % 3) * 2;
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
            opacity: (0.25 + 0.25 * Math.sin(beat * 1.7 + i)) * 0.6,
            boxShadow: `0 0 10px ${WHITE}`,
          }}
        />
      );
    })}
  </>
);

/* ───────────── ADEGAN 1 — lawan saling meniadakan (beat 0–10) ───────────── */

const Scene1: React.FC<{ tl: TL }> = ({ tl }) => {
  const { beat, at, prog, pulse, zero } = tl;
  const o = win(beat, 0, 10, 0.3);
  if (o <= 0) return null;

  const pairs = [
    { p: "p0_pos", n: "p0_neg", m: "p0_merge", ang: 0 },
    { p: "p1_pos", n: "p1_neg", m: "p1_merge", ang: 90 },
    { p: "p2_pos", n: "p2_neg", m: "p2_merge", ang: -45 },
  ];
  const D = 320;
  const mp = Math.max(...pairs.map((pr) => pulse(pr.m, 0.7)));
  const endT = prog("s1_end", 1.6);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <Ring
        x={CX}
        y={CY}
        d={90}
        color={zero}
        scale={prog("s1_ring", 0.6, backOut) * (1 + 0.3 * mp)}
        k={1 + 1.6 * mp}
      />
      {endT > 0 && endT < 1 && (
        <Ring x={CX} y={CY} d={90} color={zero} scale={1 + 6 * endT} opacity={1 - endT} />
      )}
      {pairs.map((pr, i) => {
        const a = (pr.ang * Math.PI) / 180;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const m = at(pr.m);
        const s = easeInOut(clamp01((beat - (m - 0.6)) / 0.6));
        const bob = Math.sin(beat * 3 + i * 2) * 10 * (1 - s);
        const r = D * (1 - s);
        const pa = prog(pr.p, 0.45, backOut);
        const na = prog(pr.n, 0.45, backOut);
        const bt = clamp01((beat - m) / 0.9);
        return (
          <React.Fragment key={pr.m}>
            {beat < m && (
              <>
                <Unit x={CX + dx * r} y={CY + dy * r + bob} size={150} sign="+" scale={pa * (1 - 0.3 * s)} opacity={clamp01(pa * 2)} />
                <Unit x={CX - dx * r} y={CY - dy * r - bob} size={150} sign="-" scale={na * (1 - 0.3 * s)} opacity={clamp01(na * 2)} />
              </>
            )}
            {beat >= m && bt < 1 && (
              <Ring x={CX} y={CY} d={110} color={zero} scale={1 + 3 * easeOut(bt)} opacity={1 - bt} bw={5} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ───────────── ADEGAN 2 — (−3) × (+2): 2 grup berisi 3 negatif (beat 10–24) ───────────── */

const Scene2: React.FC<{ tl: TL }> = ({ tl }) => {
  const { beat, prog, pulse, zero } = tl;
  const o = win(beat, 10, 24);
  if (o <= 0) return null;

  const size = 150;
  const step = 186;
  const tg = prog("s2_gather", 1, easeInOut);
  const rowsY = [lerp(660, 780, tg), 960];
  const landT = prog("s2_land", 0.6);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      {[0, 1].map((i) => {
        const pl = pulse(`s2_g${i}`, 0.7);
        return (
          <Ring
            key={i}
            x={CX + (i ? 70 : -70)}
            y={340}
            d={80}
            color={POS}
            scale={prog(`s2_dot${i}`, 0.5, backOut) * (1 + 0.35 * pl)}
            fill={pl > 0}
            k={1 + pl}
          />
        );
      })}

      {[0, 1].map((gi) => (
        <Rect
          key={gi}
          x={CX - 310}
          y={rowsY[gi] - 115}
          w={620}
          h={230}
          color={WHITE}
          fill={false}
          radius={40}
          bw={3}
          k={0.5}
          opacity={prog(`s2_g${gi}`, 0.6) * 0.5 * (1 - tg)}
        />
      ))}

      {[0, 1].flatMap((gi) =>
        [0, 1, 2].map((ui) => {
          const t = prog(`s2_g${gi}u${ui}`, 0.5, backOut);
          return (
            <Unit
              key={`${gi}-${ui}`}
              x={CX + (ui - 1) * step}
              y={rowsY[gi] - (1 - t) * 180}
              size={size}
              sign="-"
              scale={t}
              opacity={clamp01(t * 2)}
            />
          );
        }),
      )}

      <Rect x={100} y={1398} w={880} h={4} color={WHITE} opacity={0.5 * tg} k={0.5} />
      <Rect x={738} y={1368} w={4} h={64} color={zero} opacity={tg} />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const t = clamp01(prog(`s2_b${i}`, 0.3, backOut));
        const w = 72 * t;
        const right = 740 - i * 80 - 4;
        return <Rect key={i} x={right - w} y={1372} w={w} h={56} color={NEG} radius={14} opacity={clamp01(t * 2)} />;
      })}
      <Rect
        x={740 - 480 - 12}
        y={1352}
        w={504}
        h={96}
        color={zero}
        fill={false}
        radius={30}
        opacity={landT * (0.7 + 0.3 * Math.sin(beat * 6))}
      />
    </div>
  );
};

/* ───────────── ADEGAN 3 — pola turun 2 demi 2 (beat 24–40) ───────────── */

const Scene3: React.FC<{ tl: TL }> = ({ tl }) => {
  const { beat, prog, zero } = tl;
  const o = win(beat, 24, 40);
  if (o <= 0) return null;

  const ids = ["s3_r3", "s3_r2", "s3_r1", "s3_r0", "s3_rm1", "s3_rm2", "s3_rm3"];
  const fs = [3, 2, 1, 0, -1, -2, -3];
  const rowY = (i: number) => 560 + i * 130;
  const X0 = 700;
  const hl = prog("s3_hl", 0.8);
  const gs = ids.map((id) => prog(id, 0.5, easeOut, 0.15));
  const tt = clamp01((gs.reduce((a, b) => a + b, 0) - 1) / 6);
  const tip = (i: number) => ({ x: X0 + 100 * fs[i], y: rowY(i) });
  const a = tip(0);
  const b = tip(6);
  const e = { x: lerp(a.x, b.x, tt), y: lerp(a.y, b.y, tt) };
  const headerT = prog("s3_r3", 0.5, easeOut, -0.5);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      {[-55, 55].map((dx) => (
        <Ring key={dx} x={CX + dx} y={380} d={70} color={POS} scale={headerT} />
      ))}
      <Rect x={X0 - 2} y={500} w={4} h={920} color={WHITE} opacity={0.35} k={0.4} />

      <svg width={1080} height={1920} style={{ position: "absolute", left: 0, top: 0 }}>
        <line
          x1={a.x}
          y1={a.y}
          x2={b.x}
          y2={b.y}
          stroke={WHITE}
          strokeWidth={4}
          strokeDasharray="12 16"
          opacity={0.28 * prog("s3_ghost", 0.8)}
          style={{ filter: `drop-shadow(0 0 8px ${WHITE})` }}
        />
        <line
          x1={a.x}
          y1={a.y}
          x2={e.x}
          y2={e.y}
          stroke={zero}
          strokeWidth={6}
          strokeLinecap="round"
          style={{ filter: `drop-shadow(0 0 10px ${zero})` }}
        />
      </svg>

      {ids.map((id, i) => {
        const f = fs[i];
        const y = rowY(i);
        const pip = prog(id, 0.4, backOut);
        const g = gs[i];
        const op = 1 - 0.65 * hl * (i === 6 ? 0 : 1);
        const w = 100 * Math.abs(f) * g;
        return (
          <div key={id} style={{ position: "absolute", inset: 0, opacity: op }}>
            {f === 0 ? (
              <>
                <Ring x={114} y={y} d={40} color={zero} scale={pip} />
                <Ring x={X0} y={y} d={26} color={zero} scale={pip} fill />
              </>
            ) : (
              <>
                {Array.from({ length: Math.abs(f) }).map((_, j) => (
                  <Unit key={j} x={114 + j * 62} y={y} size={48} sign={f > 0 ? "+" : "-"} scale={pip} opacity={clamp01(pip * 2)} />
                ))}
                <Rect
                  x={f > 0 ? X0 : X0 - w}
                  y={y - 22}
                  w={w}
                  h={44}
                  color={f > 0 ? POS : NEG}
                  radius={22}
                  opacity={clamp01(g * 3)}
                />
              </>
            )}
          </div>
        );
      })}

      <Rect
        x={50}
        y={rowY(6) - 56}
        w={980}
        h={112}
        color={zero}
        fill={false}
        radius={36}
        opacity={hl * (0.7 + 0.3 * Math.sin(beat * 6))}
      />
    </div>
  );
};

/* ───────────── ADEGAN 4 — bukti pembatalan: 6 cyan vs 6 magenta = 0 (beat 40–54) ───────────── */

const Scene4: React.FC<{ tl: TL }> = ({ tl }) => {
  const { beat, at, prog, zero } = tl;
  const o = win(beat, 40, 54);
  if (o <= 0) return null;

  const cp = (i: number) => ({ x: CX + ((i % 3) - 1) * 144, y: i < 3 ? 520 : 664 });
  const mp = (i: number) => ({ x: CX + ((i % 3) - 1) * 144, y: i < 3 ? 1160 : 1304 });
  const cyanIdx = (k: number) => (k < 3 ? 3 + k : k - 3);
  const cyanKill = (i: number) => (i >= 3 ? i - 3 : i + 3);
  const killId = (k: number) => `s4_a${k}`;
  const ks = [0, 1, 2, 3, 4, 5];
  const count = ks.reduce((s, k) => s + (beat >= at(killId(k)) ? 1 : 0), 0);
  const zt = prog("s4_zero", 1.6);

  return (
    <div style={{ position: "absolute", inset: 0, opacity: o }}>
      <Ring
        x={CX}
        y={912}
        d={110}
        color={zero}
        scale={prog("s4_c0", 0.6, backOut, -0.4) * (1 + 0.12 * count)}
        k={1 + 0.4 * count}
        fill={beat >= at("s4_zero")}
      />
      {zt > 0 && zt < 1 && (
        <Ring x={CX} y={912} d={110} color={zero} scale={1 + 7 * zt} opacity={1 - zt} />
      )}

      {ks.map((i) => {
        if (beat >= at(killId(cyanKill(i)))) return null;
        const t = prog(`s4_c${i}`, 0.45, backOut);
        const p = cp(i);
        return <Unit key={`c${i}`} x={p.x} y={p.y - (1 - t) * 100} size={120} sign="+" scale={t} opacity={clamp01(t * 2)} />;
      })}

      {ks.map((k) => {
        if (beat >= at(killId(k))) return null;
        const t = prog(`s4_m${k}`, 0.45, backOut);
        const fly = easeInOut(clamp01((beat - (at(killId(k)) - 0.7)) / 0.7));
        const from = mp(k);
        const to = cp(cyanIdx(k));
        return (
          <Unit
            key={`m${k}`}
            x={lerp(from.x, to.x, fly)}
            y={lerp(from.y, to.y, fly) + (1 - t) * 100}
            size={120}
            sign="-"
            scale={t}
            opacity={clamp01(t * 2)}
            rotate={fly * 180}
          />
        );
      })}

      {ks.map((k) => {
        const bt = (beat - at(killId(k))) / 0.9;
        if (bt <= 0 || bt >= 1) return null;
        const p = cp(cyanIdx(k));
        return <Ring key={`b${k}`} x={p.x} y={p.y} d={100 + 320 * easeOut(bt)} color={zero} opacity={1 - bt} bw={5} />;
      })}
    </div>
  );
};

/* ───────────── ADEGAN 5 — rangkuman: [−3] × [2] = [−6] (beat 54–63) ───────────── */

const Scene5: React.FC<{ tl: TL }> = ({ tl }) => {
  const { beat, prog, pulse } = tl;
  const o = win(beat, 54, 63, 0.6);
  if (o <= 0) return null;

  const Y = CY;
  const endP = pulse("s5_end", 1.2);
  const k = 1 + 0.8 * endP;
  const tripleX = [97, 181, 265];
  const dotsX = [456, 512];
  const barX = [693, 753, 813, 873, 933, 993];
  const xT = prog("s5_x", 0.4, backOut);
  const eqT = prog("s5_eq", 0.4, backOut);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        opacity: o,
        transform: `scale(${1 + 0.06 * endP})`,
        transformOrigin: `${CX}px ${Y}px`,
      }}
    >
      {tripleX.map((x, i) => {
        const t = prog(`s5_t${i}`, 0.4, backOut);
        return <Unit key={i} x={x} y={Y} size={70} sign="-" scale={t} opacity={clamp01(t * 2)} k={k} />;
      })}

      <Rect x={368 - 32} y={Y - 4} w={64} h={8} color={WHITE} rot={45} opacity={xT} k={k} />
      <Rect x={368 - 32} y={Y - 4} w={64} h={8} color={WHITE} rot={-45} opacity={xT} k={k} />

      {dotsX.map((x, i) => (
        <Ring key={i} x={x} y={Y} d={40} color={POS} scale={prog(`s5_d${i}`, 0.4, backOut)} bw={5} k={k} />
      ))}

      <Rect x={568} y={Y - 18} w={64} h={8} color={WHITE} opacity={eqT} k={k} />
      <Rect x={568} y={Y + 10} w={64} h={8} color={WHITE} opacity={eqT} k={k} />

      {barX.map((x, i) => {
        const t = prog(`s5_b${i}`, 0.4, backOut);
        return <Unit key={i} x={x} y={Y} size={50} sign="-" scale={t} opacity={clamp01(t * 2)} k={k} />;
      })}
    </div>
  );
};

/* ───────────── komposisi utama ───────────── */

export const NegativeTimesPositive: React.FC<{ data: TemplateData }> = ({ data }) => {
  const tl = useTimeline(data);
  const { beat } = tl;
  const swing = Math.sin(beat * 0.35);

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(circle at 50% 45%, #10143a 0%, ${data.background} 70%)`,
        overflow: "hidden",
      }}
    >
      {data.audio ? <Audio src={staticFile(data.audio)} /> : null}
      <div
        style={{
          position: "absolute",
          inset: 0,
          transform: `scale(${1.015 + 0.012 * swing}) translate(${swing * 6}px, ${Math.cos(beat * 0.27) * 6}px)`,
        }}
      >
        <Dust beat={beat} />
        <Scene1 tl={tl} />
        <Scene2 tl={tl} />
        <Scene3 tl={tl} />
        <Scene4 tl={tl} />
        <Scene5 tl={tl} />
      </div>
    </AbsoluteFill>
  );
};