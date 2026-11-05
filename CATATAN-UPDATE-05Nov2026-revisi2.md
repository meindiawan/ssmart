# Revisi 5 Nov 2026 (2) — Laba Rugi HPP bisa diklik, rincian "Penyesuaian lain", nilai Stok

Tanpa migrasi. Timpa file lalu refresh browser (Ctrl+F5). Tidak perlu hpp:rebuild.

## 1. HPP ▸ (+) Pembelian bisa diklik
- Klik angka "(+) Pembelian" atau "(−) PPN Masukan" → daftar FAKTUR pembelian periode & cabang yang sama
  (Total Faktur − PPN Masukan = DPP). Ada kotak cari. Klik faktur → bentukan jurnalnya, ada tombol "← Kembali".
- Endpoint baru: GET /laporan/pembelian-detail. Ctrl+klik / klik-kanan "buka di tab baru" ikut jalan.

## 2. "Penyesuaian lain" kini diuraikan
Dulu hanya SELISIH: HPP jurnal − (Persediaan Awal + Pembelian − Persediaan Akhir). Sekarang dipecah dari Kartu HPP:
Selisih Pembelian vs Kartu HPP, Barang Masuk, Mutasi Masuk/Keluar, Opname +/−, Retur Pembelian,
Barang Keluar non-penjualan, dan "Selisih lainnya" (sisa). Tiap baris bisa diklik → daftar transaksi
(endpoint baru GET /laporan/hpp-kartu-detail). Total tetap sama dengan angka lama.
- Retur JUAL tidak muncul di sini: jurnalnya sudah Dr Persediaan (1105) / Cr HPP (5101) dari Kartu HPP, nilainya netral.
- Retur BELI: jurnal memakai harga retur (DPP) ke Persediaan, sedangkan Kartu HPP memakai rata-rata → tampil di baris "Retur Pembelian".

## 3. Menu Stok: nilai dari Kartu HPP
Nilai Stok sebelumnya qty × Harga Modal Master Barang → barang tanpa pembelian tetap bernilai.
Sekarang = saldo nilai terakhir Kartu HPP per barang per cabang (sumber sama dgn Persediaan Akhir Laba Rugi).
Barang yang belum pernah dibeli = Rp 0. Berlaku untuk kolom Nilai Stok, KPI Nilai Stok, dan urutan nilai.

File: DashboardController.php, StokController.php, routes/api.php, js/modules/{laporan,stok,deeplink}.js (+ salinan public/js/modules).
