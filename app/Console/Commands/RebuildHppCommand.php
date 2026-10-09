<?php

namespace App\Console\Commands;

use App\Services\HppService;
use Illuminate\Console\Command;

class RebuildHppCommand extends Command
{
    protected $signature = 'hpp:rebuild {kode? : Kode barang tertentu saja (kosongkan untuk semua barang)}';
    protected $description = 'Bangun ulang Kartu HPP (rata-rata bergerak per cabang) dari seluruh riwayat transaksi';

    public function handle(HppService $hpp): int
    {
        $kode = $this->argument('kode');

        if ($kode) {
            $this->info("Membangun ulang Kartu HPP untuk barang: {$kode} ...");
            $hpp->rebuildItem($kode);
            $this->info('Selesai.');
            return self::SUCCESS;
        }

        $this->info('Membangun ulang Kartu HPP untuk SEMUA barang dari riwayat transaksi lama...');
        $bar = null;
        $total = $hpp->rebuildAll(function ($i, $total, $kodeBarang) use (&$bar) {
            if (!$bar) $bar = $this->output->createProgressBar($total);
            $bar->setMessage($kodeBarang);
            $bar->advance();
        });
        if ($bar) $bar->finish();
        $this->newLine(2);
        $this->info("Selesai. {$total} kode barang telah dibangun ulang Kartu HPP-nya.");
        $this->comment('Kolom "modal" di Master Barang juga otomatis disinkronkan ke HPP rata-rata terkini (gabungan semua cabang).');
        return self::SUCCESS;
    }
}
