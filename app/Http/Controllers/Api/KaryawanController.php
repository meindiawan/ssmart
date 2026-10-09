<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class KaryawanController extends Controller
{
    // ─── MASTER KARYAWAN ─────────────────────────────────────────
    public function index(Request $request)
    {
        $q = DB::table('karyawan')->orderBy('nama');
        if ($s = $request->get('search')) {
            $q->where(fn($q) => $q->where('nama','like',"%$s%")->orWhere('kode','like',"%$s%")->orWhere('jabatan','like',"%$s%"));
        }
        if ($cab = $request->get('cabang')) $q->where('cabang', $cab);
        if ($status = $request->get('status')) $q->where('status', $status);
        return response()->json($q->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'kode'       => 'required|string|max:20|unique:karyawan,kode',
            'nama'       => 'required|string|max:200',
            'jabatan'    => 'nullable|string|max:100',
            'shift'      => ['nullable', Rule::in(['Pagi','Malam'])],
            'cabang'     => 'nullable|string|max:100',
            'telp'       => 'nullable|string|max:30',
            'tgl_masuk'  => 'nullable|date',
            'tipe_gaji'  => ['required', Rule::in(['Bulanan','Mingguan','Harian'])],
            'gaji_pokok' => 'required|numeric|min:0',
            'tunjangan'  => 'nullable|numeric|min:0',
            'status'     => ['nullable', Rule::in(['Aktif','Nonaktif'])],
            'catatan'    => 'nullable|string',
        ]);
        $data['tunjangan'] = $data['tunjangan'] ?? 0;
        $data['status']    = $data['status'] ?? 'Aktif';
        $data['shift']     = $data['shift'] ?? 'Pagi';
        $id = DB::table('karyawan')->insertGetId(array_merge($data, ['created_at'=>now(),'updated_at'=>now()]));
        return response()->json(DB::table('karyawan')->find($id), 201);
    }

    public function update(Request $request, int $id)
    {
        $data = $request->validate([
            'nama'       => 'sometimes|string|max:200',
            'jabatan'    => 'nullable|string|max:100',
            'shift'      => ['nullable', Rule::in(['Pagi','Malam'])],
            'cabang'     => 'nullable|string|max:100',
            'telp'       => 'nullable|string|max:30',
            'tgl_masuk'  => 'nullable|date',
            'tipe_gaji'  => ['sometimes', Rule::in(['Bulanan','Mingguan','Harian'])],
            'gaji_pokok' => 'sometimes|numeric|min:0',
            'tunjangan'  => 'nullable|numeric|min:0',
            'status'     => ['sometimes', Rule::in(['Aktif','Nonaktif'])],
            'catatan'    => 'nullable|string',
        ]);
        DB::table('karyawan')->where('id',$id)->update(array_merge($data,['updated_at'=>now()]));
        return response()->json(DB::table('karyawan')->find($id));
    }

    public function destroy(int $id)
    {
        DB::table('karyawan')->delete($id);
        return response()->json(['message'=>'Karyawan dihapus']);
    }

    // Import banyak karyawan sekaligus (mis. dari daftar gaji yang difoto/ditulis
    // tangan) — kode dibuat otomatis berurutan (KRY001, KRY002, dst) supaya
    // admin tidak perlu ketik satu-satu untuk puluhan/ratusan karyawan.
    public function importBulk(Request $request)
    {
        $request->validate([
            'items'                => 'required|array',
            'items.*.nama'         => 'required|string',
            'items.*.gaji_pokok'   => 'required|numeric|min:0',
            'items.*.tipe_gaji'    => ['required', Rule::in(['Bulanan','Mingguan','Harian'])],
        ]);

        // Cari nomor urut kode terakhir (KRY001, KRY002, ...) supaya lanjut, tidak tabrakan
        $lastKode = DB::table('karyawan')->where('kode','like','KRY%')
            ->orderByRaw('CAST(SUBSTRING(kode,4) AS UNSIGNED) DESC')->value('kode');
        $next = $lastKode ? ((int) substr($lastKode, 3)) + 1 : 1;

        $ditambahkan = [];
        foreach ($request->items as $item) {
            $nama = trim($item['nama']);
            if (!$nama) continue;
            $kode = 'KRY' . str_pad($next, 3, '0', STR_PAD_LEFT);
            $next++;
            $id = DB::table('karyawan')->insertGetId([
                'kode'       => $kode,
                'nama'       => $nama,
                'jabatan'    => trim($item['jabatan'] ?? '') ?: null,
                'shift'      => 'Pagi',
                'cabang'     => trim($item['cabang'] ?? '') ?: null,
                'tipe_gaji'  => $item['tipe_gaji'],
                'gaji_pokok' => (float) $item['gaji_pokok'],
                'tunjangan'  => (float) ($item['tunjangan'] ?? 0),
                'status'     => 'Aktif',
                'catatan'    => $item['catatan'] ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $ditambahkan[] = ['id'=>$id, 'kode'=>$kode, 'nama'=>$nama];
        }

        return response()->json([
            'message' => count($ditambahkan) . ' karyawan berhasil ditambahkan.',
            'jumlah'  => count($ditambahkan),
            'detail'  => $ditambahkan,
        ], 201);
    }

    // ─── ABSENSI ─────────────────────────────────────────────────
    public function getAbsensi(Request $request)
    {
        $q = DB::table('absensi')
            ->join('karyawan','absensi.karyawan_id','=','karyawan.id')
            ->select('absensi.*','karyawan.nama as nama_karyawan','karyawan.jabatan','karyawan.cabang as cabang_karyawan')
            ->orderByDesc('tgl')->orderBy('karyawan.nama');
        if ($tgl  = $request->get('tgl'))       $q->where('absensi.tgl', $tgl);
        if ($bln  = $request->get('bulan'))     $q->whereRaw('DATE_FORMAT(absensi.tgl,"%Y-%m") = ?', [$bln]);
        if ($kid  = $request->get('karyawan_id')) $q->where('absensi.karyawan_id', $kid);
        if ($cab  = $request->get('cabang'))    $q->where('karyawan.cabang', $cab);
        return response()->json($q->get());
    }

    public function storeAbsensi(Request $request)
    {
        $data = $request->validate([
            'tgl'          => 'required|date',
            'karyawan_id'  => 'required|integer|exists:karyawan,id',
            'status'       => ['required', Rule::in(['Hadir','Izin','Sakit','Alpha'])],
            'shift'        => ['nullable', Rule::in(['Pagi','Malam'])],
            'jam_masuk'    => 'nullable|date_format:H:i',
            'jam_keluar'   => 'nullable|date_format:H:i',
            'keterangan'   => 'nullable|string',
        ]);
        // Upsert — kalau sudah ada di hari yang sama, update
        $existing = DB::table('absensi')->where('tgl',$data['tgl'])->where('karyawan_id',$data['karyawan_id'])->first();
        if ($existing) {
            DB::table('absensi')->where('id',$existing->id)->update(array_merge($data,['updated_at'=>now()]));
            return response()->json(DB::table('absensi')->find($existing->id));
        }
        $id = DB::table('absensi')->insertGetId(array_merge($data,['created_at'=>now(),'updated_at'=>now()]));
        return response()->json(DB::table('absensi')->find($id), 201);
    }

    public function bulkAbsensi(Request $request)
    {
        // Catat absensi massal untuk 1 tanggal semua karyawan aktif
        $request->validate(['tgl'=>'required|date','items'=>'required|array','items.*.karyawan_id'=>'required|integer','items.*.status'=>'required|string']);
        $done = 0;
        foreach ($request->items as $item) {
            $existing = DB::table('absensi')->where('tgl',$request->tgl)->where('karyawan_id',$item['karyawan_id'])->first();
            $data = ['tgl'=>$request->tgl,'karyawan_id'=>$item['karyawan_id'],'status'=>$item['status'],'shift'=>$item['shift']??null,'keterangan'=>$item['keterangan']??null,'jam_masuk'=>$item['jam_masuk']??null,'jam_keluar'=>$item['jam_keluar']??null];
            if ($existing) {
                DB::table('absensi')->where('id',$existing->id)->update(array_merge($data,['updated_at'=>now()]));
            } else {
                DB::table('absensi')->insert(array_merge($data,['created_at'=>now(),'updated_at'=>now()]));
            }
            $done++;
        }
        return response()->json(['saved'=>$done]);
    }

    public function destroyAbsensi(int $id)
    {
        DB::table('absensi')->delete($id);
        return response()->json(['message'=>'Absensi dihapus']);
    }

    // ─── KASBON (dipakai form Gaji utk tahu sisa kasbon karyawan) ──
    public function kasbonSaldo(int $id)
    {
        $rows  = DB::table('trx_kasbon')->where('karyawan_id', $id)->get();
        $saldo = $rows->reduce(fn($c, $r) => $r->jenis === 'Diberikan' ? $c + $r->nominal : $c - $r->nominal, 0);
        return response()->json(['karyawan_id' => $id, 'saldo' => max(0, $saldo)]);
    }

    // ─── GAJI ────────────────────────────────────────────────────
    public function getGaji(Request $request)
    {
        $q = DB::table('gaji')
            ->join('karyawan','gaji.karyawan_id','=','karyawan.id')
            ->select('gaji.*','karyawan.kode as kode_karyawan','karyawan.nama as nama_karyawan','karyawan.jabatan','karyawan.tipe_gaji')
            ->orderByDesc('gaji.periode_mulai');
        if ($kid = $request->get('karyawan_id')) $q->where('gaji.karyawan_id',$kid);
        if ($cab = $request->get('cabang'))      $q->where('gaji.cabang',$cab);
        if ($thn = $request->get('tahun'))       $q->whereYear('gaji.periode_mulai',$thn);
        return response()->json($q->get());
    }

    public function storeGaji(Request $request)
    {
        $data = $request->validate([
            'karyawan_id'    => 'required|integer|exists:karyawan,id',
            'periode_mulai'  => 'required|date',
            'periode_selesai'=> 'required|date|after_or_equal:periode_mulai',
            'bonus'          => 'nullable|numeric|min:0',
            'potongan'       => 'nullable|numeric|min:0',
            'potong_kasbon'  => 'nullable|numeric|min:0',
            'keterangan'     => 'nullable|string',
            'cabang'         => 'nullable|string',
            'kode_akun'      => 'nullable|string|max:10',
        ]);

        $karyawan = DB::table('karyawan')->find($data['karyawan_id']);
        if (!$karyawan) return response()->json(['error'=>'Karyawan tidak ditemukan'],404);

        // Validasi potongan kasbon tidak melebihi sisa kasbon karyawan ybs
        $potongKasbon = (float) ($data['potong_kasbon'] ?? 0);
        if ($potongKasbon > 0) {
            $kasbonRows = DB::table('trx_kasbon')->where('karyawan_id', $data['karyawan_id'])->get();
            $saldoKasbon = $kasbonRows->reduce(fn($c, $r) => $r->jenis === 'Diberikan' ? $c + $r->nominal : $c - $r->nominal, 0);
            if ($potongKasbon > $saldoKasbon) {
                return response()->json([
                    'error' => 'Potongan kasbon (Rp' . number_format($potongKasbon, 0, ',', '.') . ') melebihi sisa kasbon karyawan ini (Rp' . number_format(max(0,$saldoKasbon), 0, ',', '.') . ').',
                ], 422);
            }
        }

        // Hitung hari kerja & hadir dari absensi periode ini
        $absensi = DB::table('absensi')
            ->where('karyawan_id', $data['karyawan_id'])
            ->whereBetween('tgl', [$data['periode_mulai'], $data['periode_selesai']])
            ->get();

        $hariHadir = $absensi->where('status','Hadir')->count();
        $hariIzin  = $absensi->whereIn('status',['Izin','Sakit'])->count();
        $hariAlpha = $absensi->where('status','Alpha')->count();
        $hariKerja = $absensi->count();

        // Hitung gaji: proporsional jika ada absensi, penuh jika tidak ada data absensi
        $gajiPokok = (float) $karyawan->gaji_pokok;
        $tunjangan = (float) $karyawan->tunjangan;
        $bonus     = (float)($data['bonus'] ?? 0);
        $potongan  = (float)($data['potongan'] ?? 0);

        if ($karyawan->tipe_gaji === 'Harian') {
            // Karyawan harian: gaji_pokok = TARIF PER HARI, bukan gaji per-periode.
            // Total = tarif harian x jumlah hari benar-benar Hadir di periode ini.
            // Tunjangan (kalau ada) tetap ditambahkan penuh, bukan per hari.
            if ($hariKerja === 0) {
                // Belum ada absensi sama sekali di periode ini — tidak bisa
                // diasumsikan "penuh" seperti karyawan bulanan (karena tidak
                // ada acuan berapa hari dia harusnya masuk). Ditolak eksplisit
                // supaya admin isi absensi dulu, daripada salah bayar.
                return response()->json([
                    'error' => 'Karyawan ini tipe gaji Harian tapi belum ada data Absensi di periode tsb. Isi Absensi dulu (menu Absensi) sebelum memproses gaji.',
                ], 422);
            }
            $totalPokok = $gajiPokok * $hariHadir;
            $total = max(0, $totalPokok + $tunjangan + $bonus - $potongan - $potongKasbon);
        } else {
            // Potongan alpha: per hari alpha dipotong 1/hari_kerja gaji pokok
            if ($hariKerja > 0 && $hariAlpha > 0) {
                $potonganAlpha = ($gajiPokok / $hariKerja) * $hariAlpha;
                $potongan += $potonganAlpha;
            }
            $total = max(0, $gajiPokok + $tunjangan + $bonus - $potongan - $potongKasbon);
        }

        // Simpan ke gaji
        $gajiId = DB::table('gaji')->insertGetId([
            'karyawan_id'     => $data['karyawan_id'],
            'periode_mulai'   => $data['periode_mulai'],
            'periode_selesai' => $data['periode_selesai'],
            'gaji_pokok'      => $gajiPokok,
            'tunjangan'       => $tunjangan,
            'bonus'           => $bonus,
            'potongan'        => $potongan,
            'potongan_kasbon' => $potongKasbon,
            'total'           => $total,
            'hari_kerja'      => $hariKerja,
            'hari_hadir'      => $hariHadir,
            'hari_izin'       => $hariIzin,
            'hari_alpha'      => $hariAlpha,
            'cabang'          => $data['cabang'] ?? $karyawan->cabang,
            'keterangan'      => trim(($data['keterangan'] ?? '') . ($karyawan->tipe_gaji === 'Harian' ? " [Harian: {$hariHadir} hari x " . number_format($gajiPokok,0,',','.') . "]" : '')) ?: null,
            'created_at'      => now(),
            'updated_at'      => now(),
        ]);

        // Otomatis catat ke pengeluaran (trx_biaya)
        $kodeAkun = $data['kode_akun'] ?? '6101'; // Beban Gaji
        $biayaId = DB::table('trx_biaya')->insertGetId([
            'tgl'        => $data['periode_selesai'],
            'cabang'     => $data['cabang'] ?? ($karyawan->cabang ?? 'Pusat'),
            'kode_akun'  => $kodeAkun,
            'nominal'    => $total,
            'bayar'      => 'Kas',
            'keterangan' => 'Gaji ' . $karyawan->nama . ' periode ' . $data['periode_mulai'] . ' s/d ' . $data['periode_selesai'],
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        // Simpan referensi ke trx_biaya
        DB::table('gaji')->where('id',$gajiId)->update(['trx_biaya_id'=>$biayaId]);

        // Kalau ada potongan kasbon, otomatis catat sebagai pelunasan kasbon
        // (jenis "Dibayar") supaya sisa kasbon karyawan ini berkurang.
        if ($potongKasbon > 0) {
            $kasbonTrxId = DB::table('trx_kasbon')->insertGetId([
                'karyawan_id'   => $data['karyawan_id'],
                'tgl'           => $data['periode_selesai'],
                'cabang'        => $data['cabang'] ?? ($karyawan->cabang ?? 'Pusat'),
                'nama_karyawan' => $karyawan->nama,
                'jenis'         => 'Dibayar',
                'nominal'       => $potongKasbon,
                'keterangan'    => 'Potongan otomatis dari gaji periode ' . $data['periode_mulai'] . ' s/d ' . $data['periode_selesai'],
                'created_at'    => now(),
                'updated_at'    => now(),
            ]);
            DB::table('gaji')->where('id',$gajiId)->update(['kasbon_trx_id'=>$kasbonTrxId]);
        }

        return response()->json(DB::table('gaji')->find($gajiId), 201);
    }

    public function destroyGaji(int $id)
    {
        $gaji = DB::table('gaji')->find($id);
        if ($gaji && $gaji->trx_biaya_id) {
            DB::table('trx_biaya')->delete($gaji->trx_biaya_id);
        }
        if ($gaji && $gaji->kasbon_trx_id) {
            DB::table('trx_kasbon')->delete($gaji->kasbon_trx_id);
        }
        DB::table('gaji')->delete($id);
        return response()->json(['message'=>'Data gaji dihapus, pengeluaran & potongan kasbon terkait dibatalkan']);
    }

    // ─── REKAP ABSENSI BULANAN ───────────────────────────────────
    public function rekapBulanan(Request $request)
    {
        $bulan = $request->get('bulan', date('Y-m'));
        $cabang = $request->get('cabang');

        $karyawanQ = DB::table('karyawan')->where('status','Aktif')->orderBy('nama');
        if ($cabang) $karyawanQ->where('cabang', $cabang);
        $karyawanList = $karyawanQ->get();

        $result = [];
        foreach ($karyawanList as $k) {
            $absenList = DB::table('absensi')
                ->where('karyawan_id', $k->id)
                ->whereRaw('DATE_FORMAT(tgl,"%Y-%m") = ?', [$bulan])
                ->get();
            $result[] = [
                'karyawan'    => $k,
                'hadir'       => $absenList->where('status','Hadir')->count(),
                'izin'        => $absenList->where('status','Izin')->count(),
                'sakit'       => $absenList->where('status','Sakit')->count(),
                'alpha'       => $absenList->where('status','Alpha')->count(),
                'total_hari'  => $absenList->count(),
            ];
        }
        return response()->json($result);
    }
}
