<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Pembelian — tambah diskon/potongan harga & keterangan
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->decimal('diskon', 15, 2)->default(0)->after('harga');
            $table->text('keterangan')->nullable()->after('bayar');
        });

        // Penjualan — tambah keterangan (dipakai juga oleh sinkronisasi SID)
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->text('keterangan')->nullable()->after('bayar');
        });

        // Pengeluaran / Biaya — tambah nomor bukti/kode pengeluaran
        Schema::table('trx_biaya', function (Blueprint $table) {
            $table->string('no_bukti', 30)->nullable()->unique()->after('id');
        });

        // Isi no_bukti untuk data lama yang mungkin sudah ada, agar tetap unik
        $rows = \DB::table('trx_biaya')->whereNull('no_bukti')->orderBy('id')->get();
        foreach ($rows as $r) {
            \DB::table('trx_biaya')->where('id', $r->id)->update([
                'no_bukti' => 'BX-' . date('Ymd', strtotime($r->tgl)) . '-' . str_pad($r->id, 4, '0', STR_PAD_LEFT),
            ]);
        }
    }

    public function down(): void
    {
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn(['diskon', 'keterangan']);
        });
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn('keterangan');
        });
        Schema::table('trx_biaya', function (Blueprint $table) {
            $table->dropColumn('no_bukti');
        });
    }
};
