# Update 18 Nov 2026 — Riwayat Penjualan menampilkan HPP & Laba per baris (penanda MINUS)

Timpa 6 file (struktur folder sama), lalu Ctrl+F5. Tanpa migrasi, tanpa hpp:rebuild.
Kalau route di-cache di server: php artisan route:clear
    app/Http/Controllers/Api/TransaksiController.php
    app/Http/Controllers/Api/DashboardController.php
    routes/api.php
    public/js/modules/transaksi.js   (+ salinan js/modules/transaksi.js)
    public/js/modules/laporan.js
    public/js/modules/deeplink.js

## Kenapa omzet − omzet HPP 0 − HPP bisa minus
Rumus itu = omzet baris ber-HPP dikurangi HPP baris-baris yang sama. Minus artinya ada barang yang HPP-nya
LEBIH BESAR dari harga jualnya (DPP). Penyebab yang mungkin (sekarang kelihatan per baris):
1. Harga jual < harga beli (promo/harga master rendah/harga beli naik).
2. Unit yang dijual melebihi stok pembelian dinilai RATA-RATA SELURUH RIWAYAT pembelian (aturan 6 Nov): kalau
   pembeliannya baru sedikit/sekali (mis. harga eceran), HPP-nya ikut tinggi.
3. Beda PPN: pembelian bernota "TS…-" = Non-PPN (harga TIDAK di-DPP-kan) sementara penjualan Kena PPN di-DPP-kan
   → HPP ≈ 1,11× harga jual.
4. Beda satuan (beli per dus/karton, jual per pcs) / harga beli salah input → HPP berkali-kali lipat harga jual.

## Riwayat Penjualan (Transaksi ▸ Penjualan)
- Kolom baru per barang: Omzet DPP, HPP, HPP/unit, Laba. Baris minus = latar merah + 🔴; arahkan kursor →
  tooltip PENYEBAB (rasio HPP/harga jual, "pakai rata-rata riwayat pembelian", dst).
- Header nota: HPP total, Laba, badge "🔴 N minus" / "⚪ N HPP 0" (juga untuk nota POS-).
- KPI: Omzet DPP, HPP, Laba Kotor, Omzet HPP 0, Baris Laba Minus + kalimat cara mencocokkan dgn Laba Rugi.
- Filter: Semua | 🔴 Laba minus | ⚪ HPP 0 | 🟢 Laba ≥ 0 (berlaku di seluruh data, bukan hanya halaman ini).
- Tombol 📊 "Rekap per barang minus": daftar barang yang total HPP > omzet (urut rugi terbesar).
- Export Excel ikut kolom HPP/unit, Omzet DPP, Laba, Keterangan HPP.

## Laba Rugi
- Panel merah baru: jumlah baris minus + rekonsiliasi lengkap (omzet − HPP 0 − HPP = laba baris ber-HPP) dengan tombol
  ke rekap per barang & ke Riwayat Penjualan yang sudah terfilter minus.
- Teks lama "penjualan ber-HPP seharusnya tidak jauh di atas Pembelian" dihapus (tidak berlaku sejak aturan 6 Nov).
