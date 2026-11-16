# Update 16 Nov 2026 — Stok minus → Nilai Stok (Rp) ikut minus

Timpa 2 file, lalu Ctrl+F5. Tanpa migrasi, tanpa artisan, tanpa hpp:rebuild:
    app/Http/Controllers/Api/StokController.php
    public/js/modules/stok.js

## Aturan
- Stok (qty) MINUS pada suatu cabang → Nilai Stok = qty × rata-rata harga beli (hasilnya NEGATIF).
  Rata-rata harga beli = rata-rata tertimbang seluruh riwayat Pembelian (DPP) cabang itu;
  kalau cabang itu belum pernah beli → rata-rata semua cabang.
- Barang yang BELUM PERNAH dibeli (stok minus atau tidak) → Nilai Stok Rp 0.
- Stok >= 0 → tidak berubah (saldo nilai Kartu HPP).

## Tampilan
- Menu Stok ▸ Saldo Stok Barang (per cabang & "Semua Cabang"): kolom Nilai Stok merah & negatif untuk stok minus
  (arahkan kursor → rumus qty × rata-rata beli). Urutan "Nilai Stok Terendah/Tertinggi" ikut nilai baru.
- KPI baru "Nilai Stok Minus (N item)" = total nilai barang minus, ditampilkan TERPISAH.
- KPI "Nilai Stok" sengaja tidak dikurangi nilai minus, supaya tetap = Persediaan Akhir di Laba Rugi
  (Kartu HPP tidak pernah minus; unit minus dicatat sebagai "hutang barang" dan ditutup pembelian berikutnya).

## Kartu Stok (per barang) ikut sama
Di Stok ▸ Kartu Stok, kolom Saldo Nilai (tiap baris), Nilai Awal, dan Nilai Sekarang: kalau saldo qty-nya MINUS
nilainya = saldo qty × rata-rata harga beli (negatif); belum pernah dibeli = Rp 0. Saldo qty >= 0 tidak berubah.
Kolom "Nilai" per transaksi (HPP baris itu) tidak berubah. Tanpa filter cabang dipakai rata-rata semua cabang.
