# Update 14 Okt 2026

Setelah menimpa folder proyek, jalankan SEKALI:

    php artisan migrate

(membuat tabel jurnal_manual + jurnal_manual_detail, dan akun COA baru 1109 Piutang Antar Cabang & 2104 Hutang Antar Cabang)

## Isi
1. HPP: dicek — sudah 0 bila belum ada pembelian. Bug diperbaiki: HPP Retur Jual dulu tidak pernah masuk jurnal.
2. Jurnal Manual & Jurnal Memorial: tombol di Jurnal Umum + tab "Manual & Memorial" (edit, hapus, buat pembalik).
3. Mutasi Barang masuk jurnal: Kirim → 1108; ACC → Piutang Antar Cabang (1109) di pengirim, Hutang Antar Cabang (2104) di penerima. Selisih kirim vs terima → 5102.
   Pelunasan hutang cabang ke pusat: Jurnal Memorial kategori "Pelunasan Antar Cabang".
4. Neraca gabungan semua cabang: 1109 & 2104 otomatis saling meniadakan.
5. Halaman Pembelian disederhanakan (tanpa warna biru, kolom harga jual/%/kadaluarsa dihapus, supplier opsional).
