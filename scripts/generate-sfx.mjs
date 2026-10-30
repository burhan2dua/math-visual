import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const templateId = process.argv[2] ?? "negative-times-positive";
if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(templateId)) {
  throw new Error(
    `Invalid template ID "${templateId}". Use lowercase letters, numbers, and hyphens.`,
  );
}

const dataPath = resolve("src", "templates", templateId, "data.json");
let data;
try {
  data = JSON.parse(readFileSync(dataPath, "utf8"));
} catch (error) {
  throw new Error(`Could not read audio template data at ${dataPath}: ${error.message}`);
}
if (!data || typeof data !== "object" || Array.isArray(data)) {
  throw new Error(`Template "${templateId}" data.json must contain a JSON object.`);
}
if (!Array.isArray(data.cues)) {
  throw new Error(
    `Template "${templateId}" must define a cues array to generate SFX audio.`,
  );
}
if (typeof data.audio !== "string" || data.audio.length === 0) {
  throw new Error(
    `Template "${templateId}" must define an output path in its audio field.`,
  );
}
if (
  typeof data.durationInSeconds !== "number" ||
  !Number.isFinite(data.durationInSeconds) ||
  data.durationInSeconds <= 0
) {
  throw new Error(
    `Template "${templateId}" must define a positive durationInSeconds.`,
  );
}
const publicRoot = resolve("public");
const outPath = resolve(publicRoot, data.audio);
const outputRelativePath = relative(publicRoot, outPath);
if (
  isAbsolute(data.audio) ||
  outputRelativePath === ".." ||
  outputRelativePath.startsWith(`..${sep}`)
) {
  throw new Error("The audio output path must stay inside the public folder.");
}

const isRecord = (value) =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const assertNumber = (value, label, min, max) => {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `${label} must be a finite number between ${min} and ${max}.`,
    );
  }
};

if (data.sound !== undefined && !isRecord(data.sound)) {
  throw new Error(`Template "${templateId}" sound must be an object.`);
}
const sound = data.sound ?? {};
const SR = sound.sampleRate ?? 44100;
assertNumber(SR, "sound.sampleRate", 22050, 96000);
if (![22050, 32000, 44100, 48000, 96000].includes(SR)) {
  throw new Error(
    "sound.sampleRate must be one of 22050, 32000, 44100, 48000, or 96000.",
  );
}
const bpm = data.bpm ?? 90;
assertNumber(bpm, "bpm", 20, 300);
const beat = 60 / bpm;
const fadeOutSeconds = sound.fadeOutSeconds ?? 1.2;
assertNumber(fadeOutSeconds, "sound.fadeOutSeconds", 0, data.durationInSeconds);
const masterGain = sound.masterGain ?? 0.89;
assertNumber(masterGain, "sound.masterGain", 0, 2);
const clipDrive = sound.clipDrive ?? 1.1;
assertNumber(clipDrive, "sound.clipDrive", 0.1, 8);
const tick = sound.tick ?? {};
if (!isRecord(tick)) {
  throw new Error(`Template "${templateId}" sound.tick must be an object.`);
}
const tickEnabled = tick.enabled ?? true;
if (typeof tickEnabled !== "boolean") {
  throw new Error("sound.tick.enabled must be a boolean.");
}
const tickGain = tick.gain ?? data.tickGain ?? 0.04;
assertNumber(tickGain, "sound.tick.gain", 0, 1);
const tickSubdivision = tick.subdivisionBeats ?? 0.5;
assertNumber(tickSubdivision, "sound.tick.subdivisionBeats", 0.125, 8);
const tickPan = tick.pan ?? 0.4;
assertNumber(tickPan, "sound.tick.pan", 0, 1);

const padSettings = sound.pad ?? {};
if (!isRecord(padSettings)) {
  throw new Error(`Template "${templateId}" sound.pad must be an object.`);
}
const padGain = padSettings.gain ?? 0.05;
const padSubGain = padSettings.subGain ?? 0.16;
const padAttack = padSettings.attackSeconds ?? 0.7;
const padRelease = padSettings.releaseSeconds ?? 1.2;
const padTremoloDepth = padSettings.tremoloDepth ?? 0.1;
const padTremoloHz = padSettings.tremoloHz ?? 0.3;
assertNumber(padGain, "sound.pad.gain", 0, 2);
assertNumber(padSubGain, "sound.pad.subGain", 0, 2);
assertNumber(padAttack, "sound.pad.attackSeconds", 0.01, 30);
assertNumber(padRelease, "sound.pad.releaseSeconds", 0.01, 30);
assertNumber(padTremoloDepth, "sound.pad.tremoloDepth", 0, 1);
assertNumber(padTremoloHz, "sound.pad.tremoloHz", 0, 20);

const reverb = sound.reverb ?? {};
if (!isRecord(reverb)) {
  throw new Error(`Template "${templateId}" sound.reverb must be an object.`);
}
const reverbMix = reverb.mix ?? 0.4;
const reverbFeedback = reverb.feedback ?? 0.82;
const reverbDamping = reverb.damping ?? 0.35;
const reverbDelays = reverb.delaysMs ?? [53.1, 67.7, 79.3, 97.1];
assertNumber(reverbMix, "sound.reverb.mix", 0, 1);
assertNumber(reverbFeedback, "sound.reverb.feedback", 0, 0.98);
assertNumber(reverbDamping, "sound.reverb.damping", 0, 1);
if (
  !Array.isArray(reverbDelays) ||
  reverbDelays.length === 0 ||
  reverbDelays.length > 12
) {
  throw new Error("sound.reverb.delaysMs must be an array of 1 to 12 delays.");
}
reverbDelays.forEach((delay, index) =>
  assertNumber(delay, `sound.reverb.delaysMs[${index}]`, 5, 500),
);

const knownVoices = new Set([
  "bell",
  "chime",
  "pluck",
  "sparkle",
  "pop",
  "thud",
  "whoosh",
]);
data.cues.forEach((cue, index) => {
  if (!isRecord(cue)) {
    throw new Error(`cues[${index}] must be an object.`);
  }
  if (typeof cue.id !== "string" || cue.id.trim().length === 0) {
    throw new Error(`cues[${index}].id must be a non-empty string.`);
  }
  assertNumber(cue.beat, `cues[${index}].beat`, 0, data.durationInSeconds / beat);
  if (!knownVoices.has(cue.voice)) {
    throw new Error(
      `cues[${index}].voice "${cue.voice}" is unsupported. Use: ${[...knownVoices].join(", ")}.`,
    );
  }
  if (cue.voice !== "whoosh" && (!Array.isArray(cue.notes) || cue.notes.length === 0)) {
    throw new Error(
      `cues[${index}].notes must contain at least one MIDI note for voice "${cue.voice}".`,
    );
  }
  if (cue.notes !== undefined) {
    if (!Array.isArray(cue.notes) || cue.notes.length > 16) {
      throw new Error(`cues[${index}].notes must contain at most 16 MIDI notes.`);
    }
    cue.notes.forEach((note, noteIndex) =>
      assertNumber(note, `cues[${index}].notes[${noteIndex}]`, 0, 127),
    );
  }
  if (cue.gain !== undefined) {
    assertNumber(cue.gain, `cues[${index}].gain`, 0, 2);
  }
  if (cue.pan !== undefined) {
    assertNumber(cue.pan, `cues[${index}].pan`, -1, 1);
  }
});
if (data.pads !== undefined && !Array.isArray(data.pads)) {
  throw new Error(`Template "${templateId}" pads must be an array.`);
}
for (const [index, pad] of (data.pads ?? []).entries()) {
  if (!isRecord(pad)) {
    throw new Error(`pads[${index}] must be an object.`);
  }
  assertNumber(pad.beat, `pads[${index}].beat`, 0, data.durationInSeconds / beat);
  assertNumber(pad.beats, `pads[${index}].beats`, 0.01, data.durationInSeconds / beat);
  assertNumber(pad.root, `pads[${index}].root`, 0, 127);
  if (!Array.isArray(pad.notes) || pad.notes.length === 0 || pad.notes.length > 16) {
    throw new Error(`pads[${index}].notes must contain 1 to 16 MIDI notes.`);
  }
  pad.notes.forEach((note, noteIndex) =>
    assertNumber(note, `pads[${index}].notes[${noteIndex}]`, 0, 127),
  );
  for (const key of ["gain", "subGain"]) {
    if (pad[key] !== undefined) {
      assertNumber(pad[key], `pads[${index}].${key}`, 0, 2);
    }
  }
  for (const key of ["attackSeconds", "releaseSeconds"]) {
    if (pad[key] !== undefined) {
      assertNumber(pad[key], `pads[${index}].${key}`, 0.01, 30);
    }
  }
  if (pad.pan !== undefined) {
    assertNumber(pad.pan, `pads[${index}].pan`, -1, 1);
  }
}

const total = Math.ceil(data.durationInSeconds * SR);
const L = new Float32Array(total);
const R = new Float32Array(total);

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const sine = (f, t) => Math.sin(2 * Math.PI * f * t);
const env = (t, a, d) => Math.min(1, t / a) * Math.exp(-t / d);

let seed = 1337;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 4294967296) * 2 - 1;
};

const mk = (sec, fn) => {
  const n = Math.floor(sec * SR);
  const b = new Float32Array(n);
  for (let i = 0; i < n; i++) b[i] = fn(i / SR, i);
  return b;
};

function layer(notes, stagger, make) {
  if (!notes.length) return new Float32Array(1);
  const parts = notes.map((n, i) => ({
    off: Math.floor(i * stagger * SR),
    buf: make(mtof(n), i),
  }));
  const len = Math.max(...parts.map((p) => p.off + p.buf.length));
  const out = new Float32Array(len);
  const norm = 1 / Math.sqrt(parts.length);
  for (const p of parts)
    for (let i = 0; i < p.buf.length; i++) out[p.off + i] += p.buf[i] * norm;
  return out;
}

function put(t0, buf, gain, pan) {
  const start = Math.floor(t0 * SR);
  const gl = gain * Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = gain * Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < buf.length && start + i < total; i++) {
    L[start + i] += buf[i] * gl;
    R[start + i] += buf[i] * gr;
  }
}

const voices = {
  bell: (n) =>
    layer(n, 0, (f) =>
      mk(2.6, (t) =>
        env(t, 0.004, 0.6) *
        (sine(f, t) +
          0.35 * sine(f * 2.01, t) * Math.exp(-t * 3) +
          0.12 * sine(f * 3.99, t) * Math.exp(-t * 7)),
      ),
    ),
  chime: (n) =>
    layer(n, 0.06, (f) =>
      mk(4.2, (t) =>
        env(t, 0.01, 1.1) *
        (sine(f, t) + sine(f * 1.004, t) + 0.3 * sine(f * 2.005, t) * Math.exp(-t * 2)) * 0.6,
      ),
    ),
  pluck: (n) =>
    layer(n, 0, (f) =>
      mk(0.9, (t) =>
        env(t, 0.002, 0.16) *
        (sine(f, t) +
          0.45 * sine(f * 4, t) * Math.exp(-t * 18) +
          0.2 * sine(f * 2, t) * Math.exp(-t * 8)),
      ),
    ),
  sparkle: (n) =>
    layer(n, 0.05, (f) =>
      mk(1.3, (t) =>
        env(t, 0.002, 0.3) * (sine(f * 2, t) + 0.3 * sine(f * 3, t) * Math.exp(-t * 6)) * 0.7,
      ),
    ),
  pop: (n) =>
    layer(n, 0, (f) => {
      let ph = 0;
      let hp = 0;
      return mk(0.5, (t) => {
        ph += (2 * Math.PI * f * (1 + 0.9 * Math.exp(-t * 50))) / SR;
        const x = rnd();
        hp += 0.2 * (x - hp);
        const tick = (x - hp) * Math.exp(-t / 0.003);
        return env(t, 0.002, 0.09) * Math.sin(ph) + 0.3 * tick;
      });
    }),
  thud: (n) =>
    layer(n, 0, (f) => {
      let ph = 0;
      return mk(1.2, (t) => {
        ph += (2 * Math.PI * f * (1 + 1.5 * Math.exp(-t * 30))) / SR;
        return 0.9 * env(t, 0.004, 0.28) * Math.sin(ph);
      });
    }),
  whoosh: () => {
    let lp = 0;
    let lp2 = 0;
    return mk(1.2, (t) => {
      const sh = Math.sin(Math.PI * Math.min(1, t / 1.2));
      const a = 0.01 + 0.22 * sh * sh;
      lp += a * (rnd() - lp);
      lp2 += a * (lp - lp2);
      return lp2 * 4 * sh;
    });
  },
};

// 1) cue SFX (nada polyphonic)
data.cues.forEach((c, idx) => {
  const make = voices[c.voice];
  if (!make) return;
  const pan = c.pan ?? Math.sin(idx * 1.7) * 0.5;
  put(c.beat * beat, make(c.notes ?? []), c.gain ?? 0.6, pan);
});

// 2) pad + sub bass
for (const p of data.pads ?? []) {
  const dur = p.beats * beat;
  const attack = p.attackSeconds ?? padAttack;
  const release = p.releaseSeconds ?? padRelease;
  const len = dur + release;
  const chordGain = p.gain ?? padGain;
  const chordPan = p.pan;
  p.notes.forEach((n, i) => {
    const f = mtof(n);
    const buf = mk(len, (t) => {
      const att = Math.min(1, t / attack);
      const rel = t < dur ? 1 : Math.max(0, 1 - (t - dur) / release);
      const trem = 1 + padTremoloDepth * sine(padTremoloHz, t);
      return (
        att * rel * trem *
        ((sine(f * 0.997, t) + sine(f, t) + sine(f * 1.003, t)) / 3 + 0.12 * sine(f * 2, t))
      );
    });
    const pan =
      chordPan ??
      (p.notes.length > 1 ? (i / (p.notes.length - 1) - 0.5) * 0.6 : 0);
    put(p.beat * beat, buf, chordGain, pan);
  });
  const fr = mtof(p.root);
  const sub = mk(len, (t) => {
    const att = Math.min(1, t / Math.min(0.05, attack));
    const rel = t < dur ? 1 : Math.max(0, 1 - (t - dur) / release);
    return att * rel * sine(fr, t);
  });
  put(p.beat * beat, sub, p.subGain ?? padSubGain, 0);
}

// 3) tick halus tiap setengah beat (tekstur ASMR)
for (
  let b = 0;
  tickEnabled && b * beat < data.durationInSeconds - 0.1;
  b += tickSubdivision
) {
  let hp = 0;
  const buf = mk(0.04, (t) => {
    const x = rnd();
    hp += 0.25 * (x - hp);
    return (x - hp) * Math.exp(-t / 0.006);
  });
  const down = Math.abs(b % 1) < 0.0001;
  const pan = down ? -tickPan : tickPan;
  put(b * beat, buf, tickGain * (down ? 1.2 : 0.7), pan);
}

// 4) reverb ruang + master
function reverbSignal(x, delaysMs, fb, damp) {
  const out = new Float32Array(x.length);
  for (const d of delaysMs) {
    const n = Math.floor((d * SR) / 1000);
    const buf = new Float32Array(n);
    let idx = 0;
    let lp = 0;
    for (let i = 0; i < x.length; i++) {
      const y = buf[idx];
      lp = y * (1 - damp) + lp * damp;
      buf[idx] = x[i] + lp * fb;
      idx = (idx + 1) % n;
      out[i] += y * 0.25;
    }
  }
  return out;
}
const wetL = reverbSignal(L, reverbDelays, reverbFeedback, reverbDamping);
const rightDelays = reverbDelays.map((delay, index) => delay + (index % 2 ? 1.7 : 0.9));
const wetR = reverbSignal(R, rightDelays, reverbFeedback, reverbDamping);

let peak = 0.0001;
for (let i = 0; i < total; i++) {
  L[i] = Math.tanh((L[i] + reverbMix * wetL[i]) * clipDrive);
  R[i] = Math.tanh((R[i] + reverbMix * wetR[i]) * clipDrive);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = masterGain / peak;
const fadeN = Math.floor(fadeOutSeconds * SR);

// 5) tulis WAV 16-bit stereo
const out = Buffer.alloc(44 + total * 4);
out.write("RIFF", 0);
out.writeUInt32LE(36 + total * 4, 4);
out.write("WAVEfmt ", 8);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write("data", 36);
out.writeUInt32LE(total * 4, 40);
for (let i = 0; i < total; i++) {
  const fade = i > total - fadeN ? (total - i) / fadeN : 1;
  const l = Math.max(-1, Math.min(1, L[i] * norm * fade));
  const r = Math.max(-1, Math.min(1, R[i] * norm * fade));
  out.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
}

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(`✔ ${outPath} (${data.durationInSeconds}s)`);