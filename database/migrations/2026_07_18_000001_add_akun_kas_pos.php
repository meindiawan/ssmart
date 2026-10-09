<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // akun_kas → kode COA (mis. 1101 Kas Toko / 1102 Bank BCA) yang dipilih
        // kasir saat transaksi Tunai, supaya jurnal tahu uang masuk/keluar dari
        // akun kas/bank yang MANA (bukan selalu digeneralisir ke satu akun Kas
        // saja), sehingga saldo & perhitungan modal per akun jadi akurat.
        // Nullable & tidak mengubah baris lama (yang lama tetap fallback ke
        // akun Kas default seperti sebelumnya di DashboardController::buildJurnal).
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->string('akun_kas', 10)->nullable()->after('bayar');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->string('akun_kas', 10)->nullable()->after('bayar');
        });
        // Disimpan juga di header nota POS supaya gampang ditampilkan di
        // struk & Riwayat Transaksi tanpa perlu join balik ke trx_jual/trx_beli.
        Schema::table('pos_nota', function (Blueprint $table) {
            $table->string('akun_kas', 10)->nullable()->after('bayar');
        });
    }

    public function down(): void
    {
        Schema::table('pos_nota', function (Blueprint $table) {
            $table->dropColumn('akun_kas');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn('akun_kas');
        });
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn('akun_kas');
        });
    }
};
