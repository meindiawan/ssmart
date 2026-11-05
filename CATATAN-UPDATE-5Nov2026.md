# Update 5 Nov 2026 (tanpa migrasi)
Timpa file sesuai foldernya, lalu jalankan SEKALI di folder proyek:

    php artisan hpp:rebuild

(wajib — aturan HPP berubah, jadi Kartu HPP harus dihitung ulang), lalu Ctrl+F5 di browser.

1. TAB BARU di dalam aplikasi: deretan tab di bawah topbar (seperti tab browser). "＋ Tab Baru" / tombol ＋ menggandakan halaman
   yang sedang dibuka; ikon ↗ di menu samping (hover), atau Ctrl/Cmd/Shift + klik / klik tengah pada menu & sub-menu membuka
   halaman itu di tab baru. Klik tab = pindah, × = tutup. Tiap tab ingat menu, sub-menu, cabang & posisi scroll, dan tetap ada
   setelah refresh. Pintasan: Ctrl+Alt+T (tab baru), Ctrl+Alt+W (tutup). Maks 12 tab.
   Pindah antar tab TIDAK memuat ulang: isi halaman (termasuk isian form & scroll) disimpan di memori dan dipasang lagi instan.
   Data di tab yang tersimpan tidak otomatis ter-update kalau ada perubahan di tab lain → klik ↻ di deretan tab untuk muat ulang.
   Kasir POS selalu dimuat ulang saat dibuka.
1b. FIX error "Prepared statement contains too many placeholders" di Dashboard/Laba Rugi: lookup HPP per id dipecah per 5.000.
2. HPP (HppService): penjualan SEBELUM barang itu dibeli, dan penjualan di cabang yang BELUM membeli barang itu,
   sekarang HPP = Rp 0 (dulu diisi memakai pembelian tanggal berikutnya / cabang lain, sehingga daftar "HPP Rp 0" terlalu kecil).
   Bisa dikembalikan lewat konstanta PAKAI_PEMBELIAN_TERAWAL & PAKAI_HARGA_BELI_CABANG_LAIN.
   Pembelian di Kartu HPP kini mengurangi diskon (dulu diabaikan).
3. Daftar "barang terjual HPP Rp 0": nilai omzet kini DPP setelah diskon (dasar yang sama dengan Pendapatan Laba Rugi;
   dulu bruto termasuk PPN & tanpa diskon). Ada kotak Rekonsiliasi: Penjualan − HPP 0 = Terjual dari Pembelian, dibanding Pembelian periode itu.
4. Laba Rugi ▸ Pembelian: kini diambil langsung dari Transaksi Pembelian (qty×harga−diskon), SAMA dengan total menu
   Transaksi ▸ Pembelian; PPN Masukan ditampilkan terpisah sebagai pengurang (bukan HPP).
