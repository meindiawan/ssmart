<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Tautkan Penjualan (trx_jual) yang SUDAH terlanjur masuk ke Master Pelanggan,
 * berdasarkan file CSV  no_nota,kode_pelanggan,nama_pelanggan
 * (mis. tautan-faktur-pelanggan.csv hasil pencocokan laporan "Penjualan By No. Ref").
 *
 * - Pelanggan yang kodenya belum ada di Master dibuat otomatis (memakai kode & nama dari CSV).
 * - Nota yang tidak ditemukan di trx_jual dilaporkan, bukan error.
 * - Default HANYA simulasi. Tambahkan --apply untuk benar-benar menyimpan.
 *
 * Contoh:
 *   php artisan penjualan:tautkan-pelanggan tautan-faktur-pelanggan.csv
 *   php artisan penjualan:tautkan-pelanggan tautan-faktur-pelanggan.csv --apply
 */
class TautkanPelangganPenjualanCommand extends Command
{
    protected $signature = 'penjualan:tautkan-pelanggan
        {file : Path file CSV (kolom: no_nota,kode_pelanggan,nama_pelanggan)}
        {--apply : Simpan perubahan (tanpa ini hanya simulasi)}';

    protected $description = 'Tautkan penjualan yang sudah masuk ke pelanggan (dari CSV no_nota → kode pelanggan)';

    public function handle(): int
    {
        $path = $this->argument('file');
        if (!is_file($path)) { $this->error("File tidak ditemukan: {$path}"); return self::FAILURE; }
        $apply = (bool) $this->option('apply');

        $fh = fopen($path, 'r');
        $head = fgetcsv($fh);
        if (!$head) { $this->error('File CSV kosong.'); return self::FAILURE; }
        $head = array_map(fn($h) => mb_strtolower(trim(preg_replace('/^\xEF\xBB\xBF/', '', (string) $h))), $head);
        $iNota = array_search('no_nota', $head);
        $iKode = array_search('kode_pelanggan', $head);
        $iNama = array_search('nama_pelanggan', $head);
        if ($iNota === false || $iKode === false) {
            $this->error('Header CSV harus berisi: no_nota, kode_pelanggan (nama_pelanggan opsional).');
            return self::FAILURE;
        }

        $pelBaru = 0; $barisUpdate = 0; $notaOk = 0; $notaHilang = [];
        $kodeAda = DB::table('pelanggan')->pluck('kode')->flip()->all();

        $kerja = function () use ($fh, $iNota, $iKode, $iNama, $apply, &$kodeAda, &$pelBaru, &$barisUpdate, &$notaOk, &$notaHilang) {
            while (($r = fgetcsv($fh)) !== false) {
                $nota = trim((string) ($r[$iNota] ?? ''));
                $kode = trim((string) ($r[$iKode] ?? ''));
                $nama = $iNama !== false ? trim((string) ($r[$iNama] ?? '')) : '';
                if ($nota === '' || $kode === '') continue;

                if (!isset($kodeAda[$kode])) {
                    $pelBaru++;
                    $kodeAda[$kode] = true;
                    if ($apply) {
                        DB::table('pelanggan')->insert([
                            'kode' => $kode, 'nama' => $nama !== '' ? $nama : $kode, 'poin' => 0,
                            'created_at' => now(), 'updated_at' => now(),
                        ]);
                    }
                }

                $n = DB::table('trx_jual')->where('no_nota', $nota)->count();
                if ($n === 0) { $notaHilang[] = $nota; continue; }
                $notaOk++;
                $barisUpdate += $n;
                if ($apply) {
                    DB::table('trx_jual')->where('no_nota', $nota)->update(['pelanggan' => $kode, 'updated_at' => now()]);
                }
            }
        };

        if ($apply) DB::transaction($kerja); else $kerja();
        fclose($fh);

        $this->info(($apply ? 'DISIMPAN' : 'SIMULASI') . ": {$notaOk} nota ({$barisUpdate} baris) ditautkan ke pelanggan; {$pelBaru} pelanggan baru dibuat di Master.");
        if ($notaHilang) {
            $this->warn(count($notaHilang) . ' nota di CSV tidak ada di Penjualan (belum diimport?). Contoh: ' . implode(', ', array_slice($notaHilang, 0, 10)));
        }
        if (!$apply) $this->line('Tambahkan --apply untuk menyimpan.');
        return self::SUCCESS;
    }
}
