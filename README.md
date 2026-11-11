# RetroGen Report

Generator laporan pengujian retroreflektivitas rambu, marka, dan reflektor.
Output: Excel unggah eSPM dan Laporan Pengujian Word. By Execution Dakotamo.

## Isi folder

| File | Fungsi |
|---|---|
| `index.html` | Aplikasi RetroGen (jalan di browser) |
| `api/ocr.js` | Fungsi Vercel untuk baca angka layar alat dengan AI vision lewat APMix |

## Pasang fitur baca angka (sekali saja)

1. Buka Vercel › project `retrogen-report` › **Settings › Environment Variables**.
2. Tambah variabel:
   - `APMIX_API_KEY` = API key APMix kamu (wajib). Centang Production, Preview, dan Development.
   - `APMIX_MODEL` = nama model vision (opsional). Kalau kosong, dipakai `claude-sonnet-4-6`.
     Pilih model dari hasil `python apmix_client.py test` (file `vision_models.json`).
3. Deploy ulang folder ini (lihat di bawah). Variabel baru berlaku setelah deploy berikutnya.

API key cukup ada di Vercel. Jangan ditulis di `index.html` atau dikirim lewat chat.

## Deploy dari laptop (Vercel CLI)

Buka terminal di folder ini (yang berisi `index.html` dan folder `api`), lalu:

```
npx vercel link        # pilih project retrogen-report yang sudah ada
npx vercel --prod
```

Kalau mau isi API key lewat terminal (pengganti langkah dashboard di atas):

```
npx vercel env add APMIX_API_KEY production
```

## Cara pakai fitur baca angka

- Masukkan foto layar alat (100%) lewat Kamera atau Upload. Kalau kolom nilai masih kosong, angkanya langsung dibaca.
- Rambu dan reflektor: angka atas = Nilai 0.2°, angka kedua = Nilai 0.5°. Kata warna di layar (red, white, …) dicocokkan dengan warna baris.
- Marka: diambil bacaan pertama (baris 1) RL dan Qd, bukan rata-rata.
- Kolom yang terisi dari foto ditandai kuning "dari foto". Cek, lalu tekan **Angka dari foto · tandai sudah dicek**.
- Tombol **Baca angka dari foto** membaca ulang dan menimpa nilai di baris itu.
- Butuh internet. Tiap foto memakai kuota APMix.

## Keamanan

`api/ocr.js` hanya menerima permintaan dari domain project ini sendiri (dan localhost).
Untuk domain lain, isi `ALLOWED_ORIGINS` (pisahkan dengan koma), misalnya `https://retrogen-report.vercel.app`.
