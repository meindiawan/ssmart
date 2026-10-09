<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Master Barang PER CABANG.
 *
 * Tabel `barang` tetap jadi katalog gabungan (1 kode = 1 baris, dipakai semua
 * JOIN Jurnal/Laba Rugi seperti sebelumnya — TIDAK diubah). Tabel baru ini
 * menyimpan HARGA JUAL yang berbeda tiap cabang (HGA TOKO / HRG PARTAI /
 * HRG CABANG) sekaligus menandai barang tsb terdaftar di cabang mana.
 *
 * Nilai harga 0 = "ikut harga standar" di tabel `barang`. Barang juga dianggap
 * terdaftar di sebuah cabang kalau sudah punya baris saldo di tabel `stok`
 * cabang itu, jadi data lama otomatis terbaca tanpa perlu backfill.
 *
 * HPP/modal TIDAK disimpan di sini — HPP tetap dari Kartu HPP (HppService)
 * dan kolom barang.modal seperti sebelumnya.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('barang_cabang')) return;

        Schema::create('barang_cabang', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 50);
            $table->string('cabang', 100);
            $table->decimal('harga_jual', 15, 2)->default(0);
            $table->decimal('harga_grosir', 15, 2)->default(0);
            $table->decimal('harga_cabang', 15, 2)->default(0);
            $table->timestamps();
            $table->unique(['kode', 'cabang']);
            $table->index('cabang');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('barang_cabang');
    }
};
