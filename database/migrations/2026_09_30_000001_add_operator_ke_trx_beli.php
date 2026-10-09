<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Menyimpan akun/operator yang menginput transaksi Pembelian (mis. OFFICER,
 * EKA, ADM3, BCNA1, BAEB1, PDRA1, BKB1 dari laporan kasir lama) supaya asal
 * data bisa dilacak & difilter. NULL = tidak diketahui / input manual lama.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('trx_beli', 'operator')) {
            Schema::table('trx_beli', function (Blueprint $table) {
                $table->string('operator', 30)->nullable()->after('supplier')->index();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('trx_beli', 'operator')) {
            Schema::table('trx_beli', function (Blueprint $table) {
                $table->dropIndex(['operator']);
                $table->dropColumn('operator');
            });
        }
    }
};
