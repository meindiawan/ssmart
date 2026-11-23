# Update 23 Nov 2026 — Import Master Barang membaca kolom PPN (YA / TIDAK)

Timpa 4 file (struktur folder sama), lalu Ctrl+F5. Tanpa migrasi.
    app/Http/Controllers/Api/MasterController.php
    public/js/modules/master.js   (+ salinan js/modules/master.js)
    public/js/modules/export.js   (+ salinan js/modules/export.js)
Kalau route/cache di server: php artisan optimize:clear

## Cara pakai
Data Master ▸ Barang ▸ 📥 Import Excel ▸ pilih Cabang Tujuan ▸ pilih file (mis. barangpusat27102026.xlsx).
Preview menampilkan kolom PPN per baris + ringkasan "N Kena PPN · N Non-PPN · N kosong".

## Aturan PPN
- Kolom PPN = YA (juga: Y, Kena PPN)  → Kena PPN
- Kolom PPN = TIDAK (juga: T, Non PPN) → Non-PPN
- Kolom PPN kosong:
    • barang SUDAH ada  → status PPN lama TIDAK diubah
    • barang BARU       → Kena PPN, kecuali KATEGORI = ROKOK → Non-PPN

## Perbaikan lain
- File tanpa KODE_BARANG (hanya KODE_BARCODE) kini dikenali: barcode dipakai sebagai kode barang.
- Baris tanpa kode/barcode dilewati (dilaporkan di preview); kode kembar di file diberi peringatan.
- Template Excel ikut kolom PPN.

## Export Excel Master Barang = SEMUA barang
Tombol "📊 Export Excel (Semua)" kini mengambil seluruh barang dari server (bukan hanya 30/50 baris halaman
yang tampil), mengikuti filter pencarian & cabang yang aktif. Kolomnya sama dengan format Import (ada PPN YA/TIDAK),
jadi file bisa diedit lalu diimport lagi. Kolom HPP & STOK_TOTAL hanya info (diabaikan saat import).

## Ubah PPN / Non-PPN langsung dari Master Barang
Data Master ▸ Barang:
- Klik badge PPN pada baris barang → langsung bolak-balik Kena PPN ⇄ Non-PPN (tersimpan seketika).
- Centang beberapa barang (atau kotak header = semua di halaman) → tombol ✅ Kena PPN / 🚫 Non-PPN.
- "Semua hasil" → ubah SEMUA barang hasil pencarian/cabang yang aktif sekaligus (ada konfirmasi). Contoh: cari "ROKOK" → 🚫 Non-PPN.
Hanya kolom PPN barang yang berubah; stok/HPP/harga tidak tersentuh.
File tambahan: routes/api.php (POST /master/barang/ppn), MasterController::setPpnBarang.
