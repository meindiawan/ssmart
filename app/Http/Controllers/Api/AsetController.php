<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AsetPenyusutanService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class AsetController extends Controller
{
    private function svc(): AsetPenyusutanService
    {
        return app(AsetPenyusutanService::class);
    }

    // ─── DAFTAR ASET (+ nilai buku berjalan) ───────────────────────────────────
    public function index(Request $request)
    {
        $q = DB::table('aset_tetap');
        if ($request->filled('cabang'))   $q->where('cabang', $request->get('cabang'));
        if ($request->filled('status'))   $q->where('status', $request->get('status'));
        if ($request->filled('kategori')) $q->where('kategori', $request->get('kategori'));
        if ($request->filled('search')) {
            $s = $request->get('search');
            $q->where(function ($w) use ($s) {
                $w->where('nama', 'like', "%{$s}%")->orWhere('kode', 'like', "%{$s}%");
            });
        }

        $list = $q->orderBy('tgl_perolehan', 'desc')->orderBy('id', 'desc')->get()->map(function ($a) {
            $r = $this->svc()->ringkasan($a);
            return array_merge((array) $a, $r);
        });

        return response()->json(['data' => $list->values()]);
    }

    // ─── RINGKASAN KARTU (total nilai perolehan, akumulasi, nilai buku) ────────
    public function summary(Request $request)
    {
        $q = DB::table('aset_tetap');
        if ($request->filled('cabang')) $q->where('cabang', $request->get('cabang'));
        $list = $q->get();

        $totalPerolehan = 0.0; $totalAkumulasi = 0.0; $aktif = 0;
        foreach ($list as $a) {
            $r = $this->svc()->ringkasan($a);
            $totalPerolehan += (float) $a->nilai_perolehan;
            $totalAkumulasi += $r['akumulasi_penyusutan'];
            if ($a->status === 'Aktif') $aktif++;
        }

        return response()->json([
            'jumlah_aset'          => $list->count(),
            'jumlah_aktif'         => $aktif,
            'total_nilai_perolehan'=> round($totalPerolehan, 2),
            'total_akumulasi'      => round($totalAkumulasi, 2),
            'total_nilai_buku'     => round($totalPerolehan - $totalAkumulasi, 2),
        ]);
    }

    private function rules(bool $forUpdate = false): array
    {
        return [
            'nama'                => 'required|string|max:150',
            'kategori'            => 'required|string|max:50',
            'cabang'              => 'nullable|string|max:100',
            'tgl_perolehan'       => 'required|date',
            'nilai_perolehan'     => 'required|numeric|min:0',
            'nilai_residu'        => 'nullable|numeric|min:0',
            'umur_manfaat_bulan'  => 'required|integer|min:1|max:1200',
            'bayar'               => ['required', Rule::in(['Tunai', 'Kredit'])],
            'kode_kas'            => 'nullable|string|max:10',
            'keterangan'          => 'nullable|string',
        ];
    }

    // ─── TAMBAH ──────────────────────────────────────────────────────────────
    public function store(Request $request)
    {
        $data = $request->validate($this->rules());
        $data['nilai_residu'] = $data['nilai_residu'] ?? 0;

        if ($data['nilai_residu'] > $data['nilai_perolehan']) {
            return response()->json(['message' => 'Nilai residu tidak boleh lebih besar dari nilai perolehan.'], 422);
        }

        // Buat kode urut otomatis: AT-0001, AT-0002, ...
        $terakhir = DB::table('aset_tetap')->orderByDesc('id')->value('id') ?? 0;
        $data['kode'] = 'AT-' . str_pad((string) ($terakhir + 1), 4, '0', STR_PAD_LEFT);
        $data['status'] = 'Aktif';
        $data['created_at'] = now();
        $data['updated_at'] = now();

        $id = DB::table('aset_tetap')->insertGetId($data);
        $aset = DB::table('aset_tetap')->find($id);
        return response()->json(array_merge((array) $aset, $this->svc()->ringkasan($aset)), 201);
    }

    // ─── EDIT ────────────────────────────────────────────────────────────────
    public function update(Request $request, int $id)
    {
        $aset = DB::table('aset_tetap')->find($id);
        if (!$aset) return response()->json(['message' => 'Aset tidak ditemukan'], 404);

        $data = $request->validate($this->rules(true));
        $data['nilai_residu'] = $data['nilai_residu'] ?? 0;
        if ($data['nilai_residu'] > $data['nilai_perolehan']) {
            return response()->json(['message' => 'Nilai residu tidak boleh lebih besar dari nilai perolehan.'], 422);
        }
        $data['updated_at'] = now();

        DB::table('aset_tetap')->where('id', $id)->update($data);
        $aset = DB::table('aset_tetap')->find($id);
        return response()->json(array_merge((array) $aset, $this->svc()->ringkasan($aset)));
    }

    // ─── NONAKTIFKAN (Dijual / Dihapus) — menghentikan penyusutan lebih lanjut ──
    public function nonaktifkan(Request $request, int $id)
    {
        $aset = DB::table('aset_tetap')->find($id);
        if (!$aset) return response()->json(['message' => 'Aset tidak ditemukan'], 404);

        $data = $request->validate([
            'status'     => ['required', Rule::in(['Dijual', 'Dihapus'])],
            'tgl_stop'   => 'required|date',
            'keterangan' => 'nullable|string',
        ]);
        $data['updated_at'] = now();
        DB::table('aset_tetap')->where('id', $id)->update($data);

        $aset = DB::table('aset_tetap')->find($id);
        return response()->json(array_merge((array) $aset, $this->svc()->ringkasan($aset)));
    }

    // ─── AKTIFKAN KEMBALI ────────────────────────────────────────────────────
    public function aktifkan(int $id)
    {
        $aset = DB::table('aset_tetap')->find($id);
        if (!$aset) return response()->json(['message' => 'Aset tidak ditemukan'], 404);
        DB::table('aset_tetap')->where('id', $id)->update(['status' => 'Aktif', 'tgl_stop' => null, 'updated_at' => now()]);
        $aset = DB::table('aset_tetap')->find($id);
        return response()->json(array_merge((array) $aset, $this->svc()->ringkasan($aset)));
    }

    // ─── HAPUS ───────────────────────────────────────────────────────────────
    public function destroy(int $id)
    {
        DB::table('aset_tetap')->where('id', $id)->delete();
        return response()->json(['message' => 'Aset dihapus. Jurnal perolehan & penyusutannya otomatis ikut hilang.']);
    }

    // ─── JADWAL PENYUSUTAN (drill-down 1 aset) ──────────────────────────────────
    public function jadwalPenyusutan(int $id)
    {
        $aset = DB::table('aset_tetap')->find($id);
        if (!$aset) return response()->json(['message' => 'Aset tidak ditemukan'], 404);

        $jadwal = $this->svc()->jadwal($aset);
        $ringkasan = $this->svc()->ringkasan($aset);

        return response()->json([
            'aset'      => $aset,
            'jadwal'    => $jadwal,
            'ringkasan' => $ringkasan,
        ]);
    }
}
