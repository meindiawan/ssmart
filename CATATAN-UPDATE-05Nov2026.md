# Update 5 Nov 2026 — Pembelian Laba Rugi & daftar "HPP Rp 0"

## Setelah menimpa file, WAJIB jalankan (urut):
    php artisan migrate               (BARU: tambah index database supaya cepat saat data banyak)
    php artisan saldo-awal:generate   (membersihkan baris "Saldo Awal" otomatis lama)
    php artisan hpp:rebuild           (hitung ulang semua Kartu HPP)
Lalu refresh browser (Ctrl+F5). Tanpa migrasi.

## Penyebab
1. HPP "bocor": penjualan bisa punya HPP padahal belum ada pembelian yang menutupinya, karena
   - pakai rata-rata pembelian TERAWAL walau pembelian itu tanggalnya SESUDAH penjualan (PAKAI_PEMBELIAN_TERAWAL),
   - pakai harga beli cabang lain (PAKAI_HARGA_BELI_CABANG_LAIN),
   - pakai HPP terakhir setelah stok habis,
   - seluruh qty diberi HPP begitu saldo > 0, walau jual > stok hasil pembelian.
   Akibatnya "Penjualan − daftar HPP 0" jauh lebih besar dari pembelian.
2. Angka di daftar HPP 0 = qty×harga (kotor, termasuk PPN, tanpa diskon), sedangkan Pendapatan Laba Rugi = DPP.
3. "Pembelian" di Laba Rugi dulu diambil dari Kartu HPP (tanpa diskon, hanya barang yg ada di Master Barang),
   sedangkan menu Pembelian = total faktur termasuk PPN.

## Perubahan
- HppService: 3 fallback di atas dimatikan (konstanta, bisa dinyalakan lagi); HPP hanya untuk qty yang
  tertutup stok pembelian (KELUAR_HANYA_YANG_TERSEDIA); sisanya HPP 0. Nilai pembelian di Kartu HPP kini bersih diskon.
- Laba Rugi: "Pembelian" dari tabel Pembelian (DPP, bersih diskon) + baris rekonsiliasi:
  total faktur − PPN Masukan − pembelian barang yg belum ada di Master Barang = Pembelian (DPP).
- Daftar "Barang terjual HPP Rp 0": angka = DPP (basis sama dgn Pendapatan), memasukkan bagian yg tidak tertutup
  pada baris yg tertutup sebagian; ada ringkasan "Penjualan DPP tanpa HPP" vs "yang sudah punya HPP".

## Otomatis saat barang baru didaftarkan (tambahan)
Pembelian baru / hapus / import pembelian sudah otomatis membangun ulang Kartu HPP barangnya.
Barang yang tadinya belum terdaftar di Master Barang kini juga otomatis: saat ditambah lewat Master Barang,
Import Master Barang, "Masukkan ke Master", atau "Cocokkan Otomatis", Kartu HPP barang itu langsung dibangun ulang.

## Kecepatan (data banyak)
- Index baru (migration 2026_11_05_000001_add_index_performa): tanggal/cabang/kode barang di Penjualan, Pembelian, Kartu HPP, dll. Aman dijalankan berulang.
- Dashboard / Laba Rugi / Neraca / Neraca Saldo: saldo per akun dihitung SEKALI (dulu menyaring seluruh jurnal untuk setiap akun).
- Jurnal: peta HPP tidak lagi memakai WHERE IN berisi seluruh ID transaksi.
- Daftar "HPP Rp 0": total dihitung di SQL, hanya baris kandidat yang dibaca ke PHP.

## Buka di Tab Baru (fitur baru)
File baru: js/modules/deeplink.js (+ salinan di public/js/modules/), dimuat di layouts/main.blade.php, dan dipanggil dari js/modules/app.js.
- Ctrl+klik / Cmd+klik / klik-tengah pada baris atau tautan rincian (akun, nota, bentukan jurnal, Kartu HPP, riwayat kontak, dll) -> terbuka di tab baru.
- Klik-kanan pada tautan -> "Buka di tab baru".
- Tombol "Tab Baru" di kepala jendela rincian (modal).
- Ctrl+klik pada menu sidebar / sub-menu juga membuka menu itu di tab baru.
- Tab baru memakai sesi login yang sama, pindah ke menu & cabang asal, lalu membuka rincian yang sama.
Klik biasa tidak berubah.
