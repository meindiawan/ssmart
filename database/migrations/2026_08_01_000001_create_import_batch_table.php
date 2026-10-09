<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mencatat "sidik jari" (hash) tiap import Penjualan/Pembelian dari Excel yang
 * SUDAH SELESAI diproses, supaya kalau file yang persis sama tidak sengaja
 * di-import lagi (mis. karena diklik dobel / lupa sudah pernah upload),
 * sistem bisa memperingatkan penggunanya SEBELUM baris-baris itu dobel masuk
 * dan stok/nominal penjualan ikut dobel terhitung.
 *
 * Hash dihitung dari kombinasi: jenis (jual/beli), cabang, dan isi semua baris
 * (kode barang, qty, harga, satuan, tanggal, dst) — lihat
 * TransaksiController::hashImport(). Kalau ada satu saja baris yang beda,
 * hash-nya juga ikut beda, jadi ini bukan pembatas jumlah import — hanya
 * mendeteksi kalau BENAR-BENAR persis data yang sama sudah pernah masuk.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('import_batch', function (Blueprint $table) {
            $table->id();
            $table->enum('jenis', ['jual', 'beli']);
            $table->string('cabang', 100);
            $table->string('hash', 64)->index();
            $table->unsignedInteger('jumlah_baris')->default(0);
            $table->decimal('total_nominal', 15, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('import_batch');
    }
};
