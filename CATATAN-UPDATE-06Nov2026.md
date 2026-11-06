# Update 6 Nov 2026 — Import Penjualan & Pembelian tidak boleh dobel per nota

Tanpa migrasi, tanpa artisan. Timpa 5 file lalu Ctrl+F5.

## Masalah
- Cek "nota sudah ada" (No. Referensi/Faktur + Tanggal + Cabang) di backend HANYA aktif untuk Pembelian.
  Penjualan tidak dicek sama sekali → upload ulang tanggal yang sama menggandakan nota & mengurangi stok lagi.
- Import Pembelian tidak membaca hasil "nota dilewati" dari backend, jadi peringatannya tidak pernah muncul.
- Import Penjualan memotong batch tiap 200 baris tanpa melihat batas nota; nota yang terbelah bisa kehilangan sisa barisnya.

## Perbaikan
- TransaksiController::importTrx — cek nota yang sudah ada kini berlaku untuk Penjualan DAN Pembelian.
  Nota yang sama dilewati utuh (tidak masuk transaksi, stok tidak berubah).
- helpers.js — fungsi baru potongBatchPerNota() (batch ±200 baris tanpa membelah 1 nota), dipakai Penjualan & Pembelian.
- transaksi.js — Penjualan memakai pemotongan per nota; Pembelian kini menampilkan jumlah nota yang dilewati
  dan pesan "Tidak ada nota baru" bila semua nota sudah ada.
- Pesan konfirmasi "file yang sama pernah di-import" diperjelas.

## Batasan
- Baris TANPA No. Referensi/Faktur tidak bisa dicek (nomornya dibuat otomatis), tetap masuk.
- Nota yang nomornya sudah diubah lewat "Ubah No. Faktur" atau otomatis diganti karena bentrok
  tidak akan dikenali sebagai nota yang sama.
