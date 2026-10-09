<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Akun standar baru untuk modul Aset Tetap. Pakai insertOrIgnore supaya
        // AMAN dijalankan di database yang sudah berjalan (production) maupun
        // fresh install (DatabaseSeeder juga menambahkan baris yang sama).
        DB::table('coa')->insertOrIgnore([
            [
                'kode' => '1201', 'nama' => 'Aset Tetap', 'kat' => 'Aset', 'normal' => 'D',
                'is_default' => true, 'is_kas' => false, 'created_at' => now(), 'updated_at' => now(),
            ],
            [
                // Kontra-aset: kategori Aset tapi saldo normalnya KREDIT — sama
                // seperti pola akun 4105 "Retur Penjualan" (kat Pendapatan, normal D).
                'kode' => '1202', 'nama' => 'Akumulasi Penyusutan Aset Tetap', 'kat' => 'Aset', 'normal' => 'K',
                'is_default' => true, 'is_kas' => false, 'created_at' => now(), 'updated_at' => now(),
            ],
            [
                'kode' => '6106', 'nama' => 'Biaya Penyusutan Aset Tetap', 'kat' => 'Beban', 'normal' => 'D',
                'is_default' => true, 'is_kas' => false, 'created_at' => now(), 'updated_at' => now(),
            ],
        ]);
    }

    public function down(): void
    {
        DB::table('coa')->whereIn('kode', ['1201', '1202', '6106'])->where('is_default', true)->delete();
    }
};
