<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Menambah field Master Barang supaya form "Tambah/Edit Barang" bisa
     * lebih lengkap (mirip aplikasi kasir desktop): lokasi rak, gambar
     * produk, catatan bebas, dan data pendukung pajak untuk ekspor
     * e-Faktur/Coretax. Semua nullable — tidak mengganggu data lama.
     */
    public function up(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->string('rak', 50)->nullable()->after('sub_kategori');
            $table->string('gambar_url', 500)->nullable()->after('stok_max');
            $table->text('keterangan')->nullable()->after('gambar_url');
            $table->string('jenis_pajak', 30)->nullable()->after('keterangan');
            $table->string('kode_referensi_pajak', 50)->nullable()->after('jenis_pajak');
        });
    }

    public function down(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->dropColumn(['rak', 'gambar_url', 'keterangan', 'jenis_pajak', 'kode_referensi_pajak']);
        });
    }
};
