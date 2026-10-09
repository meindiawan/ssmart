<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Kebijakan sementara: SEMUA barang dianggap "Kena PPN" dulu (termasuk
 * yang sebelumnya kesinkron dari SID sebagai "Non-PPN" — lihat
 * SidSyncController::syncBarang & upsertBarangFromSid yang defaultnya
 * ikut diubah ke "Kena PPN" di migration/perubahan yang sama).
 * Kalau nanti ada barang yang memang Non-PPN, ubah manual per-barang di
 * Master ▸ Barang.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('barang')->update(['ppn' => 'Kena PPN']);
    }

    public function down(): void
    {
        // Sengaja tidak dibalik — tidak ada cara mengetahui status ppn
        // asli sebelum migration ini dijalankan.
    }
};
