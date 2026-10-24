# Format XML Alight Motion (hasil analisis 5 file referensi)

Semua aturan di bawah diturunkan dari 5 file referensi. `node tools/analyze-reference.js [folder]` mencetak ulang tag dan atribut yang ditemukan.

## Terverifikasi

- Akar `<scene>` dengan atribut: title, width, height, exportWidth, exportHeight, precompose, bgcolor, totalTime, fps, modifiedTime, amver, ffver, am, amplatform, retime, retimeAdaptFPS.
- Layer adalah anak langsung `<scene>`: `<shape>` atau `<text>`. Tidak ada pembungkus grup atau track.
- Atribut `<shape>`: id, label, startTime, endTime, fillType, mediaFillMode.
- ID bilangan bulat unik dan berurutan naik.
- Posisi: `<transform><location value="x,y,0.000000"/></transform>`.
- Path bebas: `<path d="M x y C x1 y1, x2 y2, x y L x y Z"/>`, koordinat relatif terhadap location.
- Lubang: `<path>` berisi `<contour d>` lalu `<contour exclude="true" d>`.
- Warna isi: `<fillColor value="#aarrggbb"/>`.
- Semua sampel memakai startTime 0 dan endTime sama dengan totalTime.

## Tidak terverifikasi (tidak diekspor atau diasumsikan)

- Urutan z: layer pertama diasumsikan paling bawah.
- Opasitas, gradien, stroke path bebas.
- Layer gambar/media: tidak ada contoh, maka Mode B dan hybrid dinonaktifkan.
- Beberapa contour non-exclude dalam satu path.
- Impor ke Alight Motion belum diuji.
