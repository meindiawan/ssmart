<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;

// ═══════════════════════════════════════════════════════════════════════
// HUTANG PEMBELIAN — pelunasan per NOTA (bukan per kontak).
//   Hutang  = nota pembelian (trx_beli) ber-bayar "Kredit".
//   Dibayar = jumlah catatan di tabel bayar_hutang untuk no_nota yang sama.
//   Status  = Belum (0 dibayar) · Sebagian · Lunas (sisa ≤ Rp1).
// Setiap pembayaran otomatis masuk Jurnal: Dr 2101 Hutang Usaha / Cr Kas-Bank.
//
// SALDO DIPISAH KENA PPN vs NON-PPN (per baris barang, rumus SAMA dgn Jurnal Pembelian):
//   status baris = COALESCE(NULLIF(trx_beli.ppn,''), barang.ppn)
//   → override per baris (mis. barang berPPN dibeli di toko tanpa PPN = "Non-PPN") menang
//      atas Master Barang.
//   Kena PPN : bruto, DPP, PPN Masukan (= bruto − bruto/(1+tarif))
//   Non-PPN  : bruto saja
//   Pembayaran dialokasikan proporsional ke sisa porsi PPN & Non-PPN (kolom porsi_ppn /
//   porsi_non_ppn di bayar_hutang; pembayaran lama yg kolomnya NULL dibagi sesuai rasio nota).
// ═══════════════════════════════════════════════════════════════════════
class HutangController extends Controller
{
    private const TOLERANSI = 1.0; // selisih pembulatan ≤ Rp1 dianggap lunas

    private static function ada(): bool
    {
        return Schema::hasTable('bayar_hutang');
    }

    /** Kunci nota: no_nota, atau PB-{id} bila kosong (sama dgn ref di Jurnal). */
    private static function kunci($r): string
    {
        return ($r->no_nota !== null && $r->no_nota !== '') ? $r->no_nota : 'PB-' . $r->id;
    }

    private static function tarif(): float
    {
        $st = DB::table('settings')->where('key', 'tarif_ppn')->first();
        return $st ? (float) $st->value / 100 : 0.11;
    }

    private static function adaPorsi(): bool
    {
        return self::ada() && Schema::hasColumn('bayar_hutang', 'porsi_ppn');
    }

    /** Peta no_nota → total dibayar (+ rincian porsi PPN / Non-PPN; 'legacy' = nominal tanpa alokasi). */
    private static function petaDibayar(): array
    {
        if (!self::ada()) return [];
        $porsi = self::adaPorsi();
        $sel = 'no_nota, SUM(nominal) as dibayar, MAX(tgl) as terakhir, COUNT(*) as n'
            . ($porsi
                ? ', SUM(CASE WHEN porsi_ppn IS NULL THEN 0 ELSE porsi_ppn END) as p_ppn'
                  . ', SUM(CASE WHEN porsi_ppn IS NULL THEN 0 ELSE COALESCE(porsi_non_ppn,0) END) as p_non'
                  . ', SUM(CASE WHEN porsi_ppn IS NULL THEN nominal ELSE 0 END) as legacy'
                : ', 0 as p_ppn, 0 as p_non, SUM(nominal) as legacy');
        return DB::table('bayar_hutang')->selectRaw($sel)
            ->groupBy('no_nota')->get()->keyBy('no_nota')->map(fn($r) => [
                'dibayar' => (float) $r->dibayar, 'terakhir' => $r->terakhir, 'n' => (int) $r->n,
                'ppn' => (float) $r->p_ppn, 'non' => (float) $r->p_non, 'legacy' => (float) $r->legacy,
            ])->all();
    }

    /** Bagi nominal pembayaran ke porsi Kena PPN & Non-PPN, proporsional terhadap SISA tiap porsi. */
    private static function alokasi(array $n, float $nominal): array
    {
        $den = $n['sisa_ppn'] + $n['sisa_non'];
        if ($den <= 0) return [0.0, round($nominal, 2)];
        $p = min(round($nominal * $n['sisa_ppn'] / $den, 2), $n['sisa_ppn'], $nominal);
        return [$p, round($nominal - $p, 2)];
    }

    /** Semua nota Kredit beserta total, dibayar, sisa, status. */
    private function rekap(array $f = []): array
    {
        $q = DB::table('trx_beli')->leftJoin('barang', 'trx_beli.kode_barang', '=', 'barang.kode')
            ->where('trx_beli.bayar', 'Kredit');
        if (!empty($f['cabang'])) $q->where('trx_beli.cabang', $f['cabang']);
        if (!empty($f['dari']))   $q->where('trx_beli.tgl', '>=', $f['dari']);
        if (!empty($f['sampai'])) $q->where('trx_beli.tgl', '<=', $f['sampai']);
        if (!empty($f['supplier'])) {
            if (mb_strtolower($f['supplier']) === 'umum') {
                $q->where(fn($w) => $w->whereNull('trx_beli.supplier')->orWhere('trx_beli.supplier', '')->orWhere('trx_beli.supplier', $f['supplier']));
            } else {
                $q->where('trx_beli.supplier', $f['supplier']);
            }
        }
        $rows = $q->select('trx_beli.id', 'trx_beli.no_nota', 'trx_beli.tgl', 'trx_beli.cabang', 'trx_beli.supplier',
                'trx_beli.qty', 'trx_beli.harga', 'trx_beli.diskon', 'trx_beli.operator')
            ->selectRaw("COALESCE(NULLIF(trx_beli.ppn, ''), barang.ppn) as ppn_efektif")
            ->orderBy('trx_beli.id')->get();
        $tarif = self::tarif();

        $bayar = self::petaDibayar();
        $hariIni = strtotime(date('Y-m-d'));
        $nota = [];
        foreach ($rows as $r) {
            $k = self::kunci($r);
            if (!isset($nota[$k])) {
                $nota[$k] = [
                    'no_nota' => $k, 'tgl' => $r->tgl, 'cabang' => $r->cabang,
                    'supplier' => $r->supplier ?: null, 'operator' => $r->operator ?? null,
                    'total' => 0.0, 'total_ppn' => 0.0, 'total_non' => 0.0, 'ppn_masukan' => 0.0, 'jml_barang' => 0,
                ];
            }
            $tot  = (float) $r->qty * (float) $r->harga - (float) ($r->diskon ?? 0);
            $kena = ($r->ppn_efektif ?? null) === 'Kena PPN';
            $nota[$k]['total'] += $tot;
            if ($kena) { $nota[$k]['total_ppn'] += $tot; $nota[$k]['ppn_masukan'] += $tot - $tot / (1 + $tarif); }
            else       { $nota[$k]['total_non'] += $tot; }
            $nota[$k]['jml_barang']++;
            if (!$nota[$k]['supplier'] && $r->supplier) $nota[$k]['supplier'] = $r->supplier;
            if ($r->tgl < $nota[$k]['tgl']) $nota[$k]['tgl'] = $r->tgl;
        }

        $cari = mb_strtolower(trim($f['search'] ?? ''));
        $hasil = [];
        foreach ($nota as $k => $n) {
            $n['total_ppn']    = round($n['total_ppn']);
            $n['total']        = round($n['total']);
            $n['total_non']    = $n['total'] - $n['total_ppn']; // jumlah 2 porsi selalu = total
            $n['ppn_masukan']  = round($n['ppn_masukan']);
            $n['dpp_ppn']      = $n['total_ppn'] - $n['ppn_masukan'];
            $b            = $bayar[$k] ?? null;
            $n['dibayar'] = $b ? round($b['dibayar']) : 0.0;
            // Pembayaran lama (tanpa alokasi) dibagi sesuai rasio porsi nota.
            $rasio = $n['total'] > 0 ? $n['total_ppn'] / $n['total'] : 0.0;
            $n['dibayar_ppn'] = $b ? round($b['ppn'] + $b['legacy'] * $rasio) : 0.0;
            $n['dibayar_non'] = $n['dibayar'] - $n['dibayar_ppn'];
            $n['sisa']        = max(0.0, $n['total'] - $n['dibayar']);
            $n['sisa_ppn']    = max(0.0, $n['total_ppn'] - $n['dibayar_ppn']);
            $n['sisa_non']    = max(0.0, $n['total_non'] - $n['dibayar_non']);
            $n['terakhir_bayar'] = $b['terakhir'] ?? null;
            $n['jml_bayar']      = $b['n'] ?? 0;
            $n['status'] = $n['sisa'] <= self::TOLERANSI ? 'Lunas' : ($n['dibayar'] > 0 ? 'Sebagian' : 'Belum');
            if ($n['status'] === 'Lunas') { $n['sisa'] = 0.0; $n['sisa_ppn'] = 0.0; $n['sisa_non'] = 0.0; }
            $n['ppn_masukan_sisa'] = $n['total_ppn'] > 0 ? round($n['ppn_masukan'] * $n['sisa_ppn'] / $n['total_ppn']) : 0.0;
            $n['umur'] = (int) max(0, floor(($hariIni - strtotime($n['tgl'])) / 86400));
            if ($cari !== '' && !str_contains(mb_strtolower($k . ' ' . ($n['supplier'] ?? '') . ' ' . $n['cabang']), $cari)) continue;
            $hasil[$k] = $n;
        }
        return $hasil;
    }

    public function index(Request $request)
    {
        $status = $request->get('status', 'aktif'); // aktif (belum+sebagian) | belum | sebagian | lunas | semua
        $semua  = $this->rekap($request->only(['cabang', 'supplier', 'dari', 'sampai', 'search']));

        $ringkas = ['total' => 0.0, 'dibayar' => 0.0, 'sisa' => 0.0, 'nota_belum' => 0, 'nota_sebagian' => 0, 'nota_lunas' => 0,
            'ppn'     => ['total' => 0.0, 'dibayar' => 0.0, 'sisa' => 0.0, 'ppn_masukan_sisa' => 0.0],
            'non_ppn' => ['total' => 0.0, 'dibayar' => 0.0, 'sisa' => 0.0]];
        foreach ($semua as $n) {
            $ringkas['total']   += $n['total'];
            $ringkas['dibayar'] += min($n['dibayar'], $n['total']);
            $ringkas['sisa']    += $n['sisa'];
            $ringkas['nota_' . strtolower($n['status'])]++;
            $ringkas['ppn']['total']            += $n['total_ppn'];
            $ringkas['ppn']['dibayar']          += min($n['dibayar_ppn'], $n['total_ppn']);
            $ringkas['ppn']['sisa']             += $n['sisa_ppn'];
            $ringkas['ppn']['ppn_masukan_sisa'] += $n['ppn_masukan_sisa'];
            $ringkas['non_ppn']['total']        += $n['total_non'];
            $ringkas['non_ppn']['dibayar']      += min($n['dibayar_non'], $n['total_non']);
            $ringkas['non_ppn']['sisa']         += $n['sisa_non'];
        }

        $list = array_values(array_filter($semua, function ($n) use ($status) {
            return match ($status) {
                'aktif'    => $n['status'] !== 'Lunas',
                'belum'    => $n['status'] === 'Belum',
                'sebagian' => $n['status'] === 'Sebagian',
                'lunas'    => $n['status'] === 'Lunas',
                default    => true,
            };
        }));
        // Hutang yang masih berjalan: nota tertua di atas (prioritas bayar). Lainnya: terbaru di atas.
        if (in_array($status, ['aktif', 'belum', 'sebagian'], true)) {
            usort($list, fn($a, $b) => strcmp($a['tgl'] . $a['no_nota'], $b['tgl'] . $b['no_nota']));
        } else {
            usort($list, fn($a, $b) => strcmp($b['tgl'] . $b['no_nota'], $a['tgl'] . $a['no_nota']));
        }

        $dibatasi = count($list) > 500 ? count($list) : 0;
        return response()->json([
            'data' => array_slice($list, 0, 500),
            'ringkasan' => $ringkas,
            'dibatasi' => $dibatasi,
            'migrasi_ada' => self::ada(),
        ]);
    }

    /** Detail 1 nota: barang di dalamnya + riwayat pembayaran. */
    public function detail(Request $request)
    {
        $no = (string) $request->get('no_nota');
        $q = DB::table('trx_beli')->where('bayar', 'Kredit')
            ->leftJoin('barang', 'trx_beli.kode_barang', '=', 'barang.kode');
        if (str_starts_with($no, 'PB-') && ctype_digit(substr($no, 3))) {
            $q->where(fn($w) => $w->where('trx_beli.no_nota', $no)->orWhere(fn($x) => $x->where('trx_beli.id', (int) substr($no, 3))->where(fn($y) => $y->whereNull('trx_beli.no_nota')->orWhere('trx_beli.no_nota', ''))));
        } else {
            $q->where('trx_beli.no_nota', $no);
        }
        $items = $q->select('trx_beli.*', 'barang.nama as nama_barang')
            ->selectRaw("COALESCE(NULLIF(trx_beli.ppn, ''), barang.ppn) as ppn_efektif")
            ->orderBy('trx_beli.id')->get();
        $tarif = self::tarif();
        if ($items->isEmpty()) return response()->json(['message' => 'Nota tidak ditemukan'], 404);

        $barang = $items->map(function ($r) use ($tarif) {
            $sub  = (float) $r->qty * (float) $r->harga - (float) ($r->diskon ?? 0);
            $kena = ($r->ppn_efektif ?? null) === 'Kena PPN';
            return [
                'nama'   => $r->tidak_dikenal ? ($r->kode_asli ?: $r->kode_barang) : ($r->nama_barang ?? $r->kode_barang),
                'qty'    => (float) $r->qty, 'satuan' => $r->satuan, 'harga' => (float) $r->harga,
                'diskon' => (float) ($r->diskon ?? 0),
                'subtotal' => $sub,
                'ppn'      => $kena ? 'Kena PPN' : 'Non-PPN',
                'override' => ($r->ppn ?? '') !== '' && $r->ppn !== null, // di-override khusus baris ini
                'dpp'      => round($kena ? $sub / (1 + $tarif) : $sub),
                'ppn_nilai'=> round($kena ? $sub - $sub / (1 + $tarif) : 0),
            ];
        })->all();

        $pembayaran = self::ada()
            ? DB::table('bayar_hutang')->where('no_nota', $no)->orderBy('tgl')->orderBy('id')->get()
            : collect();

        $rekap = $this->rekap(['search' => '']);
        return response()->json([
            'nota'       => $rekap[$no] ?? null,
            'barang'     => $barang,
            'pembayaran' => $pembayaran,
        ]);
    }

    private function simpanBayar(string $noNota, array $nota, string $tgl, float $nominal, string $kodeKas, ?string $ket): object
    {
        $noBayar = 'BH-' . date('ymd', strtotime($tgl)) . '-' . strtoupper(Str::random(4));
        $row = [
            'no_bayar' => $noBayar, 'no_nota' => $noNota, 'tgl' => $tgl, 'cabang' => $nota['cabang'],
            'nominal' => $nominal, 'kode_kas' => $kodeKas, 'keterangan' => $ket,
            'created_at' => now(), 'updated_at' => now(),
        ];
        if (self::adaPorsi()) {
            [$row['porsi_ppn'], $row['porsi_non_ppn']] = self::alokasi($nota, $nominal);
        }
        $id = DB::table('bayar_hutang')->insertGetId($row);
        return DB::table('bayar_hutang')->find($id);
    }

    /** Bayar 1 nota (sebagian atau lunas). */
    public function bayar(Request $request)
    {
        if (!self::ada()) return response()->json(['message' => 'Jalankan migrasi dulu: php artisan migrate'], 500);
        $v = $request->validate([
            'no_nota'    => 'required|string',
            'tgl'        => 'required|date',
            'nominal'    => 'required|numeric|min:1',
            'kode_kas'   => 'required|string|exists:coa,kode',
            'keterangan' => 'nullable|string|max:255',
        ]);
        $rekap = $this->rekap();
        $n = $rekap[$v['no_nota']] ?? null;
        if (!$n) return response()->json(['message' => 'Nota Kredit tidak ditemukan'], 404);
        if ($n['status'] === 'Lunas') return response()->json(['message' => 'Nota ini sudah lunas'], 422);
        if ($v['nominal'] > $n['sisa'] + self::TOLERANSI) {
            return response()->json(['message' => 'Jumlah bayar (' . number_format($v['nominal'], 0, ',', '.') . ') melebihi sisa hutang (' . number_format($n['sisa'], 0, ',', '.') . ')'], 422);
        }
        $nominal = min((float) $v['nominal'], $n['sisa']);
        $row = $this->simpanBayar($v['no_nota'], $n, $v['tgl'], $nominal, $v['kode_kas'], $v['keterangan'] ?? null);
        $sisa = max(0, $n['sisa'] - $nominal);
        return response()->json(['message' => $sisa <= self::TOLERANSI ? 'Nota LUNAS' : 'Pembayaran tersimpan, sisa Rp ' . number_format($sisa, 0, ',', '.'), 'pembayaran' => $row, 'sisa' => $sisa], 201);
    }

    /** Lunasi banyak nota sekaligus (masing-masing sebesar sisanya). */
    public function bayarBanyak(Request $request)
    {
        if (!self::ada()) return response()->json(['message' => 'Jalankan migrasi dulu: php artisan migrate'], 500);
        $v = $request->validate([
            'notas'      => 'required|array|min:1',
            'notas.*'    => 'string',
            'tgl'        => 'required|date',
            'kode_kas'   => 'required|string|exists:coa,kode',
            'keterangan' => 'nullable|string|max:255',
        ]);
        $rekap = $this->rekap();
        $ok = 0; $total = 0.0; $lewat = [];
        DB::transaction(function () use ($v, $rekap, &$ok, &$total, &$lewat) {
            foreach (array_unique($v['notas']) as $no) {
                $n = $rekap[$no] ?? null;
                if (!$n || $n['status'] === 'Lunas' || $n['sisa'] < 1) { $lewat[] = $no; continue; }
                $this->simpanBayar($no, $n, $v['tgl'], $n['sisa'], $v['kode_kas'], $v['keterangan'] ?? null);
                $ok++; $total += $n['sisa'];
            }
        });
        return response()->json([
            'message' => "{$ok} nota dilunasi, total Rp " . number_format($total, 0, ',', '.') . (count($lewat) ? ' (' . count($lewat) . ' dilewati: sudah lunas/tidak ada)' : ''),
            'dilunasi' => $ok, 'total' => $total, 'dilewati' => $lewat,
        ], 201);
    }

    /** Batalkan 1 pembayaran (salah input). */
    public function hapusBayar(int $id)
    {
        if (!self::ada()) return response()->json(['message' => 'Tabel belum ada'], 404);
        $row = DB::table('bayar_hutang')->find($id);
        if (!$row) return response()->json(['message' => 'Pembayaran tidak ditemukan'], 404);
        DB::table('bayar_hutang')->delete($id);
        return response()->json(['message' => 'Pembayaran ' . $row->no_bayar . ' dibatalkan, nota kembali berhutang']);
    }

    /**
     * Total yang SUDAH dibayar per supplier (dipakai Kontak supaya Total Hutang ikut turun).
     * Kunci '' = nota tanpa supplier (kontak "Umum").
     */
    public static function dibayarPerSupplier(): array
    {
        if (!self::ada()) return [];
        $dibayar = self::petaDibayar();
        if (!$dibayar) return [];
        $peta = [];
        foreach (DB::table('trx_beli')->where('bayar', 'Kredit')->select('id', 'no_nota', 'supplier')->get() as $r) {
            $k = self::kunci($r);
            if (!isset($peta[$k]) || (empty($peta[$k]) && $r->supplier)) $peta[$k] = (string) ($r->supplier ?? '');
        }
        $hasil = [];
        foreach ($dibayar as $no => $b) {
            if (!array_key_exists($no, $peta)) continue; // nota sudah dihapus
            $hasil[$peta[$no]] = ($hasil[$peta[$no]] ?? 0) + $b['dibayar'];
        }
        return $hasil;
    }

    /** Riwayat pelunasan milik satu supplier (untuk halaman riwayat Kontak). */
    public static function pembayaranSupplier(string $supplier, bool $umum): array
    {
        if (!self::ada()) return [];
        $kunciNota = [];
        $q = DB::table('trx_beli')->where('bayar', 'Kredit')->select('id', 'no_nota', 'supplier');
        $q->where(function ($w) use ($supplier, $umum) {
            $w->where('supplier', $supplier);
            if ($umum) $w->orWhereNull('supplier')->orWhere('supplier', '');
        });
        foreach ($q->get() as $r) $kunciNota[self::kunci($r)] = true;
        if (!$kunciNota) return [];
        return DB::table('bayar_hutang')->whereIn('no_nota', array_keys($kunciNota))->orderByDesc('tgl')->get()->all();
    }
}
