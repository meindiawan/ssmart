<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// ─── POIN MEMBER ────────────────────────────────────────────────────────────
// Rekap poin member LAMA (dari 7 file rekap kasir per cabang: Pusat, Bae,
// Pasar, Ugm, Padurenan/Durenan, Putri 1, Putri 2). SATU orang bisa punya
// banyak baris (satu per cabang) — kalau namanya SAMA PERSIS (dicocokkan
// case-insensitive + rapikan spasi), poinnya DIJUMLAHKAN jadi satu identitas
// di daftar rekap, tapi rinciannya per cabang tetap bisa dilihat lewat
// endpoint detail() saat baris itu diklik.
//
// Ini TERPISAH dari kolom `pelanggan.poin` yang dipakai Kasir POS (poin baru,
// real-time, langsung memotong Rupiah saat checkout) — supaya data histori
// lama tidak tercampur dengan sistem poin yang sedang berjalan.
//
// Endpoint:
//   GET    /api/poin                 → daftar rekap (search, sort) + ringkasan
//   GET    /api/poin/hadiah          → katalog hadiah
//   POST   /api/poin/hadiah          → tambah hadiah
//   PUT    /api/poin/hadiah/{id}     → ubah hadiah
//   DELETE /api/poin/hadiah/{id}     → hapus hadiah
//   POST   /api/poin/tukar           → tukar poin dengan hadiah
//   DELETE /api/poin/tukar/{id}      → batalkan penukaran (poin dikembalikan)
//   POST   /api/poin/import          → import/replace data dari Excel rekap per cabang
//   GET    /api/poin/{nama}          → detail 1 identitas: rincian per cabang + riwayat tukar
class PoinController extends Controller
{
    // Kunci pencocokan "identitas sama persis": rapikan spasi + huruf kecil,
    // supaya "abdul manap", " Abdul Manap ", dan "ABDUL  MANAP" dianggap sama.
    private function key(string $nama): string
    {
        return mb_strtolower(preg_replace('/\s+/', ' ', trim($nama)));
    }

    // Nama saja TIDAK selalu unik (ditemukan di data asli: "SOLIKIN" di Mejobo
    // dan "SOLIKIN" di Prambatan adalah 2 orang berbeda yang kebetulan sama
    // nama). Karena data antar cabang tidak selalu punya telp/ID member yang
    // konsisten, penggabungan tetap berdasar NAMA (sesuai diminta), tapi kalau
    // alamat antar baris beda-beda & tidak ada yang cocok sama sekali, kasih
    // peringatan supaya dicek manual sebelum poin ditukar.
    private function alamatBeragam($cabangRows): bool
    {
        $alamat = collect($cabangRows)
            ->map(fn($c) => is_array($c) ? ($c['alamat'] ?? null) : ($c->alamat ?? null))
            ->filter(fn($a) => trim((string) $a) !== '')
            ->map(fn($a) => mb_strtolower(trim($a)))
            ->unique();
        return $alamat->count() > 1;
    }

    public function index(Request $request)
    {
        $search = trim((string) $request->get('search', ''));
        $sort   = $request->get('sort', 'poin_desc'); // poin_desc | poin_asc | nama

        // Kalau ada kata pencarian, filter dulu di level SQL (WHERE ... LIKE)
        // SEBELUM digabung/dijumlah di PHP. Sebelumnya SEMUA baris dari 7
        // cabang selalu ditarik & digabung dulu baru difilter belakangan —
        // jadi tiap kali kotak pencarian "Cari nama member" trigger fetch
        // (walau sudah di-debounce), server tetap mengolah ULANG seluruh
        // data poin dari nol. Kalau datanya sudah ribuan baris, ini yang
        // bikin kerasa lambat/lag meski cuma 1-2 komputer yang pakai.
        $rowsQuery = DB::table('poin_member');
        if ($search !== '') {
            $rowsQuery->where('nama', 'like', '%' . $search . '%');
        }
        $rows  = $rowsQuery->orderBy('id')->get();
        $tukar = DB::table('poin_tukar')->get();

        $groups = [];
        foreach ($rows as $r) {
            $key = $this->key($r->nama);
            if ($key === '') continue;
            if (!isset($groups[$key])) {
                $groups[$key] = [
                    'nama' => trim($r->nama), 'alamat' => null, 'telp' => null,
                    'id_member' => null, 'cabang' => [], 'total_poin_diperoleh' => 0,
                ];
            }
            $groups[$key]['cabang'][] = [
                'cabang' => $r->cabang, 'poin' => (int) $r->poin,
                'alamat' => $r->alamat, 'telp' => $r->telp, 'id_member' => $r->id_member,
            ];
            $groups[$key]['total_poin_diperoleh'] += (int) $r->poin;
            if (!$groups[$key]['alamat'] && $r->alamat) $groups[$key]['alamat'] = $r->alamat;
            if (!$groups[$key]['telp'] && $r->telp) $groups[$key]['telp'] = $r->telp;
            if (!$groups[$key]['id_member'] && $r->id_member) $groups[$key]['id_member'] = $r->id_member;
        }

        $ditukarPerKey = [];
        foreach ($tukar as $t) {
            $key = $this->key($t->nama_member);
            $ditukarPerKey[$key] = ($ditukarPerKey[$key] ?? 0) + (int) $t->poin_dipakai;
        }

        $result = [];
        foreach ($groups as $key => $g) {
            $ditukar = $ditukarPerKey[$key] ?? 0;
            $result[] = [
                'nama' => $g['nama'], 'alamat' => $g['alamat'], 'telp' => $g['telp'],
                'id_member' => $g['id_member'], 'jumlah_cabang' => count($g['cabang']),
                'cabang' => $g['cabang'],
                'total_poin_diperoleh' => $g['total_poin_diperoleh'],
                'total_poin_ditukar'   => $ditukar,
                'total_poin_tersedia'  => $g['total_poin_diperoleh'] - $ditukar,
                'alamat_beragam'       => $this->alamatBeragam($g['cabang']),
            ];
        }

        if ($search !== '') {
            $needle = mb_strtolower($search);
            $result = array_values(array_filter($result, fn($r) => str_contains(mb_strtolower($r['nama']), $needle)));
        }

        match ($sort) {
            'poin_asc' => usort($result, fn($a, $b) => $a['total_poin_tersedia'] <=> $b['total_poin_tersedia']),
            'nama'     => usort($result, fn($a, $b) => strcmp($a['nama'], $b['nama'])),
            default    => usort($result, fn($a, $b) => $b['total_poin_tersedia'] <=> $a['total_poin_tersedia']),
        };

        return response()->json([
            'data' => $result,
            'ringkasan' => [
                'total_member'              => count($result),
                'total_poin_beredar'        => array_sum(array_column($result, 'total_poin_tersedia')),
                'total_poin_pernah_ditukar' => array_sum($ditukarPerKey),
                'daftar_cabang'             => DB::table('poin_member')->select('cabang')->distinct()->orderBy('cabang')->pluck('cabang'),
            ],
        ]);
    }

    public function detail(Request $request, string $nama)
    {
        $key = $this->key($nama);

        $rows = DB::table('poin_member')->get()
            ->filter(fn($r) => $this->key($r->nama) === $key)->values();
        if ($rows->isEmpty()) {
            return response()->json(['message' => 'Member tidak ditemukan'], 404);
        }

        $riwayatTukar = DB::table('poin_tukar')->orderByDesc('tgl')->orderByDesc('id')->get()
            ->filter(fn($t) => $this->key($t->nama_member) === $key)->values();

        $totalDiperoleh = (int) $rows->sum('poin');
        $totalDitukar   = (int) $riwayatTukar->sum('poin_dipakai');

        return response()->json([
            'nama' => trim($rows->first()->nama),
            'cabang' => $rows->map(fn($r) => [
                'id' => $r->id, 'cabang' => $r->cabang, 'poin' => (int) $r->poin,
                'alamat' => $r->alamat, 'telp' => $r->telp, 'id_member' => $r->id_member,
            ])->values(),
            'riwayat_tukar'        => $riwayatTukar,
            'total_poin_diperoleh' => $totalDiperoleh,
            'total_poin_ditukar'   => $totalDitukar,
            'total_poin_tersedia'  => $totalDiperoleh - $totalDitukar,
            'alamat_beragam'       => $this->alamatBeragam($rows),
        ]);
    }

    // ─── IMPORT / REPLACE DARI EXCEL REKAP PER CABANG ──────────────────────
    // Body: { items: [{ cabang, nama, alamat, telp, id_member, poin }, ...] }
    // Frontend (poin.js) membaca SEMUA sheet file Excel sekaligus — nama sheet
    // dipakai sebagai nama cabang. Import bersifat REPLACE per cabang: semua
    // baris lama milik cabang yang ikut di file diganti total, supaya upload
    // ulang file rekap bulan berikutnya tidak menumpuk/duplikat.
    public function import(Request $request)
    {
        $data = $request->validate([
            'items'              => 'required|array',
            'items.*.cabang'     => 'required|string',
            'items.*.nama'       => 'required|string',
            'items.*.poin'       => 'nullable|numeric',
        ]);

        $byCabang = [];
        foreach ($data['items'] as $it) {
            $cabang = trim($it['cabang']);
            $nama   = trim($it['nama'] ?? '');
            if ($cabang === '' || $nama === '') continue;
            $byCabang[$cabang][] = [
                'cabang'     => $cabang,
                'nama'       => $nama,
                'alamat'     => trim((string) ($it['alamat'] ?? '')) ?: null,
                'telp'       => trim((string) ($it['telp'] ?? '')) ?: null,
                'id_member'  => trim((string) ($it['id_member'] ?? '')) ?: null,
                'poin'       => (int) ($it['poin'] ?? 0),
                'created_at' => now(), 'updated_at' => now(),
            ];
        }

        $totalMasuk = 0;
        DB::transaction(function () use ($byCabang, &$totalMasuk) {
            foreach ($byCabang as $cabang => $baris) {
                // Hilangkan duplikat nama DALAM cabang yang sama pada 1 file
                // (kalau ada baris nama sama persis dobel di sheet-nya sendiri),
                // yang terakhir menang — supaya tidak bentrok dengan unique index.
                $unik = [];
                foreach ($baris as $b) $unik[mb_strtolower($b['nama'])] = $b;
                $baris = array_values($unik);

                DB::table('poin_member')->where('cabang', $cabang)->delete();
                foreach (array_chunk($baris, 500) as $chunk) {
                    DB::table('poin_member')->insert($chunk);
                    $totalMasuk += count($chunk);
                }
            }
        });

        return response()->json([
            'message'         => 'Import poin member selesai',
            'cabang_diproses' => array_keys($byCabang),
            'total_baris'     => $totalMasuk,
        ]);
    }

    // ─── KATALOG HADIAH ─────────────────────────────────────────────────────
    public function hadiahIndex()
    {
        return response()->json(DB::table('poin_hadiah')->orderBy('urutan')->orderBy('poin_silver')->get());
    }

    public function hadiahStore(Request $request)
    {
        $data = $request->validate([
            'nama'        => 'required|string|max:150',
            'kategori'    => 'nullable|string|max:100',
            'poin_silver' => 'required|integer|min:0',
            'poin_gold'   => 'nullable|integer|min:0',
            'emoji'       => 'nullable|string|max:10',
            'urutan'      => 'nullable|integer',
            'aktif'       => 'nullable|boolean',
        ]);
        $data['aktif']  = $data['aktif'] ?? true;
        $data['urutan'] = $data['urutan'] ?? 0;
        $id = DB::table('poin_hadiah')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('poin_hadiah')->find($id), 201);
    }

    public function hadiahUpdate(Request $request, int $id)
    {
        $data = $request->validate([
            'nama'        => 'sometimes|required|string|max:150',
            'kategori'    => 'nullable|string|max:100',
            'poin_silver' => 'sometimes|required|integer|min:0',
            'poin_gold'   => 'nullable|integer|min:0',
            'emoji'       => 'nullable|string|max:10',
            'urutan'      => 'nullable|integer',
            'aktif'       => 'nullable|boolean',
        ]);
        if (!DB::table('poin_hadiah')->where('id', $id)->exists()) {
            return response()->json(['message' => 'Hadiah tidak ditemukan'], 404);
        }
        DB::table('poin_hadiah')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('poin_hadiah')->find($id));
    }

    public function hadiahDestroy(int $id)
    {
        DB::table('poin_hadiah')->where('id', $id)->delete();
        return response()->json(['message' => 'Hadiah dihapus']);
    }

    // ─── PENUKARAN POIN ─────────────────────────────────────────────────────
    public function tukarStore(Request $request)
    {
        $data = $request->validate([
            'nama_member' => 'required|string|max:191',
            'tier'        => ['required', Rule::in(['Silver', 'Gold'])],
            'hadiah_id'   => 'required|integer|exists:poin_hadiah,id',
            'tgl'         => 'required|date',
            'cabang'      => 'nullable|string|max:100',
            'keterangan'  => 'nullable|string',
        ]);

        $hadiah = DB::table('poin_hadiah')->find($data['hadiah_id']);
        $biaya  = $data['tier'] === 'Gold' ? ($hadiah->poin_gold ?? $hadiah->poin_silver) : $hadiah->poin_silver;

        $key      = $this->key($data['nama_member']);
        $tersedia = (int) DB::table('poin_member')->whereRaw('LOWER(TRIM(nama)) = ?', [$key])->sum('poin');
        $terpakai = (int) DB::table('poin_tukar')->whereRaw('LOWER(TRIM(nama_member)) = ?', [$key])->sum('poin_dipakai');
        $sisa     = $tersedia - $terpakai;

        if ($sisa < $biaya) {
            return response()->json(['message' => "Poin {$data['nama_member']} tidak cukup. Tersedia {$sisa}, butuh {$biaya}."], 422);
        }

        $id = DB::table('poin_tukar')->insertGetId([
            'nama_member'  => trim($data['nama_member']),
            'tier'         => $data['tier'],
            'hadiah_id'    => $hadiah->id,
            'nama_hadiah'  => $hadiah->nama,
            'poin_dipakai' => $biaya,
            'tgl'          => $data['tgl'],
            'cabang'       => $data['cabang'] ?? null,
            'keterangan'   => $data['keterangan'] ?? null,
            'created_at'   => now(), 'updated_at' => now(),
        ]);

        return response()->json([
            'penukaran' => DB::table('poin_tukar')->find($id),
            'sisa_poin' => $sisa - $biaya,
        ], 201);
    }

    public function tukarDestroy(int $id)
    {
        DB::table('poin_tukar')->where('id', $id)->delete();
        return response()->json(['message' => 'Penukaran dibatalkan, poin dikembalikan']);
    }
}
