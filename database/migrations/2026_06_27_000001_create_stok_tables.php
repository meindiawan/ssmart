<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Stok per cabang (saldo stok realtime)
        Schema::create('stok', function (Blueprint $table) {
            $table->id();
            $table->string('kode_barang', 50);
            $table->string('cabang', 100);
            $table->decimal('qty', 12, 2)->default(0);
            $table->timestamps();
            $table->unique(['kode_barang', 'cabang']);
        });

        // Barang Masuk (pembelian/penerimaan stok)
        Schema::create('barang_masuk', function (Blueprint $table) {
            $table->id();
            $table->string('no_dok', 50)->nullable();
            $table->date('tgl');
            $table->string('cabang', 100);
            $table->string('kode_barang', 50);
            $table->string('satuan', 20)->default('PCS');
            $table->decimal('qty', 12, 2);
            $table->decimal('harga_beli', 15, 2)->default(0);
            $table->string('supplier', 100)->nullable();
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Barang Keluar (penjualan/pengeluaran stok)
        Schema::create('barang_keluar', function (Blueprint $table) {
            $table->id();
            $table->string('no_dok', 50)->nullable();
            $table->date('tgl');
            $table->string('cabang', 100);
            $table->string('kode_barang', 50);
            $table->string('satuan', 20)->default('PCS');
            $table->decimal('qty', 12, 2);
            $table->decimal('harga_jual', 15, 2)->default(0);
            $table->enum('jenis', ['Penjualan', 'Retur Beli', 'Rusak', 'Sample', 'Lainnya'])->default('Penjualan');
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Stok Opname
        Schema::create('stok_opname', function (Blueprint $table) {
            $table->id();
            $table->string('no_so', 30);
            $table->date('tgl');
            $table->string('cabang', 100);
            $table->enum('status', ['Draft', 'Selesai'])->default('Draft');
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Detail Stok Opname
        Schema::create('stok_opname_detail', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('opname_id');
            $table->string('kode_barang', 50);
            $table->decimal('qty_sistem', 12, 2)->default(0);
            $table->decimal('qty_fisik', 12, 2)->default(0);
            $table->decimal('selisih', 12, 2)->default(0); // fisik - sistem
            $table->timestamps();
            $table->foreign('opname_id')->references('id')->on('stok_opname')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stok_opname_detail');
        Schema::dropIfExists('stok_opname');
        Schema::dropIfExists('barang_keluar');
        Schema::dropIfExists('barang_masuk');
        Schema::dropIfExists('stok');
    }
};
