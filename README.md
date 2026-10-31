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
Run workflow**. Masukkan nama folder template persis, misalnya
`lifespan-globe`; workflow mencari folder yang berisi `data.json` dan
`template.tsx`, lalu menampilkan daftar ID yang tersedia jika input tidak cocok.
GitHub Actions belum mendukung dropdown yang opsinya dibaca dinamis dari folder
repository. Dengan input teks ini, folder template baru langsung bisa dirender
tanpa mengubah file workflow. Video MP4 tersedia sebagai artifact setelah render.

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




Buat satu template baru untuk proyek Remotion saya. Saya melampirkan README proyek, script generator SFX, contoh template, dan data yang ingin divisualisasikan.

Hasilkan kode lengkap hanya untuk:
1. src/templates/[ID-TEMPLATE]/data.json
2. src/templates/[ID-TEMPLATE]/template.tsx

Jangan mengubah registry, Root, main.tsx, types.ts, package.json, atau template lain. Sistem proyek menemukan folder template secara otomatis.

STRUKTUR TEMPLATE:
- Nama folder menjadi ID URL, misalnya `sales-chart` dibuka di `/sales-chart`.
- Komponen harus memiliki named export persis `Template` dan menerima prop `data`.
- Tipe data khusus boleh ditulis lokal di `template.tsx`; sesuaikan dengan JSON.
- JSON harus valid dan berupa object di tingkat teratas.
- Sertakan `title`, `subtitle`, `background`, `accent`, dan `durationInSeconds`.
- `width`, `height`, dan `fps` opsional. Default proyek adalah 1920 × 1080 pada 30 fps.
- Jangan mengubah, mengarang, atau membuang data yang saya berikan.

REMOTION:
- Gunakan animasi deterministik berbasis frame Remotion seperti `useCurrentFrame`, `useVideoConfig`, `interpolate`, dan `Easing`.
- Jangan memakai timer browser, `setTimeout`, atau `setInterval`.
- Pastikan semua animasi selesai atau berada dalam rentang `durationInSeconds`.
- Jangan memakai dependency atau aset yang tidak disediakan. Utamakan React/SVG atau aset yang berada di folder template.
- Jika audio diminta, template harus memutarnya menggunakan Remotion, misalnya
  `<Audio src={staticFile(data.audio)} />`, dan mengimpor `Audio` serta `staticFile`.
- Jangan menambahkan audio jika saya tidak memintanya.

AUDIO SFX POLIFONIK (hanya jika saya meminta audio):
Template menggunakan `scripts/generate-sfx.mjs`. Masukkan pengaturan audio di `data.json`:
- `bpm`: tempo; waktu cue dihitung dalam beat.
- `audio`: path output relatif terhadap `public/`, misalnya `"audio/sales-chart.wav"`.
- `cues`: array event SFX. Setiap cue memiliki `id`, `beat`, dan `voice`; opsional `notes`, `gain`, `pan`.
- `notes` berisi nomor MIDI. Beberapa note dalam cue yang sama membentuk chord polifonik; cue yang waktunya bertumpuk juga dicampur.
- Voice yang didukung: `bell`, `chime`, `pluck`, `sparkle`, `pop`, `thud`, `whoosh`. `whoosh` tidak membutuhkan `notes`; voice lainnya memerlukannya.
- `pads` opsional untuk chord/latar berkelanjutan. Setiap pad memiliki `beat`, `beats`, `root`, dan `notes`; opsional `gain`, `subGain`, `attackSeconds`, `releaseSeconds`, `pan`.
- `sound` opsional untuk mengatur hasil:
  - `sampleRate`: 22050, 32000, 44100, 48000, atau 96000.
  - `masterGain`, `clipDrive`, `fadeOutSeconds`.
  - `tick`: `enabled`, `gain`, `subdivisionBeats`, `pan`.
  - `pad`: `gain`, `subGain`, `attackSeconds`, `releaseSeconds`, `tremoloDepth`, `tremoloHz`.
  - `reverb`: `mix`, `feedback`, `damping`, `delaysMs`.
- Jadwalkan cue agar sesuai dengan momen animasi. Konversi waktu adegan dalam detik ke beat dengan `beat = seconds * bpm / 60`.
- Jangan menulis script generator audio baru; gunakan format generator yang saya lampirkan. Setelah file dibuat, saya akan menjalankan:
  `npm run audio:sfx -- [ID-TEMPLATE]`

KEBUTUHAN VISUAL:
- ID template: why -x+ = -
- Tujuan dan urutan adegan: menjelaskan dengan visual animasi memanfaatkan berbagai bentuk ruang sehingga penonton paham kenapa -x+ = -, alih-laih menggunakan  text, gunakan angka saja, sisipkan jduudl diatas, agar penonton paham tujuan video yaitu agar paham mengapa -x+ = -, gunakan efek kamera bergetar, zoom in zoom out yang relevan dengan animasi video, 
- Data asli: data.json
- Durasi dan ukuran video: vertikal
- Bahasa, warna, gaya, animasi: bahasa inggris, glow in the dark, animasi memanjakan mata
- Audio/SFX yang diinginkan: sfx asmr, memanjakan telinga, full efek suara, seluruh gerakkan terdapat suara, polyphonic, 

Tampilkan kode lengkap kedua file dan sebutkan nama/lokasinya. Pastikan setiap field JSON yang digunakan memang dibaca oleh template, dan tidak ada field yang diperlukan tetapi hilang dari JSON. Jangan mengklaim sudah menjalankan validasi proyek jika tidak benar-benar menjalankannya.