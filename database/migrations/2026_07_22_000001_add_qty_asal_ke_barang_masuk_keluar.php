<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Barang Masuk & Barang Keluar sudah punya kolom `satuan`, tapi selama ini
// cuma LABEL teks bebas — qty yang diketik langsung dipakai apa adanya,
// tidak pernah benar-benar dikonversi ke satuan dasar. Jadi kalau staf
// gudang menulis "2 DUS" di kolom satuan tapi qty diisi "2", stok yang
// nambah cuma 2 PCS, bukan 2 DUS = 24 PCS. Migration ini menambah
// qty_asal/harga_asal (sama seperti pola trx_jual/trx_beli/trx_retur) —
// `qty`/`harga_beli`/`harga_jual` TETAP satuan dasar untuk stok akurat,
// qty_asal/harga_asal murni catatan tampilan input aslinya.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('barang_masuk', function (Blueprint $table) {
            $table->decimal('qty_asal', 12, 2)->nullable()->after('satuan');
            $table->decimal('harga_asal', 15, 2)->nullable()->after('harga_beli');
        });
        Schema::table('barang_keluar', function (Blueprint $table) {
            $table->decimal('qty_asal', 12, 2)->nullable()->after('satuan');
            $table->decimal('harga_asal', 15, 2)->nullable()->after('harga_jual');
        });
    }

    public function down(): void
    {
        Schema::table('barang_masuk', function (Blueprint $table) {
            $table->dropColumn(['qty_asal', 'harga_asal']);
        });
        Schema::table('barang_keluar', function (Blueprint $table) {
            $table->dropColumn(['qty_asal', 'harga_asal']);
        });
    }
};
