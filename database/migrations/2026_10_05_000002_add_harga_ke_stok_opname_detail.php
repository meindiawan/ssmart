<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    // HPP per satuan utk qty tambahan dari Stok Opname (+). NULL = tidak diisi
    // (ikut HPP rata-rata berjalan); 0 = HPP 0; >0 = HPP manual (dianggap
    // seperti saldo awal bernilai, jurnalnya tetap jurnal opname).
    public function up(): void
    {
        if (!Schema::hasColumn('stok_opname_detail', 'harga')) {
            Schema::table('stok_opname_detail', function (Blueprint $table) {
                $table->decimal('harga', 15, 2)->nullable()->after('selisih');
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('stok_opname_detail', 'harga')) {
            Schema::table('stok_opname_detail', function (Blueprint $table) {
                $table->dropColumn('harga');
            });
        }
    }
};
