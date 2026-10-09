<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Log sync dari SID
        Schema::create('sid_sync_log', function (Blueprint $table) {
            $table->id();
            $table->string('jenis', 30); // penjualan | barang | stok
            $table->dateTime('sync_at');
            $table->integer('berhasil')->default(0);
            $table->integer('dilewati')->default(0);
            $table->integer('gagal')->default(0);
            $table->text('pesan')->nullable();
            $table->timestamps();
        });

        // Tracking nota SID yang sudah disync agar tidak dobel
        Schema::create('sid_synced', function (Blueprint $table) {
            $table->id();
            $table->string('jenis', 20); // penjualan | pembelian
            $table->string('kode_sid', 100)->unique(); // kode nota dari SID
            $table->string('tanggal', 20)->nullable();
            $table->decimal('jumlah', 15, 2)->default(0);
            $table->timestamps();
        });

        // Counter TRX untuk API SID (harus unik tiap request)
        Schema::create('sid_trx_counter', function (Blueprint $table) {
            $table->id();
            $table->bigInteger('counter')->default(1);
        });
        // Insert counter awal
        \DB::table('sid_trx_counter')->insert(['counter' => 1000]);
    }

    public function down(): void
    {
        Schema::dropIfExists('sid_trx_counter');
        Schema::dropIfExists('sid_synced');
        Schema::dropIfExists('sid_sync_log');
    }
};
