<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * KARTU HPP — sumber kebenaran biaya (cost basis), BUKAN dari Master Barang
 * ─────────────────────────────────────────────────────────────────────
 * Selama ini HPP di Jurnal/Laba Rugi diambil dari `barang.modal`, sebuah
 * angka tunggal yang diisi MANUAL/sekali-klik dan tidak pernah tahu barang
 * masuk dengan harga berapa & keluar dengan harga berapa dari waktu ke
 * waktu. Tabel ini menggantikannya dengan KARTU STOK BERNILAI (moving
 * average cost) per barang PER CABANG:
 *
 *  - Setiap barang MASUK (Pembelian, Barang Masuk, Retur Jual, Mutasi
 *    Masuk, Opname selisih+) dicatat dengan harga aslinya, dan HPP
 *    (rata-rata) DIHITUNG ULANG otomatis: kalau harga beli naik/turun,
 *    hasilnya di-rata-rata dengan saldo yang sudah ada — bukan ditimpa.
 *  - Setiap barang KELUAR (Penjualan, Barang Keluar, Retur Beli, Mutasi
 *    Keluar, Opname selisih-) memakai HPP rata-rata yang berlaku SAAT itu
 *    (saldo_hpp_sebelum) — persis nilai historisnya, bukan dihitung ulang
 *    belakangan pakai harga sekarang.
 *
 * Baris ini dibangun ulang otomatis (lihat App\Services\HppService) setiap
 * kali ada transaksi yang mempengaruhi stok barang bersangkutan, sehingga
 * selalu konsisten dengan data transaksi terkini (termasuk kalau ada
 * transaksi lama yang diedit/dihapus).
 * ═══════════════════════════════════════════════════════════════════════
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('hpp_kartu', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->unsignedInteger('urutan')->default(0); // tie-break kronologis dalam tanggal yang sama
            $table->string('cabang', 100);
            $table->string('kode_barang', 50);
            $table->string('tipe', 30); // Pembelian, Barang Masuk, Retur Jual, Mutasi Masuk, Opname (+), Penjualan, Barang Keluar, Retur Beli, Mutasi Keluar, Opname (-)
            $table->string('ref_tabel', 40); // nama tabel sumber, mis. trx_jual
            $table->unsignedBigInteger('ref_id'); // id baris di tabel sumber
            $table->string('ref', 60)->nullable(); // nomor referensi utk tampilan (no_nota/no_dok/no_ref/no_so)
            $table->string('keterangan', 255)->nullable();

            $table->decimal('qty_masuk', 14, 2)->default(0);
            $table->decimal('harga_masuk', 15, 2)->default(0); // harga satuan barang masuk (kalau ada datanya)
            $table->decimal('qty_keluar', 14, 2)->default(0);
            $table->decimal('hpp_satuan', 15, 2)->default(0); // baris masuk: rata-rata baru setelah baris ini. baris keluar: HPP/satuan yang dipakai saat itu
            $table->decimal('nilai_masuk', 15, 2)->default(0);
            $table->decimal('nilai_keluar', 15, 2)->default(0); // = HPP baris ini (dipakai Jurnal & Laba Rugi)

            $table->decimal('saldo_qty_sebelum', 14, 2)->default(0);
            $table->decimal('saldo_nilai_sebelum', 15, 2)->default(0);
            $table->decimal('saldo_hpp_sebelum', 15, 2)->default(0);
            $table->decimal('saldo_qty', 14, 2)->default(0);
            $table->decimal('saldo_nilai', 15, 2)->default(0);
            $table->decimal('saldo_hpp', 15, 2)->default(0);

            $table->timestamps();

            $table->index(['kode_barang', 'cabang', 'tgl', 'urutan'], 'hpp_kartu_barang_urut_idx');
            $table->index(['ref_tabel', 'ref_id'], 'hpp_kartu_ref_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hpp_kartu');
    }
};
