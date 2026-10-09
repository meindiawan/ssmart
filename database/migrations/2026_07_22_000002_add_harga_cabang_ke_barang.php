<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Menambahkan tingkat harga ke-4: HARGA CABANG.
     * Sekarang Master Barang punya 4 tingkat harga lengkap, sesuai
     * tampilan grid Pembelian/Penjualan (HRG BELI / HGA TOKO / HRG PARTAI / HRG CABANG):
     *   - modal         → HRG BELI    (harga beli / modal barang)
     *   - harga_jual    → HGA TOKO    (harga jual eceran di toko)
     *   - harga_grosir  → HRG PARTAI  (harga jual grosir/partai)
     *   - harga_cabang  → HRG CABANG  (harga jual khusus untuk transaksi antar/oleh cabang) [BARU]
     */
    public function up(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->decimal('harga_cabang', 15, 2)->nullable()->default(0)->after('harga_grosir');
        });
    }

    public function down(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->dropColumn('harga_cabang');
        });
    }
};
