<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Pelunasan hutang dipecah: berapa dari nominal yang membayar porsi barang
 * KENA PPN (DPP + PPN Masukan) dan berapa yang membayar porsi NON-PPN.
 * Pembayaran lama (kolom NULL) otomatis dibagi proporsional oleh HutangController.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('bayar_hutang')) return;
        Schema::table('bayar_hutang', function (Blueprint $table) {
            if (!Schema::hasColumn('bayar_hutang', 'porsi_ppn'))     $table->decimal('porsi_ppn', 15, 2)->nullable()->after('nominal');
            if (!Schema::hasColumn('bayar_hutang', 'porsi_non_ppn')) $table->decimal('porsi_non_ppn', 15, 2)->nullable()->after('porsi_ppn');
        });
    }

    public function down(): void
    {
        if (!Schema::hasTable('bayar_hutang')) return;
        Schema::table('bayar_hutang', function (Blueprint $table) {
            foreach (['porsi_ppn', 'porsi_non_ppn'] as $c) {
                if (Schema::hasColumn('bayar_hutang', $c)) $table->dropColumn($c);
            }
        });
    }
};
