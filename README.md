# HIPMI Bontang Padel Cup 2026 — Skor Langsung (v9)
5 & 6 Desember 2026 · Vamos Arena Fit (nama, tanggal, dan lokasi bisa diubah di Admin > Tampilan Situs).

## Yang baru di v9
**Admin**
- **Kategori bebas**: buat dan hapus kategori sesuka hati (Bronze, Beginner, **Amatir**, Veteran, dll.) di Admin > Kategori. Nama dan tingkat bebas diketik, jenis: Putra / Putri / Campuran.
- **Hapus tim & pertandingan**: hapus satu tim, **hapus semua tim** satu kategori, hapus satu pertandingan, atau hapus massal (belum main / riwayat selesai / semua). Di Admin > Cadangan ada **Kosongkan data uji coba** (semua kategori, dengan cadangan otomatis dulu).
- **Bagan baru** (Admin > Bagan): tiga cara, semuanya dengan pratinjau langsung sebelum disimpan:
  - **Acak otomatis** (tombol Acak susunan, bisa diulang),
  - **Atur manual** (pilih tim untuk tiap kotak, kotak kosong = bye),
  - **Dari klasemen grup** (mis. 2 teratas tiap grup, disilang otomatis).
  Mendukung 2–16 tim (jumlah ganjil otomatis dapat bye), perempat final, semifinal, final, dan juara 3.
- **Pemenang otomatis maju** ke babak berikutnya. Jika skor dikoreksi, pertandingan berikutnya yang **belum dimulai** ikut menyesuaikan. Tim yang dipilih manual admin tidak ditimpa (bisa dikembalikan lewat "Kembalikan otomatis").
- **Riwayat Pertandingan** (Admin > Riwayat Pertandingan): lihat semua pertandingan selesai, **ubah skor, ubah tim/jam/lapangan, reset, buka kunci, hapus**.
- **Impor tim hanya lewat Excel (.xlsx)** dengan template yang bisa diunduh. CSV dan tempel teks sudah dihapus.
- **Panduan mulai cepat** di Beranda admin (5 langkah dengan tombol langsung) dan nama menu yang lebih sederhana.
- Seluruh admin sudah **berbahasa Indonesia**.

**Penonton**
- **Bahasa Indonesia** sebagai bawaan, tombol **ID / EN** di pojok atas.
- **Navigasi tidak lagi di atas**: menu samping di desktop, menu bawah di HP (dengan tombol "Lainnya").
- **Beranda penonton** baru: ringkasan acara, pertandingan live, giliran tim favorit, berikutnya, hasil terbaru, progres tiap kategori, status lapangan, menu cepat, dan panduan singkat.

## Cara memperbarui (penting)
1. **Supabase > SQL Editor**: jalankan isi file `supabase-update-v9.sql` (aman diulang). Ini membuka batas kategori, menambah jenis "Campuran", dan menambah kolom `manual`.
2. Salin file proyek ini ke folder proyekmu (pertahankan `.env`), lalu `git add .` / `git commit -m "v9"` / `git push`. Vercel otomatis deploy.
3. Buka Admin > **Cadangan & Cek Sistem** lalu tekan "Periksa lagi": semuanya harus hijau, termasuk "Kolom bagan manual".
4. Untuk membersihkan data uji coba: Admin > Cadangan & Cek Sistem > **Hapus semua tim & pertandingan**.

## Alur kerja admin
1. **Kategori** → buat kategori. 2. **Tim & Pemain** → tambah/impor Excel → Acak grup. 3. **Buat Jadwal** → jadwal babak grup otomatis. 4. **Kontrol Pertandingan / Skor Lapangan** → mainkan. 5. **Bagan** → susun semifinal/final.

Catatan: pengisian bagan otomatis berjalan saat konsol admin / skor lapangan terbuka (di HP penjaga skor atau admin), jadi pastikan salah satunya terbuka selama pertandingan.

## Format Excel impor tim
Kolom: `Pemain 1`, `Pemain 2`, `Nama Tim (opsional)`, `Grup (A/B/C)`. Unduh template dari tombol "Impor tim dari Excel" di halaman Tim. Hanya sheet pertama yang dibaca, harus disimpan sebagai `.xlsx`.

## Instalasi pertama
1. Supabase > SQL Editor: jalankan seluruh `supabase.sql`. 2. Buat admin pertama (lihat Bagian 3 di `supabase.sql`). 3. Salin `.env.example` ke `.env` dan isi URL + anon key. 4. `npm install && npm run dev`.
