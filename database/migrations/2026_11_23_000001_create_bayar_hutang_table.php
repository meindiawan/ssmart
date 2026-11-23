<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PELUNASAN HUTANG PEMBELIAN PER NOTA.
 * Hutang = baris trx_beli ber-bayar "Kredit" (dijurnal Cr 2101 Hutang Usaha).
 * Setiap pembayaran dicatat di sini (boleh dicicil), dikaitkan ke no_nota pembelian.
 * Dibaca DashboardController::buildJurnal() → jurnal: Dr 2101 Hutang Usaha / Cr Kas-Bank.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('bayar_hutang')) return;
        Schema::create('bayar_hutang', function (Blueprint $table) {
            $table->id();
            $table->string('no_bayar', 40)->unique();
            $table->string('no_nota', 60)->index();     // no_nota pembelian (atau PB-{id} bila nota tanpa nomor)
            $table->date('tgl');
            $table->string('cabang');
            $table->decimal('nominal', 15, 2);
            $table->string('kode_kas', 20);             // akun Kas/Bank sumber pembayaran
            $table->string('keterangan')->nullable();
            $table->timestamps();
            $table->index('tgl');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bayar_hutang');
    }
};
