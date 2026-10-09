<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * HPP per baris Penjualan (dari NOTA, bukan dari Master Barang)
 * ─────────────────────────────────────────────────────────────────────
 * Selama ini HPP di Jurnal/Laba Rugi SELALU dihitung ulang saat laporan
 * dibuka: qty × barang.modal (lihat DashboardController::buildJurnal).
 * Kalau Harga Modal di Master Barang kosong/0 — walau item itu SUDAH
 * pernah terjual — HPP-nya ikut 0 dan Laba Kotor/Bersih jadi kelihatan
 * lebih besar dari kenyataan (ini yang memicu peringatan "barang tanpa
 * modal" di Laporan Laba Rugi).
 *
 * Padahal setiap baris nota penjualan dari SID (endpoint itempenjualan)
 * SUDAH membawa kolom `hpp` sendiri — nilai HPP versi kasir SID pada
 * SAAT transaksi terjadi — tapi kolom ini tidak pernah disimpan ke
 * trx_jual (lihat SidSyncController::syncPenjualan), jadi hilang begitu
 * saja dan laporan balik mengandalkan Master Barang yang belum tentu
 * terisi.
 *
 * Kolom `hpp` ini menyimpan nilai HPP TOTAL per baris (setara `subtotal`
 * tapi untuk sisi modal), persis seperti yang dikirim SID. Kalau kosong
 * (transaksi lama / input manual tanpa data SID), laporan tetap fallback
 * ke qty × barang.modal seperti sebelumnya — jadi 100% kompatibel dengan
 * data lama, tidak ada yang berubah kalau kolom ini kosong.
 * ═══════════════════════════════════════════════════════════════════════
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->decimal('hpp', 15, 2)->nullable()->after('harga_asal');
        });
    }

    public function down(): void
    {
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn('hpp');
        });
    }
};
