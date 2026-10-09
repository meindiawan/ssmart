<?php

namespace App\Console\Commands;

use App\Services\HppService;
use Illuminate\Console\Command;

/**
 * Dipakai setelah Import Penjualan yang HPP-nya diambil dari laporan kasir
 * lama (kolom HPP di Template Import Penjualan) untuk barang yang TIDAK
 * PERNAH punya riwayat Pembelian (trx_beli) di sistem ini — supaya akun
 * Persediaan (1105) tidak minus di Neraca. Lihat penjelasan lengkap di
 * HppService::generateSaldoAwalPersediaan().
 *
 * AMAN dijalankan berulang kali (idempotent) — setiap kali dijalankan,
 * baris Saldo Awal lama dihapus & dihitung ulang dari histori transaksi
 * asli, jadi otomatis menyesuaikan kalau ada Import Penjualan/Pembelian
 * baru sesudahnya.
 *
 * Contoh pakai:
 *   php artisan saldo-awal:generate
 */
class GenerateSaldoAwalCommand extends Command
{
    protected $signature   = 'saldo-awal:generate';
    protected $description = 'Generate/refresh baris Saldo Awal Persediaan (akun 3103) untuk barang yang HPP-nya diimpor dari histori Penjualan tapi tidak punya riwayat Pembelian di sistem — supaya Neraca (akun 1105 Persediaan) tidak minus, tanpa mengubah HPP/Laba Rugi yang sudah benar.';

    public function handle(HppService $hpp): int
    {
        $this->info('Mendeteksi kekurangan Saldo Awal Persediaan dari histori Penjualan...');
        $bar = null;
        $hasil = $hpp->generateSaldoAwalPersediaan(function ($i, $total, $kodeBarang) use (&$bar) {
            if (!$bar) $bar = $this->output->createProgressBar($total);
            $bar->setMessage($kodeBarang);
            $bar->advance();
        });
        if ($bar) $bar->finish();
        $this->newLine(2);

        $this->info("Selesai.");
        $this->line("  Barang yang kekurangan Saldo Awal : {$hasil['barang_disentuh']}");
        $this->line("  Baris Saldo Awal dibuat            : {$hasil['baris_dibuat']}");
        $this->line("  Total nilai Saldo Awal (Modal)     : Rp " . number_format($hasil['total_nilai'], 0, ',', '.'));
        $this->newLine();
        $this->comment('Akun 1105 (Persediaan) & Modal (3103) di Neraca sekarang seimbang.');
        $this->comment('HPP di Laba Rugi TIDAK berubah — sudah benar sejak dari Kartu HPP (bersih PPN Masukan).');

        return self::SUCCESS;
    }
}
