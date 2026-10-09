<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Shift default karyawan (dipakai buat auto-isi absensi)
        Schema::table('karyawan', function (Blueprint $table) {
            $table->enum('shift', ['Pagi', 'Malam'])->default('Pagi')->after('jabatan');
        });

        // Shift yang dipakai di absensi hari itu (jam_masuk/jam_keluar tetap
        // tersimpan, tapi otomatis terisi dari shift supaya admin tidak perlu
        // ketik jam manual satu-satu untuk banyak karyawan)
        Schema::table('absensi', function (Blueprint $table) {
            $table->enum('shift', ['Pagi', 'Malam'])->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('absensi', function (Blueprint $table) {
            $table->dropColumn('shift');
        });
        Schema::table('karyawan', function (Blueprint $table) {
            $table->dropColumn('shift');
        });
    }
};
