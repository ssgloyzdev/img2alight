# Image2Alight

Aplikasi web statis: unggah PNG/JPG/WebP, kuantisasi warna, segmentasi, tracing ke layer vektor, pratinjau, edit layer, lalu ekspor XML proyek Alight Motion.

Status: belum diuji di Alight Motion. Validator hanya memeriksa struktur terhadap 5 file referensi.

## Menjalankan

- Tes: `node --test tests/*.test.js` (Node 22+, tanpa dependensi).
- Benchmark: `npm run bench` (menulis examples/ dan examples/benchmark.json).
- Audit warna UI: `npm run audit`.
- Server lokal: `npm run serve`, buka http://localhost:8080.

## Deploy dari HP

Unggah seluruh isi folder ke repo GitHub lalu aktifkan GitHub Pages, atau hubungkan repo ke Cloudflare Pages tanpa build command dengan output directory `/`. Tidak ada server atau API berbayar.

## Penggunaan

1. Pilih gambar, atur tingkat detail (rendah/sedang/tinggi/ultra) dan ukuran kanvas.
2. Tekan Konversi, bandingkan lewat tab Asli, Rekonstruksi, Berdampingan, Overlay.
3. Edit layer: tampil, nama, warna, urutan, solo, gabung ke bawah, hapus.
4. Unduh XML, ZIP (XML + pratinjau + manifest), pratinjau PNG, atau manifest.

## Struktur

- src/core: quantize, regions, trace, curves, raster, metrics, preprocess, vectorize.
- src/export: format (builder dan validator), xml, zip.
- src/ui/app.js, css/style.css, index.html.
- tools: synth (gambar uji), benchmark, analyze-reference, audit-colors.
- docs/FORMAT.md: aturan format yang terverifikasi.

## Keterbatasan

- Hanya Mode A (vektor). Mode B (raster) dan hybrid tidak tersedia karena sampel tidak memuat layer gambar.
- Tidak ada segmentasi AI dan tidak ada penamaan semantik; layer bernama "Region 001" dst.
- Opasitas, gradien, dan stroke tidak diekspor.
- Gambar foto, gradien halus, dan derau menghasilkan SSIM rendah (sekitar 0.5-0.78 pada uji sintetis) dan jumlah layer sangat besar pada detail tinggi; gambar flat, logo, dan ilustrasi bersih mendekati sempurna.
- Benchmark hanya memakai gambar sintetis; belum diuji pada anime atau foto nyata.
- Urutan z (layer pertama = bawah) adalah asumsi.
- Tidak ada dependensi eksternal karena registry npm tidak terjangkau saat pengembangan; parser XML dan ZIP ditulis sendiri.
- UI diuji di Chromium (desktop dan lebar 390 px), bukan di perangkat sungguhan.
