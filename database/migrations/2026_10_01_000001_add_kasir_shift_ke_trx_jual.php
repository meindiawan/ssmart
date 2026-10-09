<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kasir & shift pada Penjualan.
 *
 * `kasir` = akun kasir yang melayani (mis. BAEA1, PDRB2, TSB1, ADM2) —
 * dibawa dari kolom "Kasir" di file Import Penjualan (laporan kasir lama).
 * `shift` = 'Pagi' | 'Siang' | 'Sehari'. Aturan: akun berakhiran 1 = Pagi, selain
 * itu Siang; akun ADM… & PSR… = Sehari (lihat App\Services\KasirAkunService).
 *
 * Dipakai Analisis Data ▸ Kasir & Shift untuk melihat penjualan & laba per
 * shift, per kasir, per cabang, dan total. NULL = transaksi lama / input
 * manual tanpa kasir (otomatis dikelompokkan "(tanpa kasir)").
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('trx_jual', 'kasir')) {
            Schema::table('trx_jual', function (Blueprint $table) {
                $table->string('kasir', 30)->nullable()->after('cabang')->index();
            });
        }
        if (!Schema::hasColumn('trx_jual', 'shift')) {
            Schema::table('trx_jual', function (Blueprint $table) {
                $table->string('shift', 10)->nullable()->after('kasir')->index();
            });
        }
    }

    public function down(): void
    {
        foreach (['shift', 'kasir'] as $kol) {
            if (Schema::hasColumn('trx_jual', $kol)) {
                Schema::table('trx_jual', function (Blueprint $table) use ($kol) {
                    $table->dropIndex([$kol]);
                    $table->dropColumn($kol);
                });
            }
        }
    }
};
