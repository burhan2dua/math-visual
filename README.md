# Dynamic Remotion Templates

Template ditemukan otomatis dari folder di `src/templates/`. Untuk menambah
template, cukup buat folder baru yang berisi:

```text
src/templates/nama-template/
  data.json
  template.tsx
  assets/                 # opsional
```

Komponen di `template.tsx` harus mengekspor satu komponen React. Gunakan nama
`Template` dan terima prop `data`; tipe data boleh didefinisikan lokal di file
template, jadi template baru tidak perlu mengubah `src/types.ts`.

```tsx
type ChartData = {
  title: string;
  durationInSeconds: number;
  values: Array<{ label: string; value: number }>;
};

export const Template = ({ data }: { data: ChartData }) => {
  // Render animasi dengan frame Remotion.
  return null;
};
```

`data.json` dapat memiliki properti khusus apa pun yang dibutuhkan template.
Properti `durationInSeconds` mengatur durasi video. `width`, `height`, dan `fps`
opsional; default-nya 1920 × 1080 dan 30 fps. `title`, `subtitle`, `background`,
dan `accent` dipakai untuk metadata/default tampilan. Jika durasi tidak diisi,
registry menampilkan peringatan dan memakai default 10 detik. JSON harus berupa
object pada tingkat teratas.

Nama folder menjadi ID URL dan composition Remotion. Contohnya,
`src/templates/nama-template/` dapat dibuka di `/nama-template`.
Registry di `src/templates/generated.ts` dibuat otomatis dan tidak perlu diedit.
Saat server berjalan, perubahan atau penambahan folder template dipindai ulang.
Aset lokal dapat diimpor dari `assets/`; file yang disajikan lewat URL dapat
ditempatkan di `public/`.

## Menjalankan preview dan Remotion Studio

```bash
npm install
npm run dev
```

Satu perintah menjalankan keduanya:

- Preview web: `http://localhost:5173/` (pilih template atau buka `/<id>`).
- Remotion Studio: `http://localhost:3000/` (pilih composition berdasarkan ID).

## Render dan validasi

```bash
npm run render -- nama-template out/video.mp4
npm run typecheck
npm run build
```

Render otomatis di GitHub tersedia melalui **Actions → Render Remotion video →
Run workflow**. Pilih template dari dropdown; video MP4 akan tersedia sebagai
artifact workflow setelah render selesai. Daftar pilihan dropdown berada di
`.github/workflows/render-video.yml`; tambahkan ID folder baru ke `options`
ketika menambahkan template.

Perintah Studio, render, type-check, dan build membuat ulang registry otomatis.
Untuk membuat audio polifonik/SFX, isi properti audio di `data.json`, lalu jalankan:

```bash
npm run audio:sfx -- nama-template
```

Contoh konfigurasi yang dapat ditempatkan bersama properti template lainnya:

```json
{
  "durationInSeconds": 12,
  "bpm": 84,
  "audio": "audio/nama-template.wav",
  "sound": {
    "sampleRate": 44100,
    "masterGain": 0.84,
    "clipDrive": 1.1,
    "fadeOutSeconds": 1.2,
    "tick": {
      "enabled": false,
      "gain": 0.025,
      "subdivisionBeats": 0.5,
      "pan": 0.4
    },
    "pad": {
      "gain": 0.05,
      "subGain": 0.12,
      "attackSeconds": 0.7,
      "releaseSeconds": 1.2,
      "tremoloDepth": 0.1,
      "tremoloHz": 0.3
    },
    "reverb": {
      "mix": 0.35,
      "feedback": 0.82,
      "damping": 0.35,
      "delaysMs": [53.1, 67.7, 79.3, 97.1]
    }
  },
  "cues": [
    {
      "id": "intro-chord",
      "beat": 0,
      "voice": "chime",
      "notes": [60, 64, 67],
      "gain": 0.22,
      "pan": 0
    },
    {
      "id": "soft-transition",
      "beat": 4,
      "voice": "whoosh",
      "gain": 0.16,
      "pan": 0.2
    }
  ],
  "pads": [
    {
      "beat": 0,
      "beats": 8,
      "root": 48,
      "notes": [60, 64, 67],
      "gain": 0.05,
      "subGain": 0.12
    }
  ]
}
```

Cue `beat` menentukan waktu berdasarkan `bpm`; beberapa MIDI note dalam satu cue
dimainkan polifonik, dan cue/pad yang waktunya bertumpuk juga dicampur bersama.
Voice yang didukung: `bell`, `chime`, `pluck`, `sparkle`, `pop`, `thud`, dan
`whoosh`. Semua note memakai nomor MIDI. Generator memakai seed tetap agar hasil
noise konsisten saat dirender ulang, memvalidasi konfigurasi, dan hanya menulis
file ke dalam `public/`.

Template yang ingin memutar hasilnya perlu menghubungkan audio melalui Remotion,
misalnya `<Audio src={staticFile(data.audio)} />`. `data.audio` adalah lokasi
output relatif terhadap `public/`. Jika `sound` tidak ditentukan, default
generator tetap tersedia dan `tickGain` lama tetap didukung. ID template
opsional; tanpa argumen, generator memakai `negative-times-positive`.
