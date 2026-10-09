<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * KODE KAS pada Penjualan & Pembelian
 * ─────────────────────────────────────────────────────────────────────
 * Sebelum ini, SEMUA transaksi Tunai otomatis dianggap masuk/keluar dari
 * akun '1101 - Kas' saja (hardcoded di DashboardController::buildJurnal).
 * Kalau toko punya lebih dari satu "kas" (mis. Kas Toko A, Kas Toko B,
 * Bank BCA, Bank Mandiri, dst), saldo per-akun jadi tidak akurat karena
 * semuanya numpuk di satu akun.
 *
 * Solusi: tambahkan kolom `kode_kas` di trx_jual/trx_beli/pos_nota supaya
 * kasir WAJIB memilih akun kas/bank tujuan setiap transaksi Tunai — persis
 * seperti field "KODE KAS [F12]" di aplikasi kasir desktop. Kolom `is_kas`
 * di COA menandai akun mana saja yang boleh dipakai sebagai pilihan kas
 * (defaultnya: 1101-Kas & 1102-Bank; admin bisa menambah akun kas/bank
 * lain lewat Master > COA).
 * ═══════════════════════════════════════════════════════════════════════
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coa', function (Blueprint $table) {
            $table->boolean('is_kas')->default(false)->after('normal');
        });

        // Tandai akun standar "Kas" & "Bank" sebagai akun kas otomatis
        DB::table('coa')->whereIn('kode', ['1101', '1102'])->update(['is_kas' => true]);

        Schema::table('trx_jual', function (Blueprint $table) {
            $table->string('kode_kas', 10)->nullable()->after('bayar');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->string('kode_kas', 10)->nullable()->after('bayar');
        });
        Schema::table('pos_nota', function (Blueprint $table) {
            $table->string('kode_kas', 10)->nullable()->after('bayar');
        });

        // Transaksi Tunai lama (sebelum kolom ini ada) dianggap sudah masuk
        // akun Kas (1101) — supaya laporan lama tetap konsisten & tidak
        // tiba-tiba kehilangan saldo kas di laporan yang sudah berjalan.
        DB::table('trx_jual')->where('bayar', 'Tunai')->whereNull('kode_kas')->update(['kode_kas' => '1101']);
        DB::table('trx_beli')->where('bayar', 'Tunai')->whereNull('kode_kas')->update(['kode_kas' => '1101']);
        DB::table('pos_nota')->where('bayar', 'Tunai')->whereNull('kode_kas')->update(['kode_kas' => '1101']);
    }

    public function down(): void
    {
        Schema::table('pos_nota', function (Blueprint $table) {
            $table->dropColumn('kode_kas');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn('kode_kas');
        });
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn('kode_kas');
        });
        Schema::table('coa', function (Blueprint $table) {
            $table->dropColumn('is_kas');
        });
    }
};
