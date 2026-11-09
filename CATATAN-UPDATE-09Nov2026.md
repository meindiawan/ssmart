# Update 9 Nov 2026 — "Selisih lainnya" & "Penjualan tanpa Master Barang" bisa diklik/ditelusuri

Timpa seluruh isi folder (kecuali .env), lalu Ctrl+F5. Tanpa migrasi, tanpa artisan.
(HppService dari update 6 Nov sudah termasuk; kalau belum: php artisan hpp:rebuild)

## Laba Rugi ▸ blok HPP
Baris "(+) Selisih lainnya" sekarang DIURAIKAN jadi penyebabnya, tiap baris bisa diklik → daftar transaksinya
(klik baris di daftar → bentukan jurnal):
- Jurnal Manual/Memorial ke akun HPP (5101)      → daftar jurnal manualnya
- Selisih HPP Penjualan: Jurnal vs Kartu HPP     → penjualan yang hanya ada di Kartu HPP / hanya di Jurnal, lengkap dgn alasannya
                                                    (transaksi sudah dihapus, kode tak ada di Master, tanggal/cabang beda)
- Selisih HPP Barang Keluar (Penjualan)          → sama, utk Barang Keluar jenis Penjualan
- Selisih Retur Jual: Kartu HPP vs Jurnal        → sama, utk Retur Jual
- HPP unit terjual melebihi stok pembelian       → baris Kartu HPP yang qty keluarnya melebihi stok (aturan 6 Nov)
- Pembulatan / "Selisih lainnya (belum terjelaskan)" → sisa kecil. Kalau ≥ Rp 1.000 sengaja diberi label
  "belum terjelaskan" supaya tidak tersamar.
Rumus: Selisih lainnya = Manual→5101 + (Jurnal−Kartu Penjualan) + (Jurnal−Kartu Barang Keluar)
                       + (Kartu−Jurnal Retur Jual) + HPP unit melebihi stok + pembulatan.

## Peringatan merah "kode barang belum terdaftar di Master Barang"
Angka "N kode barang" dan tombol "🔎 Lihat daftar kode & nota-nya" sekarang bisa diklik:
daftar kode (baris, qty, nilai, rentang tanggal) → klik kode → semua nota penjualannya.

## File berubah
app/Http/Controllers/Api/DashboardController.php, routes/api.php (+ /laporan/penjualan-tanpa-master),
public/js/modules/laporan.js, public/js/modules/deeplink.js
