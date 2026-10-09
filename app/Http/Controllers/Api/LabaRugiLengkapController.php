<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\HppService;
use App\Services\KasirAkunService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * LAPORAN LABA RUGI LENGKAP  —  GET /api/laporan/laba-rugi-lengkap
 *
 * Satu endpoint untuk layar "Laba Rugi Lengkap" dan PDF-nya. Filter (semua opsional):
 *   ?dari=YYYY-MM-DD &sampai=YYYY-MM-DD &cabang=<nama cabang>
 *
 * Isi jawaban:
 *   total       Laba Rugi gabungan seluruh cabang yang terpilih (pendapatan, HPP,
 *               laba kotor, biaya operasional per akun, laba bersih).
 *   per_cabang  Laba Rugi tiap cabang + rincian SHIFT (Pagi/Siang/Sehari) + KASIR
 *               + rekap per tanggal/bulan.
 *   per_shift   Total tiap shift untuk SEMUA cabang, plus pecahan per cabang.
 *   periode     Rekap per hari (rentang ≤ 93 hari) atau per bulan (lebih panjang).
 *
 * SUMBER ANGKA = mesin jurnal yang sama dengan Laporan Laba Rugi biasa
 * (DashboardController::buildJurnal + calcLabaRugi), jadi total di sini PASTI sama
 * dengan menu Laporan ▸ Laba Rugi untuk filter yang sama.
 *
 * Soal SHIFT: hanya Penjualan yang tercatat per kasir/shift (kolom trx_jual.kasir &
 * trx_jual.shift). Biaya operasional, pembelian, gaji, dst. tidak punya shift, jadi
 * di tingkat shift yang bisa dihitung adalah LABA KOTOR penjualan. Laba BERSIH hanya
 * ada di tingkat cabang dan total. Selisih antara total laba kotor cabang dengan
 * jumlah laba kotor semua shift (retur, jasa, sewa, selisih stok) ditampilkan di
 * baris "non_kasir" supaya semua angka bisa dicocokkan.
 */
class LabaRugiLengkapController extends Controller
{
    private const URUT_SHIFT = ['Pagi', 'Siang', 'Sehari', '(tanpa shift)'];
    /** Rentang maksimal (hari) yang masih dirinci per hari; lebih panjang → per bulan. */
    private const BATAS_HARIAN = 93;

    public function lengkap(Request $request)
    {
        @set_time_limit(120);
        $dari   = $request->get('dari') ?: null;
        $sampai = $request->get('sampai') ?: null;
        $cabang = $request->get('cabang') ?: null;

        $dash  = app(DashboardController::class);
        $jurnal = $dash->buildJurnal($cabang, $dari, $sampai);

        $coa = [];
        foreach (DB::table('coa')->get() as $a) $coa[(string) $a->kode] = $a;

        $urutCabang = DB::table('cabang')->pluck('nama')->all();

        // ── 1. Jurnal → akumulasi per cabang / akun / tanggal ───────────────────
        $akunCab = [];   // [cab][kode] => nilai (Pendapatan: K−D ; Beban: D−K ; HPP: D−K)
        $hari    = [];   // [cab][tgl]  => [pend, hpp, beban]
        $minTgl = null; $maxTgl = null;
        foreach ($jurnal as $l) {
            $kode = (string) $l['akun'];
            $a = $coa[$kode] ?? null;
            if (!$a) continue;
            if ($a->kat === 'Pendapatan')      { $jenis = 'pend';  $v = $l['K'] - $l['D']; }
            elseif ($kode === '5101')          { $jenis = 'hpp';   $v = $l['D'] - $l['K']; }
            elseif ($a->kat === 'Beban')       { $jenis = 'beban'; $v = $l['D'] - $l['K']; }
            else continue;

            $cab = $l['cab'] ?: '(tanpa cabang)';
            $tgl = substr((string) $l['tgl'], 0, 10);
            $akunCab[$cab][$kode] = ($akunCab[$cab][$kode] ?? 0) + $v;
            $hari[$cab][$tgl][$jenis] = ($hari[$cab][$tgl][$jenis] ?? 0) + $v;
            if ($minTgl === null || $tgl < $minTgl) $minTgl = $tgl;
            if ($maxTgl === null || $tgl > $maxTgl) $maxTgl = $tgl;
        }

        // ── 2. Penjualan per cabang → shift → kasir (+ per hari) ───────────────
        $adaKolom = Schema::hasColumn('trx_jual', 'kasir') && Schema::hasColumn('trx_jual', 'shift');
        $q = DB::table('trx_jual')->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode');
        if ($cabang) $q->where('trx_jual.cabang', $cabang);
        if ($dari)   $q->where('trx_jual.tgl', '>=', $dari);
        if ($sampai) $q->where('trx_jual.tgl', '<=', $sampai);
        $kol = ['trx_jual.id', 'trx_jual.tgl', 'trx_jual.cabang', 'trx_jual.no_nota', 'trx_jual.qty', 'trx_jual.harga',
                'trx_jual.diskon', 'trx_jual.ppn', 'barang.ppn as ppn_master', 'barang.modal'];
        if ($adaKolom) { $kol[] = 'trx_jual.kasir'; $kol[] = 'trx_jual.shift'; }
        $rows = $q->select($kol)->orderBy('trx_jual.id')->get();

        $hppMap = app(HppService::class)->hppMapUntukJurnal('trx_jual', $rows->pluck('id')->all());
        $tarif = $this->tarif();

        $nol = fn() => ['struk' => 0, 'baris' => 0, 'dpp' => 0.0, 'hpp' => 0.0, 'laba' => 0.0];
        $tree = [];      // [cab][shift][kasir] => ringkasan
        $nota = [];      // [cab][shift][kasir][nota] => true
        $hariShift = []; // [cab][tgl][shift] => [dpp,hpp]
        foreach ($rows as $t) {
            // Rumus IDENTIK dengan DashboardController::buildJurnal (termasuk pembulatan per baris)
            $kena = ($t->ppn ?: $t->ppn_master) === 'Kena PPN';
            $tot  = (float) $t->qty * (float) $t->harga - (float) ($t->diskon ?? 0);
            $dpp  = round($kena ? $tot / (1 + $tarif) : $tot);
            $hpp  = $hppMap[$t->id] ?? 0; // hanya dari Kartu HPP (pembelian)
            $hpp  = $hpp > 0 ? round($hpp) : 0;

            $ks = ($adaKolom && $t->kasir) ? $t->kasir : '(tanpa kasir)';
            $sh = ($adaKolom && $t->shift) ? $t->shift
                : (($adaKolom && $t->kasir) ? KasirAkunService::shift($t->kasir) : '(tanpa shift)');
            $cab = $t->cabang;
            $tgl = substr((string) $t->tgl, 0, 10);
            $nt  = $t->no_nota ?: ('PJ-' . $t->id);

            $n = &$tree[$cab][$sh][$ks];
            if (!$n) $n = $nol();
            $n['baris']++; $n['dpp'] += $dpp; $n['hpp'] += $hpp; $n['laba'] += $dpp - $hpp;
            unset($n);
            $nota[$cab][$sh][$ks][$nt] = true;

            $h = &$hariShift[$cab][$tgl][$sh];
            if (!$h) $h = ['dpp' => 0.0, 'hpp' => 0.0];
            $h['dpp'] += $dpp; $h['hpp'] += $hpp;
            unset($h);
        }

        // ── 3. Susun per cabang ──────────────────────────────────────────────────
        $semuaCab = array_values(array_unique(array_merge(array_keys($akunCab), array_keys($tree))));
        usort($semuaCab, function ($a, $b) use ($urutCabang) {
            $ia = array_search($a, $urutCabang); $ib = array_search($b, $urutCabang);
            return ($ia === false ? 999 : $ia) <=> ($ib === false ? 999 : $ib) ?: strcmp($a, $b);
        });

        // Tentukan granularitas rekap periode
        $awal  = $dari ?: $minTgl; $akhir = $sampai ?: $maxTgl;
        $span  = ($awal && $akhir) ? (int) ((strtotime($akhir) - strtotime($awal)) / 86400) + 1 : 0;
        $harian = $span > 0 && $span <= self::BATAS_HARIAN;

        $perCabang = [];
        $akunTotal = [];
        $perShiftSemua = [];       // [shift] => ringkasan (semua cabang)
        $perShiftCab = [];         // [shift][cab] => ringkasan
        $notaShiftSemua = [];      // [shift][cab|nota] => true
        $periodeTotal = [];        // [kunci] => baris
        foreach ($semuaCab as $cab) {
            $akun = $akunCab[$cab] ?? [];
            foreach ($akun as $k => $v) $akunTotal[$k] = ($akunTotal[$k] ?? 0) + $v;
            $lr = $this->susunLaba($akun, $coa);

            // shift → kasir
            $shiftList = []; $salesTot = $nol();
            $shifts = $tree[$cab] ?? [];
            uksort($shifts, fn($a, $b) => (array_search($a, self::URUT_SHIFT) === false ? 99 : array_search($a, self::URUT_SHIFT))
                <=> (array_search($b, self::URUT_SHIFT) === false ? 99 : array_search($b, self::URUT_SHIFT)));
            foreach ($shifts as $sh => $kasirs) {
                ksort($kasirs);
                $shTot = $nol(); $kasirList = []; $notaSh = [];
                foreach ($kasirs as $ks => $z) {
                    $z['struk'] = count($nota[$cab][$sh][$ks] ?? []);
                    foreach (($nota[$cab][$sh][$ks] ?? []) as $nk => $_) $notaSh[$nk] = true;
                    $kasirList[] = ['kasir' => $ks] + $this->bulat($z);
                    foreach (['baris', 'dpp', 'hpp', 'laba'] as $f) $shTot[$f] += $z[$f];
                }
                $shTot['struk'] = count($notaSh);
                $shiftList[] = ['shift' => $sh] + $this->bulat($shTot) + ['kasir' => $kasirList];
                foreach (['struk', 'baris', 'dpp', 'hpp', 'laba'] as $f) $salesTot[$f] += $shTot[$f];

                $perShiftSemua[$sh] = $perShiftSemua[$sh] ?? $nol();
                foreach (['baris', 'dpp', 'hpp', 'laba'] as $f) $perShiftSemua[$sh][$f] += $shTot[$f];
                $perShiftCab[$sh][$cab] = $shTot;
                foreach ($notaSh as $nk => $_) $notaShiftSemua[$sh][$cab . '|' . $nk] = true;
            }

            // pendapatan / HPP yang tidak lewat kasir (retur, jasa, sewa, selisih stok, dst.)
            $nonKasir = [
                'pendapatan' => $lr['pendapatan'] - $salesTot['dpp'],
                'hpp'        => $lr['hpp'] - $salesTot['hpp'],
            ];
            $nonKasir['laba'] = $nonKasir['pendapatan'] - $nonKasir['hpp'];

            // rekap per periode (hari / bulan) untuk cabang ini
            $per = []; // kunci => baris
            $tglList = array_unique(array_merge(array_keys($hari[$cab] ?? []), array_keys($hariShift[$cab] ?? [])));
            foreach ($tglList as $tgl) {
                $key = $harian ? $tgl : substr($tgl, 0, 7);
                $b = &$per[$key];
                if (!$b) $b = $this->barisPeriode($key);
                $h = $hari[$cab][$tgl] ?? [];
                $b['pendapatan'] += $h['pend'] ?? 0; $b['hpp'] += $h['hpp'] ?? 0; $b['beban'] += $h['beban'] ?? 0;
                foreach (($hariShift[$cab][$tgl] ?? []) as $sh => $z) {
                    $b['shift'][$sh] = $b['shift'][$sh] ?? ['dpp' => 0.0, 'hpp' => 0.0, 'laba' => 0.0];
                    $b['shift'][$sh]['dpp'] += $z['dpp']; $b['shift'][$sh]['hpp'] += $z['hpp']; $b['shift'][$sh]['laba'] += $z['dpp'] - $z['hpp'];
                }
                unset($b);
            }
            ksort($per);
            foreach ($per as $key => $b) {
                $t = &$periodeTotal[$key];
                if (!$t) $t = $this->barisPeriode($key);
                $t['pendapatan'] += $b['pendapatan']; $t['hpp'] += $b['hpp']; $t['beban'] += $b['beban'];
                foreach ($b['shift'] as $sh => $z) {
                    $t['shift'][$sh] = $t['shift'][$sh] ?? ['dpp' => 0.0, 'hpp' => 0.0, 'laba' => 0.0];
                    foreach (['dpp', 'hpp', 'laba'] as $f) $t['shift'][$sh][$f] += $z[$f];
                }
                unset($t);
            }

            $perCabang[] = ['cabang' => $cab] + $lr + [
                'shift'      => $shiftList,
                'penjualan_kasir' => $this->bulat($salesTot),
                'non_kasir'  => $this->bulat($nonKasir),
                'periode'    => $this->akhiriPeriode($per),
            ];
        }

        // ── 4. Total gabungan & per shift (semua cabang) ─────────────────────────
        $total = $this->susunLaba($akunTotal, $coa);
        ksort($periodeTotal);

        $perShift = [];
        foreach (self::URUT_SHIFT as $sh) {
            if (!isset($perShiftSemua[$sh])) continue;
            $z = $perShiftSemua[$sh];
            $z['struk'] = count($notaShiftSemua[$sh] ?? []);
            $cabList = [];
            foreach ($semuaCab as $cab) if (isset($perShiftCab[$sh][$cab])) $cabList[] = ['cabang' => $cab] + $this->bulat($perShiftCab[$sh][$cab]);
            $perShift[] = ['shift' => $sh] + $this->bulat($z) + ['per_cabang' => $cabList];
        }
        $salesAll = $nol();
        foreach ($perShift as $s) foreach (['struk', 'baris', 'dpp', 'hpp', 'laba'] as $f) $salesAll[$f] += $s[$f];

        return response()->json([
            'meta' => [
                'dari' => $dari, 'sampai' => $sampai, 'cabang' => $cabang,
                'awal_data' => $minTgl, 'akhir_data' => $maxTgl,
                'granularitas' => $harian ? 'harian' : 'bulanan',
                'ada_kolom_shift' => $adaKolom,
                'dibuat' => now()->format('Y-m-d H:i:s'),
            ],
            'total'        => $total + [
                'penjualan_kasir' => $this->bulat($salesAll),
                'non_kasir' => [
                    'pendapatan' => round($total['pendapatan'] - $salesAll['dpp']),
                    'hpp'        => round($total['hpp'] - $salesAll['hpp']),
                    'laba'       => round(($total['pendapatan'] - $salesAll['dpp']) - ($total['hpp'] - $salesAll['hpp'])),
                ],
            ],
            'per_cabang'   => $perCabang,
            'per_shift'    => $perShift,
            'periode'      => $this->akhiriPeriode($periodeTotal),
            'peringatan'   => [
                'barang_tanpa_modal'      => $dash->barangTanpaModal($cabang, $dari, $sampai),
                'barang_tidak_terdeteksi' => $dash->barangTidakTerdeteksiRingkas($cabang, $dari, $sampai),
            ],
        ]);
    }

    private function tarif(): float
    {
        $s = DB::table('settings')->where('key', 'tarif_ppn')->first();
        return $s ? (float) $s->value / 100 : 0.11;
    }

    /** [kode => nilai] → ringkasan Laba Rugi + rincian akun (urut kode akun). */
    private function susunLaba(array $akun, array $coa): array
    {
        $pend = []; $beban = []; $hpp = 0.0;
        ksort($akun, SORT_STRING);
        foreach ($akun as $kode => $v) {
            $kode = (string) $kode;
            $a = $coa[$kode] ?? null;
            if (!$a || round($v) == 0) continue;
            if ($a->kat === 'Pendapatan')   $pend[]  = ['kode' => $kode, 'nama' => $a->nama, 'nilai' => round($v)];
            elseif ($kode === '5101')       $hpp = $v;
            elseif ($a->kat === 'Beban')    $beban[] = ['kode' => $kode, 'nama' => $a->nama, 'nilai' => round($v)];
        }
        $totPend = array_sum(array_column($pend, 'nilai'));
        $totBeban = array_sum(array_column($beban, 'nilai'));
        $hpp = round($hpp);
        $kotor = $totPend - $hpp;
        $bersih = $kotor - $totBeban;
        return [
            'pendapatan' => $totPend, 'hpp' => $hpp, 'laba_kotor' => $kotor,
            'beban' => $totBeban, 'laba_bersih' => $bersih,
            'margin_kotor'  => $totPend > 0 ? round($kotor / $totPend * 100, 2) : 0,
            'margin_bersih' => $totPend > 0 ? round($bersih / $totPend * 100, 2) : 0,
            'pendapatan_detail' => $pend, 'beban_detail' => $beban,
        ];
    }

    private function barisPeriode(string $key): array
    {
        return ['periode' => $key, 'pendapatan' => 0.0, 'hpp' => 0.0, 'beban' => 0.0, 'shift' => []];
    }

    private function akhiriPeriode(array $per): array
    {
        ksort($per);
        $out = [];
        foreach ($per as $b) {
            $kotor = $b['pendapatan'] - $b['hpp'];
            $sh = [];
            foreach (self::URUT_SHIFT as $nama) if (isset($b['shift'][$nama])) $sh[$nama] = $this->bulat($b['shift'][$nama]);
            $out[] = [
                'periode' => $b['periode'], 'pendapatan' => round($b['pendapatan']), 'hpp' => round($b['hpp']),
                'laba_kotor' => round($kotor), 'beban' => round($b['beban']), 'laba_bersih' => round($kotor - $b['beban']),
                'shift' => $sh,
            ];
        }
        return $out;
    }

    private function bulat(array $z): array
    {
        return array_map(fn($v) => is_float($v) ? round($v) : $v, $z);
    }
}
