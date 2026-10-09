<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Status PPN (Kena PPN / Non-PPN) selama ini SELALU diambil dari Master
 * Barang (`barang.ppn`) — tidak bisa diubah per transaksi. Padahal di
 * dunia nyata, barang yang sama kadang dibeli/dijual kena PPN, kadang
 * tidak (tergantung supplier/pelanggan/faktur pajak saat itu).
 *
 * Kolom `ppn` ini ditambahkan ke `trx_jual` & `trx_beli` sebagai OVERRIDE
 * per baris transaksi:
 *   - NULL  → ikut status PPN di Master Barang (perilaku lama, default)
 *   - 'Kena PPN' / 'Non-PPN' → dipakai APA ADANYA utk baris ini, dan ini
 *     yang dipakai buat hitung PPN Keluaran/Masukan di Jurnal — bukan lagi
 *     barang.ppn.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->string('ppn', 15)->nullable()->after('diskon');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->string('ppn', 15)->nullable()->after('diskon');
        });
    }

    public function down(): void
    {
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn('ppn');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn('ppn');
        });
    }
};
