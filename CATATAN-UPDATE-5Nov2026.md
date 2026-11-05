# Update 5 Nov 2026 (tanpa migrasi)
Timpa file sesuai foldernya, lalu jalankan SEKALI di folder proyek:

    php artisan hpp:rebuild

(wajib — aturan HPP berubah, jadi Kartu HPP harus dihitung ulang), lalu Ctrl+F5 di browser.

1. Buka di tab baru: ikon ↗ di tiap menu samping (muncul saat di-hover), Ctrl/Cmd/Shift + klik atau klik tengah
   pada menu & sub-menu, dan tombol "↗ Tab Baru" di topbar. URL kini ikut berubah (#transaksi/beli?cabang=...),
   jadi bisa di-copy / bookmark / refresh tetap di halaman yang sama.
2. HPP (HppService): penjualan SEBELUM barang itu dibeli, dan penjualan di cabang yang BELUM membeli barang itu,
   sekarang HPP = Rp 0 (dulu diisi memakai pembelian tanggal berikutnya / cabang lain, sehingga daftar "HPP Rp 0" terlalu kecil).
   Bisa dikembalikan lewat konstanta PAKAI_PEMBELIAN_TERAWAL & PAKAI_HARGA_BELI_CABANG_LAIN.
   Pembelian di Kartu HPP kini mengurangi diskon (dulu diabaikan).
3. Daftar "barang terjual HPP Rp 0": nilai omzet kini DPP setelah diskon (dasar yang sama dengan Pendapatan Laba Rugi;
   dulu bruto termasuk PPN & tanpa diskon). Ada kotak Rekonsiliasi: Penjualan − HPP 0 = Terjual dari Pembelian, dibanding Pembelian periode itu.
4. Laba Rugi ▸ Pembelian: kini diambil langsung dari Transaksi Pembelian (qty×harga−diskon), SAMA dengan total menu
   Transaksi ▸ Pembelian; PPN Masukan ditampilkan terpisah sebagai pengurang (bukan HPP).
