<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    // Akun baru dipakai oleh DashboardController::buildJurnal() untuk mencatat
    // dampak keuangan dari Barang Keluar (jenis Rusak/Sample/Lainnya) dan
    // selisih Stok Opname — transaksi yang SEBELUMNYA mengubah qty stok tapi
    // TIDAK PERNAH masuk ke jurnal, sehingga nilai persediaan di neraca bisa
    // tidak nyambung dengan qty fisik.
    public function up(): void
    {
        if (!DB::table('coa')->where('kode', '5102')->exists()) {
            DB::table('coa')->insert([
                'kode'       => '5102',
                'nama'       => 'Penyesuaian Stok & Kerugian Barang',
                'kat'        => 'Beban',
                'normal'     => 'D',
                'is_default' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('coa')->where('kode', '5102')->where('is_default', true)->delete();
    }
};
