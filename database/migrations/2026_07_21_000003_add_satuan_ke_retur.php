<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Retur Barang sebelumnya cuma bisa dicatat dalam satuan dasar (PCS).
// Samakan dengan pola trx_jual/trx_beli (lihat migration
// 2026_07_02_000002_add_satuan_konversi_transaksi.php): `qty`/`harga` TETAP
// disimpan dalam satuan dasar supaya rumus stok/jurnal/laporan tidak perlu
// diubah, sedangkan input asli kasir (mis. "1 DUS") disimpan terpisah di
// `satuan`, `qty_asal`, `harga_asal` murni untuk ditampilkan di riwayat.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trx_retur', function (Blueprint $table) {
            $table->string('satuan', 20)->nullable()->after('qty');
            $table->decimal('qty_asal', 12, 2)->nullable()->after('satuan');
            $table->decimal('harga_asal', 15, 2)->nullable()->after('harga');
        });
    }

    public function down(): void
    {
        Schema::table('trx_retur', function (Blueprint $table) {
            $table->dropColumn(['satuan', 'qty_asal', 'harga_asal']);
        });
    }
};
