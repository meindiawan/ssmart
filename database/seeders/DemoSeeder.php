<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

// Data dummy (opsional): php artisan db:seed --class=DemoSeeder  (hanya utk DB kosong)
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        // Settings
        DB::table('settings')->insert([
            ['key' => 'tarif_ppn', 'value' => '11', 'created_at' => now(), 'updated_at' => now()],
            ['key' => 'nama_toko', 'value' => 'Toko Sumini', 'created_at' => now(), 'updated_at' => now()],
        ]);

        // COA Default
        $coa = [
            ['kode'=>'1101','nama'=>'Kas','kat'=>'Aset','normal'=>'D','is_default'=>true,'is_kas'=>true],
            ['kode'=>'1102','nama'=>'Bank','kat'=>'Aset','normal'=>'D','is_default'=>true,'is_kas'=>true],
            ['kode'=>'1103','nama'=>'Piutang Usaha','kat'=>'Aset','normal'=>'D','is_default'=>true],
            ['kode'=>'1104','nama'=>'Piutang Kasbon','kat'=>'Aset','normal'=>'D','is_default'=>true],
            ['kode'=>'1105','nama'=>'Persediaan Barang','kat'=>'Aset','normal'=>'D','is_default'=>true],
            ['kode'=>'1106','nama'=>'PPN Masukan','kat'=>'Aset','normal'=>'D','is_default'=>true],
            ['kode'=>'1107','nama'=>'Piutang Cashbon Pelanggan','kat'=>'Aset','normal'=>'D','is_default'=>true],
            ['kode'=>'2101','nama'=>'Hutang Usaha','kat'=>'Liabilitas','normal'=>'K','is_default'=>true],
            ['kode'=>'2102','nama'=>'PPN Keluaran','kat'=>'Liabilitas','normal'=>'K','is_default'=>true],
            ['kode'=>'3101','nama'=>'Modal Pemilik','kat'=>'Modal','normal'=>'K','is_default'=>true],
            ['kode'=>'3102','nama'=>'Laba Ditahan','kat'=>'Modal','normal'=>'K','is_default'=>true],
            ['kode'=>'4101','nama'=>'Penjualan Kena PPN','kat'=>'Pendapatan','normal'=>'K','is_default'=>true],
            ['kode'=>'4102','nama'=>'Penjualan Non-PPN','kat'=>'Pendapatan','normal'=>'K','is_default'=>true],
            ['kode'=>'4103','nama'=>'Pendapatan Jasa','kat'=>'Pendapatan','normal'=>'K','is_default'=>true],
            ['kode'=>'4104','nama'=>'Pendapatan Sewa','kat'=>'Pendapatan','normal'=>'K','is_default'=>true],
            ['kode'=>'4105','nama'=>'Retur Penjualan','kat'=>'Pendapatan','normal'=>'D','is_default'=>true],
            ['kode'=>'5101','nama'=>'Harga Pokok Penjualan','kat'=>'Beban','normal'=>'D','is_default'=>true],
            ['kode'=>'6101','nama'=>'Biaya Gaji','kat'=>'Beban','normal'=>'D','is_default'=>true],
            ['kode'=>'6102','nama'=>'Biaya Listrik & Air','kat'=>'Beban','normal'=>'D','is_default'=>true],
            ['kode'=>'6103','nama'=>'Biaya Sewa','kat'=>'Beban','normal'=>'D','is_default'=>true],
            ['kode'=>'6104','nama'=>'Biaya Transportasi','kat'=>'Beban','normal'=>'D','is_default'=>true],
            ['kode'=>'6105','nama'=>'Biaya Operasional Lain','kat'=>'Beban','normal'=>'D','is_default'=>true],
            ['kode'=>'1201','nama'=>'Aset Tetap','kat'=>'Aset','normal'=>'D','is_default'=>true],
            // Kontra-aset (saldo normal Kredit meski kategori Aset) — sama seperti pola 4105 Retur Penjualan.
            ['kode'=>'1202','nama'=>'Akumulasi Penyusutan Aset Tetap','kat'=>'Aset','normal'=>'K','is_default'=>true],
            ['kode'=>'6106','nama'=>'Biaya Penyusutan Aset Tetap','kat'=>'Beban','normal'=>'D','is_default'=>true],
        ];
        foreach ($coa as &$c) { $c['is_kas'] = $c['is_kas'] ?? false; $c['created_at'] = now(); $c['updated_at'] = now(); }
        DB::table('coa')->insert($coa);

        // Cabang
        DB::table('cabang')->insert([
            ['nama'=>'Pusat Rembang','alamat'=>'Jl. Pasar Lama No. 1, Rembang','created_at'=>now(),'updated_at'=>now()],
            ['nama'=>'Cabang Lasem','alamat'=>'Jl. Raya Lasem No. 8, Lasem','created_at'=>now(),'updated_at'=>now()],
            ['nama'=>'Cabang Pati','alamat'=>'Jl. Pemuda No. 12, Pati','created_at'=>now(),'updated_at'=>now()],
        ]);

        // Barang
        $barang = [
            ['kode'=>'BR001','nama'=>'Minyak Goreng Tropical 1L','ppn'=>'Kena PPN','modal'=>14500],
            ['kode'=>'BR002','nama'=>'Beras Premium 5kg','ppn'=>'Non-PPN','modal'=>58000],
            ['kode'=>'BR003','nama'=>'Gula Pasir 1kg','ppn'=>'Kena PPN','modal'=>12500],
            ['kode'=>'BR004','nama'=>'Tepung Terigu 1kg','ppn'=>'Non-PPN','modal'=>8500],
            ['kode'=>'BR005','nama'=>'Susu SGM 400gr','ppn'=>'Kena PPN','modal'=>45000],
            ['kode'=>'BR006','nama'=>'Indomie Goreng','ppn'=>'Kena PPN','modal'=>2800],
            ['kode'=>'BR007','nama'=>'Kecap Bango 650ml','ppn'=>'Kena PPN','modal'=>18000],
            ['kode'=>'BR008','nama'=>'Sabun Mandi Lifebuoy','ppn'=>'Kena PPN','modal'=>4200],
            ['kode'=>'BR009','nama'=>'Teh Botol Sosro 330ml','ppn'=>'Kena PPN','modal'=>4500],
            ['kode'=>'BR010','nama'=>'Detergen Rinso 1kg','ppn'=>'Kena PPN','modal'=>22000],
        ];
        foreach ($barang as &$b) { $b['created_at'] = now(); $b['updated_at'] = now(); }
        DB::table('barang')->insert($barang);

        // Jasa
        $jasa = [
            ['kode'=>'JS001','nama'=>'Servis Kompor Gas','ppn'=>'Non-PPN','harga'=>50000],
            ['kode'=>'JS002','nama'=>'Antar Barang','ppn'=>'Non-PPN','harga'=>20000],
            ['kode'=>'JS003','nama'=>'Pasang Instalasi Listrik','ppn'=>'Kena PPN','harga'=>150000],
            ['kode'=>'JS004','nama'=>'Servis Kulkas','ppn'=>'Non-PPN','harga'=>120000],
        ];
        foreach ($jasa as &$j) { $j['created_at'] = now(); $j['updated_at'] = now(); }
        DB::table('jasa')->insert($jasa);

        // Pelanggan
        $pelanggan = [
            ['kode'=>'PL001','nama'=>'Ibu Sari Wulandari','telp'=>'081234567890','alamat'=>'Jl. Mawar No. 3, Rembang','poin'=>120],
            ['kode'=>'PL002','nama'=>'Bapak Joko Santoso','telp'=>'082345678901','alamat'=>'Jl. Melati No. 7, Lasem','poin'=>75],
            ['kode'=>'PL003','nama'=>'Ibu Rina Kartika','telp'=>'083456789012','alamat'=>'Jl. Pemuda No. 2, Pati','poin'=>200],
            ['kode'=>'PL004','nama'=>'Bapak Ahmad Subagyo','telp'=>'084567890123','alamat'=>'Jl. Diponegoro No. 5, Rembang','poin'=>50],
            ['kode'=>'PL005','nama'=>'Ibu Dewi Rahayu','telp'=>'085678901234','alamat'=>'Jl. Sudirman No. 10, Lasem','poin'=>310],
        ];
        foreach ($pelanggan as &$p) { $p['created_at'] = now(); $p['updated_at'] = now(); }
        DB::table('pelanggan')->insert($pelanggan);

        // Generate 3 months of transaction data
        $cabs = ['Pusat Rembang', 'Cabang Lasem', 'Cabang Pati'];
        $barangJual = [
            ['BR001', 16000], ['BR002', 65000], ['BR003', 14000],
            ['BR004', 9500],  ['BR005', 52000], ['BR006', 3200],
            ['BR007', 20000], ['BR008', 5500],  ['BR009', 5000], ['BR010', 25000],
        ];
        $barangBeli = [
            ['BR001', 14500, 120], ['BR002', 58000, 80], ['BR006', 2800, 200],
            ['BR007', 18000, 60],  ['BR008', 4200, 100], ['BR010', 22000, 50],
        ];

        $jualRows = [];
        $beliRows = [];
        $biayaRows = [];

        for ($monthOffset = 2; $monthOffset >= 0; $monthOffset--) {
            $monthDate = Carbon::now()->subMonths($monthOffset);
            $year = $monthDate->year;
            $month = $monthDate->month;
            $daysInMonth = $monthDate->daysInMonth;

            foreach ($cabs as $cab) {
                // Penjualan harian (simulasi 20 hari/bulan per cabang)
                for ($day = 1; $day <= $daysInMonth; $day += 1) {
                    if (rand(1, 7) > 2) { // 70% chance each day
                        $brg = $barangJual[array_rand($barangJual)];
                        $qty = rand(5, 50);
                        $tgl = Carbon::create($year, $month, min($day, $daysInMonth));
                        $jualRows[] = [
                            'tgl'          => $tgl->toDateString(),
                            'cabang'       => $cab,
                            'kode_barang'  => $brg[0],
                            'qty'          => $qty,
                            'harga'        => $brg[1],
                            'bayar'        => rand(1, 5) > 1 ? 'Tunai' : 'Kredit',
                            'created_at'   => now(),
                            'updated_at'   => now(),
                        ];
                        // Tambah barang lain di hari yang sama
                        if (rand(0, 1)) {
                            $brg2 = $barangJual[array_rand($barangJual)];
                            $jualRows[] = [
                                'tgl'         => $tgl->toDateString(),
                                'cabang'      => $cab,
                                'kode_barang' => $brg2[0],
                                'qty'         => rand(2, 20),
                                'harga'       => $brg2[1],
                                'bayar'       => 'Tunai',
                                'created_at'  => now(),
                                'updated_at'  => now(),
                            ];
                        }
                    }
                }

                // Pembelian (2-3x per bulan per cabang)
                for ($b = 0; $b < rand(2, 4); $b++) {
                    $brg = $barangBeli[array_rand($barangBeli)];
                    $beliRows[] = [
                        'tgl'         => Carbon::create($year, $month, rand(1, $daysInMonth))->toDateString(),
                        'cabang'      => $cab,
                        'kode_barang' => $brg[0],
                        'qty'         => rand(50, 200),
                        'harga'       => $brg[1],
                        'bayar'       => rand(0, 1) ? 'Tunai' : 'Kredit',
                        'created_at'  => now(),
                        'updated_at'  => now(),
                    ];
                }

                // Biaya per bulan per cabang
                $biayaRows[] = [
                    'tgl'        => Carbon::create($year, $month, 5)->toDateString(),
                    'cabang'     => $cab,
                    'kode_akun'  => '6101',
                    'nominal'    => rand(2000000, 4000000),
                    'bayar'      => 'Bank',
                    'keterangan' => 'Gaji karyawan bulan ' . $monthDate->format('M Y'),
                    'created_at' => now(), 'updated_at' => now(),
                ];
                $biayaRows[] = [
                    'tgl'        => Carbon::create($year, $month, 10)->toDateString(),
                    'cabang'     => $cab,
                    'kode_akun'  => '6102',
                    'nominal'    => rand(300000, 800000),
                    'bayar'      => 'Kas',
                    'keterangan' => 'Listrik & Air bulan ' . $monthDate->format('M Y'),
                    'created_at' => now(), 'updated_at' => now(),
                ];
                $biayaRows[] = [
                    'tgl'        => Carbon::create($year, $month, 15)->toDateString(),
                    'cabang'     => $cab,
                    'kode_akun'  => '6104',
                    'nominal'    => rand(100000, 300000),
                    'bayar'      => 'Kas',
                    'keterangan' => 'Transportasi & ongkir',
                    'created_at' => now(), 'updated_at' => now(),
                ];
            }
        }

        // Batch insert
        foreach (array_chunk($jualRows, 100) as $chunk) {
            DB::table('trx_jual')->insert($chunk);
        }
        foreach (array_chunk($beliRows, 100) as $chunk) {
            DB::table('trx_beli')->insert($chunk);
        }
        DB::table('trx_biaya')->insert($biayaRows);

        // Transaksi Jasa
        DB::table('trx_jasa')->insert([
            ['tgl'=>Carbon::now()->subDays(20)->toDateString(),'cabang'=>'Pusat Rembang','kode_jasa'=>'JS001','qty'=>2,'harga'=>50000,'bayar'=>'Tunai','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(15)->toDateString(),'cabang'=>'Cabang Lasem','kode_jasa'=>'JS002','qty'=>5,'harga'=>20000,'bayar'=>'Tunai','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(10)->toDateString(),'cabang'=>'Pusat Rembang','kode_jasa'=>'JS003','qty'=>1,'harga'=>150000,'bayar'=>'Tunai','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(5)->toDateString(),'cabang'=>'Cabang Pati','kode_jasa'=>'JS004','qty'=>1,'harga'=>120000,'bayar'=>'Kredit','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>now()->toDateString(),'cabang'=>'Cabang Lasem','kode_jasa'=>'JS001','qty'=>3,'harga'=>50000,'bayar'=>'Tunai','created_at'=>now(),'updated_at'=>now()],
        ]);

        // Sewa
        DB::table('trx_sewa')->insert([
            ['tgl'=>Carbon::now()->subDays(45)->toDateString(),'cabang'=>'Pusat Rembang','nama_penyewa'=>'Ibu Sari Wulandari','item'=>'Tenda Pesta','tgl_mulai'=>Carbon::now()->subDays(45)->toDateString(),'tgl_selesai'=>Carbon::now()->subDays(43)->toDateString(),'biaya'=>750000,'ppn'=>'Non-PPN','bayar'=>'Tunai','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(20)->toDateString(),'cabang'=>'Cabang Pati','nama_penyewa'=>'Bapak Joko Santoso','item'=>'Kursi & Meja 100 set','tgl_mulai'=>Carbon::now()->subDays(20)->toDateString(),'tgl_selesai'=>Carbon::now()->subDays(19)->toDateString(),'biaya'=>500000,'ppn'=>'Non-PPN','bayar'=>'Tunai','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(10)->toDateString(),'cabang'=>'Cabang Lasem','nama_penyewa'=>'Ibu Rina Kartika','item'=>'Tenda & Dekorasi','tgl_mulai'=>Carbon::now()->subDays(10)->toDateString(),'tgl_selesai'=>Carbon::now()->subDays(8)->toDateString(),'biaya'=>1200000,'ppn'=>'Kena PPN','bayar'=>'Kredit','created_at'=>now(),'updated_at'=>now()],
        ]);

        // Kasbon
        DB::table('trx_kasbon')->insert([
            ['tgl'=>Carbon::now()->subDays(60)->toDateString(),'cabang'=>'Pusat Rembang','nama_karyawan'=>'Sari','jenis'=>'Diberikan','nominal'=>300000,'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(45)->toDateString(),'cabang'=>'Cabang Lasem','nama_karyawan'=>'Budi','jenis'=>'Diberikan','nominal'=>500000,'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(30)->toDateString(),'cabang'=>'Pusat Rembang','nama_karyawan'=>'Sari','jenis'=>'Dibayar','nominal'=>150000,'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(15)->toDateString(),'cabang'=>'Cabang Pati','nama_karyawan'=>'Rina','jenis'=>'Diberikan','nominal'=>250000,'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(5)->toDateString(),'cabang'=>'Cabang Lasem','nama_karyawan'=>'Budi','jenis'=>'Dibayar','nominal'=>200000,'created_at'=>now(),'updated_at'=>now()],
        ]);

        // Cashbon Pelanggan
        DB::table('trx_cashbon')->insert([
            ['tgl'=>Carbon::now()->subDays(40)->toDateString(),'cabang'=>'Pusat Rembang','nama_pelanggan'=>'Ibu Sari Wulandari','jenis'=>'Diberikan','nominal'=>200000,'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(20)->toDateString(),'cabang'=>'Cabang Pati','nama_pelanggan'=>'Ibu Rina Kartika','jenis'=>'Diberikan','nominal'=>150000,'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(10)->toDateString(),'cabang'=>'Pusat Rembang','nama_pelanggan'=>'Ibu Sari Wulandari','jenis'=>'Dibayar','nominal'=>100000,'created_at'=>now(),'updated_at'=>now()],
        ]);

        // Mutasi Barang
        DB::table('trx_mutasi')->insert([
            ['tgl'=>Carbon::now()->subDays(55)->toDateString(),'dari_cabang'=>'Pusat Rembang','ke_cabang'=>'Cabang Lasem','kode_barang'=>'BR001','qty'=>40,'keterangan'=>'Pengisian stok rutin','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(30)->toDateString(),'dari_cabang'=>'Pusat Rembang','ke_cabang'=>'Cabang Pati','kode_barang'=>'BR006','qty'=>100,'keterangan'=>'Pengisian stok rutin','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(10)->toDateString(),'dari_cabang'=>'Cabang Lasem','ke_cabang'=>'Cabang Pati','kode_barang'=>'BR002','qty'=>20,'keterangan'=>'Pinjam stok darurat','created_at'=>now(),'updated_at'=>now()],
        ]);

        // Retur Barang
        DB::table('trx_retur')->insert([
            ['tgl'=>Carbon::now()->subDays(25)->toDateString(),'cabang'=>'Pusat Rembang','jenis'=>'Jual','kode_barang'=>'BR006','qty'=>3,'harga'=>3200,'bayar'=>'Tunai','keterangan'=>'Kemasan rusak','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(10)->toDateString(),'cabang'=>'Cabang Lasem','jenis'=>'Beli','kode_barang'=>'BR002','qty'=>5,'harga'=>58000,'bayar'=>'Tunai','keterangan'=>'Kualitas tidak sesuai','created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>Carbon::now()->subDays(5)->toDateString(),'cabang'=>'Cabang Pati','jenis'=>'Jual','kode_barang'=>'BR005','qty'=>2,'harga'=>52000,'bayar'=>'Tunai','keterangan'=>'Produk expired','created_at'=>now(),'updated_at'=>now()],
        ]);

        // Barang Kadaluarsa
        DB::table('barang_kadaluarsa')->insert([
            ['tgl'=>now()->toDateString(),'cabang'=>'Pusat Rembang','kode_barang'=>'BR005','batch'=>'B2406','qty'=>12,'tgl_exp'=>Carbon::now()->addDays(15)->toDateString(),'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>now()->toDateString(),'cabang'=>'Cabang Lasem','kode_barang'=>'BR006','batch'=>'B2401','qty'=>30,'tgl_exp'=>Carbon::now()->subDays(5)->toDateString(),'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>now()->toDateString(),'cabang'=>'Cabang Pati','kode_barang'=>'BR001','batch'=>'B2409','qty'=>24,'tgl_exp'=>Carbon::now()->addDays(90)->toDateString(),'created_at'=>now(),'updated_at'=>now()],
            ['tgl'=>now()->toDateString(),'cabang'=>'Pusat Rembang','kode_barang'=>'BR003','batch'=>'B2408','qty'=>18,'tgl_exp'=>Carbon::now()->addDays(25)->toDateString(),'created_at'=>now(),'updated_at'=>now()],
        ]);
    }
}
