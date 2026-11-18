# Update 18 Nov 2026 — Download Excel laporan Laba Minus

Timpa 3 file (+ salinan di folder js/), lalu Ctrl+F5. Tanpa migrasi, tanpa perubahan backend.
    public/js/modules/transaksi.js   (+ js/modules/transaksi.js)
    public/js/modules/laporan.js     (+ js/modules/laporan.js)
    public/js/modules/export.js      (+ js/modules/export.js)

Tombol Download Excel ada di 3 tempat:
1. Laba Rugi → panel merah "baris penjualan laba-nya MINUS" → ⬇️ Download Excel
2. Jendela "Rekap per barang minus" → ⬇️ Download Excel
3. Transaksi ▸ Penjualan, bar "Filter laba": ⬇️ Download Excel (filter ini) dan ⬇️ Laporan Laba Minus

Isi "Laporan Laba Minus" (3 sheet, ikut cabang & tanggal): Ringkasan (rekonsiliasi), Rekap per Barang, Detail Baris Minus (+penyebab).
"Export Semua" Penjualan kini mengikuti filter Laba (minus/HPP 0/≥0) & kotak cari, dan menambah kolom
Omzet DPP, HPP, HPP/unit, Laba, Status HPP, Keterangan HPP.
