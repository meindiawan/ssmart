<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Kasbon Karyawan: sebelumnya nama diketik manual (nama_karyawan bebas
        // teks). Sekarang dihubungkan ke master karyawan supaya id & nama
        // selalu konsisten dan bisa dipakai untuk hitung sisa kasbon per
        // karyawan (dipakai di form potong gaji).
        Schema::table('trx_kasbon', function (Blueprint $table) {
            $table->unsignedBigInteger('karyawan_id')->nullable()->after('id');
            $table->text('keterangan')->nullable()->after('nominal');
            $table->foreign('karyawan_id')->references('id')->on('karyawan')->nullOnDelete();
        });

        // Gaji: potongan kasbon dicatat terpisah dari potongan manual/alpha,
        // + referensi ke baris trx_kasbon (jenis Dibayar) yang otomatis
        // dibuat saat gaji diproses, supaya bisa dibatalkan kalau gaji dihapus.
        Schema::table('gaji', function (Blueprint $table) {
            $table->decimal('potongan_kasbon', 15, 2)->default(0)->after('potongan');
            $table->unsignedBigInteger('kasbon_trx_id')->nullable()->after('trx_biaya_id');
        });
    }

    public function down(): void
    {
        Schema::table('gaji', function (Blueprint $table) {
            $table->dropColumn(['potongan_kasbon', 'kasbon_trx_id']);
        });
        Schema::table('trx_kasbon', function (Blueprint $table) {
            $table->dropForeign(['karyawan_id']);
            $table->dropColumn(['karyawan_id', 'keterangan']);
        });
    }
};
