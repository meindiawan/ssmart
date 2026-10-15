<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * php artisan hpp:diagnosa 2026-10-05 [2026-10-05]
 * Mencari tahu kenapa HPP periode tertentu terlalu besar / Laba Rugi minus.
 * Hanya MEMBACA data — tidak mengubah apa pun.
 */
class DiagnosaHppCommand extends Command
{
    protected $signature = 'hpp:diagnosa {dari : Tanggal awal Y-m-d} {sampai? : Tanggal akhir Y-m-d (default = sama dgn awal)}';
    protected $description = 'Diagnosa HPP penjualan pada periode tertentu (baca-saja)';

    public function handle(): int
    {
        $dari = $this->argument('dari');
        $sampai = $this->argument('sampai') ?: $dari;
        $rp = fn($v) => 'Rp ' . number_format((float) $v, 0, ',', '.');

        $this->info("=== DIAGNOSA HPP {$dari} s/d {$sampai} ===");

        $j = DB::table('trx_jual')->whereBetween(DB::raw('DATE(tgl)'), [$dari, $sampai]);
        $jml = (clone $j)->count();
        $gross = (clone $j)->selectRaw('COALESCE(SUM(qty*harga-COALESCE(diskon,0)),0) t')->value('t');
        $this->line("Baris penjualan      : {$jml}");
        $this->line('Omzet (incl PPN)     : ' . $rp($gross));
        $this->line('trx_jual.hpp terisi  : ' . (clone $j)->where('hpp', '>', 0)->count() . ' baris (HARUSNYA tidak dipakai lagi)');

        $k = DB::table('hpp_kartu')->where('ref_tabel', 'trx_jual')->whereBetween(DB::raw('DATE(tgl)'), [$dari, $sampai]);
        $adaKartu = (clone $k)->count();
        $totHpp = (clone $k)->sum('nilai_keluar');
        $this->line("Baris Kartu HPP      : {$adaKartu}  (selisih dgn penjualan = {$jml} - {$adaKartu}; kalau besar → jalankan hpp:rebuild)");
        $this->line('Total HPP Kartu HPP  : ' . $rp($totHpp) . '  (' . ($gross > 0 ? round($totHpp / $gross * 100, 1) : 0) . '% dari omzet)');

        // Baris yang HPP-nya ~ sama dengan harga jual (tanda HPP bocor dari harga jual)
        $mirip = DB::table('hpp_kartu as h')
            ->join('trx_jual as t', function ($q) { $q->on('t.id', '=', 'h.ref_id')->where('h.ref_tabel', '=', 'trx_jual'); })
            ->whereBetween(DB::raw('DATE(h.tgl)'), [$dari, $sampai])
            ->whereRaw('h.nilai_keluar >= 0.9 * (t.qty * t.harga - COALESCE(t.diskon,0)) AND h.nilai_keluar > 0');
        $this->line('Baris HPP ≥ 90% harga jual: ' . (clone $mirip)->count() . ' baris, total HPP ' . $rp((clone $mirip)->sum('h.nilai_keluar')));

        $this->newLine();
        $this->info('10 baris HPP terbesar:');
        $top = (clone $k)->orderByDesc('nilai_keluar')->limit(10)->get();
        $rows = [];
        foreach ($top as $r) {
            $t = DB::table('trx_jual')->find($r->ref_id);
            $rows[] = [$r->kode_barang, $r->cabang, $r->qty_keluar, $t->harga ?? '-', $t->satuan ?? '-', $r->saldo_hpp_sebelum, $r->hpp_satuan, round($r->nilai_keluar)];
        }
        $this->table(['kode', 'cabang', 'qty', 'harga jual', 'satuan', 'saldo HPP sebelum', 'HPP/sat', 'nilai HPP'], $rows);

        $this->newLine();
        $this->info('Barang Masuk per sumber (semua tanggal) — "Saldo Awal*" TIDAK dipakai HPP:');
        $bm = DB::table('barang_masuk')->selectRaw('COALESCE(sumber,"-") s, COUNT(*) n, MIN(tgl) a, MAX(tgl) b')->groupBy('sumber')->get();
        $this->table(['sumber', 'baris', 'tgl awal', 'tgl akhir'], $bm->map(fn($r) => [$r->s, $r->n, $r->a, $r->b])->all());

        $this->info('Pembelian (trx_beli) per cabang:');
        $pb = DB::table('trx_beli')->selectRaw('cabang, COUNT(*) n, MIN(tgl) a, MAX(tgl) b, SUM(qty*harga) t')->groupBy('cabang')->get();
        $this->table(['cabang', 'baris', 'tgl awal', 'tgl akhir', 'total'], $pb->map(fn($r) => [$r->cabang, $r->n, $r->a, $r->b, $rp($r->t)])->all());

        $this->line('Terakhir Kartu HPP dibangun: ' . (DB::table('hpp_kartu')->max('updated_at') ?? '-'));
        return self::SUCCESS;
    }
}
