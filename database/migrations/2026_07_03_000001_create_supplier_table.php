<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Data Master Supplier — dipakai untuk dropdown pemasok saat input
        // Pembelian (trx_beli), dan bisa juga jadi acuan kolom `supplier`
        // (teks bebas) yang sudah ada di tabel barang.
        Schema::create('supplier', function (Blueprint $table) {
            $table->id();
            $table->string('nama')->unique();
            $table->string('kontak', 100)->nullable();  // nama contact person
            $table->string('telp', 30)->nullable();
            $table->text('alamat')->nullable();
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Pembelian — tandai dari supplier mana barang ini dibeli
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->string('supplier')->nullable()->after('kode_barang');
        });
    }

    public function down(): void
    {
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn('supplier');
        });
        Schema::dropIfExists('supplier');
    }
};
