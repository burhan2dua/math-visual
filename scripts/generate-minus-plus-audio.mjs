import fs from "node:fs";
import path from "node:path";

const DATA = "src/templates/minus-times-plus/data.json";
const OUT = "public/audio/minus-times-plus.wav";

const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
const SR = 44100;
const DUR = data.durationInSeconds;
const N = Math.floor(SR * DUR);
const L = new Float32Array(N);
const R = new Float32Array(N);
const TAU = Math.PI * 2;

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(20261031);

/* ───────── Util ───────── */

const SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const freq = (name) => {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`Nama nada tidak valid: ${name}`);
  const s = SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0);
  const midi = 12 * (Number(m[3]) + 1) + s;
  return 440 * Math.pow(2, (midi - 69) / 12);
};

/** Menulis satu "suara" ke buffer stereo. pan: -1 (kiri) … 1 (kanan) */
const voice = (start, len, pan, gen) => {
  const i0 = Math.floor(start * SR);
  const n = Math.floor(len * SR);
  const ang = ((pan + 1) * Math.PI) / 4;
  const gl = Math.cos(ang);
  const gr = Math.sin(ang);
  for (let i = 0; i < n; i++) {
    const k = i0 + i;
    if (k < 0 || k >= N) continue;
    const s = gen(i / SR, i);
    L[k] += s * gl;
    R[k] += s * gr;
  }
};

/* ───────── Instrumen ───────── */

// Bel FM: bunyi utama untuk melodi
const pluck = (t, note, { vel = 0.5, len = 1.6, pan = 0, mult = 1 } = {}) => {
  const f = freq(note) * mult;
  voice(t, len, pan, (tt) => {
    const e = Math.exp(-tt * 3.2) * Math.min(tt / 0.004, 1);
    const mod = Math.sin(TAU * f * 2.005 * tt) * 2.2 * Math.exp(-tt * 6);
    return (
      (Math.sin(TAU * f * tt + mod) * 0.8 +
        Math.sin(TAU * f * 2 * tt) * 0.15 * Math.exp(-tt * 5)) *
      e *
      vel
    );
  });
};

// Pad lembut untuk chord
const pad = (t, notes, len, { vel = 0.12, attack = 1.0, release = 1.2, pan = 0 } = {}) => {
  notes.forEach((n, i) => {
    const w = TAU * freq(n);
    const p = notes.length > 1 ? (i / (notes.length - 1) - 0.5) * 1.2 : pan;
    voice(t, len, p, (tt) => {
      const e = Math.max(0, Math.min(tt / attack, 1, (len - tt) / release));
      const lfo = 1 + 0.15 * Math.sin(TAU * 0.3 * tt + i);
      const x =
        Math.sin(w * tt) +
        0.45 * Math.sin(w * 2.004 * tt) +
        0.2 * Math.sin(w * 3 * tt);
      return x * e * vel * lfo;
    });
  });
};

const bass = (t, note, { vel = 0.22, len = 2.2 } = {}) => {
  const w = TAU * freq(note);
  voice(t, len, 0, (tt) => Math.sin(w * tt) * Math.exp(-tt * 1.6) * Math.min(tt / 0.01, 1) * vel);
};

// Whoosh naik
const riser = (t, len, { vel = 0.35 } = {}) => {
  let lp = 0;
  let ph = 0;
  voice(t, len, 0, (tt) => {
    const u = tt / len;
    lp += (0.02 + 0.6 * u * u) * (rng() * 2 - 1 - lp);
    ph += (TAU * 200 * Math.pow(18, u)) / SR;
    const saw = ((ph / Math.PI) % 2) - 1;
    return (lp * 0.96 + saw * 0.18 * u) * u * vel;
  });
};

// Dentuman dalam + chord
const hit = (t, notes, { vel = 0.6 } = {}) => {
  let ph = 0;
  voice(t, 1.6, 0, (tt) => {
    ph += (TAU * (38 + 90 * Math.exp(-tt * 9))) / SR;
    return Math.sin(ph) * Math.exp(-tt * 2.6) * vel;
  });
  notes.forEach((n, i) =>
    pluck(t + i * 0.012, n, { vel: vel * 0.35, len: 1.8, pan: (i - 1) * 0.4 }),
  );
};

// Tabrakan / saling menghapus
const burst = (t, notes, { vel = 0.55 } = {}) => {
  let prev = 0;
  let ph = 0;
  voice(t, 0.7, 0, (tt) => {
    const n = rng() * 2 - 1;
    const y = n - prev;
    prev = n;
    ph += (TAU * (200 + 1800 * Math.exp(-tt * 14))) / SR;
    return (y * 0.5 * Math.exp(-tt * 9) + Math.sin(ph) * 0.25 * Math.exp(-tt * 7)) * vel;
  });
  notes.forEach((n, i) =>
    pluck(t + 0.02 + i * 0.05, n, {
      vel: vel * 0.5,
      len: 2.0,
      pan: (i / Math.max(1, notes.length - 1) - 0.5) * 0.9,
    }),
  );
};

// Jatuh: ping dengan pitch turun
const drop = (t, note, { vel = 0.5, pan = 0 } = {}) => {
  const f = freq(note);
  let ph = 0;
  voice(t, 0.5, pan, (tt) => {
    ph += (TAU * f * (1 + 2.5 * Math.exp(-tt * 40))) / SR;
    return Math.sin(ph) * Math.exp(-tt * 9) * vel * Math.min(tt / 0.002, 1);
  });
  pluck(t + 0.02, note, { vel: vel * 0.35, len: 0.9, pan });
};

// Potong: swish + zap laser
const cut = (t, note, { vel = 0.5, pan = 0 } = {}) => {
  const f = freq(note);
  let prev = 0;
  let ph = 0;
  voice(t, 0.5, pan, (tt) => {
    const n = rng() * 2 - 1;
    const y = n - prev;
    prev = n;
    const sw = y * 0.45 * Math.exp(-tt * 8) * Math.min(tt / 0.005, 1);
    ph += (TAU * (f + f * 4 * Math.exp(-tt * 10))) / SR;
    const saw = ((ph / Math.PI) % 2) - 1;
    return (sw + saw * 0.25 * Math.exp(-tt * 12)) * vel;
  });
  pluck(t + 0.05, note, { vel: vel * 0.4, len: 1.0, pan });
};

/* ───────── Lagu latar ───────── */

const resolveT = data.events.find((e) => e.tag === "resolve")?.t ?? DUR * 0.8;
const PROG = [
  { notes: ["A3", "C4", "E4"], root: "A2" },
  { notes: ["F3", "A3", "C4"], root: "F2" },
  { notes: ["C4", "E4", "G4"], root: "C3" },
  { notes: ["G3", "B3", "D4"], root: "G2" },
];
const MAJOR = { notes: ["C4", "E4", "G4"], root: "C3" };
const SEG = 5;

const segments = [];
for (let s = 0, k = 0; s < resolveT; s += SEG, k++) {
  segments.push({ from: s, to: Math.min(s + SEG, resolveT), chord: PROG[k % PROG.length] });
}
segments.push({ from: resolveT, to: DUR, chord: MAJOR });

for (const sg of segments) {
  pad(sg.from, sg.chord.notes, sg.to - sg.from + 0.8, { vel: 0.085 });
  bass(sg.from, sg.chord.root);
}

// Arpeggio lembut (denyut)
const STEP = 60 / 96 / 2;
const ARP_PATTERN = [0, 1, 2, 1];
for (let t = 0.4, i = 0; t < DUR - 1.5; t += STEP, i++) {
  const sg = segments.find((x) => t >= x.from && t < x.to) ?? segments[segments.length - 1];
  const note = sg.chord.notes[ARP_PATTERN[i % ARP_PATTERN.length]];
  pluck(t, note, { vel: 0.05, len: 0.8, pan: i % 2 ? 0.6 : -0.6, mult: 2 });
}

/* ───────── Event dari data.json ───────── */

for (const e of data.events) {
  const pan = e.pan ?? 0;
  switch (e.type) {
    case "riser":
      riser(e.t, e.len ?? 2, { vel: e.vel ?? 0.35 });
      break;
    case "hit":
      hit(e.t, e.notes, { vel: e.vel ?? 0.6 });
      break;
    case "pluck":
      pluck(e.t, e.note, { vel: e.vel ?? 0.5, len: e.len ?? 1.6, pan });
      break;
    case "burst":
      burst(e.t, e.notes, { vel: e.vel ?? 0.55 });
      break;
    case "drop":
      drop(e.t, e.note, { vel: e.vel ?? 0.5, pan });
      break;
    case "cut":
      cut(e.t, e.note, { vel: e.vel ?? 0.5, pan });
      break;
    case "arp":
      e.notes.forEach((n, i) =>
        pluck(e.t + i * (e.step ?? 0.1), n, {
          vel: e.vel ?? 0.45,
          len: 1.8,
          pan: (i / Math.max(1, e.notes.length - 1) - 0.5) * 0.8,
        }),
      );
      break;
    case "swell": {
      const len = e.len ?? 1.6;
      pad(e.t, e.notes, len, { vel: e.vel ?? 0.2, attack: len * 0.6, release: len * 0.4 });
      break;
    }
    default:
      throw new Error(`Tipe event tidak dikenal: ${e.type}`);
  }
}

/* ───────── Master: delay ping-pong, soft clip, normalisasi ───────── */

const dl = Math.floor(SR * 0.33);
const dr = Math.floor(SR * 0.47);
const fb = 0.34;
const oL = new Float32Array(N);
const oR = new Float32Array(N);
for (let i = 0; i < N; i++) {
  oL[i] = L[i] + (i >= dl ? oR[i - dl] * fb : 0);
  oR[i] = R[i] + (i >= dr ? oL[i - dr] * fb : 0);
}

let peak = 0;
for (let i = 0; i < N; i++) {
  oL[i] = Math.tanh(oL[i] * 1.1);
  oR[i] = Math.tanh(oR[i] * 1.1);
  peak = Math.max(peak, Math.abs(oL[i]), Math.abs(oR[i]));
}
const gain = 0.9 / (peak || 1);
const fin = Math.floor(SR * 0.01);
const fout = Math.floor(SR * 1.5);

const buf = Buffer.alloc(44 + N * 4);
buf.write("RIFF", 0);
buf.writeUInt32LE(36 + N * 4, 4);
buf.write("WAVE", 8);
buf.write("fmt ", 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20);
buf.writeUInt16LE(2, 22);
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write("data", 36);
buf.writeUInt32LE(N * 4, 40);

for (let i = 0; i < N; i++) {
  const f = Math.min(1, i / fin) * Math.min(1, (N - i) / fout);
  const l = Math.max(-1, Math.min(1, oL[i] * gain * f));
  const r = Math.max(-1, Math.min(1, oR[i] * gain * f));
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, buf);
console.log(`✔ ${OUT} (${DUR}s, ${(buf.length / 1048576).toFixed(1)} MB)`);