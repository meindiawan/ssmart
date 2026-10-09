<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->string('barcode', 50)->nullable()->after('kode');
            $table->string('barcode2', 50)->nullable()->after('barcode');
            $table->string('barcode3', 50)->nullable()->after('barcode2');
            $table->string('kategori', 100)->nullable()->after('nama');
            $table->string('sub_kategori', 100)->nullable()->after('kategori');
            $table->string('supplier', 100)->nullable()->after('sub_kategori');
            $table->string('satuan1', 20)->nullable()->default('PCS')->after('ppn');
            $table->string('satuan2', 20)->nullable()->after('satuan1');
            $table->string('satuan3', 20)->nullable()->after('satuan2');
            $table->integer('isi')->nullable()->default(1)->after('satuan3');
            $table->decimal('harga_jual', 15, 2)->nullable()->default(0)->after('modal');
            $table->decimal('harga_grosir', 15, 2)->nullable()->default(0)->after('harga_jual');
            $table->integer('stok_min')->nullable()->default(0)->after('harga_grosir');
            $table->integer('stok_max')->nullable()->default(0)->after('stok_min');
        });

        // Tambah edit support untuk cabang (alamat sudah ada, tambah telepon)
        Schema::table('cabang', function (Blueprint $table) {
            $table->string('telp', 30)->nullable()->after('alamat');
        });
    }

    public function down(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->dropColumn(['barcode','barcode2','barcode3','kategori','sub_kategori','supplier',
                'satuan1','satuan2','satuan3','isi','harga_jual','harga_grosir','stok_min','stok_max']);
        });
        Schema::table('cabang', function (Blueprint $table) {
            $table->dropColumn('telp');
        });
    }
};
