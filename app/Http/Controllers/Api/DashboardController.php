<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Carbon\Carbon;

class DashboardController extends Controller
{
    private function getTarif(): float
    {
        $setting = DB::table('settings')->where('key', 'tarif_ppn')->first();
        return $setting ? (float)$setting->value / 100 : 0.11;
    }

    private function filterCabang($query, $cabang, string $col = 'cabang')
    {
        if ($cabang) $query->where($col, $cabang);
        return $query;
    }

    public function index(Request $request)
    {
        $cabang = $request->get('cabang');
        $bulanIni = Carbon::now()->format('Y-m');
        $bulanLalu = Carbon::now()->subMonth()->format('Y-m');
        $tarif = $this->getTarif();

        // KPI: Penjualan bulan ini & lalu
        $penjualanBulanIni = $this->filterCabang(DB::table('trx_jual'), $cabang)
            ->whereRaw("DATE_FORMAT(tgl, '%Y-%m') = ?", [$bulanIni])
            ->selectRaw('SUM(qty * harga) as total')->value('total') ?? 0;

        $penjualanBulanLalu = $this->filterCabang(DB::table('trx_jual'), $cabang)
            ->whereRaw("DATE_FORMAT(tgl, '%Y-%m') = ?", [$bulanLalu])
            ->selectRaw('SUM(qty * harga) as total')->value('total') ?? 0;

        // Jurnal untuk kas/bank/laba
        $jurnal = $this->buildJurnal($cabang);
        $kas   = $this->balAkun($jurnal, '1101', 'D');
        $bank  = $this->balAkun($jurnal, '1102', 'D');
        // Total Kas & Bank dihitung dari SEMUA akun yang ditandai `is_kas`
        // (bukan cuma 1101/1102), supaya kalau ada akun Kas/Bank tambahan
        // (mis. "Kas Toko Cabang B") saldonya tetap ikut terhitung akurat.
        $akunKasSemua = DB::table('coa')->where('is_kas', true)->pluck('kode');
        $kasBankTotal = 0;
        foreach ($akunKasSemua as $kodeAkun) {
            $kasBankTotal += $this->balAkun($jurnal, $kodeAkun, 'D');
        }
        $piutang = $this->balAkun($jurnal, '1103', 'D');
        $hutang  = $this->balAkun($jurnal, '2101', 'K');
        $lr = $this->calcLabaRugi($jurnal);

        // Top 5 barang bulan ini
        $topBarang = $this->filterCabang(DB::table('trx_jual'), $cabang)
            ->whereRaw("DATE_FORMAT(tgl, '%Y-%m') = ?", [$bulanIni])
            ->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
            ->selectRaw('trx_jual.kode_barang, barang.nama, SUM(qty) as total_qty, SUM(qty * trx_jual.harga) as total_omzet')
            ->groupBy('trx_jual.kode_barang', 'barang.nama')
            ->orderByDesc('total_omzet')
            ->limit(5)->get();

        // 6 bulan penjualan untuk chart
        $months6 = [];
        for ($i = 5; $i >= 0; $i--) {
            $m = Carbon::now()->subMonths($i)->format('Y-m');
            $val = $this->filterCabang(DB::table('trx_jual'), $cabang)
                ->whereRaw("DATE_FORMAT(tgl, '%Y-%m') = ?", [$m])
                ->selectRaw('SUM(qty * harga) as total')->value('total') ?? 0;
            $months6[] = ['bulan' => $m, 'total' => (float)$val];
        }

        // Penjualan per cabang bulan ini
        $cabangSales = DB::table('trx_jual')
            ->whereRaw("DATE_FORMAT(tgl, '%Y-%m') = ?", [$bulanIni])
            ->selectRaw('cabang, SUM(qty * harga) as total')
            ->groupBy('cabang')
            ->orderByDesc('total')->get();

        // Aktivitas terbaru
        $recent = $this->getRecentActivity($cabang, 10);

        return response()->json([
            'kpi' => [
                'kas'                 => (float)$kas,
                'bank'                => (float)$bank,
                'kas_bank'            => (float)$kasBankTotal,
                'penjualan_bulan_ini' => (float)$penjualanBulanIni,
                'penjualan_bulan_lalu'=> (float)$penjualanBulanLalu,
                'pct_change'          => $penjualanBulanLalu > 0
                    ? round(($penjualanBulanIni - $penjualanBulanLalu) / $penjualanBulanLalu * 100, 1)
                    : null,
                'piutang'             => (float)$piutang,
                'hutang'              => (float)$hutang,
                'laba_bersih'         => (float)$lr['laba_bersih'],
                'laba_kotor'          => (float)$lr['laba_kotor'],
                'pendapatan'          => (float)$lr['pendapatan'],
                'hpp'                 => (float)$lr['hpp'],
                'beban'               => (float)$lr['beban'],
            ],
            'top_barang'    => $topBarang,
            'chart_6bln'    => $months6,
            'cabang_sales'  => $cabangSales,
            'recent'        => $recent,
        ]);
    }

    // ─── JURNAL ENGINE ────────────────────────────────────────────────────────
    // $dari/$sampai (format Y-m-d, opsional) membatasi transaksi yang ikut
    // dihitung berdasarkan tanggalnya — dipakai oleh Neraca Saldo, Laba Rugi,
    // Rekap PPN (periode/rentang tanggal) dan Jurnal Umum. KHUSUS Neraca
    // (balance sheet): jangan pernah kirim $dari — Aset/Liabilitas/Modal
    // sifatnya SELALU kumulatif sejak awal berdiri sampai 1 tanggal cutoff,
    // beda dengan laporan periode lain (lihat method neraca() di bawah).
    /**
     * $shift / $kasir (opsional): kalau salah satunya diisi, jurnal HANYA berisi
     * transaksi PENJUALAN (+ HPP-nya) milik shift/kasir tsb — dipakai Laporan
     * Laba Rugi per Shift untuk menilai kinerja kasir. Transaksi lain
     * (pembelian, biaya, kasbon, aset, dst.) tidak punya kasir/shift sehingga
     * sengaja tidak ikut dihitung. Nilai shift: 'Pagi' | 'Siang' | 'Sehari' |
     * '(tanpa shift)'; nilai kasir: kode akun kasir | '(tanpa kasir)'.
     */
    public function buildJurnal(?string $cabang = null, ?string $dari = null, ?string $sampai = null, ?string $shift = null, ?string $kasir = null): array
    {
        $tarif = $this->getTarif();
        $lines = [];
        $hppSvc = app(\App\Services\HppService::class);

        // ─── Peta HPP dari Kartu HPP (App\Services\HppService) ──────────
        // HPP setiap baris keluar (Penjualan, Retur Beli, Barang Keluar,
        // Opname minus) TIDAK LAGI dihitung dari `barang.modal` (angka
        // manual di Master Barang) — melainkan dari Kartu HPP: harga
        // pokok rata-rata bergerak PER CABANG, yang otomatis ter-rata-rata
        // setiap kali harga beli naik/turun. Diambil sekaligus di sini
        // (bukan query per-baris di dalam ->each()) supaya tetap efisien.
        $hppMap = [
            'trx_jual'          => $hppSvc->hppMapUntukJurnal('trx_jual', DB::table('trx_jual')->pluck('id')->all()),
            'trx_retur'         => $hppSvc->hppMapUntukJurnal('trx_retur', DB::table('trx_retur')->pluck('id')->all()),
            'barang_keluar'     => $hppSvc->hppMapUntukJurnal('barang_keluar', DB::table('barang_keluar')->pluck('id')->all()),
            'stok_opname_detail'=> $hppSvc->hppNilaiOpname(DB::table('stok_opname_detail')->pluck('id')->all()),
        ];
        // Helper kecil: terapkan filter rentang tanggal ke query manapun,
        // supaya tidak perlu ditulis berulang di 11 blok transaksi di bawah.
        $applyTgl = function ($q, string $col) use ($dari, $sampai) {
            if ($dari)   $q->where($col, '>=', $dari);
            if ($sampai) $q->where($col, '<=', $sampai);
        };

        // Penjualan
        $jualQ = DB::table('trx_jual')->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode');
        if ($cabang) $jualQ->where('trx_jual.cabang', $cabang);
        $applyTgl($jualQ, 'trx_jual.tgl');
        $filterKasir = ($shift !== null && $shift !== '') || ($kasir !== null && $kasir !== '');
        $jualQ->select('trx_jual.*', 'barang.nama as nama_barang', 'barang.ppn as ppn_master', 'barang.modal')
            ->get()
            ->filter(fn($t) => !$filterKasir || $this->cocokKasirShift($t, $shift, $kasir))
            ->each(function ($t) use (&$lines, $tarif, $hppMap) {
                // Status PPN: PRIORITASKAN override per baris transaksi (trx_jual.ppn,
                // bisa dipilih langsung saat input Penjualan) — baru kalau kosong
                // (belum pernah diisi / transaksi lama), ikut Master Barang.
                $kena = ($t->ppn ?: $t->ppn_master) === 'Kena PPN';
                // diskon (kalau ada, mis. dari transaksi POS) mengurangi nilai
                // penjualan sebelum dipisah DPP/PPN — sama seperti Pembelian.
                $tot  = $t->qty * $t->harga - ($t->diskon ?? 0);
                $dpp  = $kena ? $tot / (1 + $tarif) : $tot;
                $pvn  = $tot - $dpp;
                // Pakai no_nota (mis. TXJ-20260811-1497) supaya nomor referensi
                // di Jurnal sinkron dengan nomor yang tampil di Riwayat Penjualan.
                // Fallback ke PJ-<id> hanya untuk data lama yang belum punya no_nota.
                $ref  = $t->no_nota ?: ('PJ-' . $t->id);
                $ket  = 'Penjualan ' . $t->nama_barang . ' (' . $t->cabang . ')';
                $acc  = $t->bayar === 'Kredit' ? '1103' : ($t->kode_kas ?: '1101');
                // Dr Kas/Bank/Piutang sebesar total (termasuk PPN kalau ada),
                // Cr Pendapatan Penjualan sebesar DPP — sebelumnya 2 baris ini
                // tidak pernah dibuat sama sekali, jadi Kas & Pendapatan tidak
                // pernah bertambah dari Penjualan padahal $acc & $dpp sudah
                // dihitung di atas (bandingkan dengan blok Pembelian di bawah).
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $acc, $tot, 0);
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $kena ? '4101' : '4102', 0, $dpp);
                if ($kena) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '2102', 0, $pvn);
                // HPP baris ini: dari Kartu HPP (App\Services\HppService) — rata-rata
                // bergerak PER CABANG dari riwayat barang masuk/keluar ASLI, bukan
                // dari `barang.modal`. HPP HANYA dari riwayat Pembelian: belum ada
                // pembelian = 0 (jalankan `php artisan hpp:rebuild` setelah update).
                $hpp = $hppMap['trx_jual'][$t->id] ?? 0; // hanya dari Kartu HPP (pembelian); belum ada pembelian = 0
                if ($hpp > 0) {
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, 'HPP – ' . $ket, '5101', $hpp, 0);
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, 'HPP – ' . $ket, '1105', 0, $hpp);
                }
            });

        // Mode per Shift/Kasir: berhenti di sini (hanya Penjualan + HPP).
        if ($filterKasir) {
            usort($lines, fn($a, $b) => strcmp($a['tgl'] . $a['ref'], $b['tgl'] . $b['ref']));
            return $lines;
        }

        // Pembelian
        $beliQ = DB::table('trx_beli')->join('barang', 'trx_beli.kode_barang', '=', 'barang.kode');
        if ($cabang) $beliQ->where('trx_beli.cabang', $cabang);
        $applyTgl($beliQ, 'trx_beli.tgl');
        $beliQ->select('trx_beli.*', 'barang.nama as nama_barang', 'barang.ppn as ppn_master')->get()
            ->each(function ($t) use (&$lines, $tarif) {
                // Sama seperti Penjualan: override per baris (trx_beli.ppn) diutamakan,
                // fallback ke Master Barang kalau belum pernah diisi.
                $kena = ($t->ppn ?: $t->ppn_master) === 'Kena PPN';
                $tot  = $t->qty * $t->harga - ($t->diskon ?? 0);
                $dpp  = $kena ? $tot / (1 + $tarif) : $tot;
                $pvn  = $tot - $dpp;
                // Sama seperti Penjualan: pakai no_nota (TXB-...) biar sinkron
                // dengan nomor yang tampil di Riwayat Pembelian.
                $ref  = $t->no_nota ?: ('PB-' . $t->id);
                $ket  = 'Pembelian ' . $t->nama_barang . ' (' . $t->cabang . ')';
                $acc  = $t->bayar === 'Kredit' ? '2101' : ($t->kode_kas ?: '1101');
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1105', $dpp, 0);
                if ($kena) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1106', $pvn, 0);
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $acc, 0, $tot);
            });

        // Kasbon
        $kasbonQ = DB::table('trx_kasbon');
        if ($cabang) $kasbonQ->where('cabang', $cabang);
        $applyTgl($kasbonQ, 'tgl');
        $kasbonQ->get()->each(function ($t) use (&$lines) {
            $ref = 'KB-' . $t->id;
            $ket = 'Kasbon ' . $t->jenis . ' – ' . $t->nama_karyawan . ' (' . $t->cabang . ')';
            $nom = $t->nominal;
            if ($t->jenis === 'Diberikan') {
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1104', $nom, 0);
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1101', 0, $nom);
            } else {
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1101', $nom, 0);
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1104', 0, $nom);
            }
        });

        // Cashbon Pelanggan
        $cashQ = DB::table('trx_cashbon');
        if ($cabang) $cashQ->where('cabang', $cabang);
        $applyTgl($cashQ, 'tgl');
        $cashQ->get()->each(function ($t) use (&$lines) {
            $ref = 'CB-' . $t->id;
            $ket = 'Cashbon Pelanggan ' . $t->jenis . ' – ' . $t->nama_pelanggan . ' (' . $t->cabang . ')';
            $nom = $t->nominal;
            if ($t->jenis === 'Diberikan') {
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1107', $nom, 0);
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1101', 0, $nom);
            } else {
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1101', $nom, 0);
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1107', 0, $nom);
            }
        });

        // Jasa
        $jasaQ = DB::table('trx_jasa')->leftJoin('jasa', 'trx_jasa.kode_jasa', '=', 'jasa.kode');
        if ($cabang) $jasaQ->where('trx_jasa.cabang', $cabang);
        $applyTgl($jasaQ, 'trx_jasa.tgl');
        $jasaQ->select('trx_jasa.*', 'jasa.nama as nama_jasa', 'jasa.ppn as ppn_jasa')->get()
            ->each(function ($t) use (&$lines, $tarif) {
                $kena = ($t->ppn_jasa ?? '') === 'Kena PPN';
                $tot  = $t->qty * $t->harga;
                $dpp  = $kena ? $tot / (1 + $tarif) : $tot;
                $pvn  = $tot - $dpp;
                $ref  = 'JS-' . $t->id;
                $ket  = 'Jasa ' . ($t->nama_jasa ?? $t->kode_jasa) . ' (' . $t->cabang . ')';
                $acc  = $t->bayar === 'Kredit' ? '1103' : '1101';
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $acc, $tot, 0);
                $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '4103', 0, $dpp);
                if ($kena) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '2102', 0, $pvn);
            });

        // Sewa
        $sewaQ = DB::table('trx_sewa');
        if ($cabang) $sewaQ->where('cabang', $cabang);
        $applyTgl($sewaQ, 'tgl');
        $sewaQ->get()->each(function ($t) use (&$lines, $tarif) {
            $kena = $t->ppn === 'Kena PPN';
            $tot  = $t->biaya;
            $dpp  = $kena ? $tot / (1 + $tarif) : $tot;
            $pvn  = $tot - $dpp;
            $ref  = 'SW-' . $t->id;
            $ket  = 'Sewa ' . $t->item . ' – ' . $t->nama_penyewa . ' (' . $t->cabang . ')';
            $acc  = $t->bayar === 'Kredit' ? '1103' : '1101';
            $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $acc, $tot, 0);
            $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '4104', 0, $dpp);
            if ($kena) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '2102', 0, $pvn);
        });

        // Retur
        $returQ = DB::table('trx_retur')->leftJoin('barang', 'trx_retur.kode_barang', '=', 'barang.kode');
        if ($cabang) $returQ->where('trx_retur.cabang', $cabang);
        $applyTgl($returQ, 'trx_retur.tgl');
        $returQ->select('trx_retur.*', 'barang.nama as nama_barang', 'barang.ppn', 'barang.modal')->get()
            ->each(function ($t) use (&$lines, $tarif, $hppMap) {
                $kena = ($t->ppn ?? '') === 'Kena PPN';
                $tot  = $t->qty * $t->harga;
                $dpp  = $kena ? $tot / (1 + $tarif) : $tot;
                $pvn  = $tot - $dpp;
                $ref  = 'RT-' . $t->id;
                $ket  = 'Retur ' . $t->jenis . ' ' . ($t->nama_barang ?? $t->kode_barang) . ' (' . $t->cabang . ')';
                if ($t->jenis === 'Jual') {
                    $acc = $t->bayar === 'Kredit' ? '1103' : '1101';
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '4105', $dpp, 0);
                    if ($kena) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '2102', $pvn, 0);
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $acc, 0, $tot);
                    // HPP retur (barang balik ke gudang) dari Kartu HPP, bukan barang.modal
                    $hpp = $hppMap['trx_retur'][$t->id] ?? 0;
                    if ($hpp > 0) {
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, 'HPP – ' . $ket, '1105', $hpp, 0);
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, 'HPP – ' . $ket, '5101', 0, $hpp);
                    }
                } else {
                    $acc = $t->bayar === 'Kredit' ? '2101' : '1101';
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $acc, $tot, 0);
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1105', 0, $dpp);
                    if ($kena) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1106', 0, $pvn);
                }
            });

        // Biaya
        $biayaQ = DB::table('trx_biaya');
        if ($cabang) $biayaQ->where('cabang', $cabang);
        $applyTgl($biayaQ, 'tgl');
        $biayaQ->get()->each(function ($t) use (&$lines) {
            $ref = 'BX-' . $t->id;
            $ket = ($t->keterangan ? $t->keterangan . ' – ' : '') . $t->kode_akun . ' (' . $t->cabang . ')';
            $nom = $t->nominal;
            $acc = $t->bayar === 'Bank' ? '1102' : '1101';
            $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $t->kode_akun, $nom, 0);
            $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $acc, 0, $nom);
        });

        // Barang Masuk — stok masuk yang dicatat langsung dari modul Stok
        // (bukan lewat Transaksi > Pembelian). Kalau ada harga_beli, ini
        // adalah pengeluaran uang riil untuk menambah persediaan, jadi HARUS
        // masuk jurnal juga — sebelumnya baris ini hanya mengubah qty di
        // tabel `stok` tanpa menyentuh pembukuan sama sekali.
        // Catatan: form Barang Masuk tidak punya field metode bayar, jadi
        // secara default dianggap dibayar Tunai (Kas). Kalau di kemudian hari
        // dibutuhkan pilihan Kas/Bank/Kredit, tambahkan field `bayar` di form.
        $bmQ = DB::table('barang_masuk')->join('barang', 'barang_masuk.kode_barang', '=', 'barang.kode');
        if ($cabang) $bmQ->where('barang_masuk.cabang', $cabang);
        $applyTgl($bmQ, 'barang_masuk.tgl');
        $bmQ->select('barang_masuk.*', 'barang.nama as nama_barang')->get()
            ->each(function ($t) use (&$lines) {
                $nilaiPersediaan = (float) $t->qty * (float) $t->harga_beli; // DPP-only
                $ppnMasukan = (float) ($t->ppn_masukan ?? 0); // hanya terisi utk baris 'Saldo Awal', lihat HppService::generateSaldoAwalPersediaan
                $totalKredit = $nilaiPersediaan + $ppnMasukan;
                if ($totalKredit <= 0) return; // tidak ada nilai uang, tidak perlu jurnal (mis. stok penyesuaian awal)
                $ref = 'BM-' . $t->id;
                // 'Saldo Awal' (OTOMATIS oleh HppService::generateSaldoAwalPersediaan,
                // lihat migration add_sumber_barang_masuk_dan_coa_saldo_awal) DAN
                // 'Saldo Awal Manual' (input manual lewat Master > Saldo Awal >
                // Saldo Awal Inventory, lihat SaldoAwalController::inventoryImport)
                // = pengakuan stok migrasi — BUKAN transaksi kas baru. Persediaan
                // (DPP) & PPN Masukan dipisah jadi 2 baris debit, sama-sama
                // diimbangi ke Modal (3103) — TIDAK ada yang menyentuh Laba Rugi.
                // Barang Masuk biasa (restock tunai) tetap ke Kas (1101) seperti
                // semula, tanpa pemisahan PPN Masukan.
                $isSaldoAwal = in_array($t->sumber ?? 'Pembelian Tunai', ['Saldo Awal', 'Saldo Awal Manual']);
                $labelSaldoAwal = ($t->sumber === 'Saldo Awal Manual') ? 'Saldo Awal Persediaan (Manual) ' : 'Saldo Awal Persediaan (Otomatis) ';
                $ket = ($isSaldoAwal ? $labelSaldoAwal : 'Barang Masuk ') . $t->nama_barang . ($t->supplier ? ' – ' . $t->supplier : '') . ' (' . $t->cabang . ')';
                if ($isSaldoAwal) {
                    if ($nilaiPersediaan > 0) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1105', $nilaiPersediaan, 0);
                    if ($ppnMasukan > 0) $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket . ' (PPN Masukan)', '1106', $ppnMasukan, 0);
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '3103', 0, $totalKredit);
                } else {
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1105', $nilaiPersediaan, 0);
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1101', 0, $nilaiPersediaan);
                }
            });

        // Barang Keluar — stok keluar dari modul Stok di luar Transaksi >
        // Penjualan. Sebelumnya baris ini HANYA mengurangi qty di `stok` dan
        // sama sekali tidak tersentuh jurnal, padahal nilainya (baik sebagai
        // penjualan, retur ke supplier, maupun kerugian barang rusak/sample)
        // adalah pengaruh keuangan yang nyata.
        $bkQ = DB::table('barang_keluar')->join('barang', 'barang_keluar.kode_barang', '=', 'barang.kode');
        if ($cabang) $bkQ->where('barang_keluar.cabang', $cabang);
        $applyTgl($bkQ, 'barang_keluar.tgl');
        $bkQ->select('barang_keluar.*', 'barang.nama as nama_barang', 'barang.modal')->get()
            ->each(function ($t) use (&$lines, $hppMap) {
                $ref = 'BK-' . $t->id;
                $ket = 'Barang Keluar (' . $t->jenis . ') ' . $t->nama_barang . ' (' . $t->cabang . ')';
                // HPP dari Kartu HPP (rata-rata bergerak per cabang), bukan barang.modal
                $modalNilai = $hppMap['barang_keluar'][$t->id] ?? 0;

                if ($t->jenis === 'Penjualan') {
                    // Diperlakukan seperti penjualan tunai sederhana (tanpa rincian
                    // PPN karena form ini tidak punya field PPN) + HPP-nya.
                    $nilai = (float) $t->qty * (float) $t->harga_jual;
                    if ($nilai > 0) {
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1101', $nilai, 0);
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '4102', 0, $nilai);
                    }
                    if ($modalNilai > 0) {
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, 'HPP – ' . $ket, '5101', $modalNilai, 0);
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, 'HPP – ' . $ket, '1105', 0, $modalNilai);
                    }
                } elseif ($t->jenis === 'Retur Beli') {
                    // Barang dikembalikan ke supplier — persediaan berkurang,
                    // dianggap uang kembali tunai (kalau sebenarnya mengurangi
                    // hutang, sesuaikan akun lawan ini ke 2101 secara manual).
                    if ($modalNilai > 0) {
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1101', $modalNilai, 0);
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1105', 0, $modalNilai);
                    }
                } else {
                    // Rusak / Sample / Lainnya — persediaan hilang tanpa ada
                    // uang masuk, dicatat sebagai kerugian/beban.
                    if ($modalNilai > 0) {
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '5102', $modalNilai, 0);
                        $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '1105', 0, $modalNilai);
                    }
                }
            });

        // Stok Opname — selisih antara qty sistem & qty fisik yang sudah
        // "Selesai" mengubah saldo tabel `stok` tapi sebelumnya tidak pernah
        // tercatat nilainya di jurnal, padahal itu artinya persediaan
        // bertambah/berkurang nilai tanpa transaksi jual/beli.
        $soQ = DB::table('stok_opname')->where('status', 'Selesai');
        if ($cabang) $soQ->where('cabang', $cabang);
        $applyTgl($soQ, 'tgl');
        $soQ->get()->each(function ($so) use (&$lines, $hppMap) {
            $detail = DB::table('stok_opname_detail')
                ->join('barang', 'stok_opname_detail.kode_barang', '=', 'barang.kode')
                ->where('opname_id', $so->id)
                ->select('stok_opname_detail.*', 'barang.nama as nama_barang', 'barang.modal')
                ->get();
            foreach ($detail as $d) {
                // Nilai dari Kartu HPP (rata-rata bergerak saat itu), bukan barang.modal
                // Selisih 0 = tidak ada jurnal. Selisih ≠ 0 tetap dibuat barisnya
                // walau HPP 0 (nilai Rp 0) supaya opname terlihat di jurnal.
                if ((float) $d->selisih == 0) continue;
                $nilai = $hppMap['stok_opname_detail'][$d->id] ?? 0;
                if ($nilai == 0) $nilai = ((float) $d->selisih > 0) ? 0.0001 : -0.0001; // tanda arah; di-round jadi 0 oleh jl()
                $ref = 'SO-' . $so->id . '-' . $d->id;
                $ket = 'Selisih Opname ' . $d->nama_barang . ' (' . $so->cabang . ')';
                if ($nilai > 0) {
                    // Stok fisik lebih banyak dari sistem — persediaan bertambah nilai
                    $lines[] = $this->jl($so->tgl, $so->cabang, $ref, $ket, '1105', $nilai, 0);
                    $lines[] = $this->jl($so->tgl, $so->cabang, $ref, $ket, '5102', 0, $nilai);
                } else {
                    // Stok fisik lebih sedikit dari sistem — persediaan berkurang nilai (kerugian)
                    $abs = abs($nilai);
                    $lines[] = $this->jl($so->tgl, $so->cabang, $ref, $ket, '5102', $abs, 0);
                    $lines[] = $this->jl($so->tgl, $so->cabang, $ref, $ket, '1105', 0, $abs);
                }
            }
        });

        // Aset Tetap — perolehan (sekali) + penyusutan bulanan (garis lurus,
        // dihitung terus-menerus oleh App\Services\AsetPenyusutanService,
        // TIDAK disimpan sebagai baris statis — lihat catatan di service itu).
        $asetQ = DB::table('aset_tetap');
        if ($cabang) $asetQ->where('cabang', $cabang);
        $applyTgl($asetQ, 'tgl_perolehan');
        $asetSvc = app(\App\Services\AsetPenyusutanService::class);
        $asetQ->get()->each(function ($a) use (&$lines, $asetSvc, $dari, $sampai) {
            // Perolehan: Dr Aset Tetap (1201), Cr Kas/Bank (Tunai) atau Hutang Usaha (Kredit)
            $ref = 'AT-' . $a->id;
            $ket = 'Perolehan Aset Tetap ' . $a->nama . ($a->cabang ? ' (' . $a->cabang . ')' : '');
            $acc = $a->bayar === 'Kredit' ? '2101' : ($a->kode_kas ?: '1101');
            $lines[] = $this->jl($a->tgl_perolehan, $a->cabang ?: '-', $ref, $ket, '1201', $a->nilai_perolehan, 0);
            $lines[] = $this->jl($a->tgl_perolehan, $a->cabang ?: '-', $ref, $ket, $acc, 0, $a->nilai_perolehan);

            // Penyusutan bulanan: Dr Biaya Penyusutan (6106), Cr Akumulasi Penyusutan (1202)
            // — dibangun terpisah dari query utama (bukan lewat $applyTgl) karena
            // setiap baris punya tanggal SENDIRI (akhir tiap bulan), lalu difilter
            // manual dgn $dari/$sampai laporan yang sedang aktif.
            foreach ($asetSvc->jurnalLines($a) as $p) {
                if ($dari && $p['tgl'] < $dari) continue;
                if ($sampai && $p['tgl'] > $sampai) continue;
                $lines[] = $this->jl($p['tgl'], $a->cabang ?: '-', $p['ref'], $p['ket'], '6106', $p['nilai'], 0);
                $lines[] = $this->jl($p['tgl'], $a->cabang ?: '-', $p['ref'], $p['ket'], '1202', 0, $p['nilai']);
            }
        });

        // Saldo Awal Akun — saldo pembukaan akun-akun Neraca (Kas, Bank,
        // Piutang, Hutang, Modal, dst) saat migrasi ke sistem baru, diinput
        // manual di menu Master > Saldo Awal > Saldo Awal Akun (lihat
        // App\Http\Controllers\Api\SaldoAwalController::akunSave). Setiap
        // baris otomatis diimbangi ke akun 3102 "Modal Awal" supaya Neraca
        // TETAP SEIMBANG walau baris-baris diinput satu per satu / belum
        // lengkap semua akun sekaligus. TIDAK termasuk Persediaan (1105) —
        // itu diatur lewat Saldo Awal Inventory (barang_masuk) di atas.
        $saQ = DB::table('saldo_awal_akun')->join('coa', 'saldo_awal_akun.kode_akun', '=', 'coa.kode');
        if ($cabang) $saQ->where('saldo_awal_akun.cabang', $cabang);
        $applyTgl($saQ, 'saldo_awal_akun.tgl');
        $saQ->select('saldo_awal_akun.*', 'coa.nama as nama_akun', 'coa.normal')->get()
            ->each(function ($t) use (&$lines) {
                $nom = (float) $t->nominal;
                if ($nom <= 0) return;
                $ref = 'SA-' . $t->id;
                $ket = 'Saldo Awal ' . $t->nama_akun . ' (' . $t->cabang . ')';
                if ($t->normal === 'D') {
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $t->kode_akun, $nom, 0);
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '3102', 0, $nom);
                } else {
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, $t->kode_akun, 0, $nom);
                    $lines[] = $this->jl($t->tgl, $t->cabang, $ref, $ket, '3102', $nom, 0);
                }
            });

        usort($lines, fn($a, $b) => strcmp($a['tgl'] . $a['ref'], $b['tgl'] . $b['ref']));
        return $lines;
    }

    /** Apakah baris trx_jual ini milik shift/kasir yang dipilih? Aturan shift
     *  sama persis dengan Analisis Data ▸ Kasir & Shift (analisisKasir):
     *  pakai kolom `shift`; kalau kosong tapi ada kasir → turunkan dari akun
     *  kasir (KasirAkunService); kalau dua-duanya kosong → '(tanpa …)'. */
    private function cocokKasirShift(object $t, ?string $shift, ?string $kasir): bool
    {
        $k  = !empty($t->kasir) ? $t->kasir : '(tanpa kasir)';
        $sh = !empty($t->shift) ? $t->shift
            : (!empty($t->kasir) ? \App\Services\KasirAkunService::shift($t->kasir) : '(tanpa shift)');
        if ($shift !== null && $shift !== '' && $sh !== $shift) return false;
        if ($kasir !== null && $kasir !== '' && $k !== $kasir) return false;
        return true;
    }

    private function jl($tgl, $cab, $ref, $ket, $akun, $D, $K): array
    {
        return ['tgl' => $tgl, 'cab' => $cab, 'ref' => $ref, 'ket' => $ket, 'akun' => $akun, 'D' => round($D), 'K' => round($K)];
    }

    public function balAkun(array $jurnal, string $kode, string $normal): float
    {
        $D = array_sum(array_column(array_filter($jurnal, fn($x) => $x['akun'] === $kode), 'D'));
        $K = array_sum(array_column(array_filter($jurnal, fn($x) => $x['akun'] === $kode), 'K'));
        return $normal === 'D' ? $D - $K : $K - $D;
    }

    public function calcLabaRugi(array $jurnal): array
    {
        $coaAll = DB::table('coa')->get()->keyBy('kode');
        $pendapatan = 0;
        $hpp = 0;
        $beban = 0;

        foreach ($coaAll as $kode => $akun) {
            // PENTING: $kode di sini BUKAN string murni. Laravel Collection
            // (keyBy) disimpan di atas array PHP biasa, dan PHP otomatis
            // meng-cast key array yang berupa angka murni (mis. "5101")
            // jadi integer. Akibatnya perbandingan strict semacam
            // `$kode === '5101'` SELALU gagal (int vs string), sehingga baris
            // HPP tidak pernah kena cabang yang benar dan malah ikut ke Beban
            // — bikin HPP selalu Rp 0 dan Biaya Operasional dobel hitung HPP.
            // Fix: cast eksplisit ke string dulu sebelum dibandingkan.
            $kodeStr = (string) $kode;
            if ($akun->kat === 'Pendapatan') {
                $pendapatan += $this->balAkun($jurnal, $kodeStr, 'K');
            } elseif ($kodeStr === '5101') {
                $D = array_sum(array_column(array_filter($jurnal, fn($x) => $x['akun'] === '5101'), 'D'));
                $K = array_sum(array_column(array_filter($jurnal, fn($x) => $x['akun'] === '5101'), 'K'));
                $hpp = $D - $K;
            } elseif ($akun->kat === 'Beban' && $kodeStr !== '5101') {
                $beban += $this->balAkun($jurnal, $kodeStr, 'D');
            }
        }

        // PPN (Keluaran dari penjualan/jasa/sewa via akun 2102, Masukan dari
        // pembelian via akun 1106) SENGAJA TIDAK direkonsiliasi lagi di sini.
        // Pendapatan yang tercatat di akun Pendapatan sudah berupa DPP bersih
        // (PPN Keluaran sudah dipisah ke akun 2102 sejak dari buildJurnal()),
        // jadi Laporan Laba Rugi ini otomatis "bersih dari PPN" tanpa perlu
        // baris rekonsiliasi tambahan. PPN Keluaran & PPN Masukan tetap
        // tercatat & terlihat sebagai saldo akun 2102/1106 di Neraca —
        // itulah tempatnya (bukan di Laba Rugi). Lihat neraca() & rekapPpn().
        return [
            'pendapatan'  => $pendapatan,
            'hpp'         => $hpp,
            'beban'       => $beban,
            'laba_kotor'  => $pendapatan - $hpp,
            'laba_bersih' => $pendapatan - $hpp - $beban,
        ];
    }

    private function getRecentActivity(?string $cabang, int $limit): array
    {
        $all = [];

        $q = DB::table('trx_jual')->leftJoin('barang', 'trx_jual.kode_barang', '=', 'barang.kode');
        if ($cabang) $q->where('trx_jual.cabang', $cabang);
        $q->select('trx_jual.tgl', 'trx_jual.cabang', DB::raw("'Penjualan' as jenis"), 'barang.nama as keterangan', DB::raw('(trx_jual.qty * trx_jual.harga) as nilai'))->get()->each(fn($r) => $all[] = $r);

        $q2 = DB::table('trx_biaya');
        if ($cabang) $q2->where('cabang', $cabang);
        $q2->select('tgl', 'cabang', DB::raw("'Pengeluaran' as jenis"), 'keterangan', 'nominal as nilai')->get()->each(fn($r) => $all[] = $r);

        $q3 = DB::table('trx_jasa')->leftJoin('jasa', 'trx_jasa.kode_jasa', '=', 'jasa.kode');
        if ($cabang) $q3->where('trx_jasa.cabang', $cabang);
        $q3->select('trx_jasa.tgl', 'trx_jasa.cabang', DB::raw("'Jasa' as jenis"), 'jasa.nama as keterangan', DB::raw('(trx_jasa.qty * trx_jasa.harga) as nilai'))->get()->each(fn($r) => $all[] = $r);

        usort($all, fn($a, $b) => strcmp($b->tgl ?? '', $a->tgl ?? ''));
        return array_slice($all, 0, $limit);
    }

    // ─── JURNAL & BUKU BESAR API ─────────────────────────────────────────────
    public function jurnalUmum(Request $request)
    {
        $cabang = $request->get('cabang');
        $dari   = $request->get('dari');
        $sampai = $request->get('sampai');
        $jurnal = $this->buildJurnal($cabang, $dari, $sampai);
        $coaMap = DB::table('coa')->pluck('nama', 'kode');

        $result = array_map(function ($j) use ($coaMap) {
            $j['nama_akun'] = $coaMap[$j['akun']] ?? $j['akun'];
            return $j;
        }, $jurnal);

        $totD = array_sum(array_column($jurnal, 'D'));
        $totK = array_sum(array_column($jurnal, 'K'));

        return response()->json([
            'data'      => $result,
            'total_D'   => $totD,
            'total_K'   => $totK,
            'seimbang'  => abs($totD - $totK) < 2,
        ]);
    }

    public function bukuBesar(Request $request)
    {
        // Catatan: TIDAK menerima filter dari/sampai (beda dengan Jurnal Umum &
        // laporan keuangan lain) — kolom "saldo" berjalan di Buku Besar butuh
        // SEMUA transaksi sejak awal supaya saldo akhir akurat; kalau dipotong
        // per tanggal, saldo awal periode akan salah mulai dari 0.
        $cabang = $request->get('cabang');
        $kodeAkun = $request->get('kode_akun', '1101');
        $jurnal = $this->buildJurnal($cabang);
        $akun = DB::table('coa')->where('kode', $kodeAkun)->first();

        $rows = array_filter($jurnal, fn($j) => $j['akun'] === $kodeAkun);
        $saldo = 0;
        $result = [];
        foreach ($rows as $r) {
            if ($akun) {
                $saldo += $akun->normal === 'D' ? ($r['D'] - $r['K']) : ($r['K'] - $r['D']);
            }
            $result[] = array_merge($r, ['saldo' => $saldo]);
        }

        return response()->json([
            'akun'   => $akun,
            'data'   => array_values($result),
            'saldo_akhir' => $saldo,
        ]);
    }

    // ─── LAPORAN API ──────────────────────────────────────────────────────────
    public function neracaSaldo(Request $request)
    {
        $cabang  = $request->get('cabang');
        $dari    = $request->get('dari');
        $sampai  = $request->get('sampai');
        $jurnal  = $this->buildJurnal($cabang, $dari, $sampai);
        $coaAll  = DB::table('coa')->orderBy('kode')->get();

        $rows = [];
        foreach ($coaAll as $akun) {
            $D = array_sum(array_column(array_filter($jurnal, fn($j) => $j['akun'] === $akun->kode), 'D'));
            $K = array_sum(array_column(array_filter($jurnal, fn($j) => $j['akun'] === $akun->kode), 'K'));
            if ($D > 0 || $K > 0) {
                $rows[] = ['kode' => $akun->kode, 'nama' => $akun->nama, 'kat' => $akun->kat, 'D' => $D, 'K' => $K];
            }
        }

        $totD = array_sum(array_column($rows, 'D'));
        $totK = array_sum(array_column($rows, 'K'));

        return response()->json([
            'data'     => $rows,
            'total_D'  => $totD,
            'total_K'  => $totK,
            'seimbang' => abs($totD - $totK) < 2,
        ]);
    }

    // ─── SALDO SEMUA AKUN (Rupiah) ──────────────────────────────────────────
    // Total real-time per akun COA (bukan cuma D & K terpisah seperti Neraca
    // Saldo, tapi sudah dijadikan 1 angka saldo sesuai posisi normalnya) —
    // dipakai supaya Data Master > COA & rekap manapun bisa langsung
    // menampilkan "Total (Rupiah)" per akun tanpa harus buka Buku Besar dulu.
    public function saldoAkun(Request $request)
    {
        $cabang = $request->get('cabang');
        $jurnal = $this->buildJurnal($cabang);
        $coaAll = DB::table('coa')->orderBy('kode')->get();

        $rows = $coaAll->map(function ($akun) use ($jurnal) {
            return [
                'kode'   => $akun->kode,
                'nama'   => $akun->nama,
                'kat'    => $akun->kat,
                'normal' => $akun->normal,
                'saldo'  => round($this->balAkun($jurnal, $akun->kode, $akun->normal)),
            ];
        })->values();

        $totalPerKategori = $rows->groupBy('kat')->map(fn($g) => $g->sum('saldo'));

        return response()->json([
            'data'               => $rows,
            'total_per_kategori' => $totalPerKategori,
            'total_semua'        => $rows->sum('saldo'),
        ]);
    }

    public function labaRugi(Request $request)
    {
        $cabang = $request->get('cabang');
        $dari   = $request->get('dari');
        $sampai = $request->get('sampai');
        $shift  = trim((string) $request->get('shift'));
        $kasir  = trim((string) $request->get('kasir'));
        $perKasir = ($shift !== '' || $kasir !== '');
        $jurnal = $this->buildJurnal($cabang, $dari, $sampai, $shift ?: null, $kasir ?: null);
        $lr     = $this->calcLabaRugi($jurnal);
        $coaAll = DB::table('coa')->get();

        $pendRows = [];
        $bebanRows = [];
        foreach ($coaAll as $akun) {
            if ($akun->kat === 'Pendapatan') {
                $val = $this->balAkun($jurnal, $akun->kode, 'K');
                if ($val != 0) $pendRows[] = ['kode' => $akun->kode, 'nama' => $akun->nama, 'nilai' => $val];
            } elseif ($akun->kat === 'Beban' && $akun->kode !== '5101') {
                $val = $this->balAkun($jurnal, $akun->kode, 'D');
                if ($val != 0) $bebanRows[] = ['kode' => $akun->kode, 'nama' => $akun->nama, 'nilai' => $val];
            }
        }

        return response()->json(array_merge($lr, [
            'pendapatan_detail'         => $pendRows,
            'beban_detail'              => $bebanRows,
            // Peringatan data (barang tanpa modal / tak terdeteksi) berlaku utk
            // laporan keseluruhan, bukan per shift/kasir — dikosongkan di mode itu.
            'barang_tanpa_modal'        => $perKasir ? [] : $this->barangTanpaModal($cabang, $dari, $sampai),
            'barang_tidak_terdeteksi'   => $perKasir ? ['jumlah_kode' => 0, 'omzet' => 0] : $this->barangTidakTerdeteksiRingkas($cabang, $dari, $sampai),
            'filter_shift'              => $shift ?: null,
            'filter_kasir'              => $kasir ?: null,
            'per_kasir_shift'           => $perKasir,
        ]));
    }

    // Beda dengan barangTanpaModal() di bawah (yang butuh baris barang-nya
    // SUDAH ada tapi modal=0): ini menghitung omzet Penjualan yang kode
    // barangnya TIDAK ADA SAMA SEKALI di Master Barang, sehingga baris
    // tsb bahkan tidak ikut di-JOIN sama sekali dan hilang total dari
    // Jurnal & Pendapatan di bawah — inilah biasanya penyebab total
    // "Riwayat Penjualan" berbeda dengan "Pendapatan" di Laba Rugi. Cukup
    // ringkasan (jumlah kode & total omzet) — detail lengkap + tombol
    // perbaikannya ada di menu Sinkronisasi Data ▸ Barang Tidak Terdeteksi
    // (TransaksiController::barangTidakTerdeteksi).
    public function barangTidakTerdeteksiRingkas(?string $cabang = null, ?string $dari = null, ?string $sampai = null): array
    {
        $q = DB::table('trx_jual')
            ->whereNotExists(function ($sub) {
                $sub->select(DB::raw(1))->from('barang')->whereColumn('barang.kode', 'trx_jual.kode_barang');
            });
        if ($cabang) $q->where('cabang', $cabang);
        if ($dari)   $q->where('tgl', '>=', $dari);
        if ($sampai) $q->where('tgl', '<=', $sampai);

        $row = $q->selectRaw('COUNT(DISTINCT kode_barang) as jml_kode, SUM(qty*harga) as omzet')->first();
        return [
            'jumlah_kode' => (int) ($row->jml_kode ?? 0),
            'omzet'       => (float) ($row->omzet ?? 0),
        ];
    }

    // Cari barang yang sudah terjual (ada di trx_jual, dalam rentang tanggal
    // $dari–$sampai kalau diisi) tapi Harga Modal-nya masih 0/kosong di Master
    // Barang. Item seperti ini membuat HPP-nya dihitung 0 sehingga LABA
    // terlihat jauh lebih besar dari kenyataan (margin barang tsb "terbaca"
    // 100%). Dipakai untuk menampilkan peringatan di Laporan Laba Rugi supaya
    // gampang ditelusuri & diperbaiki.
    public function barangTanpaModal(?string $cabang = null, ?string $dari = null, ?string $sampai = null): array
    {
        // Barang terjual yang HPP-nya 0 karena BELUM ADA PEMBELIAN (Kartu HPP).
        $q = DB::table('trx_jual')
            ->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
            ->leftJoin('hpp_kartu', function ($j) {
                $j->on('hpp_kartu.ref_id', '=', 'trx_jual.id')->where('hpp_kartu.ref_tabel', '=', 'trx_jual');
            })
            ->where(fn($w) => $w->whereNull('hpp_kartu.id')->orWhere('hpp_kartu.nilai_keluar', '<=', 0));
        if ($cabang) $q->where('trx_jual.cabang', $cabang);
        if ($dari)   $q->where('trx_jual.tgl', '>=', $dari);
        if ($sampai) $q->where('trx_jual.tgl', '<=', $sampai);

        return $q->selectRaw('barang.kode, barang.nama, SUM(trx_jual.qty) as qty_terjual, SUM(trx_jual.qty*trx_jual.harga) as omzet')
            ->groupBy('barang.kode', 'barang.nama')
            ->orderByDesc('omzet')
            ->limit(50)
            ->get()
            ->map(fn($r) => ['kode' => $r->kode, 'nama' => $r->nama, 'qty_terjual' => (float)$r->qty_terjual, 'omzet' => (float)$r->omzet])
            ->toArray();
    }

    public function neraca(Request $request)
    {
        // PENTING: Neraca (balance sheet) TIDAK menerima "dari" — Aset,
        // Liabilitas & Modal selalu kumulatif SEJAK AWAL berdiri sampai 1
        // tanggal cutoff ("per tanggal ..."), beda dengan Neraca Saldo/Laba
        // Rugi/Rekap PPN yang benar-benar per rentang periode. $sampai kosong
        // = per hari ini (snapshot terkini, termasuk transaksi hari ini).
        $cabang = $request->get('cabang');
        $sampai = $request->get('sampai');
        $jurnal = $this->buildJurnal($cabang, null, $sampai);
        $lr     = $this->calcLabaRugi($jurnal);
        $coaAll = DB::table('coa')->get();

        $aset = $liab = $modal = [];
        foreach ($coaAll as $akun) {
            $val = 0;
            if ($akun->kat === 'Aset') {
                $val = $this->balAkun($jurnal, $akun->kode, 'D');
                if ($val != 0) $aset[] = ['kode' => $akun->kode, 'nama' => $akun->nama, 'nilai' => $val];
            } elseif ($akun->kat === 'Liabilitas') {
                $val = $this->balAkun($jurnal, $akun->kode, 'K');
                if ($val != 0) $liab[] = ['kode' => $akun->kode, 'nama' => $akun->nama, 'nilai' => $val];
            } elseif ($akun->kat === 'Modal') {
                $val = $this->balAkun($jurnal, $akun->kode, 'K');
                if ($val != 0) $modal[] = ['kode' => $akun->kode, 'nama' => $akun->nama, 'nilai' => $val];
            }
        }

        $tAset  = array_sum(array_column($aset, 'nilai'));
        $tLiab  = array_sum(array_column($liab, 'nilai'));
        $tModal = array_sum(array_column($modal, 'nilai')) + $lr['laba_bersih'];

        return response()->json([
            'aset'            => $aset,
            'liabilitas'      => $liab,
            'modal'           => $modal,
            'total_aset'      => $tAset,
            'total_liabilitas'=> $tLiab,
            'total_modal'     => $tModal,
            'laba_berjalan'   => $lr['laba_bersih'],
            'seimbang'        => abs($tAset - ($tLiab + $tModal)) < 2,
        ]);
    }

    public function rekapPpn(Request $request)
    {
        $cabang = $request->get('cabang');
        $dari   = $request->get('dari');
        $sampai = $request->get('sampai');
        $tarif  = $this->getTarif();

        $bulanData = [];

        // PPN Keluaran (dari penjualan) — override per baris (trx_jual.ppn)
        // diutamakan, fallback ke Master Barang kalau belum pernah diisi.
        $jualQ = DB::table('trx_jual')
            ->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
            ->whereRaw("COALESCE(trx_jual.ppn, barang.ppn) = ?", ['Kena PPN']);
        if ($cabang) $jualQ->where('trx_jual.cabang', $cabang);
        if ($dari)   $jualQ->where('trx_jual.tgl', '>=', $dari);
        if ($sampai) $jualQ->where('trx_jual.tgl', '<=', $sampai);
        $jualQ->selectRaw("DATE_FORMAT(tgl, '%Y-%m') as bulan, SUM(qty * trx_jual.harga) as total")
            ->groupBy('bulan')->get()->each(function ($r) use (&$bulanData, $tarif) {
                $tot = $r->total;
                $dpp = $tot / (1 + $tarif);
                $pvn = $tot - $dpp;
                if (!isset($bulanData[$r->bulan])) $bulanData[$r->bulan] = ['bulan' => $r->bulan, 'dpp_jual' => 0, 'ppn_keluaran' => 0, 'dpp_beli' => 0, 'ppn_masukan' => 0];
                $bulanData[$r->bulan]['dpp_jual']     += $dpp;
                $bulanData[$r->bulan]['ppn_keluaran'] += $pvn;
            });

        // PPN Masukan (dari pembelian) — sama, override per baris diutamakan
        $beliQ = DB::table('trx_beli')
            ->join('barang', 'trx_beli.kode_barang', '=', 'barang.kode')
            ->whereRaw("COALESCE(trx_beli.ppn, barang.ppn) = ?", ['Kena PPN']);
        if ($cabang) $beliQ->where('trx_beli.cabang', $cabang);
        if ($dari)   $beliQ->where('trx_beli.tgl', '>=', $dari);
        if ($sampai) $beliQ->where('trx_beli.tgl', '<=', $sampai);
        $beliQ->selectRaw("DATE_FORMAT(tgl, '%Y-%m') as bulan, SUM(qty * trx_beli.harga - COALESCE(trx_beli.diskon,0)) as total")
            ->groupBy('bulan')->get()->each(function ($r) use (&$bulanData, $tarif) {
                $tot = $r->total;
                $dpp = $tot / (1 + $tarif);
                $pvn = $tot - $dpp;
                if (!isset($bulanData[$r->bulan])) $bulanData[$r->bulan] = ['bulan' => $r->bulan, 'dpp_jual' => 0, 'ppn_keluaran' => 0, 'dpp_beli' => 0, 'ppn_masukan' => 0];
                $bulanData[$r->bulan]['dpp_beli']     += $dpp;
                $bulanData[$r->bulan]['ppn_masukan']  += $pvn;
            });

        ksort($bulanData);
        $rows = array_values(array_map(function ($r) {
            $r['kurang_bayar'] = $r['ppn_keluaran'] - $r['ppn_masukan'];
            return $r;
        }, $bulanData));

        // PPN Masukan dari migrasi (barang_masuk sumber='Saldo Awal', dibuat
        // oleh HppService::generateSaldoAwalPersediaan() / tombol "Jalankan
        // Deteksi Otomatis"). SENGAJA TIDAK digabung ke $rows/$bulanData di
        // atas (yang berbasis trx_beli per-bulan) — baris migrasi ini ditanggali
        // "1 hari sebelum transaksi pertama" (tanggal teknis migrasi), BUKAN
        // tanggal faktur pajak asli, jadi kalau dicampur ke bulan tertentu akan
        // salah taruh masa pajak untuk keperluan SPT Masa PPN/Coretax. Ditampilkan
        // terpisah sebagai satu ringkasan, biar user yang putuskan mau
        // diperhitungkan atau tidak (lihat catatan di migration
        // add_sumber_barang_masuk_dan_coa_saldo_awal soal risiko klaim ganda
        // kalau PPN ini sudah pernah dikreditkan di SPT jaman sistem lama).
        $migrasiQ = DB::table('barang_masuk')->where('sumber', 'Saldo Awal');
        if ($cabang) $migrasiQ->where('cabang', $cabang);
        $migrasi = $migrasiQ->selectRaw(
            'COUNT(*) as jumlah_baris, COALESCE(SUM(qty*harga_beli),0) as total_dpp, COALESCE(SUM(ppn_masukan),0) as total_ppn_masukan'
        )->first();

        return response()->json([
            'data' => $rows,
            'tarif' => $tarif * 100,
            'migrasi_saldo_awal' => [
                'jumlah_baris'      => (int) $migrasi->jumlah_baris,
                'total_dpp'         => round((float) $migrasi->total_dpp, 2),
                'total_ppn_masukan' => round((float) $migrasi->total_ppn_masukan, 2),
            ],
        ]);
    }

    // ─── PPh FINAL 0,5% (PP 55/2022, disesuaikan PP 20/2026) ───────────────
    // Dasar (DPP) PPh Final = peredaran bruto/Omset SEBULAN, TIDAK termasuk
    // PPN Keluaran (baris Kena PPN dibagi 1+tarif dulu; baris Non-PPN dipakai
    // apa adanya) — dan TIDAK dikurangi HPP sama sekali (beda dgn Laba Kotor).
    // Jatuh tempo SETOR: tanggal 15 bulan berikutnya (lebih dulu drpd PPN yg
    // jatuh tempo akhir bulan berikutnya).
    //
    // `bentuk_usaha` (Settings) menentukan 2 hal, sesuai PP 20/2026:
    //   - 'WP Orang Pribadi'   → tarif 0,5% + fasilitas bebas pajak Rp500jt
    //                             pertama/tahun (kumulatif sejak Januari)
    //   - 'PT Perorangan' / 'Koperasi' → tarif 0,5%, TANPA fasilitas Rp500jt
    //   - 'CV/Firma/PT Biasa'  → SUDAH TIDAK BOLEH pakai 0,5% sejak 22 Apr
    //     2026 (PP 20/2026) — wajib pindah ke PPh Badan tarif umum 22% dari
    //     Laba Kena Pajak (perlu koreksi fiskal, TIDAK dihitung otomatis di
    //     sini krn butuh data yg tidak dicatat aplikasi ini — cukup diberi
    //     peringatan, konsultasikan ke konsultan pajak).
    //
    // PENTING: ini alat bantu hitung, BUKAN pengganti konsultan pajak. Selalu
    // cross-check status PKP, bentuk usaha, & threshold Rp4,8 miliar/tahun ke
    // AR pajak/konsultan sebelum setor.
    public function rekapPphFinal(Request $request)
    {
        $cabang = $request->get('cabang');
        $tahun  = (int) $request->get('tahun', now()->year);
        $tarifPpn = $this->getTarif();
        $tarifPph = 0.005; // 0,5%, tetap sesuai PP 55/2022 & PP 20/2026

        $bentukUsaha = DB::table('settings')->where('key', 'bentuk_usaha')->value('value') ?? 'WP Orang Pribadi';
        $bolehTarifFinal = in_array($bentukUsaha, ['WP Orang Pribadi', 'PT Perorangan', 'Koperasi']);
        $dapatFasilitasBebas = $bentukUsaha === 'WP Orang Pribadi';
        $batasBebasSetahun = 500_000_000; // Rp500 juta/tahun, khusus WP OP, Pasal 60 ayat (2) PP 55/2022

        $q = DB::table('trx_jual')
            ->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
            ->whereRaw('YEAR(tgl) = ?', [$tahun]);
        if ($cabang) $q->where('trx_jual.cabang', $cabang);
        $rows = $q->selectRaw("MONTH(tgl) as bulan, COALESCE(trx_jual.ppn, barang.ppn) as ppn, SUM(qty * trx_jual.harga - COALESCE(trx_jual.diskon,0)) as total")
            ->groupBy('bulan', 'ppn')->get();

        $omzetBulan = array_fill(1, 12, 0.0);
        foreach ($rows as $r) {
            $bulan = (int) $r->bulan;
            $kena = $r->ppn === 'Kena PPN';
            $dpp = $kena ? $r->total / (1 + $tarifPpn) : $r->total;
            $omzetBulan[$bulan] += $dpp;
        }

        $kumulatif = 0.0;
        $hasil = [];
        for ($b = 1; $b <= 12; $b++) {
            $omzet = round($omzetBulan[$b], 2);
            $kumulatifSebelum = $kumulatif;
            $kumulatif += $omzet;

            $omzetKenaPajak = $omzet;
            if ($dapatFasilitasBebas) {
                // Bagian yg MASIH di bawah sisa jatah Rp500jt kumulatif tahun
                // ini bebas pajak; hanya kelebihannya (kalau ada) yg kena 0,5%.
                $sisaJatah = max(0, $batasBebasSetahun - $kumulatifSebelum);
                $omzetKenaPajak = max(0, $omzet - $sisaJatah);
            }

            $pphTerutang = $bolehTarifFinal ? round($omzetKenaPajak * $tarifPph, 2) : null;

            $hasil[] = [
                'bulan'            => sprintf('%04d-%02d', $tahun, $b),
                'omzet'            => $omzet,
                'omzet_kumulatif'  => round($kumulatif, 2),
                'omzet_bebas_pajak' => $dapatFasilitasBebas ? round($omzet - $omzetKenaPajak, 2) : 0,
                'omzet_kena_pajak' => round($omzetKenaPajak, 2),
                'pph_terutang'     => $pphTerutang,
                'jatuh_tempo_setor' => sprintf('%04d-%02d-15', $b === 12 ? $tahun + 1 : $tahun, $b === 12 ? 1 : $b + 1),
            ];
        }

        return response()->json([
            'data'                  => $hasil,
            'tarif_pph'             => $tarifPph * 100,
            'bentuk_usaha'          => $bentukUsaha,
            'boleh_tarif_final'     => $bolehTarifFinal,
            'dapat_fasilitas_bebas' => $dapatFasilitasBebas,
            'batas_bebas_setahun'   => $batasBebasSetahun,
            'peringatan'            => $bolehTarifFinal ? null :
                "Bentuk usaha '{$bentukUsaha}' sudah tidak dapat memakai tarif PPh Final 0,5% sejak PP 20/2026 (22 April 2026) — wajib pakai PPh Badan tarif umum 22% dari Laba Kena Pajak (perlu koreksi fiskal, tidak dihitung otomatis di sini). Konsultasikan ke konsultan pajak.",
        ]);
    }

    // ─── AUDIT TRAIL / DRILL-DOWN ───────────────────────────────────────────
    // Dipakai supaya SETIAP angka di Neraca Saldo, Laba Rugi & Neraca bisa
    // diklik dan menampilkan rincian transaksi yang membentuknya. Sengaja
    // memanggil ulang buildJurnal() dengan filter cabang/dari/sampai yang
    // PERSIS SAMA dengan yang dipakai neracaSaldo()/labaRugi()/neraca() —
    // supaya total yang muncul di modal drill-down ini DIJAMIN identik
    // dengan angka yang diklik di laporan (satu mesin hitung, satu sumber
    // kebenaran, tidak mungkin selisih / tidak sinkron).
    public function akunTrace(Request $request)
    {
        $kode   = $request->get('kode_akun');
        $cabang = $request->get('cabang');
        $dari   = $request->get('dari');
        $sampai = $request->get('sampai');

        $akun = DB::table('coa')->where('kode', $kode)->first();
        $jurnal = $this->buildJurnal($cabang, $dari, $sampai);
        $coaMap = DB::table('coa')->pluck('nama', 'kode');

        $rows = array_values(array_filter($jurnal, fn($j) => $j['akun'] === $kode));
        usort($rows, fn($a, $b) => strcmp($a['tgl'] . $a['ref'], $b['tgl'] . $b['ref']));

        $kumulatif = 0;
        foreach ($rows as &$r) {
            $r['nama_akun'] = $coaMap[$r['akun']] ?? $r['akun'];
            $kumulatif += $akun && $akun->normal === 'D' ? ($r['D'] - $r['K']) : ($r['K'] - $r['D']);
            $r['kumulatif'] = $kumulatif;
        }
        unset($r);

        $totD = array_sum(array_column($rows, 'D'));
        $totK = array_sum(array_column($rows, 'K'));

        return response()->json([
            'akun'     => $akun,
            'data'     => $rows,
            'total_D'  => $totD,
            'total_K'  => $totK,
            'saldo'    => $kumulatif,
            'jml_transaksi' => count($rows),
        ]);
    }

    // Bentukan jurnal lengkap (semua baris debit/kredit) dari SATU referensi
    // transaksi (mis. TXJ-20260811-1497), dipakai saat baris di modal
    // akun-trace / rekap-ppn-detail diklik untuk "menelusuri" lebih dalam.
    // Sengaja buildJurnal(cabang) TANPA batas tanggal — referensi transaksi
    // harus selalu ketemu biar-pun di luar rentang periode laporan yang
    // sedang aktif dilihat.
    public function bentukanRef(Request $request)
    {
        $ref    = $request->get('ref');
        $cabang = $request->get('cabang');
        $jurnal = $this->buildJurnal($cabang);
        $coaMap = DB::table('coa')->pluck('nama', 'kode');

        $rows = array_values(array_filter($jurnal, fn($j) => $j['ref'] === $ref));
        foreach ($rows as &$r) $r['nama_akun'] = $coaMap[$r['akun']] ?? $r['akun'];
        unset($r);

        $totD = array_sum(array_column($rows, 'D'));
        $totK = array_sum(array_column($rows, 'K'));

        return response()->json([
            'ref'      => $ref,
            'data'     => $rows,
            'total_D'  => $totD,
            'total_K'  => $totK,
            'seimbang' => abs($totD - $totK) < 2,
        ]);
    }

    // Rincian transaksi mentah (bukan dari jurnal, langsung dari trx_jual/
    // trx_beli) yang membentuk 1 sel di Rekap PPN — dipakai karena Rekap
    // PPN dihitung langsung dari tabel transaksi (bukan lewat buildJurnal),
    // supaya tetap bisa ditelusuri sampai baris nota aslinya.
    public function rekapPpnDetail(Request $request)
    {
        $bulan  = $request->get('bulan');   // format 'Y-m'
        $jenis  = $request->get('jenis');   // 'jual' | 'beli'
        $cabang = $request->get('cabang');
        $tarif  = $this->getTarif();

        if ($jenis === 'beli') {
            $q = DB::table('trx_beli')->join('barang', 'trx_beli.kode_barang', '=', 'barang.kode')
                ->whereRaw("COALESCE(trx_beli.ppn, barang.ppn) = ?", ['Kena PPN'])
                ->whereRaw("DATE_FORMAT(trx_beli.tgl, '%Y-%m') = ?", [$bulan]);
            if ($cabang) $q->where('trx_beli.cabang', $cabang);
            $rows = $q->select(
                'trx_beli.id', 'trx_beli.tgl', 'trx_beli.cabang', 'trx_beli.no_nota',
                'barang.nama as nama_barang', 'trx_beli.qty', 'trx_beli.harga',
                DB::raw('(trx_beli.qty * trx_beli.harga - COALESCE(trx_beli.diskon,0)) as total')
            )->orderBy('trx_beli.tgl')->get();
        } else {
            $q = DB::table('trx_jual')->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
                ->whereRaw("COALESCE(trx_jual.ppn, barang.ppn) = ?", ['Kena PPN'])
                ->whereRaw("DATE_FORMAT(trx_jual.tgl, '%Y-%m') = ?", [$bulan]);
            if ($cabang) $q->where('trx_jual.cabang', $cabang);
            // CATATAN: sengaja TIDAK mengurangi diskon di sini — samakan persis
            // dengan formula agregat di rekapPpn() (SUM(qty*harga) tanpa diskon
            // untuk Penjualan), supaya total baris-baris ini kalau dijumlah
            // PASTI sama dengan angka DPP/PPN Keluaran yang diklik di tabel.
            $rows = $q->select(
                'trx_jual.id', 'trx_jual.tgl', 'trx_jual.cabang', 'trx_jual.no_nota',
                'barang.nama as nama_barang', 'trx_jual.qty', 'trx_jual.harga',
                DB::raw('(trx_jual.qty * trx_jual.harga) as total')
            )->orderBy('trx_jual.tgl')->get();
        }

        $prefix = $jenis === 'beli' ? 'PB-' : 'PJ-';
        $rows = $rows->map(function ($r) use ($tarif, $prefix) {
            $tot = (float) $r->total;
            $dpp = $tot / (1 + $tarif);
            $r->dpp = round($dpp);
            $r->ppn_nilai = round($tot - $dpp);
            $r->ref = $r->no_nota ?: ($prefix . $r->id);
            return $r;
        });

        $totDpp = round($rows->sum('dpp'));
        $totPpn = round($rows->sum('ppn_nilai'));

        return response()->json([
            'data'     => $rows->values(),
            'total_dpp'=> $totDpp,
            'total_ppn'=> $totPpn,
            'tarif'    => $tarif * 100,
        ]);
    }

    public function analisisCabang(Request $request)
    {
        $bulanIni = Carbon::now()->format('Y-m');
        $dari   = $request->get('dari');
        $sampai = $request->get('sampai');
        // Filter/cut-off tanggal (opsional): kosong = semua waktu. Berlaku untuk
        // Omzet, Pembelian, Biaya (pengeluaran), HPP, Margin & jumlah transaksi.
        $tgl = function ($q, string $col) use ($dari, $sampai) {
            if ($dari)   $q->where($col, '>=', $dari);
            if ($sampai) $q->where($col, '<=', $sampai);
            return $q;
        };
        $cabangList = DB::table('cabang')->get();

        $result = $cabangList->map(function ($c) use ($bulanIni, $tgl) {
            $omzet = $tgl(DB::table('trx_jual')->where('cabang', $c->nama), 'tgl')
                ->selectRaw('SUM(qty * harga) as total')->value('total') ?? 0;
            $omzetBulan = DB::table('trx_jual')->where('cabang', $c->nama)
                ->whereRaw("DATE_FORMAT(tgl, '%Y-%m') = ?", [$bulanIni])
                ->selectRaw('SUM(qty * harga) as total')->value('total') ?? 0;
            $beli = $tgl(DB::table('trx_beli')->where('cabang', $c->nama), 'tgl')
                ->selectRaw('SUM(qty * harga - COALESCE(diskon,0)) as total')->value('total') ?? 0;
            $biaya = $tgl(DB::table('trx_biaya')->where('cabang', $c->nama), 'tgl')
                ->selectRaw('SUM(nominal) as total')->value('total') ?? 0;
            $trxCount = $tgl(DB::table('trx_jual')->where('cabang', $c->nama), 'tgl')->count();

            // HPP — dihitung dari SEMUA penjualan (leftJoin), bukan cuma barang
            // yang modalnya sudah diisi (> 0), supaya margin tidak keliru tinggi.
            // HPP dari Kartu HPP (hanya dari pembelian) — bukan barang.modal.
            $hpp = $tgl(DB::table('hpp_kartu')
                ->where('ref_tabel', 'trx_jual')
                ->where('cabang', $c->nama), 'tgl')
                ->selectRaw('COALESCE(SUM(nilai_keluar),0) as total')->value('total') ?? 0;

            return [
                'nama'         => $c->nama,
                'omzet'        => (float)$omzet,
                'omzet_bulan'  => (float)$omzetBulan,
                'beli_total'   => (float)$beli,
                'biaya_total'  => (float)$biaya,
                'hpp'          => (float)$hpp,
                'margin'       => (float)$omzet - (float)$hpp,
                'trx_count'    => $trxCount,
            ];
        });

        return response()->json(['data' => $result]);
    }

    /**
     * ANALISIS KASIR & SHIFT — penjualan & laba per shift, per kasir, per cabang,
     * total per cabang, dan total semua cabang.
     *
     * Rumus SAMA dengan Jurnal/Laba Rugi (lihat buildJurnal): nilai baris =
     * qty × harga − diskon (sudah termasuk PPN bila Kena PPN); DPP = nilai /
     * (1+tarif) kalau Kena PPN (override baris diutamakan, lalu Master Barang);
     * HPP dari Kartu HPP (hanya dari pembelian; belum ada pembelian = 0);
     * Laba = DPP − HPP. Filter: ?dari=&sampai=&cabang= (semua opsional).
     * Pengelompokan: cabang → shift (Pagi/Siang/Sehari) → kasir. Baris tanpa kasir
     * (transaksi lama/manual) masuk "(tanpa kasir)".
     */
    public function analisisKasir(Request $request)
    {
        $dari = $request->get('dari'); $sampai = $request->get('sampai'); $cabang = $request->get('cabang');
        $tarif = $this->getTarif();
        $adaKolom = \Illuminate\Support\Facades\Schema::hasColumn('trx_jual', 'kasir')
            && \Illuminate\Support\Facades\Schema::hasColumn('trx_jual', 'shift');

        $q = DB::table('trx_jual')->leftJoin('barang', 'trx_jual.kode_barang', '=', 'barang.kode');
        if ($cabang) $q->where('trx_jual.cabang', $cabang);
        if ($dari)   $q->where('trx_jual.tgl', '>=', $dari);
        if ($sampai) $q->where('trx_jual.tgl', '<=', $sampai);
        $kolom = ['trx_jual.id', 'trx_jual.cabang', 'trx_jual.no_nota', 'trx_jual.qty', 'trx_jual.harga', 'trx_jual.diskon',
                  'trx_jual.ppn', 'barang.ppn as ppn_master', 'barang.modal'];
        if ($adaKolom) { $kolom[] = 'trx_jual.kasir'; $kolom[] = 'trx_jual.shift'; }
        $rows = $q->select($kolom)->orderBy('trx_jual.id')->get();

        $hppMap = app(\App\Services\HppService::class)->hppMapUntukJurnal('trx_jual', $rows->pluck('id')->all());

        $nol = fn() => ['struk' => 0, 'baris' => 0, 'penjualan' => 0.0, 'dpp' => 0.0, 'hpp' => 0.0, 'laba' => 0.0, 'baris_tanpa_hpp' => 0];
        $tree = [];       // cabang → shift → kasir → ringkasan
        $notaSet = [];    // untuk menghitung struk unik per kasir
        $total = $nol(); $notaTotal = [];

        foreach ($rows as $t) {
            $kena = ($t->ppn ?: $t->ppn_master) === 'Kena PPN';
            $tot  = (float) $t->qty * (float) $t->harga - (float) ($t->diskon ?? 0);
            $dpp  = $kena ? $tot / (1 + $tarif) : $tot;
            $hpp  = (float) ($hppMap[$t->id] ?? 0);

            $kasir = $adaKolom && $t->kasir ? $t->kasir : '(tanpa kasir)';
            $shift = $adaKolom && $t->shift ? $t->shift : ($adaKolom && $t->kasir ? \App\Services\KasirAkunService::shift($t->kasir) : '(tanpa shift)');
            $cab   = $t->cabang;
            $nota  = $t->no_nota ?: ('PJ-' . $t->id);

            $node = &$tree[$cab][$shift][$kasir];
            if (!$node) $node = $nol();
            $node['baris']++; $node['penjualan'] += $tot; $node['dpp'] += $dpp; $node['hpp'] += $hpp; $node['laba'] += $dpp - $hpp;
            if ($hpp <= 0) $node['baris_tanpa_hpp']++;
            $notaSet[$cab][$shift][$kasir][$nota] = true;
            unset($node);

            $total['baris']++; $total['penjualan'] += $tot; $total['dpp'] += $dpp; $total['hpp'] += $hpp; $total['laba'] += $dpp - $hpp;
            if ($hpp <= 0) $total['baris_tanpa_hpp']++;
            $notaTotal[$cab . '|' . $nota] = true;
        }
        $total['struk'] = count($notaTotal);

        $jumlah = function (array $a, array $b): array {
            foreach (['struk', 'baris', 'penjualan', 'dpp', 'hpp', 'laba', 'baris_tanpa_hpp'] as $k) $a[$k] += $b[$k];
            return $a;
        };
        $bulat = fn(array $z) => array_map(fn($v) => is_float($v) ? round($v, 2) : $v, $z);

        $urutCabang = DB::table('cabang')->pluck('nama')->all();
        $urutShift  = ['Pagi', 'Siang', 'Sehari', '(tanpa shift)'];
        uksort($tree, fn($a, $b) => (array_search($a, $urutCabang) === false ? 999 : array_search($a, $urutCabang)) <=> (array_search($b, $urutCabang) === false ? 999 : array_search($b, $urutCabang)));

        $perCabang = []; $perShift = [];
        foreach ($tree as $cab => $shifts) {
            uksort($shifts, fn($a, $b) => array_search($a, $urutShift) <=> array_search($b, $urutShift));
            $cabTot = $nol(); $shiftList = [];
            foreach ($shifts as $sh => $kasirs) {
                ksort($kasirs);
                $shTot = $nol(); $kasirList = [];
                foreach ($kasirs as $ks => $z) {
                    $z['struk'] = count($notaSet[$cab][$sh][$ks] ?? []);
                    $kasirList[] = ['kasir' => $ks] + $bulat($z);
                    $shTot = $jumlah($shTot, $z);
                }
                // struk unik per shift (gabungan nota semua kasir pada shift ini)
                $notaShift = [];
                foreach ($kasirs as $ks => $_) foreach (($notaSet[$cab][$sh][$ks] ?? []) as $nk => $__) $notaShift[$nk] = true;
                $shTot['struk'] = count($notaShift);
                $shiftList[] = ['shift' => $sh, 'total' => $bulat($shTot), 'kasir' => $kasirList];
                $cabTot = $jumlah($cabTot, $shTot);
                $perShift[$sh] = isset($perShift[$sh]) ? $jumlah($perShift[$sh], $shTot) : $shTot;
            }
            $perCabang[] = ['cabang' => $cab, 'total' => $bulat($cabTot), 'shift' => $shiftList];
        }
        $perShiftOut = [];
        foreach ($urutShift as $sh) if (isset($perShift[$sh])) $perShiftOut[] = ['shift' => $sh, 'total' => $bulat($perShift[$sh])];

        return response()->json([
            'dari' => $dari, 'sampai' => $sampai, 'cabang' => $cabang,
            'ada_kolom' => $adaKolom, 'tarif' => $tarif,
            'total' => $bulat($total),
            'per_cabang' => $perCabang,
            'per_shift' => $perShiftOut,
        ]);
    }

    public function analisisTren(Request $request)
    {
        $cabang = $request->get('cabang');
        $months = [];
        for ($i = 11; $i >= 0; $i--) {
            $m = Carbon::now()->subMonths($i)->format('Y-m');
            $qJ = DB::table('trx_jual');
            if ($cabang) $qJ->where('cabang', $cabang);
            $jual  = $qJ->whereRaw("DATE_FORMAT(tgl,'%Y-%m')=?", [$m])->selectRaw('SUM(qty*harga) as t')->value('t') ?? 0;
            $qB = DB::table('trx_beli');
            if ($cabang) $qB->where('cabang', $cabang);
            $beli  = $qB->whereRaw("DATE_FORMAT(tgl,'%Y-%m')=?", [$m])->selectRaw('SUM(qty*harga - COALESCE(diskon,0)) as t')->value('t') ?? 0;
            $qBx = DB::table('trx_biaya');
            if ($cabang) $qBx->where('cabang', $cabang);
            $biaya = $qBx->whereRaw("DATE_FORMAT(tgl,'%Y-%m')=?", [$m])->selectRaw('SUM(nominal) as t')->value('t') ?? 0;
            // leftJoin + COALESCE: sama seperti di analisisCabang, supaya barang
            // yang harga modalnya belum diisi tidak membuat margin keliru 100%.
            // HPP dari Kartu HPP (hanya dari pembelian), bukan barang.modal.
            $qH = DB::table('hpp_kartu')->where('ref_tabel', 'trx_jual');
            if ($cabang) $qH->where('cabang', $cabang);
            $hpp   = $qH->whereRaw("DATE_FORMAT(tgl,'%Y-%m')=?", [$m])->selectRaw('COALESCE(SUM(nilai_keluar),0) as t')->value('t') ?? 0;
            $months[] = ['bulan' => $m, 'jual' => (float)$jual, 'beli' => (float)$beli, 'biaya' => (float)$biaya, 'hpp' => (float)$hpp, 'laba' => (float)$jual - (float)$hpp - (float)$biaya];
        }
        return response()->json(['data' => $months]);
    }

    public function analisisMargin(Request $request)
    {
        $cabang = $request->get('cabang');

        // HPP per barang dari Kartu HPP (hanya dari pembelian) — bukan barang.modal.
        $hppPerBarang = DB::table('hpp_kartu')->where('ref_tabel', 'trx_jual')
            ->when($cabang, fn($q) => $q->where('cabang', $cabang))
            ->groupBy('kode_barang')
            ->selectRaw('kode_barang, SUM(nilai_keluar) as hpp')
            ->pluck('hpp', 'kode_barang');

        $q = DB::table('trx_jual')->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode');
        if ($cabang) $q->where('trx_jual.cabang', $cabang);
        $stats = $q->selectRaw('barang.kode, barang.nama, barang.ppn, SUM(trx_jual.qty) as total_qty, SUM(trx_jual.qty * trx_jual.harga) as omzet')
            ->groupBy('barang.kode', 'barang.nama', 'barang.ppn')
            ->get()
            ->map(function ($r) use ($hppPerBarang) {
                $r->hpp   = (float) ($hppPerBarang[$r->kode] ?? 0);
                $r->modal = $r->total_qty > 0 ? round($r->hpp / $r->total_qty, 2) : 0;
                return $r;
            })
            ->filter(fn($r) => $r->hpp > 0)   // belum ada pembelian → tidak dihitung margin
            ->map(function ($r) {
                $margin    = $r->omzet - $r->hpp;
                $marginPct = $r->omzet > 0 ? round($margin / $r->omzet * 100, 1) : 0;
                return array_merge((array)$r, ['margin' => $margin, 'margin_pct' => $marginPct]);
            })->sortByDesc('margin_pct')->values();

        return response()->json(['data' => $stats]);
    }
}
