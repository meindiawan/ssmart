# Revisi 5 Nov 2026 (3) — Persediaan Akhir Laba Rugi vs Stok Akhir menu Stok

WAJIB setelah menimpa file:
    php artisan hpp:rebuild      (hitung ulang semua Kartu HPP dengan aturan baru)
lalu Ctrl+F5. Tanpa migrasi.

## Penyebab
1. Kartu HPP memakai qty-nya sendiri, bukan qty menu Stok. Kalau barang terjual SEBELUM (atau di cabang lain dari)
   pembelian, saldo Kartu di-nol-kan lalu pembelian menambah penuh (mis. beli 17) padahal 11 unit sudah terjual.
   Hasil: Kartu = 17 pcs (Rp 413.508 = 17 × 24.324), stok = 6 pcs.
2. Perbaikan "HPP hanya untuk qty yang tertutup stok pembelian" yang tertulis di CATATAN-UPDATE-05Nov2026.md
   (konstanta KELUAR_HANYA_YANG_TERSEDIA) ternyata TIDAK ada di HppService: penjualan melebihi saldo tetap diberi HPP penuh.

## Perbaikan (HppService, kedua salinan)
- KELUAR_HANYA_YANG_TERSEDIA = true: keluar/jual melebihi saldo bernilai → hanya qty yang tertutup yang ber-HPP,
  sisanya HPP 0 dan dicatat sebagai "hutang barang" per cabang.
- Pembelian/Barang Masuk/Mutasi masuk berikutnya MENUTUP hutang itu dulu; hanya sisanya jadi persediaan bernilai.
  Contoh: jual 11 → beli 17 @24.324 → stok bernilai 6 pcs = Rp 145.944. Jual 10 lagi → HPP hanya 6 pcs, 4 pcs HPP 0.
- Mutasi: nilai yang dibawa ke cabang tujuan = nilai yang benar-benar tertutup stok pengirim.
- Keterangan baris Kartu HPP menyebut berapa unit yang menutup/melebihi.

## Menu Stok
- KPI Nilai Stok = jumlah saldo nilai terakhir Kartu HPP (tidak tergantung baris tabel stok) → sama dengan Persediaan Akhir Laba Rugi.
- Tanda ⚠️ di kolom Nilai Stok + catatan jumlah item yang qty stok-nya ≠ qty Kartu HPP.
- Selisih qty yang tersisa biasanya dari stok minus di satu cabang sementara pembelian di cabang lain (belum ada Mutasi),
  Saldo Awal, atau stok diubah manual — itu masalah data, bukan hitungan.
