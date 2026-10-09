<?php

namespace App\Console\Commands;

use App\Services\CabangPurgeService;
use Illuminate\Console\Command;

/**
 * Dipakai buat kasus: cabang sudah dihapus dari Master Data, tapi transaksi
 * lama (jurnal, gaji, stok, dll) yang masih menyimpan nama cabang itu belum
 * ikut kebersihin (misal karena dihapus sebelum fitur cascade-delete ada,
 * atau ini memang data dummy/seeder yang mau dibuang).
 *
 * Contoh pakai:
 *   php artisan cabang:purge "Pusat Rembang" "Cabang Lasem" "Cabang Pati"
 */
class PurgeCabangData extends Command
{
    protected $signature = 'cabang:purge {nama* : Nama cabang yang mau dibersihkan datanya (pisah spasi, pakai tanda kutip kalau namanya ada spasi)}';

    protected $description = 'Hapus permanen semua transaksi & data (penjualan, gaji, stok, dll) untuk nama cabang tertentu — berguna kalau cabang sudah kehapus dari master tapi transaksi lamanya masih nyangkut.';

    public function handle(): int
    {
        $namaList = $this->argument('nama');

        foreach ($namaList as $nama) {
            $this->info("Membersihkan data untuk cabang: \"{$nama}\" ...");

            $ringkasan = CabangPurgeService::purge($nama);
            $total = array_sum($ringkasan);

            foreach ($ringkasan as $label => $jumlah) {
                if ($jumlah > 0) {
                    $this->line("  - {$label}: {$jumlah} baris dihapus");
                }
            }

            if ($total === 0) {
                $this->warn("  Tidak ada data ditemukan untuk cabang \"{$nama}\" (mungkin nama tidak persis sama).");
            } else {
                $this->info("  Selesai. Total {$total} baris dihapus untuk \"{$nama}\".");
            }
            $this->newLine();
        }

        $this->info('Semua cabang selesai dibersihkan.');
        return self::SUCCESS;
    }
}
