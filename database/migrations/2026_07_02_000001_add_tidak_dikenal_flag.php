<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Penjualan & Pembelian — tandai baris yang kode/barcode-nya tidak
        // cocok dengan Master Barang manapun saat input manual atau import,
        // supaya transaksi TETAP masuk (tidak hilang / ter-skip) tapi
        // kelihatan jelas perlu dicek & dicocokkan ke Master Barang.
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->boolean('tidak_dikenal')->default(false)->after('kode_barang');
            $table->string('kode_asli', 100)->nullable()->after('tidak_dikenal');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->boolean('tidak_dikenal')->default(false)->after('kode_barang');
            $table->string('kode_asli', 100)->nullable()->after('tidak_dikenal');
        });
    }

    public function down(): void
    {
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn(['tidak_dikenal', 'kode_asli']);
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn(['tidak_dikenal', 'kode_asli']);
        });
    }
};
