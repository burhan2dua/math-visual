# Panduan Proyek Remotion

## Informasi Proyek

Proyek ini menggunakan Remotion untuk membuat video dari komponen React. Template
ditemukan otomatis dari folder di `src/templates/`; registry dibuat otomatis,
jadi biasanya tidak perlu mengubah file registry secara manual.

Struktur satu template:

```text
src/templates/nama-template/
  data.json
  template.tsx
  assets/                 # opsional
```

Nama folder menjadi ID URL dan composition Remotion. Contohnya,
`src/templates/nama-template/` dapat dibuka di `/nama-template` dan dipilih di
Remotion Studio. Aset lokal dapat diimpor dari folder `assets/`; file yang
disajikan lewat URL dapat ditempatkan di `public/`.

`data.json` harus berupa object JSON pada tingkat teratas. Properti
`durationInSeconds` mengatur durasi video. `width`, `height`, dan `fps` bersifat
opsional; nilai bawaan proyek adalah 1920 × 1080 dan 30 fps. Jika durasi tidak
diisi, registry menggunakan nilai bawaan 10 detik. Properti `title`,
`subtitle`, `background`, dan `accent` digunakan sebagai metadata atau tampilan
bawaan.

Komponen di `template.tsx` harus mengekspor satu komponen React. Gunakan named
export `Template` dan terima prop `data`. Tipe data boleh didefinisikan secara
lokal di file template, sehingga template baru tidak perlu mengubah
`src/types.ts`.

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

Registry di `src/templates/generated.ts` dibuat otomatis. Saat server berjalan,
perubahan atau penambahan folder template dipindai ulang.

## Menjalankan Preview dan Studio

```bash
npm install
npm run dev
```

Perintah tersebut menjalankan:

- Preview web: `http://localhost:5173/` (pilih template atau buka `/<id>`).
- Remotion Studio: `http://localhost:3000/` (pilih composition berdasarkan ID).

## Render dan Validasi

Render satu template dan jalankan pemeriksaan proyek dengan:

```bash
npm run render -- nama-template out/video.mp4
npm run typecheck
npm run build
```

Render otomatis tersedia melalui **Actions → Render Remotion video → Run
workflow** di GitHub. Kolom template menerima ID folder persis, dipisahkan koma:

- Kosongkan kolom untuk merender semua folder template yang valid.
- Isi satu ID untuk merender satu template.
- Isi beberapa ID, misalnya `rotasi,why-3-14`, untuk merender template pilihan
  secara berurutan.

Workflow memvalidasi folder yang berisi `data.json` dan `template.tsx`, termasuk
format JSON-nya. Jika audio atau render sebuah template gagal, workflow tetap
mencoba template berikutnya. Artifact hanya berisi video yang berhasil dibuat;
workflow tetap ditandai gagal jika ada template yang gagal. Video MP4 tersedia
sebagai artifact setelah proses selesai.

Perintah Studio, render, type-check, dan build membuat ulang registry secara
otomatis.

## Audio SFX

Untuk membuat audio polifonik/SFX, isi properti audio di `data.json`, lalu
jalankan:

```bash
npm run audio:sfx -- nama-template
```

Contoh konfigurasi yang dapat diletakkan bersama properti template lainnya:

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

Nilai `beat` menentukan waktu berdasarkan `bpm`; waktu adegan dalam detik dapat
dikonversi dengan rumus `beat = seconds * bpm / 60`. Beberapa MIDI note dalam
satu cue membentuk chord polifonik, sedangkan cue dan pad yang waktunya
bertumpuk akan dicampur. Voice yang didukung: `bell`, `chime`, `pluck`,
`sparkle`, `pop`, `thud`, dan `whoosh`. Semua note memakai nomor MIDI.

Generator menggunakan seed tetap agar noise konsisten saat dirender ulang,
memvalidasi konfigurasi, dan hanya menulis file ke dalam `public/`. Template
yang ingin memutar hasilnya perlu menghubungkan audio melalui Remotion, misalnya
`<Audio src={staticFile(data.audio)} />`. Nilai `data.audio` adalah lokasi
output relatif terhadap `public/`. Jika `sound` tidak ditentukan, nilai bawaan
generator tetap tersedia dan `tickGain` lama masih didukung. ID template
bersifat opsional; tanpa argumen, generator menggunakan `negative-times-positive`.

## Aturan Khusus Pembuatan Template

Aturan di bagian ini berlaku saat meminta pembuatan template baru. Letakkan
permintaan yang berlaku untuk seluruh proyek di sini; jangan mencampurnya dengan
judul atau arahan kreatif untuk satu video tertentu.

- Buat satu template baru di `src/templates/[ID-TEMPLATE]/`.
- Hasilkan kode lengkap hanya untuk `data.json` dan `template.tsx`.
- Jangan mengubah registry, `Root.tsx`, `main.tsx`, `types.ts`, `package.json`,
  atau template lain. Sistem proyek menemukan folder template secara otomatis.
- Gunakan ID folder dengan huruf kecil, angka, dan tanda hubung, misalnya
  `sales-chart`; nama folder menjadi ID URL.
- Komponen harus memiliki named export persis `Template` dan menerima prop
  `data`. Tipe data khusus boleh ditulis secara lokal di `template.tsx`.
- JSON harus valid dan berupa object di tingkat teratas. Sertakan `title`,
  `subtitle`, `background`, `accent`, dan `durationInSeconds`. `width`,
  `height`, dan `fps` bersifat opsional; nilai bawaan proyek adalah 1920 × 1080
  pada 30 fps.
- Jangan mengubah, mengarang, atau membuang data sumber yang diberikan.
- Gunakan animasi deterministik berbasis frame Remotion, seperti
  `useCurrentFrame`, `useVideoConfig`, `interpolate`, dan `Easing`. Jangan
  menggunakan timer browser, `setTimeout`, atau `setInterval`.
- Pastikan semua animasi selesai atau tetap berada dalam rentang
  `durationInSeconds`.
- Jangan menggunakan dependency atau aset yang tidak disediakan. Utamakan
  React/SVG atau aset yang berada di dalam folder template.
- Jangan menambahkan audio kecuali diminta. Jika audio diminta, template harus
  memutarnya menggunakan Remotion, misalnya
  `<Audio src={staticFile(data.audio)} />`, dan mengimpor `Audio` serta
  `staticFile`.

### Aturan Audio Khusus

Gunakan `scripts/generate-sfx.mjs` untuk audio polifonik/SFX. Hanya tambahkan
konfigurasi dan pemutaran audio jika permintaan video memang meminta audio.

- `bpm`: tempo; waktu cue dihitung dalam beat.
- `audio`: path output relatif terhadap `public/`, misalnya
  `audio/sales-chart.wav`.
- `cues`: array event SFX. Setiap cue memiliki `id`, `beat`, dan `voice`; nilai
  `notes`, `gain`, dan `pan` bersifat opsional.
- `notes` berisi nomor MIDI. Beberapa note dalam cue yang sama membentuk chord;
  cue yang waktunya bertumpuk juga dicampur.
- Voice yang didukung: `bell`, `chime`, `pluck`, `sparkle`, `pop`, `thud`, dan
  `whoosh`. `whoosh` tidak membutuhkan `notes`; voice lainnya memerlukannya.
- `pads` bersifat opsional untuk chord/latar berkelanjutan. Setiap pad memiliki
  `beat`, `beats`, `root`, dan `notes`; `gain`, `subGain`, `attackSeconds`,
  `releaseSeconds`, dan `pan` bersifat opsional.
- `sound` bersifat opsional untuk mengatur hasil: `sampleRate` (22050, 32000,
  44100, 48000, atau 96000), `masterGain`, `clipDrive`, `fadeOutSeconds`,
  `tick`, `pad`, dan `reverb`.
- Jadwalkan cue agar sesuai dengan momen animasi. Konversi waktu adegan dalam
  detik ke beat dengan `beat = seconds * bpm / 60`.
- Jangan membuat script generator audio baru. Setelah file dibuat, jalankan
  `npm run audio:sfx -- [ID-TEMPLATE]`.

### Tempat Mengisi Prompt Setiap Video

Isi bagian ini secara terpisah untuk setiap template. Judul adalah teks yang
ingin terlihat di video; arahan khusus menjelaskan tujuan, urutan adegan,
komposisi, gaya visual, dan detail lain yang hanya berlaku untuk video itu.

```text
ID template:
Judul video yang tampil di layar:
Data sumber atau file yang dilampirkan:
Tujuan video:
Urutan adegan:
Komposisi dan area aman:
Bahasa, warna, dan gaya visual:
Durasi dan ukuran video:
Gerakan kamera atau animasi khusus:
Audio/SFX yang diinginkan (tulis "tanpa audio" jika tidak diminta):
Arahan khusus lainnya:
```

### Contoh Arahan Video: The Math of Music

ID Template:The Math of Music

Judul Utama & Subjudul: Teks judul berukuran sedang (proporsional, tidak terlalu keras di mata), dikelilingi ruang kosong/margin atas yang aman dari notch ponsel, serta diberi jarak yang nyaman agar pembacaan judul terasa natural.

Tujuan & Alur Adegan: Menjelaskan konsep luas area di bawah kurva menggunakan visualisasi animasi pergerakan angka dan grafik Riemann Sum secara intuitif (tanpa teks panjang). Setiap transisi tahapan diberi jeda beberapa detik agar penonton sempat mencerna materi.

Komposisi & Tata Letak (Layout):

Format vertikal 9:16.

Posisi Animasi: Terpusat di bagian tengah agak ke atas (center-up), memberikan ruang pandang yang seimbang dan tidak terlalu turun ke bawah agar terhindar dari tumpang tindih dengan caption atau tombol interaksi bawah.

Mematuhi safe zones untuk UI platform video vertikal (bebas dari gangguan elemen tombol di sisi kanan).

Gaya Visual: Desain grafis edukasi minimalis yang bersih dengan latar belakang gelap elegan,





Konsep Detail Video (Blueprint & Storyboard)Format & Komposisi:Vertikal 9:16 (optimal untuk Reels, TikTok, dan YouTube Shorts).Posisi objek utama: Terpusat di tengah (center-focused) agar mata penonton fokus pada pembelahan kotak yang presisi dan simetris.Gaya Visual:Dark Mode Minimalist: Latar belakang gelap pekat dengan garis tepi objek bercahaya warna putih terang atau pirus (glow cyan/white) yang bersih.Show, Don't Tell: Tanpa teks penjelasan yang berlebihan, biarkan geometri pecahan dan ketukan visual yang berbicara.Audio & Musik:Efek suara ASMR polifonik berupa crisp clicks dan ketukan perkusi kayu/digital yang sangat renyah dan memuaskan di setiap detik pembelahan kotak.Rangkaian Adegan (Scene by Scene)Adegan 1: Ketukan Utuh Pertama (0–3 Detik)Visual: Layar gelap bersih. Sebuah balok persegi panjang besar berwarna putih bersinar muncul di tengah layar melambangkan 1 Ketukan Penuh ($1$).Efek Audio: Suara thud bass yang dalam dan hangat, diikuti ketukan stabil.Adegan 2: Pembelahan Pertama (Pecahan Setengah / $1/2$)Visual: Balok besar tersebut tiba-tiba terbelah rapi menjadi 2 bagian sama rata dengan garis garis pemisah tipis yang menyala.Efek Audio: Suara klik mekanis yang renyah (crisp ASMR click), disusul ketukan ritme yang terbagi dua.Adegan 3: Pelipatgandaan Simetris ($1/4$ dan $1/8$)Visual: Kedua kotak tadi langsung terbelah lagi secara simetris menjadi 4 kotak, lalu dalam sekejap membelah lagi menjadi 8 kotak kecil yang tersusun rapi dalam satu baris/matriks yang harmonis.Efek Audio: Rangkaian suara klik ganda yang cepat dan memuaskan, menyerupai ketukan hi-hat drum yang presisi.Adegan 4: Puncak Irama & Denyut Bersama (The Final Beat)Visual: Seluruh kotak kecil (16 bagian) berkedip dan berdenyut menyala bergantian atau bersamaan seirama dengan tempo ketukan musik, membentuk visual gelombang fraktal pecahan yang hidup.Efek Audio: Kombinasi ketukan perkusi polifonik (snare, kick, and soft chimes) yang menyatu membentuk pola ketukan lagu yang asyik.Adegan 5: PenutupVisual: Kotak-kotak kecil menyatu kembali secara mulus menjadi satu balok utuh. Teks minimalis muncul di bawahnya: "Music is living fractions." Disusul kilatan cahaya tipis (glow sweep).
















Bahasa Teks/Audio: Menggunakan Bahasa Inggris untuk teks di dalam video.

Audio & SFX Polifonik (Semangat & ASMR):

Menggunakan efek suara ASMR polifonik yang lembut namun dinamis pada setiap gerakan grafik.

Tempo dan susunan not musik dirancang energik dan membakar semangat (upbeat & energetic progression) untuk membangun suasana positif serta memengaruhi antusiasme penonton dari awal hingga akhir video.
intruksi khusus = tidak ada jeda antara judul dan isi video, kalau bisa di mulai dengan tidak menampilkan judul saja, tetapi juudl dan gambaran isi video, fokus animasi detengah saja, jangan terlalu atas, jeda pada saat agar penonton memahami jangan terlalu lama, singkat saja, gunakan efek animasi yang relevan, tidak melulu dengan lingkaran membesaar, hindari awal video dengan video kosong dan mucul judul, alalu muncul lainya, pada awal sudah ada judul dan keselurahan video, misalnya, akan menggunakan grafik untuk di animaskiakn, maka munculkan garfik memtahnya, lalau animasikn, atau misalnya ingin menggunakan kotak-kotak untuk di animasikan, amka munculka kotaknya opada titik awal ini