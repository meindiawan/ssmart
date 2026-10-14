<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * JURNAL MANUAL & JURNAL MEMORIAL
 * ─────────────────────────────────────────────────────────────────────
 * Jurnal yang diinput langsung oleh pengguna (bukan hasil otomatis dari
 * transaksi). Disimpan di jurnal_manual (+ _detail) dan dibaca oleh
 * DashboardController::buildJurnal() — jadi otomatis ikut Jurnal Umum,
 * Buku Besar, Neraca Saldo, Laba Rugi & Neraca.
 *
 *   jenis 'Umum'     → no. JU-YYYYMMDD-001 (jurnal manual biasa)
 *   jenis 'Memorial' → no. JM-YYYYMMDD-001 (penyesuaian, koreksi, pembalik,
 *                      pelunasan antar cabang, transaksi non-kas lainnya)
 *
 * Aturan: minimal 2 baris, tiap baris hanya salah satu Debit ATAU Kredit
 * (> 0), total Debit harus sama dengan total Kredit.
 * ═══════════════════════════════════════════════════════════════════════
 */
class JurnalManualController extends Controller
{
    /** Pilihan kategori utk Jurnal Memorial (ditampilkan di form). */
    public const KATEGORI_MEMORIAL = [
        'Penyesuaian', 'Koreksi', 'Pembalik', 'Pelunasan Antar Cabang', 'Non-Kas Lainnya',
    ];

    public function index(Request $request)
    {
        $q = DB::table('jurnal_manual')->orderByDesc('tgl')->orderByDesc('id');
        if ($jenis = $request->get('jenis'))   $q->where('jenis', $jenis);
        if ($cab = $request->get('cabang'))    $q->where('cabang', $cab);
        if ($dari = $request->get('dari'))     $q->where('tgl', '>=', $dari);
        if ($smp = $request->get('sampai'))    $q->where('tgl', '<=', $smp);
        if ($s = trim((string) $request->get('search'))) {
            $q->where(fn($w) => $w->where('no_jurnal', 'like', "%$s%")
                ->orWhere('keterangan', 'like', "%$s%")
                ->orWhere('kategori', 'like', "%$s%"));
        }
        $headers = $q->limit(500)->get();

        $ids = $headers->pluck('id')->all();
        $detail = empty($ids) ? collect() : DB::table('jurnal_manual_detail')
            ->leftJoin('coa', 'jurnal_manual_detail.kode_akun', '=', 'coa.kode')
            ->whereIn('jurnal_manual_id', $ids)
            ->select('jurnal_manual_detail.*', 'coa.nama as nama_akun')
            ->orderBy('jurnal_manual_detail.id')->get()->groupBy('jurnal_manual_id');

        $data = $headers->map(function ($h) use ($detail) {
            $lines = ($detail[$h->id] ?? collect())->values();
            $h->detail = $lines;
            $h->total = (float) $lines->sum('debit');
            return $h;
        })->values();

        return response()->json(['data' => $data, 'kategori_memorial' => self::KATEGORI_MEMORIAL]);
    }

    public function store(Request $request)
    {
        [$header, $lines] = $this->validasi($request);

        $id = DB::transaction(function () use ($header, $lines) {
            $id = DB::table('jurnal_manual')->insertGetId(array_merge($header, [
                'no_jurnal'  => $this->nomorBaru($header['jenis'], $header['tgl']),
                'created_at' => now(), 'updated_at' => now(),
            ]));
            $this->simpanBaris($id, $lines);
            return $id;
        });

        return response()->json($this->satu($id), 201);
    }

    public function update(Request $request, int $id)
    {
        $lama = DB::table('jurnal_manual')->find($id);
        if (!$lama) return response()->json(['message' => 'Jurnal tidak ditemukan'], 404);
        [$header, $lines] = $this->validasi($request);

        DB::transaction(function () use ($id, $lama, $header, $lines) {
            $upd = array_merge($header, ['updated_at' => now()]);
            // Kalau jenis/tanggal berganti, nomor mengikuti prefix baru supaya tetap rapi.
            if ($lama->jenis !== $header['jenis']) {
                $upd['no_jurnal'] = $this->nomorBaru($header['jenis'], $header['tgl']);
            }
            DB::table('jurnal_manual')->where('id', $id)->update($upd);
            DB::table('jurnal_manual_detail')->where('jurnal_manual_id', $id)->delete();
            $this->simpanBaris($id, $lines);
        });

        return response()->json($this->satu($id));
    }

    public function destroy(int $id)
    {
        $n = DB::table('jurnal_manual')->where('id', $id)->delete(); // detail ikut cascade
        if (!$n) return response()->json(['message' => 'Jurnal tidak ditemukan'], 404);
        return response()->json(['message' => 'Jurnal dihapus']);
    }

    // ─── helper ───────────────────────────────────────────────────────────
    private function satu(int $id): object
    {
        $h = DB::table('jurnal_manual')->find($id);
        $h->detail = DB::table('jurnal_manual_detail')->where('jurnal_manual_id', $id)->orderBy('id')->get();
        $h->total = (float) $h->detail->sum('debit');
        return $h;
    }

    private function simpanBaris(int $id, array $lines): void
    {
        $rows = [];
        foreach ($lines as $l) {
            $rows[] = [
                'jurnal_manual_id' => $id,
                'kode_akun'  => $l['kode_akun'],
                'debit'      => $l['debit'],
                'kredit'     => $l['kredit'],
                'keterangan' => $l['keterangan'] ?: null,
                'created_at' => now(), 'updated_at' => now(),
            ];
        }
        DB::table('jurnal_manual_detail')->insert($rows);
    }

    /** JU-YYYYMMDD-001 / JM-YYYYMMDD-001 — urutan per prefix+tanggal, dijamin unik. */
    private function nomorBaru(string $jenis, string $tgl): string
    {
        $prefix = ($jenis === 'Memorial' ? 'JM-' : 'JU-') . date('Ymd', strtotime($tgl)) . '-';
        $terakhir = DB::table('jurnal_manual')->where('no_jurnal', 'like', $prefix . '%')
            ->orderByDesc('no_jurnal')->value('no_jurnal');
        $n = $terakhir ? ((int) substr($terakhir, -3)) + 1 : 1;
        do {
            $no = $prefix . str_pad((string) $n, 3, '0', STR_PAD_LEFT);
            $n++;
        } while (DB::table('jurnal_manual')->where('no_jurnal', $no)->exists());
        return $no;
    }

    /** Validasi + pastikan seimbang. Return [header, baris-bersih]. */
    private function validasi(Request $request): array
    {
        $data = $request->validate([
            'jenis'             => ['required', Rule::in(['Umum', 'Memorial'])],
            'kategori'          => 'nullable|string|max:40',
            'tgl'               => 'required|date',
            'cabang'            => 'required|string|exists:cabang,nama',
            'keterangan'        => 'required|string|max:255',
            'detail'            => 'required|array|min:2',
            'detail.*.kode_akun'  => 'required|string|exists:coa,kode',
            'detail.*.debit'      => 'nullable|numeric|min:0',
            'detail.*.kredit'     => 'nullable|numeric|min:0',
            'detail.*.keterangan' => 'nullable|string|max:255',
        ], [
            'detail.min'                => 'Jurnal minimal terdiri dari 2 baris akun.',
            'detail.*.kode_akun.exists' => 'Ada kode akun yang tidak ditemukan di COA.',
            'detail.*.kode_akun.required' => 'Ada baris yang akunnya belum dipilih.',
        ]);

        $lines = [];
        $totD = 0.0; $totK = 0.0;
        foreach ($data['detail'] as $i => $l) {
            $d = round((float) ($l['debit'] ?? 0), 2);
            $k = round((float) ($l['kredit'] ?? 0), 2);
            if ($d <= 0 && $k <= 0) continue; // baris kosong diabaikan
            if ($d > 0 && $k > 0) {
                abort(response()->json(['message' => 'Baris ' . ($i + 1) . ': isi Debit ATAU Kredit saja, jangan keduanya.'], 422));
            }
            $lines[] = ['kode_akun' => $l['kode_akun'], 'debit' => $d, 'kredit' => $k, 'keterangan' => $l['keterangan'] ?? null];
            $totD += $d; $totK += $k;
        }

        if (count($lines) < 2) {
            abort(response()->json(['message' => 'Jurnal minimal punya 2 baris yang terisi nominalnya.'], 422));
        }
        if (abs($totD - $totK) > 0.5) {
            abort(response()->json([
                'message' => 'Jurnal tidak seimbang: Debit Rp ' . number_format($totD, 0, ',', '.') .
                             ' ≠ Kredit Rp ' . number_format($totK, 0, ',', '.') . '.',
            ], 422));
        }

        $header = [
            'jenis'       => $data['jenis'],
            'kategori'    => $data['jenis'] === 'Memorial' ? ($data['kategori'] ?? null) : null,
            'tgl'         => $data['tgl'],
            'cabang'      => $data['cabang'],
            'keterangan'  => $data['keterangan'],
            'dibuat_oleh' => session('login_nama') ?: null,
        ];
        return [$header, $lines];
    }
}
