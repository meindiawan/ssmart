<?php

namespace App\Console\Commands;

use App\Services\HppService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Atur status PPN baris Pembelian (trx_beli) yang SUDAH terlanjur masuk,
 * berdasarkan No. Referensi/Faktur:
 *   - diawali "TS" + angka + "-"  (mis. TS1-250926008, nota internal) → Non-PPN
 *   - selain itu (faktur asli supplier)                               → Kena PPN
 *
 * Aturan yang sama dipakai form Import Pembelian (opsi "Tentukan PPN otomatis").
 *
 * Default HANYA simulasi (tidak mengubah apa pun). Tambahkan --apply untuk
 * benar-benar menyimpan. Setelah disimpan, Kartu HPP barang yang terdampak
 * dibangun ulang otomatis (harga baris "Kena PPN" di-DPP-kan dulu di HPP).
 *
 * Contoh:
 *   php artisan pembelian:atur-ppn --dari=2026-08-01 --sampai=2026-09-30
 *   php artisan pembelian:atur-ppn --dari=2026-08-01 --sampai=2026-09-30 --apply
 *   php artisan pembelian:atur-ppn --dari=2026-08-01 --sampai=2026-09-30 --cabang="Putri 2" --apply
 */
class AturPpnPembelianCommand extends Command
{
    protected $signature = 'pembelian:atur-ppn
        {--dari= : Tanggal awal (YYYY-MM-DD), WAJIB}
        {--sampai= : Tanggal akhir (YYYY-MM-DD), WAJIB}
        {--cabang= : Batasi ke 1 cabang (nama persis di Master Cabang)}
        {--apply : Simpan perubahan (tanpa ini hanya simulasi)}';

    protected $description = 'Set PPN pembelian dari No. Referensi (TS…- = Non-PPN, selain itu Kena PPN) lalu bangun ulang Kartu HPP';

    public function handle(HppService $hpp): int
    {
        $dari   = $this->option('dari');
        $sampai = $this->option('sampai');
        if (!$dari || !$sampai) {
            $this->error('Isi --dari dan --sampai (format YYYY-MM-DD) supaya tidak menyentuh data di luar periode yang dimaksud.');
            return self::FAILURE;
        }

        $q = DB::table('trx_beli')
            ->whereBetween('tgl', [$dari, $sampai])
            ->whereNotNull('no_nota')->where('no_nota', '!=', '');
        if ($cab = $this->option('cabang')) $q->where('cabang', $cab);

        $ubah = [];          // id => ppn baru
        $kodeTerdampak = []; // kode_barang => true
        $total = 0; $kena = 0; $non = 0;

        $q->select('id', 'no_nota', 'ppn', 'kode_barang')->orderBy('id')->chunk(1000, function ($rows) use (&$ubah, &$kodeTerdampak, &$total, &$kena, &$non) {
            foreach ($rows as $r) {
                $total++;
                $target = preg_match('/^TS\d*-/i', trim($r->no_nota)) ? 'Non-PPN' : 'Kena PPN';
                $target === 'Kena PPN' ? $kena++ : $non++;
                if ($r->ppn !== $target) {
                    $ubah[$r->id] = $target;
                    $kodeTerdampak[$r->kode_barang] = true;
                }
            }
        });

        $ubahKena = count(array_filter($ubah, fn ($v) => $v === 'Kena PPN'));
        $ubahNon  = count($ubah) - $ubahKena;

        $this->info("Periode {$dari} s/d {$sampai}" . ($cab ? " · cabang {$cab}" : ' · semua cabang'));
        $this->line("Baris pembelian diperiksa : {$total}");
        $this->line("  sesuai aturan → Non-PPN  : {$non}");
        $this->line("  sesuai aturan → Kena PPN : {$kena}");
        $this->line('Baris yang akan DIUBAH      : ' . count($ubah) . "  (jadi Kena PPN: {$ubahKena}, jadi Non-PPN: {$ubahNon})");
        $this->line('Barang yang HPP-nya dihitung ulang: ' . count($kodeTerdampak));

        if (!$this->option('apply')) {
            $this->comment('SIMULASI saja — belum ada data yang diubah. Tambahkan --apply untuk menyimpan.');
            return self::SUCCESS;
        }
        if (!$ubah) { $this->info('Tidak ada yang perlu diubah.'); return self::SUCCESS; }

        DB::transaction(function () use ($ubah) {
            foreach (['Kena PPN', 'Non-PPN'] as $nilai) {
                $ids = array_keys(array_filter($ubah, fn ($v) => $v === $nilai));
                foreach (array_chunk($ids, 500) as $chunk) {
                    DB::table('trx_beli')->whereIn('id', $chunk)->update(['ppn' => $nilai, 'updated_at' => now()]);
                }
            }
        });
        $this->info('PPN tersimpan. Membangun ulang Kartu HPP …');

        $bar = $this->output->createProgressBar(count($kodeTerdampak));
        foreach (array_keys($kodeTerdampak) as $kode) {
            $hpp->rebuildItem((string) $kode);
            $bar->advance();
        }
        $bar->finish();
        $this->newLine(2);
        $this->info('Selesai.');
        return self::SUCCESS;
    }
}
