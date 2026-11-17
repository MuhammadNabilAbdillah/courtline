-- Khusus untuk database yang SUDAH berjalan: salin seluruh isi file ini ke Supabase > SQL Editor > Run.
-- ===== v9: kategori bebas + bagan manual =====
-- Aman dijalankan berulang kali (juga di database yang sudah berjalan).
-- 1) Nama tingkat/kategori tidak lagi dibatasi daftar tetap, supaya admin bisa membuat kategori sendiri (mis. Amatir).
alter table tournaments drop constraint if exists tournaments_level_check;
-- 2) Jenis kategori: Putra, Putri, atau Campuran.
alter table tournaments drop constraint if exists tournaments_gender_check;
alter table tournaments add constraint tournaments_gender_check check (gender in ('Men','Women','Mixed'));
-- 3) Penanda "tim dipilih manual" pada pertandingan bagan, supaya pengisian otomatis tidak menimpanya.
alter table matches add column if not exists manual boolean not null default false;

