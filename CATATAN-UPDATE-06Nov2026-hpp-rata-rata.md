# Update 6 Nov 2026 — HPP tidak 0 untuk barang yang sudah pernah dibeli

Timpa 2 file (isinya sama):
    app/Services/HppService.php
    Services/HppService.php
Lalu WAJIB jalankan sekali:
    php artisan hpp:rebuild
Setelah itu Ctrl+F5. Tanpa migrasi.
(Kalau pernah memakai tombol "Generate Saldo Awal Persediaan", jalankan lagi setelah hpp:rebuild:
 php artisan saldo-awal:generate)

## Aturan baru
Barang yang SUDAH ADA riwayat pembeliannya tidak lagi ber-HPP 0. Kalau saat penjualan/barang keluar
tidak ada saldo bernilai, HPP = rata-rata tertimbang (qty) seluruh riwayat pembelian barang itu
(harga DPP, semua tanggal). Dipakai rata-rata cabang itu sendiri; kalau cabang itu belum pernah
membeli → rata-rata semua cabang.

Kasus yang sebelumnya HPP 0 dan sekarang terisi:
- dijual SEBELUM pembelian pertama
- dijual di cabang yang belum pernah membeli barang itu
- qty penjualan melebihi stok hasil pembelian (hanya kelebihannya)
- stok pembelian sudah habis lalu dijual lagi

Tetap HPP 0: barang yang benar-benar tidak pernah ada pembeliannya (tidak ada dasar biaya).

## Yang tidak berubah
- Saldo qty & nilai persediaan Kartu HPP: unit yang melebihi stok tetap dicatat sebagai "hutang barang"
  dan ditutup pembelian berikutnya (persediaan tidak dobel). Hanya nilai HPP/beban penjualannya yang terisi.
- Saldo Awal Persediaan otomatis ikut aturan yang sama: unit yang kemudian ditutup pembelian tidak lagi
  dianggap kekurangan (tidak dobel).
- Retur Jual ke cabang tanpa saldo bernilai dinilai rata-rata riwayat pembelian.
- barang.modal (Master Barang): kalau stok habis tapi ada riwayat pembelian → diisi rata-rata riwayat pembelian.

## Ubah perilaku
HppService::PAKAI_RATA_RATA_RIWAYAT_PEMBELIAN = false mengembalikan aturan 5 Nov 2026 (ketat), lalu hpp:rebuild.
