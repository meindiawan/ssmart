<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// ─── KONTAK ─────────────────────────────────────────────────────────────────
// Buku alamat terpadu: semua nama karyawan, pelanggan, supplier (dan kontak
// bebas "Lainnya") dikumpulkan di satu tempat. Setiap kontak, saat diklik,
// menampilkan riwayat lengkap (kasbon/cashbon/pembelian kredit sesuai
// tipenya) DITAMBAH catatan bebas dari tabel `kontak_catatan` — dipakai
// untuk mencatat hal yang tidak otomatis kebaca dari transaksi lain,
// misalnya "kurang bayar Rp50.000" atau piutang/hutang di luar sistem.
//
// Konvensi saldo: POSITIF = kontak itu berhutang ke kita (piutang kita),
// NEGATIF = kita berhutang ke kontak itu (hutang kita) — sama seperti
// konvensi saldo Kasbon & Cashbon yang sudah ada.
class KontakController extends Controller
{
    // Ringkasan saldo catatan manual (kontak_catatan) untuk satu kontak,
    // dipisah jadi komponen piutang & hutang.
    private function saldoCatatan(string $tipe, string $nama): array
    {
        $rows = DB::table('kontak_catatan')->where('tipe', $tipe)->where('nama', $nama)->get();
        $piutang = 0; $hutang = 0;
        foreach ($rows as $r) {
            $nom = (float) ($r->nominal ?? 0);
            if ($r->jenis === 'Piutang')       $piutang += $nom;
            if ($r->jenis === 'Bayar Piutang') $piutang -= $nom;
            if ($r->jenis === 'Hutang')        $hutang  += $nom;
            if ($r->jenis === 'Bayar Hutang')  $hutang  -= $nom;
        }
        return ['piutang' => $piutang, 'hutang' => $hutang];
    }

    public function index(Request $request)
    {
        $search = trim((string) $request->get('search', ''));
        $tipeFilter = $request->get('tipe'); // opsional: Karyawan|Pelanggan|Supplier|Lainnya
        $result = [];

        // ── Karyawan ─────────────────────────────────────────────────────
        if (!$tipeFilter || $tipeFilter === 'Karyawan') {
            $karyawan = DB::table('karyawan')->orderBy('nama')->get();
            $kasbonSaldo = DB::table('trx_kasbon')
                ->selectRaw("karyawan_id, SUM(CASE WHEN jenis='Diberikan' THEN nominal ELSE -nominal END) as saldo")
                ->whereNotNull('karyawan_id')->groupBy('karyawan_id')->pluck('saldo', 'karyawan_id');

            foreach ($karyawan as $k) {
                $catatan = $this->saldoCatatan('Karyawan', $k->nama);
                $piutang = (float) ($kasbonSaldo[$k->id] ?? 0) + $catatan['piutang'];
                $hutang  = $catatan['hutang'];
                $result[] = [
                    'tipe' => 'Karyawan', 'nama' => $k->nama, 'kode' => $k->kode ?? null,
                    'telp' => $k->telp ?? null, 'alamat' => $k->alamat ?? null,
                    'saldo' => $piutang - $hutang, 'piutang' => $piutang, 'hutang' => $hutang,
                ];
            }
        }

        // ── Pelanggan ────────────────────────────────────────────────────
        if (!$tipeFilter || $tipeFilter === 'Pelanggan') {
            $pelanggan = DB::table('pelanggan')->orderBy('nama')->get();
            $namaTerdaftar = $pelanggan->pluck('nama')->map(fn($n) => mb_strtolower(trim($n)))->all();

            $cashbonSaldo = DB::table('trx_cashbon')
                ->selectRaw("nama_pelanggan, SUM(CASE WHEN jenis='Diberikan' THEN nominal ELSE -nominal END) as saldo")
                ->groupBy('nama_pelanggan')->pluck('saldo', 'nama_pelanggan');

            // Total pembelian per pelanggan (dari Penjualan yang tertaut lewat kode pelanggan)
            $beliPerKode = $this->ringkasBeliPerPelanggan();

            foreach ($pelanggan as $p) {
                $catatan = $this->saldoCatatan('Pelanggan', $p->nama);
                $piutang = (float) ($cashbonSaldo[$p->nama] ?? 0) + $catatan['piutang'];
                $hutang  = $catatan['hutang'];
                $beli    = $beliPerKode[$p->kode] ?? null;
                $result[] = [
                    'tipe' => 'Pelanggan', 'nama' => $p->nama, 'kode' => $p->kode ?? null,
                    'telp' => $p->telp ?? null, 'alamat' => $p->alamat ?? null,
                    'saldo' => $piutang - $hutang, 'piutang' => $piutang, 'hutang' => $hutang,
                    'total_beli'    => $beli ? (float) $beli->total : 0,
                    'jml_nota'      => $beli ? (int) $beli->jml_nota : 0,
                    'terakhir_beli' => $beli->terakhir ?? null,
                ];
            }

            // Pelanggan yang cuma tercatat lewat Cashbon (nama bebas, belum masuk Master Pelanggan)
            foreach ($cashbonSaldo->keys() as $nama) {
                if (in_array(mb_strtolower(trim($nama)), $namaTerdaftar)) continue;
                $catatan = $this->saldoCatatan('Pelanggan', $nama);
                $piutang = (float) $cashbonSaldo[$nama] + $catatan['piutang'];
                $hutang  = $catatan['hutang'];
                $result[] = [
                    'tipe' => 'Pelanggan', 'nama' => $nama, 'kode' => null,
                    'telp' => null, 'alamat' => null,
                    'saldo' => $piutang - $hutang, 'piutang' => $piutang, 'hutang' => $hutang,
                ];
                $namaTerdaftar[] = mb_strtolower(trim($nama));
            }

            // Kontak "Umum": penjualan yang tidak tertaut ke pelanggan mana pun (pelanggan kosong).
            $statUmum = DB::table('trx_jual')
                ->where(fn($w) => $w->whereNull('pelanggan')->orWhere('pelanggan', ''))
                ->selectRaw("COUNT(DISTINCT COALESCE(no_nota, CONCAT('#', id))) as jml_nota, SUM(qty*harga - COALESCE(diskon,0)) as total, MAX(tgl) as terakhir")
                ->first();
            $this->gabungUmum($result, 'Pelanggan', $statUmum, 0);
        }

        // ── Supplier ─────────────────────────────────────────────────────
        // HUTANG hanya dari pembelian Kredit (+ catatan manual). Tapi RIWAYAT
        // PEMBELIAN (total, jumlah faktur, terakhir beli) dihitung dari SEMUA
        // pembelian supplier ini — tunai maupun kredit — supaya supplier yang
        // dibayar tunai (mis. "UANG PAS") tetap muncul & bisa dilihat riwayatnya.
        if (!$tipeFilter || $tipeFilter === 'Supplier') {
            $supplier = DB::table('supplier')->orderBy('nama')->get();
            $namaTerdaftar = $supplier->pluck('nama')->map(fn($n) => mb_strtolower(trim($n)))->all();

            $hutangBeli = DB::table('trx_beli')
                ->where('bayar', 'Kredit')->whereNotNull('supplier')
                ->selectRaw('supplier, SUM(qty*harga - COALESCE(diskon,0)) as total')
                ->groupBy('supplier')->pluck('total', 'supplier');

            $beliPerSupplier = $this->ringkasBeliPerSupplier();

            foreach ($supplier as $s) {
                $catatan = $this->saldoCatatan('Supplier', $s->nama);
                $hutang  = (float) ($hutangBeli[$s->nama] ?? 0) + $catatan['hutang'];
                $piutang = $catatan['piutang'];
                $beli    = $beliPerSupplier[$s->nama] ?? null;
                $result[] = [
                    'tipe' => 'Supplier', 'nama' => $s->nama, 'kode' => null,
                    'telp' => $s->telp ?? null, 'alamat' => $s->alamat ?? null,
                    'saldo' => $piutang - $hutang, 'piutang' => $piutang, 'hutang' => $hutang,
                    'total_beli'    => $beli ? (float) $beli->total : 0,
                    'jml_nota'      => $beli ? (int) $beli->jml_nota : 0,
                    'terakhir_beli' => $beli->terakhir ?? null,
                ];
            }

            // Supplier yang cuma muncul di transaksi pembelian (belum ada di Master
            // Supplier) — sebelumnya hanya yang punya pembelian Kredit.
            foreach ($beliPerSupplier->keys() as $nama) {
                if (in_array(mb_strtolower(trim($nama)), $namaTerdaftar)) continue;
                $catatan = $this->saldoCatatan('Supplier', $nama);
                $hutang  = (float) ($hutangBeli[$nama] ?? 0) + $catatan['hutang'];
                $piutang = $catatan['piutang'];
                $beli    = $beliPerSupplier[$nama];
                $result[] = [
                    'tipe' => 'Supplier', 'nama' => $nama, 'kode' => null,
                    'telp' => null, 'alamat' => null,
                    'saldo' => $piutang - $hutang, 'piutang' => $piutang, 'hutang' => $hutang,
                    'total_beli'    => (float) $beli->total,
                    'jml_nota'      => (int) $beli->jml_nota,
                    'terakhir_beli' => $beli->terakhir ?? null,
                ];
                $namaTerdaftar[] = mb_strtolower(trim($nama));
            }

            // Kontak "Umum": pembelian yang tidak punya supplier (supplier kosong). Yang Kredit
            // tetap dihitung sebagai hutang supaya tidak hilang dari pembukuan.
            $qUmum = fn() => DB::table('trx_beli')->where(fn($w) => $w->whereNull('supplier')->orWhere('supplier', ''));
            $statUmum = $qUmum()
                ->selectRaw("COUNT(DISTINCT COALESCE(no_nota, CONCAT('#', id))) as jml_nota, SUM(qty*harga - COALESCE(diskon,0)) as total, MAX(tgl) as terakhir")
                ->first();
            $hutangUmum = (float) ($qUmum()->where('bayar', 'Kredit')->selectRaw('SUM(qty*harga - COALESCE(diskon,0)) as total')->value('total') ?? 0);
            $this->gabungUmum($result, 'Supplier', $statUmum, $hutangUmum);
        }

        // ── Lainnya (murni dari catatan manual) ─────────────────────────
        if (!$tipeFilter || $tipeFilter === 'Lainnya') {
            $namaLain = DB::table('kontak_catatan')->where('tipe', 'Lainnya')->distinct()->pluck('nama');
            foreach ($namaLain as $nama) {
                $catatan = $this->saldoCatatan('Lainnya', $nama);
                $result[] = [
                    'tipe' => 'Lainnya', 'nama' => $nama, 'kode' => null,
                    'telp' => null, 'alamat' => null,
                    'saldo' => $catatan['piutang'] - $catatan['hutang'],
                    'piutang' => $catatan['piutang'], 'hutang' => $catatan['hutang'],
                ];
            }
        }

        if ($search !== '') {
            $needle = mb_strtolower($search);
            $result = array_values(array_filter($result, fn($r) => str_contains(mb_strtolower($r['nama']), $needle)));
        }

        usort($result, fn($a, $b) => strcmp($a['nama'], $b['nama']));

        return response()->json([
            'data'  => $result,
            'ringkasan' => [
                'total_kontak'    => count($result),
                'total_piutang'   => array_sum(array_column($result, 'piutang')),
                'total_hutang'    => array_sum(array_column($result, 'hutang')),
                'kurang_bayar'    => count(array_filter($result, fn($r) => $r['saldo'] != 0)),
                'total_pembelian' => array_sum(array_column(array_filter($result, fn($r) => $r['tipe'] === 'Pelanggan' && empty($r['umum'])), 'total_beli')),
                'total_pembelian_supplier' => array_sum(array_column(array_filter($result, fn($r) => $r['tipe'] === 'Supplier' && empty($r['umum'])), 'total_beli')),
            ],
        ]);
    }

    // Ringkasan pembelian per KODE pelanggan dari trx_jual: jumlah nota, total (qty×harga − diskon),
    // dan tanggal pembelian terakhir. Baris tanpa no_nota dihitung 1 nota sendiri-sendiri.
    private function ringkasBeliPerPelanggan()
    {
        return DB::table('trx_jual')
            ->whereNotNull('pelanggan')->where('pelanggan', '!=', '')
            ->selectRaw("pelanggan, COUNT(DISTINCT COALESCE(no_nota, CONCAT('#', id))) as jml_nota, SUM(qty*harga - COALESCE(diskon,0)) as total, MAX(tgl) as terakhir")
            ->groupBy('pelanggan')->get()->keyBy('pelanggan');
    }

    // Kontak "Umum" (per tipe): menampung transaksi TANPA pelanggan (penjualan) / TANPA supplier
    // (pembelian) supaya tetap bisa dilihat riwayatnya. Kalau di Master sudah ada kontak
    // bernama "Umum" (mis. pelanggan UMUM bawaan kasir), angkanya digabung ke kontak itu.
    private function gabungUmum(array &$result, string $tipe, $stat, float $hutang): void
    {
        $total = (float) ($stat->total ?? 0);
        $jml   = (int) ($stat->jml_nota ?? 0);
        $akhir = $stat->terakhir ?? null;
        $ket   = 'Transaksi tanpa ' . ($tipe === 'Supplier' ? 'supplier' : 'pelanggan');
        foreach ($result as &$r) {
            if ($r['tipe'] === $tipe && mb_strtolower(trim($r['nama'])) === 'umum') {
                $r['total_beli'] = (float) ($r['total_beli'] ?? 0) + $total;
                $r['jml_nota']   = (int) ($r['jml_nota'] ?? 0) + $jml;
                if ($akhir && (empty($r['terakhir_beli']) || $akhir > $r['terakhir_beli'])) $r['terakhir_beli'] = $akhir;
                $r['hutang'] += $hutang;
                $r['saldo']  -= $hutang;
                $r['umum'] = true; $r['ket'] = 'Termasuk ' . mb_strtolower($ket);
                return;
            }
        }
        unset($r);
        $catatan = $this->saldoCatatan($tipe, 'Umum');
        $h = $hutang + $catatan['hutang'];
        $result[] = [
            'tipe' => $tipe, 'nama' => 'Umum', 'kode' => null, 'telp' => null, 'alamat' => null,
            'saldo' => $catatan['piutang'] - $h, 'piutang' => $catatan['piutang'], 'hutang' => $h,
            'total_beli' => $total, 'jml_nota' => $jml, 'terakhir_beli' => $akhir,
            'umum' => true, 'ket' => $ket,
        ];
    }

    // Ringkasan pembelian per SUPPLIER dari trx_beli (semua cara bayar, tunai & kredit):
    // jumlah faktur, total (qty×harga − diskon), tanggal beli terakhir.
    private function ringkasBeliPerSupplier()
    {
        return DB::table('trx_beli')
            ->whereNotNull('supplier')->where('supplier', '!=', '')
            ->selectRaw("supplier, COUNT(DISTINCT COALESCE(no_nota, CONCAT('#', id))) as jml_nota, SUM(qty*harga - COALESCE(diskon,0)) as total, MAX(tgl) as terakhir")
            ->groupBy('supplier')->get()->keyBy('supplier');
    }

    // Detail 1 nota PENJUALAN untuk tracking dari halaman Kontak ▸ Pelanggan: nota mana,
    // toko mana, kasir siapa, pelanggan siapa, dan barang apa saja. Cari lewat ?no_nota=…
    // atau ?id=… (baris lepas tanpa no_nota).
    public function notaJual(Request $request)
    {
        $noNota = trim((string) $request->get('no_nota'));
        $id     = (int) $request->get('id');

        $q = DB::table('trx_jual')->leftJoin('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
            ->select('trx_jual.*', 'barang.nama as nama_barang', 'barang.ppn as ppn_master');
        if ($noNota !== '') $q->where('trx_jual.no_nota', $noNota);
        elseif ($id > 0)    $q->where('trx_jual.id', $id);
        else return response()->json(['message' => 'no_nota atau id wajib diisi'], 422);

        $rows = $q->orderBy('trx_jual.id')->get();
        if ($rows->isEmpty()) return response()->json(['message' => 'Nota penjualan tidak ditemukan'], 404);

        $first = $rows->first();
        $items = $rows->map(function ($r) {
            $sub = (float) $r->qty * (float) $r->harga - (float) ($r->diskon ?? 0);
            return [
                'id'       => $r->id,
                'nama'     => !empty($r->tidak_dikenal) ? ('⚠️ ' . ($r->kode_asli ?: $r->kode_barang)) : ($r->nama_barang ?? $r->kode_barang),
                'qty'      => (float) $r->qty,
                'satuan'   => $r->satuan ?? null,
                'harga'    => (float) $r->harga,
                'diskon'   => (float) ($r->diskon ?? 0),
                'ppn'      => ($r->ppn ?? null) ?: ($r->ppn_master ?: 'Non-PPN'),
                'subtotal' => $sub,
            ];
        })->values();

        $pel = !empty($first->pelanggan) ? DB::table('pelanggan')->where('kode', $first->pelanggan)->first() : null;

        return response()->json([
            'no_nota'      => $first->no_nota,
            'tgl'          => $first->tgl,
            'cabang'       => $first->cabang,
            'pelanggan'    => $pel->nama ?? null,
            'bayar'        => $first->bayar,
            'kasir'        => $rows->pluck('kasir')->filter()->unique()->values()->all(),
            'jumlah_baris' => $rows->count(),
            'total'        => (float) $items->sum('subtotal'),
            'items'        => $items,
        ]);
    }

    // Detail 1 faktur pembelian untuk tracking dari halaman Kontak ▸ Supplier:
    // faktur mana, toko (cabang) mana, akun/operator siapa yang menginput, kapan
    // diinput, dan barang apa saja. Cari lewat ?no_nota=… (1 nota, semua barangnya)
    // atau ?id=… (baris lepas yang tidak punya no_nota).
    public function notaBeli(Request $request)
    {
        $noNota = trim((string) $request->get('no_nota'));
        $id     = (int) $request->get('id');

        $q = DB::table('trx_beli')->leftJoin('barang', 'trx_beli.kode_barang', '=', 'barang.kode')
            ->select('trx_beli.*', 'barang.nama as nama_barang', 'barang.ppn as ppn_master');
        if ($noNota !== '') $q->where('trx_beli.no_nota', $noNota);
        elseif ($id > 0)    $q->where('trx_beli.id', $id);
        else return response()->json(['message' => 'no_nota atau id wajib diisi'], 422);

        $rows = $q->orderBy('trx_beli.id')->get();
        if ($rows->isEmpty()) return response()->json(['message' => 'Faktur pembelian tidak ditemukan'], 404);

        $first = $rows->first();
        $items = $rows->map(function ($r) {
            $sub = (float) $r->qty * (float) $r->harga - (float) ($r->diskon ?? 0);
            return [
                'id'          => $r->id,
                'kode_barang' => $r->kode_barang,
                'nama'        => $r->tidak_dikenal ? ('⚠️ ' . ($r->kode_asli ?: $r->kode_barang)) : ($r->nama_barang ?? $r->kode_barang),
                'qty'         => (float) $r->qty,
                'satuan'      => $r->satuan ?? null,
                'harga'       => (float) $r->harga,
                'diskon'      => (float) ($r->diskon ?? 0),
                'ppn'         => $r->ppn ?: ($r->ppn_master ?: 'Non-PPN'),
                'subtotal'    => $sub,
            ];
        })->values();

        // Nota dari Kasir POS punya info tambahan (kasir). Kalau bukan POS → null.
        $pos = $first->no_nota ? DB::table('pos_nota')->where('no_nota', $first->no_nota)->first() : null;

        return response()->json([
            'no_nota'    => $first->no_nota,
            'tgl'        => $first->tgl,
            'cabang'     => $first->cabang,
            'supplier'   => $first->supplier,
            'bayar'      => $first->bayar,
            'operator'   => $rows->pluck('operator')->filter()->unique()->values()->all(), // bisa >1 kalau 1 nomor dipakai beberapa akun
            'kasir_pos'  => $pos->kasir ?? null,
            'sumber'     => $pos ? 'Kasir POS' : 'Input/Import Pembelian',
            'diinput'    => $rows->min('created_at'),
            'diubah'     => $rows->max('updated_at'),
            'jumlah_baris' => $rows->count(),
            'total'      => (float) $items->sum('subtotal'),
            'items'      => $items,
        ]);
    }

    // Riwayat lengkap satu kontak: transaksi terkait (sesuai tipe) + catatan manual, urut terbaru dulu.
    public function riwayat(Request $request, string $tipe, string $nama)
    {
        if (!in_array($tipe, ['Karyawan', 'Pelanggan', 'Supplier', 'Lainnya'])) {
            return response()->json(['message' => 'Tipe kontak tidak valid'], 422);
        }

        $riwayat = [];

        if ($tipe === 'Karyawan') {
            $karyawan = DB::table('karyawan')->where('nama', $nama)->first();
            if ($karyawan) {
                DB::table('trx_kasbon')->where('karyawan_id', $karyawan->id)->orderByDesc('tgl')->get()
                    ->each(function ($r) use (&$riwayat) {
                        $riwayat[] = [
                            'tgl' => $r->tgl, 'sumber' => 'Kasbon', 'jenis' => $r->jenis,
                            'nominal' => (float) $r->nominal, 'keterangan' => $r->keterangan ?? ('Kasbon ' . $r->jenis),
                            'arah' => $r->jenis === 'Diberikan' ? 'piutang' : 'bayar_piutang',
                        ];
                    });
            }
        }

        $ringkasanBeli = null;
        $dibatasi = 0;

        if ($tipe === 'Pelanggan') {
            // Riwayat PEMBELIAN (Penjualan yang tertaut ke pelanggan ini lewat kode pelanggan),
            // digabung per nota. ?kode=… membatasi ke 1 kode pelanggan; tanpa itu semua kode
            // pelanggan bernama sama ikut dihitung.
            $kodeQ = trim((string) $request->get('kode', ''));
            $umum  = mb_strtolower(trim($nama)) === 'umum'; // kontak Umum: ikut penjualan tanpa pelanggan
            $kodes = $kodeQ !== ''
                ? [$kodeQ]
                : DB::table('pelanggan')->whereRaw('LOWER(nama) = ?', [mb_strtolower(trim($nama))])->pluck('kode')->all();
            if ($kodes || $umum) {
                $keyNota = "COALESCE(no_nota, CONCAT('#', id))";
                $notas = DB::table('trx_jual')
                    ->where(function ($w) use ($kodes, $umum) {
                        if ($kodes) $w->whereIn('pelanggan', $kodes);
                        if ($umum)  $w->orWhereNull('pelanggan')->orWhere('pelanggan', '');
                    })
                    ->selectRaw("MAX(no_nota) as no_nota, MIN(id) as id, MIN(tgl) as tgl, MAX(cabang) as cabang, MAX(bayar) as bayar, COUNT(*) as jml_barang, SUM(qty*harga - COALESCE(diskon,0)) as total")
                    ->groupByRaw($keyNota)->orderByDesc('tgl')->get();
                $totalBeli = 0;
                $batasUmum = 300; $dibatasi = 0;
                foreach ($notas as $idx => $n) {
                    $totalBeli += (float) $n->total;
                    if ($umum && $idx >= $batasUmum) { $dibatasi = $notas->count(); continue; } // Umum bisa ribuan nota: tampilkan 300 terbaru, total tetap lengkap
                    $riwayat[] = [
                        'tgl' => $n->tgl, 'sumber' => 'Penjualan', 'jenis' => 'Beli',
                        'nominal' => (float) $n->total,
                        'keterangan' => $n->jml_barang . ' barang · ' . $n->cabang . ' · ' . $n->bayar,
                        'arah' => 'beli',
                        // Baris bisa diklik → detail nota (lihat notaJual()).
                        'jual' => ['id' => $n->id, 'no_nota' => $n->no_nota, 'cabang' => $n->cabang],
                    ];
                }
                $ringkasanBeli = [
                    'total_beli'    => $totalBeli,
                    'jml_nota'      => $notas->count(),
                    'terakhir_beli' => $notas->max('tgl'),
                    'rata_nota'     => $notas->count() ? $totalBeli / $notas->count() : 0,
                ];
            }

            DB::table('trx_cashbon')->where('nama_pelanggan', $nama)->orderByDesc('tgl')->get()
                ->each(function ($r) use (&$riwayat) {
                    $riwayat[] = [
                        'tgl' => $r->tgl, 'sumber' => 'Cashbon', 'jenis' => $r->jenis,
                        'nominal' => (float) $r->nominal, 'keterangan' => 'Cashbon ' . $r->jenis . ' (' . $r->cabang . ')',
                        'arah' => $r->jenis === 'Diberikan' ? 'piutang' : 'bayar_piutang',
                    ];
                });
        }

        if ($tipe === 'Supplier') {
            // RIWAYAT PEMBELIAN supplier: SEMUA pembelian (tunai & kredit), digabung per
            // faktur (no_nota) — bukan per baris barang. Hanya yang Kredit dihitung
            // sebagai hutang (arah 'hutang'); yang Tunai tampil sebagai 'beli' biasa.
            // Kolom disebut lengkap dgn nama tabel: tabel `barang` juga punya kolom
            // `supplier`, jadi tanpa prefix MySQL error "Column 'supplier' is ambiguous".
            $umum = mb_strtolower(trim($nama)) === 'umum'; // kontak Umum: ikut pembelian tanpa supplier
            $rows = DB::table('trx_beli')
                ->where(function ($w) use ($nama, $umum) {
                    $w->where('trx_beli.supplier', $nama);
                    if ($umum) $w->orWhereNull('trx_beli.supplier')->orWhere('trx_beli.supplier', '');
                })
                ->leftJoin('barang', 'trx_beli.kode_barang', '=', 'barang.kode')
                ->select('trx_beli.*', 'barang.nama as nama_barang')
                ->orderBy('trx_beli.id')->get();

            $grup = [];
            foreach ($rows as $r) {
                $kunci = ($r->no_nota !== null && $r->no_nota !== '' ? $r->no_nota : '#' . $r->id) . '|' . $r->bayar;
                if (!isset($grup[$kunci])) {
                    $grup[$kunci] = [
                        'id' => $r->id, 'no_nota' => $r->no_nota, 'tgl' => $r->tgl, 'cabang' => $r->cabang,
                        'bayar' => $r->bayar, 'operator' => $r->operator ?? null, 'total' => 0.0, 'barang' => [],
                    ];
                }
                $grup[$kunci]['total'] += (float) $r->qty * (float) $r->harga - (float) ($r->diskon ?? 0);
                $grup[$kunci]['barang'][] = $r->tidak_dikenal ? ($r->kode_asli ?: $r->kode_barang) : ($r->nama_barang ?? $r->kode_barang);
                if ($r->tgl < $grup[$kunci]['tgl']) $grup[$kunci]['tgl'] = $r->tgl;
            }

            $totalBeli = 0.0; $totalKredit = 0.0; $totalTunai = 0.0;
            if ($umum) uasort($grup, fn($a, $b) => strcmp($b['tgl'], $a['tgl']));
            $dibatasi = 0; $idx = 0;
            foreach ($grup as $g) {
                $kredit = $g['bayar'] === 'Kredit';
                $totalBeli += $g['total'];
                if ($kredit) $totalKredit += $g['total']; else $totalTunai += $g['total'];
                if ($umum && ++$idx > 300) { $dibatasi = count($grup); continue; }
                $jml = count($g['barang']);
                $contoh = implode(', ', array_slice($g['barang'], 0, 3)) . ($jml > 3 ? ' +' . ($jml - 3) . ' lainnya' : '');
                $riwayat[] = [
                    'tgl' => $g['tgl'], 'sumber' => $kredit ? 'Pembelian Kredit' : 'Pembelian Tunai',
                    'jenis' => $kredit ? 'Hutang' : 'Beli',
                    'nominal' => $g['total'],
                    'keterangan' => $jml . ' barang · ' . $g['cabang'] . ' · ' . $g['bayar'] . ' — ' . $contoh,
                    'arah' => $kredit ? 'hutang' : 'beli',
                    // Info untuk tracking: baris bisa diklik → detail faktur (lihat notaBeli()).
                    'beli' => [
                        'id'       => $g['id'],
                        'no_nota'  => $g['no_nota'],
                        'cabang'   => $g['cabang'],
                        'operator' => $g['operator'],
                    ],
                ];
            }
            $jmlNota = count($grup);
            $ringkasanBeli = [
                'total_beli'    => $totalBeli,
                'total_kredit'  => $totalKredit,
                'total_tunai'   => $totalTunai,
                'jml_nota'      => $jmlNota,
                'terakhir_beli' => $grup ? max(array_column($grup, 'tgl')) : null,
                'rata_nota'     => $jmlNota ? $totalBeli / $jmlNota : 0,
            ];
        }

        DB::table('kontak_catatan')->where('tipe', $tipe)->where('nama', $nama)->orderByDesc('tgl')->orderByDesc('id')->get()
            ->each(function ($r) use (&$riwayat) {
                $arahMap = ['Piutang' => 'piutang', 'Bayar Piutang' => 'bayar_piutang', 'Hutang' => 'hutang', 'Bayar Hutang' => 'bayar_hutang', 'Catatan' => 'catatan'];
                $riwayat[] = [
                    'id' => $r->id, 'tgl' => $r->tgl, 'sumber' => 'Catatan', 'jenis' => $r->jenis,
                    'nominal' => $r->nominal !== null ? (float) $r->nominal : null,
                    'keterangan' => $r->keterangan ?? '', 'arah' => $arahMap[$r->jenis] ?? 'catatan',
                    'bisa_hapus' => true,
                ];
            });

        usort($riwayat, fn($a, $b) => strcmp($b['tgl'], $a['tgl']));

        return response()->json(['tipe' => $tipe, 'nama' => $nama, 'riwayat' => $riwayat, 'ringkasan_beli' => $ringkasanBeli, 'riwayat_dibatasi' => $dibatasi]);
    }

    public function storeCatatan(Request $request)
    {
        $data = $request->validate([
            'tipe'       => ['required', Rule::in(['Karyawan', 'Pelanggan', 'Supplier', 'Lainnya'])],
            'nama'       => 'required|string|max:200',
            'tgl'        => 'required|date',
            'jenis'      => ['required', Rule::in(['Piutang', 'Hutang', 'Bayar Piutang', 'Bayar Hutang', 'Catatan'])],
            'nominal'    => 'nullable|numeric|min:0',
            'keterangan' => 'nullable|string',
        ]);
        if ($data['jenis'] !== 'Catatan' && !isset($data['nominal'])) {
            return response()->json(['message' => 'Nominal wajib diisi untuk jenis ini'], 422);
        }
        $data['nama'] = trim($data['nama']);
        $id = DB::table('kontak_catatan')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('kontak_catatan')->find($id), 201);
    }

    public function destroyCatatan(int $id)
    {
        DB::table('kontak_catatan')->delete($id);
        return response()->json(['message' => 'Catatan dihapus']);
    }
}
