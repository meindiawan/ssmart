<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Master Karyawan
        Schema::create('karyawan', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 20)->unique();
            $table->string('nama');
            $table->string('jabatan', 100)->nullable();
            $table->string('cabang', 100)->nullable();
            $table->string('telp', 30)->nullable();
            $table->date('tgl_masuk')->nullable();
            $table->enum('tipe_gaji', ['Bulanan', 'Mingguan'])->default('Bulanan');
            $table->decimal('gaji_pokok', 15, 2)->default(0);
            $table->decimal('tunjangan', 15, 2)->default(0);
            $table->enum('status', ['Aktif', 'Nonaktif'])->default('Aktif');
            $table->text('catatan')->nullable();
            $table->timestamps();
        });

        // Absensi Karyawan
        Schema::create('absensi', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->unsignedBigInteger('karyawan_id');
            $table->enum('status', ['Hadir', 'Izin', 'Sakit', 'Alpha'])->default('Hadir');
            $table->time('jam_masuk')->nullable();
            $table->time('jam_keluar')->nullable();
            $table->text('keterangan')->nullable();
            $table->timestamps();
            $table->foreign('karyawan_id')->references('id')->on('karyawan')->onDelete('cascade');
            $table->unique(['tgl', 'karyawan_id']);
        });

        // Penggajian
        Schema::create('gaji', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('karyawan_id');
            $table->date('periode_mulai');
            $table->date('periode_selesai');
            $table->decimal('gaji_pokok', 15, 2)->default(0);
            $table->decimal('tunjangan', 15, 2)->default(0);
            $table->decimal('bonus', 15, 2)->default(0);
            $table->decimal('potongan', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->integer('hari_kerja')->default(0);
            $table->integer('hari_hadir')->default(0);
            $table->integer('hari_izin')->default(0);
            $table->integer('hari_alpha')->default(0);
            $table->string('cabang', 100)->nullable();
            $table->text('keterangan')->nullable();
            $table->unsignedBigInteger('trx_biaya_id')->nullable(); // referensi ke pengeluaran
            $table->timestamps();
            $table->foreign('karyawan_id')->references('id')->on('karyawan')->onDelete('cascade');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gaji');
        Schema::dropIfExists('absensi');
        Schema::dropIfExists('karyawan');
    }
};
