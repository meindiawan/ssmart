<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Supaya transaksi Penjualan/Pembelian bisa dicatat dalam satuan apa pun
// (PCS, DUS, KARTON, dst) tanpa membuat Omzet/HPP/Laba Rugi meledak:
// - `qty` & `harga` di trx_jual/trx_beli TETAP disimpan dalam SATUAN DASAR
//   (satuan1, sama seperti barang.modal), jadi seluruh rumus laporan yang
//   sudah ada (jurnal, laba rugi, margin, stok) otomatis tetap benar TANPA
//   perlu diubah sama sekali.
// - Input asli dari kasir (mis. "3 DUS x Rp150.000") disimpan terpisah di
//   `satuan`, `qty_asal`, `harga_asal` — murni untuk ditampilkan di riwayat,
//   konversinya dilakukan otomatis oleh backend saat transaksi disimpan.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->string('satuan', 20)->nullable()->after('qty');
            $table->decimal('qty_asal', 12, 2)->nullable()->after('satuan');
            $table->decimal('harga_asal', 15, 2)->nullable()->after('harga');
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->string('satuan', 20)->nullable()->after('qty');
            $table->decimal('qty_asal', 12, 2)->nullable()->after('satuan');
            $table->decimal('harga_asal', 15, 2)->nullable()->after('harga');
        });
    }

    public function down(): void
    {
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn(['satuan', 'qty_asal', 'harga_asal']);
        });
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn(['satuan', 'qty_asal', 'harga_asal']);
        });
    }
};
