<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Menambahkan opsi 'Harian' ke tipe_gaji karyawan — dibutuhkan untuk
    // karyawan dengan sistem gaji per-hari-masuk (bukan gaji bulanan/mingguan
    // tetap). gaji_pokok untuk tipe ini diartikan sebagai TARIF PER HARI.
    public function up(): void
    {
        DB::statement("ALTER TABLE karyawan MODIFY tipe_gaji ENUM('Bulanan','Mingguan','Harian') NOT NULL DEFAULT 'Bulanan'");
    }

    public function down(): void
    {
        DB::statement("UPDATE karyawan SET tipe_gaji = 'Bulanan' WHERE tipe_gaji = 'Harian'");
        DB::statement("ALTER TABLE karyawan MODIFY tipe_gaji ENUM('Bulanan','Mingguan') NOT NULL DEFAULT 'Bulanan'");
    }
};
