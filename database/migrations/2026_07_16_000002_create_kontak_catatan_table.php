<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Catatan bebas per kontak (Karyawan/Pelanggan/Supplier/Lainnya) — dipakai
        // untuk mencatat hal-hal yang tidak otomatis terekam dari transaksi lain,
        // misalnya "kurang bayar Rp50.000", piutang/hutang di luar kasbon &
        // cashbon, atau sekadar catatan. Kontak diidentifikasi lewat kombinasi
        // tipe+nama (bukan foreign key) supaya tetap bisa dipakai untuk nama
        // yang belum ada di master manapun (mis. pelanggan/supplier lepas).
        Schema::create('kontak_catatan', function (Blueprint $table) {
            $table->id();
            $table->enum('tipe', ['Karyawan', 'Pelanggan', 'Supplier', 'Lainnya']);
            $table->string('nama', 200);
            $table->date('tgl');
            // Piutang        = kontak berhutang ke kita (kita punya piutang)
            // Hutang         = kita berhutang ke kontak
            // Bayar Piutang  = kontak membayar piutangnya ke kita
            // Bayar Hutang   = kita membayar hutang ke kontak
            // Catatan        = catatan teks biasa, tanpa nominal
            $table->enum('jenis', ['Piutang', 'Hutang', 'Bayar Piutang', 'Bayar Hutang', 'Catatan']);
            $table->decimal('nominal', 15, 2)->nullable();
            $table->text('keterangan')->nullable();
            $table->timestamps();

            $table->index(['tipe', 'nama']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('kontak_catatan');
    }
};
