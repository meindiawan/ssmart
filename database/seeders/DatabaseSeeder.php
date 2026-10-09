<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;

// Seeder bersih & aman dijalankan berulang: hanya data dasar (setting, COA, admin),
// tanpa data dummy. Data dummy lama ada di DemoSeeder (opsional).
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        foreach (['tarif_ppn' => '11', 'nama_toko' => 'Toko Sumini'] as $k => $v) {
            DB::table('settings')->updateOrInsert(
                ['key' => $k],
                ['value' => $v, 'created_at' => now(), 'updated_at' => now()]
            );
        }

        $coa = [
            ['1101','Kas','Aset','D',true],
            ['1102','Bank','Aset','D',true],
            ['1103','Piutang Usaha','Aset','D',false],
            ['1104','Piutang Kasbon','Aset','D',false],
            ['1105','Persediaan Barang','Aset','D',false],
            ['1106','PPN Masukan','Aset','D',false],
            ['1107','Piutang Cashbon Pelanggan','Aset','D',false],
            ['2101','Hutang Usaha','Liabilitas','K',false],
            ['2102','PPN Keluaran','Liabilitas','K',false],
            ['3101','Modal Pemilik','Modal','K',false],
            ['4101','Penjualan Kena PPN','Pendapatan','K',false],
            ['4102','Penjualan Non-PPN','Pendapatan','K',false],
            ['4103','Pendapatan Jasa','Pendapatan','K',false],
            ['4104','Pendapatan Sewa','Pendapatan','K',false],
            ['4105','Retur Penjualan','Pendapatan','D',false],
            ['5101','Harga Pokok Penjualan','Beban','D',false],
            ['6101','Biaya Gaji','Beban','D',false],
            ['6102','Biaya Listrik & Air','Beban','D',false],
            ['6103','Biaya Sewa','Beban','D',false],
            ['6104','Biaya Transportasi','Beban','D',false],
            ['6105','Biaya Operasional Lain','Beban','D',false],
        ];
        // Hanya tambah kode yang belum ada (3102, 1108, 1201, 1202, 5102, 6106, dst.
        // sudah dibuat oleh migrasi).
        foreach ($coa as [$kode, $nama, $kat, $normal, $isKas]) {
            if (DB::table('coa')->where('kode', $kode)->exists()) continue;
            DB::table('coa')->insert([
                'kode' => $kode, 'nama' => $nama, 'kat' => $kat, 'normal' => $normal,
                'is_default' => true, 'is_kas' => $isKas,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        $this->call(AdminSeeder::class);
    }
}
