<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\DashboardController;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Diagnosa: kenapa Penjualan/Pembelian yang sudah di-import TIDAK masuk ke Kas?
 * Hanya MEMBACA data (tidak mengubah apa pun).   Pakai:  php artisan kas:cek
 */
class CekKasCommand extends Command
{
    protected $signature   = 'kas:cek';
    protected $description = 'Cek kenapa transaksi import tidak masuk Kas/Jurnal (baca saja, tidak mengubah data)';

    private function rp($n): string { return 'Rp ' . number_format((float) $n, 0, ',', '.'); }

    public function handle(): int
    {
        foreach (['trx_jual' => 'PENJUALAN', 'trx_beli' => 'PEMBELIAN'] as $tabel => $judul) {
            $this->line('');
            $this->info("=== $judul ($tabel) ===");

            $rows = DB::table($tabel)->leftJoin('barang', "$tabel.kode_barang", '=', 'barang.kode')
                ->selectRaw("(barang.kode IS NULL) as asing, COUNT(*) as n, COALESCE(SUM($tabel.qty*$tabel.harga - COALESCE($tabel.diskon,0)),0) as tot")
                ->groupBy('asing')->get()->keyBy('asing');

            $ok   = $rows->get(0); $asing = $rows->get(1);
            $this->line('Kode barang ADA di Master  : ' . number_format($ok->n ?? 0) . ' baris, ' . $this->rp($ok->tot ?? 0) . '   -> ikut Jurnal & Kas');
            $this->line('Kode barang TIDAK ada      : ' . number_format($asing->n ?? 0) . ' baris, ' . $this->rp($asing->tot ?? 0) . '   -> TIDAK ikut Jurnal & Kas');

            if (($asing->n ?? 0) > 0) {
                $this->line('Contoh kode yang tidak dikenal (terbesar):');
                $top = DB::table($tabel)->leftJoin('barang', "$tabel.kode_barang", '=', 'barang.kode')
                    ->whereNull('barang.kode')
                    ->selectRaw("$tabel.kode_barang as kode, MAX($tabel.kode_asli) as asli, COUNT(*) as n, SUM($tabel.qty*$tabel.harga) as tot")
                    ->groupBy("$tabel.kode_barang")->orderByDesc('tot')->limit(10)->get();
                foreach ($top as $t) {
                    $this->line(sprintf('   %-22s %5d baris  %s', $t->asli ?: $t->kode, $t->n, $this->rp($t->tot)));
                }
            }

            $perTgl = DB::table($tabel)->selectRaw('tgl, COUNT(*) as n')->groupBy('tgl')->orderByDesc('tgl')->limit(7)->get();
            $this->line('7 tanggal terakhir yang ada datanya: ' . $perTgl->map(fn($r) => substr($r->tgl, 0, 10) . " ({$r->n})")->implode(', '));
        }

        $this->line('');
        $this->info('=== KAS (akun 1101) dari mesin Jurnal ===');
        $jurnal = app(DashboardController::class)->buildJurnal();
        $D = $K = 0.0;
        foreach ($jurnal as $l) { if ($l['akun'] === '1101') { $D += $l['D']; $K += $l['K']; } }
        $this->line('Kas masuk (Debit)  : ' . $this->rp($D));
        $this->line('Kas keluar (Kredit): ' . $this->rp($K));
        $this->line('Saldo Kas          : ' . $this->rp($D - $K));

        $this->line('');
        $this->info('=== Pengaturan terkait ===');
        $minus = DB::table('settings')->where('key', 'stok_boleh_minus')->value('value');
        $this->line('Stok boleh minus   : ' . ($minus === null ? 'ya (default)' : ($minus === '1' ? 'ya' : 'TIDAK -> baris penjualan dgn stok kurang DILEWATI saat import')));

        $this->line('');
        $this->comment('Kalau "TIDAK ada" di PENJUALAN besar: buka Transaksi > Sinkronisasi Data > Barang Tidak Terdeteksi,');
        $this->comment('klik "Cocokkan Otomatis", lalu "Masukkan ke Master Barang" untuk kode yang masih tersisa. Setelah itu jalankan kas:cek lagi.');
        return self::SUCCESS;
    }
}
