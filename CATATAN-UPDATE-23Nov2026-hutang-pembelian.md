# Update 23 Nov 2026 — Menu baru "🧾 Hutang Pembelian" (bayar hutang PER NOTA)

## WAJIB setelah menimpa file
    php artisan migrate        ← membuat tabel bayar_hutang (migrasi 2026_11_23_000001)
    php artisan optimize:clear (kalau route/view di-cache), lalu Ctrl+F5

## File baru
    app/Http/Controllers/Api/HutangController.php
    database/migrations/2026_11_23_000001_create_bayar_hutang_table.php
    resources/views/modules/hutang.blade.php
    public/js/modules/hutang.js   (+ salinan js/modules/hutang.js)
## File diubah
    routes/api.php                                  (route /api/hutang/*)
    app/Http/Controllers/Api/DashboardController.php (jurnal pelunasan: Dr 2101 / Cr Kas)
    app/Http/Controllers/Api/KontakController.php    (Total Hutang supplier dikurangi pelunasan + riwayat "Bayar Hutang")
    resources/views/partials/sidebar.blade.php, resources/views/layouts/main.blade.php
    public/js/modules/nav.js, public/js/modules/kontak.js  (+ salinan di js/modules/)

## Cara pakai (admin)
Menu samping ▸ Hutang Pembelian.
- Daftar = semua nota pembelian ber-bayar "Kredit": No. Nota, Tgl, Umur (hari), Supplier, Total, Dibayar, Sisa, Status (Belum / Sebagian / Lunas).
- Filter: status, supplier, cabang, tanggal nota, cari no. nota/supplier. Default = yang belum lunas, nota tertua di atas.
- 💳 Bayar (per nota): isi tanggal, akun Kas/Bank, jumlah (default = sisa → lunas; kecilkan untuk cicil), keterangan.
- Centang beberapa nota → "Lunasi N nota sekaligus".
- Klik baris nota → rincian barang + riwayat pembayaran; tombol ✕ membatalkan pembayaran yang salah.
- Kontak ▸ (supplier) ada tombol "Bayar hutang per nota" yang membuka menu ini terfilter supplier tsb.

## Akuntansi
Nota Kredit tetap dijurnal seperti sebelumnya (Cr 2101 Hutang Usaha). Tiap pembayaran menambah jurnal:
    Dr 2101 Hutang Usaha   /   Cr Kas-Bank (akun yang dipilih)   — di cabang nota tsb.
Otomatis masuk Jurnal Umum, Buku Besar, Neraca Saldo, Neraca & Dashboard.
Catatan "Bayar Hutang" manual lama di Kontak TIDAK diubah (tetap hanya catatan, tanpa jurnal) — pakai menu baru ini untuk pelunasan nota.
