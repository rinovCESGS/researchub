SIMS — Sage Internal Management System
Paket PHP dan MySQL untuk Hostinger

================================================================
ISI PAKET
================================================================
  index.php     Halaman utama. Menyajikan antarmuka dan menyambungkannya ke basis data.
  app.html      Seluruh antarmuka SIMS. Ganti berkas ini bila ada versi antarmuka baru.
  api.php       Satu titik masuk untuk seluruh permintaan data, berbentuk JSON.
  unggah.php    Penerima unggahan lampiran, batas dua puluh megabita per berkas.
  auth.php      Akun, sesi, dan aturan akses per peran.
  db.php        Sambungan PDO dan pembantu baca tulis.
  schema.php    Peta tabel dan kolom, dibuat mengikuti skema aplikasi.
  config.php    Setelan sambungan basis data. Berkas inilah yang Anda isi.
  pasang.php    Pemasangan sekali jalan untuk menetapkan akun Director pertama.
  sims_db.sql   Skema 34 tabel beserta data acuan. Inilah yang diimpor ke MySQL.
  uploads/      Folder lampiran. Harus dapat ditulis peladen.
  .htaccess     Menutup berkas yang tidak boleh diakses dan mematikan skrip di uploads.

================================================================
LANGKAH PEMASANGAN DI HOSTINGER
================================================================
1. Buat basis data MySQL
   hPanel, menu Databases, MySQL Databases. Catat nama basis data, nama pengguna,
   dan kata sandinya.

2. Impor skema
   Buka phpMyAdmin dari hPanel, pilih basis data tadi, buka tab Import,
   pilih berkas sims_db.sql, lalu tekan Go. Setelah selesai akan ada 34 tabel.

3. Isi config.php
   Ganti DB_NAME, DB_USER, dan DB_PASS sesuai langkah pertama. DB_HOST biasanya
   tetap localhost.

4. Unggah berkas
   hPanel, File Manager, masuk ke public_html. Unggah seluruh isi folder ini.
   Pastikan folder uploads ikut terunggah dan izinnya 755.

5. Tetapkan akun pertama
   Buka https://domain-anda/pasang.php di peramban, isi surel dan kata sandi
   Director, lalu simpan. Setelah berhasil, HAPUS berkas pasang.php.

6. Masuk
   Buka https://domain-anda/ lalu masuk memakai surel dan kata sandi tadi.

7. Pindahkan data lama, bila ada
   Bila Anda sudah memakai antarmuka ini secara luring dan datanya tersimpan di
   peramban, buka Pengaturan, tab Data sistem, lalu tekan Kirim data ini ke
   Spreadsheet. Pada pemasangan PHP tombol itu mengirim ke basis data MySQL.

================================================================
MENAMBAH AKUN LAIN
================================================================
Akun dibuat dari dashboard oleh Director, atau langsung lewat phpMyAdmin pada
tabel pengguna. Kolom peran menerima: director, manager, asisten, staff, admin,
bizdev. Kolom sandi berisi hasil password_hash, jangan diisi teks biasa. Bila
mengisi dari phpMyAdmin, kosongkan kolom sandi lalu minta orangnya memakai
tombol lupa kata sandi yang Anda sediakan, atau isi lewat dashboard.

Akun portal klien memakai tabel klien, kolom portal diisi 1, login diisi surel,
dan sandiKlien diisi hasil password_hash.

================================================================
YANG PERLU DIKETAHUI
================================================================
1. Kode ini belum pernah dijalankan di peladen sungguhan, jadi uji dulu di satu
   subdomain sebelum dipakai tim. Kesalahan paling sering muncul di config.php
   dan di izin folder uploads.
2. Seluruh perintah basis data memakai pernyataan tersiap, dan kata sandi
   disimpan memakai password_hash. Meski begitu, pasang HTTPS lewat hPanel
   sebelum dipakai, karena tanpa itu kata sandi lewat sebagai teks biasa.
3. Penyaringan data dilakukan di api.php, bukan di peramban. Menambah modul baru
   berarti menambah aturannya di auth.php, jangan hanya di antarmuka.
4. Lampiran disimpan di folder uploads dengan nama acak. Folder itu tidak boleh
   menjalankan skrip, dan .htaccess di dalamnya sudah mengaturnya.
5. Cadangkan basis data secara berkala lewat phpMyAdmin, tab Export. Tabel log
   sengaja tidak punya jalur penghapusan dari aplikasi.
