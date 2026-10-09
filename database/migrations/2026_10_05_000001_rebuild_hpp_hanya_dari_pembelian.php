<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Aturan baru: HPP HANYA dari Pembelian (belum ada pembelian = HPP 0).
 * Kartu HPP (hpp_kartu) yang sudah terlanjur terisi dengan aturan lama
 * (HPP dari nota kasir lama / Saldo Awal / barang.modal) harus dibangun
 * ulang SEKALI supaya Jurnal, Laba Rugi, Laba Rugi Lengkap & Neraca
 * ikut sinkron. Sama dengan menjalankan: php artisan hpp:rebuild
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('hpp_kartu')) return;
        app(\App\Services\HppService::class)->rebuildAll();
    }

    public function down(): void
    {
        // tidak ada yang perlu dibalik
    }
};
