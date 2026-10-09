<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class StokController extends Controller
{
    // ─── Helper: setting stok boleh minus atau tidak (Master > Pengaturan) ──
    private function stokBolehMinus(): bool
    {
        $v = DB::table('settings')->where('key', 'stok_boleh_minus')->value('value');
        return $v === null ? true : $v === '1';
    }

    // ─── Helper: update saldo stok ───────────────────────────────
    private function updateStok(string $kodeBarang, string $cabang, float $delta): void
    {
        $bolehMinus = $this->stokBolehMinus();
        $existing = DB::table('stok')
            ->where('kode_barang', $kodeBarang)
            ->where('cabang', $cabang)
            ->first();

        if ($existing) {
            $newQty = $existing->qty + $delta;
            if (!$bolehMinus) $newQty = max(0, $newQty);
            DB::table('stok')
                ->where('kode_barang', $kodeBarang)
                ->where('cabang', $cabang)
                ->update(['qty' => $newQty, 'updated_at' => now()]);
        } else {
            $newQty = $bolehMinus ? $delta : max(0, $delta);
            DB::table('stok')->insert([
                'kode_barang' => $kodeBarang,
                'cabang'      => $cabang,
                'qty'         => $newQty,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        }
        // Kartu HPP (rata-rata bergerak per cabang) dibangun ulang setiap kali
        // stok barang ini bergerak — lihat App\Services\HppService.
        if ($delta != 0) app(\App\Services\HppService::class)->rebuildItem($kodeBarang);
    }

    // ─── Helper: cari barang by kode/barcode ──────────────────────
    private function cariBarangStok(string $kodeAtauBarcode): ?object
    {
        $k = trim($kodeAtauBarcode);
        return DB::table('barang')
            ->where('kode', $k)->orWhere('barcode', $k)->orWhere('barcode2', $k)->orWhere('barcode3', $k)
            ->first();
    }

    // ─── Helper: konversi qty/harga input (satuan bebas) ke satuan dasar ──
    // Sama persis pola TransaksiController::konversiSatuan() — supaya staf
    // gudang bisa catat "2 DUS" dan stok tetap benar dalam PCS di belakang
    // layar, tanpa perlu hitung manual.
    private function konversiSatuanStok(?object $barang, float $qtyInput, float $hargaInput, ?string $satuanInput): array
    {
        $satuanDasar = $barang?->satuan1 ?? 'PCS';
        $satuan      = trim($satuanInput ?? '') ?: $satuanDasar;
        $isi         = (float) ($barang?->isi ?? 1);
        $isSatuan2   = $barang && $barang->satuan2 && strcasecmp(trim($barang->satuan2), $satuan) === 0;

        if ($isSatuan2 && $isi > 0) {
            return [
                'satuan' => $satuan, 'qty_asal' => $qtyInput, 'harga_asal' => $hargaInput,
                'qty' => round($qtyInput * $isi, 4), 'harga' => round($hargaInput / $isi, 2),
            ];
        }
        return [
            'satuan' => $satuan, 'qty_asal' => null, 'harga_asal' => null,
            'qty' => $qtyInput, 'harga' => $hargaInput,
        ];
    }

    // ─── GET STOK ────────────────────────────────────────────────
    // Kartu Stok Semua Barang: bisa diurutkan (default nama A-Z) —
    // 'sort' menerima: nama (default), qty_asc (qty paling sedikit dulu,
    // berguna utk cepat lihat barang yang mau habis), qty_desc,
    // nilai_desc (nilai stok rupiah tertinggi dulu), nilai_asc.
    public function getStok(Request $request)
    {
        $q = DB::table('stok')
            ->join('barang', 'stok.kode_barang', '=', 'barang.kode')
            ->select('stok.*', 'barang.nama', 'barang.satuan1', 'barang.satuan2',
                     'barang.harga_jual', 'barang.modal', 'barang.stok_min', 'barang.stok_max',
                     'barang.kategori', 'barang.ppn');

        if ($cab = $request->get('cabang')) $q->where('stok.cabang', $cab);
        if ($s   = $request->get('search')) {
            $q->where(fn($q) => $q->where('barang.nama','like',"%$s%")
                ->orWhere('stok.kode_barang','like',"%$s%"));
        }
        if ($request->get('minim') == '1') {
            $q->whereRaw('stok.qty <= barang.stok_min AND barang.stok_min > 0');
        }

        switch ($request->get('sort')) {
            case 'qty_asc':   $q->orderBy('stok.qty', 'asc');  break;
            case 'qty_desc':  $q->orderBy('stok.qty', 'desc'); break;
            case 'nilai_desc':$q->orderByRaw('(stok.qty * barang.modal) desc'); break;
            case 'nilai_asc': $q->orderByRaw('(stok.qty * barang.modal) asc');  break;
            default:          $q->orderBy('barang.nama');
        }

        // Ringkasan semua cabang per barang jika tidak filter cabang
        $list = $q->get();

        // Tambah flag stok rendah
        $list = $list->map(function($item) {
            $item->stok_rendah = $item->stok_min > 0 && $item->qty <= $item->stok_min;
            $item->nilai_stok  = $item->qty * $item->modal;
            return $item;
        });

        return response()->json($list);
    }

    // Kartu Stok Semua Barang, DIRANGKUM per barang (semua cabang digabung) —
    // dipakai saat filter Cabang = "Semua Cabang". Sort sama seperti getStok().
    public function getStokSemua(Request $request)
    {
        $q = DB::table('stok')
            ->join('barang', 'stok.kode_barang', '=', 'barang.kode')
            ->select('stok.kode_barang', 'barang.nama', 'barang.satuan1', 'barang.modal',
                     'barang.stok_min', 'barang.kategori',
                     DB::raw('SUM(stok.qty) as qty_total'),
                     DB::raw('SUM(stok.qty * barang.modal) as nilai_total'))
            ->groupBy('stok.kode_barang','barang.nama','barang.satuan1','barang.modal','barang.stok_min','barang.kategori');

        if ($s = $request->get('search')) {
            $q->where(fn($q) => $q->where('barang.nama','like',"%$s%")
                ->orWhere('stok.kode_barang','like',"%$s%"));
        }

        switch ($request->get('sort')) {
            case 'qty_asc':   $q->orderBy('qty_total', 'asc');  break;
            case 'qty_desc':  $q->orderBy('qty_total', 'desc'); break;
            case 'nilai_desc':$q->orderBy('nilai_total', 'desc'); break;
            case 'nilai_asc': $q->orderBy('nilai_total', 'asc');  break;
            default:          $q->orderBy('barang.nama');
        }

        $list = $q->get()->map(function($item) {
            $item->stok_rendah = $item->stok_min > 0 && $item->qty_total <= $item->stok_min;
            return $item;
        });

        return response()->json($list);
    }

    // ─── BARANG MASUK ────────────────────────────────────────────
    public function getBarangMasuk(Request $request)
    {
        $q = DB::table('barang_masuk')
            ->join('barang', 'barang_masuk.kode_barang', '=', 'barang.kode')
            ->select('barang_masuk.*', 'barang.nama as nama_barang', 'barang.satuan1')
            ->orderByDesc('barang_masuk.tgl')->orderByDesc('barang_masuk.id');

        if ($cab = $request->get('cabang'))  $q->where('barang_masuk.cabang', $cab);
        if ($bln = $request->get('bulan'))   $q->whereRaw('DATE_FORMAT(barang_masuk.tgl,"%Y-%m") = ?', [$bln]);
        if ($s   = $request->get('search'))  $q->where(fn($q) => $q->where('barang.nama','like',"%$s%")->orWhere('barang_masuk.kode_barang','like',"%$s%")->orWhere('barang_masuk.no_dok','like',"%$s%"));

        return response()->json($q->get());
    }

    public function storeBarangMasuk(Request $request)
    {
        $data = $request->validate([
            'no_dok'      => 'nullable|string|max:50',
            'tgl'         => 'required|date',
            'cabang'      => 'required|string|max:100',
            'kode_barang' => 'required|string|exists:barang,kode',
            'satuan'      => 'nullable|string|max:20',
            'qty'         => 'required|numeric|min:0.01',
            'harga_beli'  => 'nullable|numeric|min:0',
            'supplier'    => 'nullable|string|max:100|exists:supplier,nama',
            'keterangan'  => 'nullable|string',
        ]);

        // Konversi qty/harga ke satuan dasar kalau yang dipilih adalah
        // satuan besar (mis. DUS) — supaya stok tetap akurat.
        $barang = $this->cariBarangStok($data['kode_barang']);
        $konv   = $this->konversiSatuanStok($barang, (float) $data['qty'], (float) ($data['harga_beli'] ?? 0), $data['satuan'] ?? null);

        $row = [
            'no_dok' => $data['no_dok'] ?? null, 'tgl' => $data['tgl'], 'cabang' => $data['cabang'],
            'kode_barang' => $data['kode_barang'],
            'satuan' => $konv['satuan'], 'qty' => $konv['qty'], 'qty_asal' => $konv['qty_asal'],
            'harga_beli' => $konv['harga'], 'harga_asal' => $konv['harga_asal'],
            'supplier' => $data['supplier'] ?? null, 'keterangan' => $data['keterangan'] ?? null,
        ];

        $id = DB::table('barang_masuk')->insertGetId(array_merge($row, ['created_at'=>now(),'updated_at'=>now()]));
        $this->updateStok($data['kode_barang'], $data['cabang'], (float) $konv['qty']);

        return response()->json(DB::table('barang_masuk')->find($id), 201);
    }

    public function destroyBarangMasuk(int $id)
    {
        $row = DB::table('barang_masuk')->find($id);
        if (!$row) return response()->json(['error'=>'Tidak ditemukan'], 404);
        $this->updateStok($row->kode_barang, $row->cabang, -(float)$row->qty);
        DB::table('barang_masuk')->delete($id);
        return response()->json(['message'=>'Barang masuk dihapus, stok disesuaikan']);
    }

    // ─── BARANG KELUAR ───────────────────────────────────────────
    public function getBarangKeluar(Request $request)
    {
        $q = DB::table('barang_keluar')
            ->join('barang', 'barang_keluar.kode_barang', '=', 'barang.kode')
            ->select('barang_keluar.*', 'barang.nama as nama_barang', 'barang.satuan1')
            ->orderByDesc('barang_keluar.tgl')->orderByDesc('barang_keluar.id');

        if ($cab = $request->get('cabang'))  $q->where('barang_keluar.cabang', $cab);
        if ($bln = $request->get('bulan'))   $q->whereRaw('DATE_FORMAT(barang_keluar.tgl,"%Y-%m") = ?', [$bln]);
        if ($s   = $request->get('search'))  $q->where(fn($q) => $q->where('barang.nama','like',"%$s%")->orWhere('barang_keluar.kode_barang','like',"%$s%"));

        return response()->json($q->get());
    }

    public function storeBarangKeluar(Request $request)
    {
        $data = $request->validate([
            'no_dok'      => 'nullable|string|max:50',
            'tgl'         => 'required|date',
            'cabang'      => 'required|string|max:100',
            'kode_barang' => 'required|string|exists:barang,kode',
            'satuan'      => 'nullable|string|max:20',
            'qty'         => 'required|numeric|min:0.01',
            'harga_jual'  => 'nullable|numeric|min:0',
            'jenis'       => ['nullable', \Illuminate\Validation\Rule::in(['Penjualan','Retur Beli','Rusak','Sample','Lainnya'])],
            'keterangan'  => 'nullable|string',
        ]);

        $barang = $this->cariBarangStok($data['kode_barang']);
        $konv   = $this->konversiSatuanStok($barang, (float) $data['qty'], (float) ($data['harga_jual'] ?? 0), $data['satuan'] ?? null);

        // Cek stok cukup — hanya diblokir jika setting stok tidak boleh minus
        if (!$this->stokBolehMinus()) {
            $stok = DB::table('stok')->where('kode_barang',$data['kode_barang'])->where('cabang',$data['cabang'])->first();
            $stokQty = $stok ? (float)$stok->qty : 0;
            if ($stokQty < (float) $konv['qty']) {
                return response()->json(['error' => "Stok tidak cukup. Stok tersedia: {$stokQty}"], 422);
            }
        }

        $row = [
            'no_dok' => $data['no_dok'] ?? null, 'tgl' => $data['tgl'], 'cabang' => $data['cabang'],
            'kode_barang' => $data['kode_barang'],
            'satuan' => $konv['satuan'], 'qty' => $konv['qty'], 'qty_asal' => $konv['qty_asal'],
            'harga_jual' => $konv['harga'], 'harga_asal' => $konv['harga_asal'],
            'jenis' => $data['jenis'] ?? 'Penjualan', 'keterangan' => $data['keterangan'] ?? null,
        ];

        $id = DB::table('barang_keluar')->insertGetId(array_merge($row, ['created_at'=>now(),'updated_at'=>now()]));
        $this->updateStok($data['kode_barang'], $data['cabang'], -(float) $konv['qty']);

        return response()->json(DB::table('barang_keluar')->find($id), 201);
    }

    public function destroyBarangKeluar(int $id)
    {
        $row = DB::table('barang_keluar')->find($id);
        if (!$row) return response()->json(['error'=>'Tidak ditemukan'], 404);
        $this->updateStok($row->kode_barang, $row->cabang, (float)$row->qty);
        DB::table('barang_keluar')->delete($id);
        return response()->json(['message'=>'Barang keluar dihapus, stok dikembalikan']);
    }

    // ─── STOK OPNAME ─────────────────────────────────────────────
    public function getOpname(Request $request)
    {
        $q = DB::table('stok_opname')->orderByDesc('tgl');
        if ($cab = $request->get('cabang')) $q->where('cabang', $cab);
        $hppSvc = app(\App\Services\HppService::class);
        $list = $q->orderByDesc('id')->get()->map(function($so) use ($hppSvc) {
            $det = DB::table('stok_opname_detail')
                ->join('barang', 'stok_opname_detail.kode_barang', '=', 'barang.kode')
                ->where('opname_id', $so->id)
                ->select('stok_opname_detail.*', 'barang.nama as nama_barang')
                ->get();
            $so->detail_count = $det->count();
            // Opname per barang → tampilkan barang, qty & nilai jurnalnya langsung di daftar
            if ($det->count() === 1) {
                $d = $det->first();
                $so->kode_barang = $d->kode_barang;
                $so->nama_barang = $d->nama_barang;
                $so->qty_sistem  = (float) $d->qty_sistem;
                $so->qty_fisik   = (float) $d->qty_fisik;
                $so->selisih     = (float) $d->selisih;
                $so->nilai       = $so->status === 'Selesai'
                    ? ($hppSvc->hppNilaiOpname([$d->id])[$d->id] ?? 0) : 0;
            }
            return $so;
        });
        return response()->json($list);
    }

    // ─── STOK OPNAME PER BARANG (tanggal dipilih manual) ──────────
    // Satu opname = satu barang di satu cabang pada tanggal yang dipilih.
    // Qty sistem = saldo barang itu PADA TANGGAL tsb (Kartu Stok), bukan
    // saldo hari ini. Langsung berstatus Selesai: selisih (fisik − sistem)
    // ditambahkan ke saldo stok, masuk Kartu HPP, dan otomatis membentuk
    // jurnal (Dr/Cr 1105 Persediaan vs 5102 Penyesuaian Stok) lewat
    // DashboardController::buildJurnal.
    public function storeOpnameBarang(Request $request)
    {
        $data = $request->validate([
            'tgl'         => 'required|date',
            'cabang'      => 'required|string|max:100',
            'kode_barang' => 'required|string|exists:barang,kode',
            'qty_fisik'   => 'required|numeric|min:0',
            'harga'       => 'nullable|numeric|min:0',
            'keterangan'  => 'nullable|string',
        ]);
        $tgl = date('Y-m-d', strtotime($data['tgl']));

        $sistem = $this->qtySistemPerTanggal($data['kode_barang'], $data['cabang'], $tgl);
        $fisik  = round((float) $data['qty_fisik'], 2);
        $selisih = round($fisik - $sistem, 2);

        $prefix = 'SO-' . date('Ymd', strtotime($tgl)) . '-';
        $n = DB::table('stok_opname')->where('no_so', 'like', $prefix . '%')->count() + 1;
        while (DB::table('stok_opname')->where('no_so', $prefix . str_pad($n, 3, '0', STR_PAD_LEFT))->exists()) $n++;
        $noSo = $prefix . str_pad($n, 3, '0', STR_PAD_LEFT);

        // HPP per satuan utk qty tambahan (hanya berlaku kalau fisik > sistem).
        // Kosong = ikut HPP rata-rata; 0 = HPP 0; angka = HPP manual.
        $harga = ($selisih > 0 && isset($data['harga']) && $data['harga'] !== '') ? round((float) $data['harga'], 2) : null;

        $detailId = null;
        $id = DB::transaction(function () use ($data, $tgl, $noSo, $sistem, $fisik, $selisih, $harga, &$detailId) {
            $id = DB::table('stok_opname')->insertGetId([
                'no_so'      => $noSo,
                'tgl'        => $tgl,
                'cabang'     => $data['cabang'],
                'status'     => 'Selesai',
                'keterangan' => $data['keterangan'] ?? null,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
            $detailId = DB::table('stok_opname_detail')->insertGetId([
                'opname_id'   => $id,
                'kode_barang' => $data['kode_barang'],
                'qty_sistem'  => $sistem,
                'qty_fisik'   => $fisik,
                'selisih'     => $selisih,
                'harga'       => $harga,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
            return $id;
        });

        // Geser saldo stok real-time sebesar selisih (bukan di-SET ke qty fisik,
        // karena tanggal opname bisa mundur & ada transaksi sesudahnya).
        // updateStok sekaligus membangun ulang Kartu HPP barang ini.
        if ($selisih != 0) {
            $this->updateStok($data['kode_barang'], $data['cabang'], $selisih);
        }

        $nilai = app(\App\Services\HppService::class)->hppNilaiOpname([$detailId])[$detailId] ?? 0;

        return response()->json([
            'id'         => $id,
            'no_so'      => $noSo,
            'tgl'        => $tgl,
            'qty_sistem' => $sistem,
            'qty_fisik'  => $fisik,
            'selisih'    => $selisih,
            'nilai'      => round($nilai, 2),
            'harga'      => $harga,
            'jurnal'     => $selisih != 0,   // baris jurnal opname selalu dibuat bila ada selisih (nilai bisa Rp 0)
        ], 201);
    }

    // Daftar barang yang stoknya minus di satu cabang (saat ini) — untuk dibereskan lewat opname
    public function opnameMinus(Request $request)
    {
        $q = DB::table('stok')->join('barang', 'stok.kode_barang', '=', 'barang.kode')
            ->where('stok.qty', '<', 0)
            ->select('stok.kode_barang as kode', 'barang.nama', 'barang.satuan1 as satuan', 'stok.cabang', 'stok.qty')
            ->orderBy('stok.qty');
        if ($cab = $request->get('cabang')) $q->where('stok.cabang', $cab);
        return response()->json($q->limit(300)->get());
    }

    // Pratinjau qty sistem pada tanggal tertentu (dipakai form sebelum simpan)
    public function opnameSistem(Request $request)
    {
        $request->validate([
            'kode_barang' => 'required|string|exists:barang,kode',
            'cabang'      => 'required|string',
            'tanggal'     => 'required|date',
        ]);
        return response()->json([
            'qty_sistem' => $this->qtySistemPerTanggal($request->kode_barang, $request->cabang, date('Y-m-d', strtotime($request->tanggal))),
        ]);
    }

    private function qtySistemPerTanggal(string $kode, string $cabang, string $tgl): float
    {
        $req = Request::create('/stok/kartu', 'GET', ['kode_barang' => $kode, 'cabang' => $cabang, 'tanggal' => $tgl]);
        $res = $this->kartuStok($req)->getData(true);
        return round((float) ($res['saldo_per_tanggal'] ?? 0), 2);
    }

    public function storeOpname(Request $request)
    {
        $data = $request->validate([
            'tgl'        => 'required|date',
            'cabang'     => 'required|string|max:100',
            'keterangan' => 'nullable|string',
        ]);
        // Generate nomor SO
        $count  = DB::table('stok_opname')->count() + 1;
        $no_so  = 'SO-' . date('Ymd') . '-' . str_pad($count, 3, '0', STR_PAD_LEFT);

        // Ambil semua stok di cabang ini sebagai draft
        $stokList = DB::table('stok')
            ->join('barang','stok.kode_barang','=','barang.kode')
            ->where('stok.cabang', $data['cabang'])
            ->select('stok.kode_barang','stok.qty')
            ->get();

        $id = DB::table('stok_opname')->insertGetId(array_merge($data, [
            'no_so'      => $no_so,
            'status'     => 'Draft',
            'created_at' => now(),
            'updated_at' => now(),
        ]));

        // Buat detail draft dari stok sistem
        foreach ($stokList as $s) {
            DB::table('stok_opname_detail')->insert([
                'opname_id'  => $id,
                'kode_barang'=> $s->kode_barang,
                'qty_sistem' => $s->qty,
                'qty_fisik'  => $s->qty, // default sama dengan sistem, user nanti update
                'selisih'    => 0,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }

        return response()->json(DB::table('stok_opname')->find($id), 201);
    }

    public function getOpnameDetail(int $id)
    {
        $so = DB::table('stok_opname')->find($id);
        if (!$so) return response()->json(['error'=>'Tidak ditemukan'], 404);

        $detail = DB::table('stok_opname_detail')
            ->join('barang','stok_opname_detail.kode_barang','=','barang.kode')
            ->where('stok_opname_detail.opname_id', $id)
            ->select('stok_opname_detail.*','barang.nama','barang.satuan1','barang.kategori')
            ->orderBy('barang.nama')
            ->get();

        return response()->json(['opname' => $so, 'detail' => $detail]);
    }

    public function updateOpnameDetail(Request $request, int $opnameId)
    {
        $request->validate(['items'=>'required|array','items.*.id'=>'required|integer','items.*.qty_fisik'=>'required|numeric|min:0']);

        foreach ($request->items as $item) {
            $detail = DB::table('stok_opname_detail')->find($item['id']);
            if (!$detail || $detail->opname_id != $opnameId) continue;
            $selisih = (float)$item['qty_fisik'] - (float)$detail->qty_sistem;
            DB::table('stok_opname_detail')->where('id', $item['id'])->update([
                'qty_fisik'  => $item['qty_fisik'],
                'selisih'    => $selisih,
                'updated_at' => now(),
            ]);
        }
        return response()->json(['message' => 'Detail diperbarui']);
    }

    public function selesaiOpname(int $id)
    {
        $so = DB::table('stok_opname')->find($id);
        if (!$so) return response()->json(['error'=>'Tidak ditemukan'], 404);
        if ($so->status === 'Selesai') return response()->json(['error'=>'Sudah selesai'], 422);

        $detail = DB::table('stok_opname_detail')->where('opname_id', $id)->get();

        // Sesuaikan stok berdasarkan qty fisik
        foreach ($detail as $d) {
            $stok = DB::table('stok')->where('kode_barang',$d->kode_barang)->where('cabang',$so->cabang)->first();
            if ($stok) {
                DB::table('stok')->where('id',$stok->id)->update(['qty'=>$d->qty_fisik,'updated_at'=>now()]);
            } else {
                DB::table('stok')->insert(['kode_barang'=>$d->kode_barang,'cabang'=>$so->cabang,'qty'=>$d->qty_fisik,'created_at'=>now(),'updated_at'=>now()]);
            }
        }

        DB::table('stok_opname')->where('id',$id)->update(['status'=>'Selesai','updated_at'=>now()]);

        // Kartu HPP: selisih opname (fisik vs sistem) ikut dinilai di rata-rata
        // berjalan tiap barang yang selisihnya bukan 0 — lihat HppService.
        $hpp = app(\App\Services\HppService::class);
        foreach ($detail as $d) {
            if ((float) $d->selisih != 0) $hpp->rebuildItem($d->kode_barang);
        }

        return response()->json(['message'=>'Stok opname selesai, stok telah disesuaikan']);
    }

    public function destroyOpname(int $id)
    {
        $so = DB::table('stok_opname')->find($id);
        if (!$so) return response()->json(['error'=>'Tidak ditemukan'], 404);
        $detail = DB::table('stok_opname_detail')->where('opname_id',$id)->get();
        DB::table('stok_opname_detail')->where('opname_id',$id)->delete();
        DB::table('stok_opname')->delete($id);
        // Opname Selesai: balikkan selisihnya dari saldo stok (jurnal & Kartu HPP ikut hilang)
        if ($so->status === 'Selesai') {
            foreach ($detail as $d) {
                if ((float)$d->selisih != 0) $this->updateStok($d->kode_barang, $so->cabang, -(float)$d->selisih);
            }
            return response()->json(['message'=>'Opname dihapus, stok & jurnal dikembalikan']);
        }
        return response()->json(['message'=>'Draft opname dihapus']);
    }

    // ─── RINGKASAN STOK ──────────────────────────────────────────
    public function summary(Request $request)
    {
        $cab = $request->get('cabang');
        $q   = DB::table('stok')->join('barang','stok.kode_barang','=','barang.kode');
        if ($cab) $q->where('stok.cabang',$cab);

        $totalItem    = $q->clone()->count();
        $nilaiStok    = $q->clone()->sum(DB::raw('stok.qty * barang.modal'));
        $stokRendah   = $q->clone()->whereRaw('stok.qty <= barang.stok_min AND barang.stok_min > 0')->count();
        $stokKosong   = $q->clone()->where('stok.qty','<=',0)->count();

        return response()->json([
            'total_item'  => $totalItem,
            'nilai_stok'  => $nilaiStok,
            'stok_rendah' => $stokRendah,
            'stok_kosong' => $stokKosong,
        ]);
    }

    // ─── KARTU STOK (stok per tanggal, per item) ────────────────────────────
    // Menyusun ulang seluruh riwayat pergerakan satu barang secara kronologis
    // (Pembelian, Penjualan, Retur, Mutasi, Barang Masuk/Keluar, Opname) dan
    // saldo berjalan (running balance) — supaya bisa dilihat "stok barang ini
    // di tanggal sekian" berapa, bukan cuma saldo hari ini.
    //
    // Karena sebagian data lama (stok awal saat barang dibuat / edit manual di
    // Master > Barang) di-SET langsung ke tabel `stok` tanpa tanggal & tanpa
    // baris riwayat, saldo pembukaan yang tidak tercatat itu dihitung sebagai
    // angka "plug" (saldo sekarang dikurangi total semua pergerakan yang
    // tercatat) supaya total tetap rekonsiliasi persis dengan saldo real-time
    // di tabel `stok` — bukan diasumsikan mulai dari 0.
    public function kartuStok(Request $request)
    {
        $request->validate([
            'kode_barang' => 'required|string|exists:barang,kode',
            'cabang'      => 'nullable|string',
            'tanggal'     => 'nullable|date',
        ]);
        $kode    = $request->kode_barang;
        $cabang  = $request->get('cabang');
        $tanggal = $request->get('tanggal') ?: now()->toDateString();
        $barang  = DB::table('barang')->where('kode', $kode)->first();

        $mov = collect();

        $tarik = function ($table, $cabCol) use ($kode, $cabang) {
            $q = DB::table($table)->where('kode_barang', $kode);
            if ($cabang) $q->where($cabCol, $cabang);
            return $q->get();
        };

        // Setiap baris ditandai 'ref_tabel' (nama tabel sumber) supaya nanti bisa
        // dicocokkan 1:1 ke baris Kartu HPP (hpp_kartu) — itulah yang membawa
        // qty, tanggal, harga & nilai rupiah yang SELALU lengkap & taat urutan
        // tanggal (lihat App\Services\HppService). Sebelum ini Kartu Stok sama
        // sekali tidak tahu nilai rupiah/HPP baris-barisnya (mis. baris
        // Pembelian tidak kelihatan qty & tanggalnya nyambung ke HPP mana),
        // sehingga terkesan "HPP tidak valid" — padahal datanya ada, cuma tidak
        // ditarik ke sini.
        $tarik('trx_jual', 'cabang')->each(fn($r) => $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'trx_jual', 'sumber' => 'Penjualan', 'ref' => $r->no_nota ?: ('PJ-' . $r->id), 'cabang' => $r->cabang, 'delta' => -(float) $r->qty, 'ket' => 'Penjualan (' . $r->bayar . ')']));
        $tarik('trx_beli', 'cabang')->each(fn($r) => $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'trx_beli', 'sumber' => 'Pembelian', 'ref' => $r->no_nota ?: ('PB-' . $r->id), 'cabang' => $r->cabang, 'delta' => (float) $r->qty, 'ket' => 'Pembelian dari ' . ($r->supplier ?? '-')]));
        $tarik('trx_retur', 'cabang')->each(function ($r) use (&$mov) {
            $arah = $r->jenis === 'Jual' ? 1 : -1;
            $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'trx_retur', 'sumber' => 'Retur ' . $r->jenis, 'ref' => 'RT-' . $r->id, 'cabang' => $r->cabang, 'delta' => $arah * (float) $r->qty, 'ket' => 'Retur ' . $r->jenis]);
        });
        $tarik('barang_masuk', 'cabang')->each(fn($r) => $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'barang_masuk', 'sumber' => 'Barang Masuk', 'ref' => 'BM-' . $r->id, 'cabang' => $r->cabang, 'delta' => (float) $r->qty, 'ket' => $r->supplier ? ('Dari ' . $r->supplier) : ($r->keterangan ?? '-')]));
        $tarik('barang_keluar', 'cabang')->each(fn($r) => $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'barang_keluar', 'sumber' => 'Barang Keluar', 'ref' => 'BK-' . $r->id, 'cabang' => $r->cabang, 'delta' => -(float) $r->qty, 'ket' => $r->jenis . ($r->keterangan ? (' — ' . $r->keterangan) : '')]));

        // Mutasi punya 2 sisi — tampilkan sisi yang relevan sesuai filter cabang
        // (kalau tidak difilter cabang, dua sisi otomatis saling meniadakan
        // di total perusahaan, yang memang benar karena cuma pindah lokasi)
        $mutasiQ = DB::table('trx_mutasi')->where('kode_barang', $kode);
        $mutasiQ->get()->each(function ($r) use (&$mov, $cabang) {
            if (!$cabang || $r->dari_cabang === $cabang) {
                $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'trx_mutasi', 'sumber' => 'Mutasi Keluar', 'ref' => 'MT-' . $r->id, 'cabang' => $r->dari_cabang, 'delta' => -(float) $r->qty, 'ket' => 'Mutasi ke ' . $r->ke_cabang]);
            }
            if (!$cabang || $r->ke_cabang === $cabang) {
                $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'trx_mutasi', 'sumber' => 'Mutasi Masuk', 'ref' => 'MT-' . $r->id, 'cabang' => $r->ke_cabang, 'delta' => (float) $r->qty, 'ket' => 'Mutasi dari ' . $r->dari_cabang]);
            }
        });

        // Mutasi Barang versi PAKET (mutasi_kirim + mutasi_kirim_detail) — sisi
        // "keluar" tercatat begitu paket dikirim (stok asal langsung berkurang,
        // kecuali paketnya dibatalkan — pengurangannya sudah dibalik saat itu
        // juga jadi tidak perlu muncul di kartu stok). Sisi "masuk" baru ada
        // begitu cabang tujuan meng-ACC, dan besarnya = qty yang BENAR-BENAR
        // dikonfirmasi diterima (qty_diterima), bukan qty yang dikirim — supaya
        // kartu stok selalu cocok dengan saldo `stok` yang sebenarnya.
        DB::table('mutasi_kirim_detail')
            ->join('mutasi_kirim', 'mutasi_kirim_detail.mutasi_kirim_id', '=', 'mutasi_kirim.id')
            ->where('mutasi_kirim_detail.kode_barang', $kode)
            ->where('mutasi_kirim.status', '!=', 'Dibatalkan')
            ->select('mutasi_kirim_detail.*', 'mutasi_kirim.no_ref', 'mutasi_kirim.tgl', 'mutasi_kirim.dari_cabang', 'mutasi_kirim.ke_cabang', 'mutasi_kirim.status', 'mutasi_kirim.waktu_terima')
            ->get()
            ->each(function ($r) use (&$mov, $cabang) {
                if (!$cabang || $r->dari_cabang === $cabang) {
                    $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'mutasi_kirim_detail', 'sumber' => 'Mutasi Keluar', 'ref' => $r->no_ref, 'cabang' => $r->dari_cabang, 'delta' => -(float) $r->qty_kirim, 'ket' => 'Mutasi (paket) ke ' . $r->ke_cabang]);
                }
                $sudahDikonfirmasi = in_array($r->status, ['Selesai', 'Selesai (Ada Selisih)']);
                if ($sudahDikonfirmasi && (float) $r->qty_diterima != 0 && (!$cabang || $r->ke_cabang === $cabang)) {
                    $tglMasuk = $r->waktu_terima ? substr($r->waktu_terima, 0, 10) : $r->tgl;
                    $mov->push(['tgl' => $tglMasuk, 'id' => $r->id, 'ref_tabel' => 'mutasi_kirim_detail', 'sumber' => 'Mutasi Masuk', 'ref' => $r->no_ref, 'cabang' => $r->ke_cabang, 'delta' => (float) $r->qty_diterima, 'ket' => 'Mutasi (paket) dari ' . $r->dari_cabang]);
                }
            });

        // Stok Opname — selisih (fisik - sistem) yang sudah "Selesai"
        $opQ = DB::table('stok_opname_detail')
            ->join('stok_opname', 'stok_opname_detail.opname_id', '=', 'stok_opname.id')
            ->where('stok_opname_detail.kode_barang', $kode)
            ->where('stok_opname.status', 'Selesai');
        if ($cabang) $opQ->where('stok_opname.cabang', $cabang);
        $opQ->select('stok_opname_detail.*', 'stok_opname.tgl', 'stok_opname.cabang', 'stok_opname.no_so')->get()
            ->each(function ($r) use (&$mov) {
                if ((float) $r->selisih == 0) return;
                $mov->push(['tgl' => $r->tgl, 'id' => $r->id, 'ref_tabel' => 'stok_opname_detail', 'sumber' => 'Opname', 'ref' => 'SO-' . $r->opname_id, 'cabang' => $r->cabang, 'delta' => (float) $r->selisih, 'ket' => 'Opname ' . $r->no_so . ' (selisih fisik vs sistem)']);
            });

        // Urutkan kronologis (tanggal, lalu id supaya stabil untuk tanggal yang sama)
        $mov = $mov->sortBy([['tgl', 'asc'], ['id', 'asc']])->values();

        // ─── Tempel data Kartu HPP (qty, HPP/satuan & nilai rupiah) ke tiap
        // baris pergerakan di atas, dicocokkan lewat (ref_tabel, ref_id,
        // cabang) — persis kunci yang dipakai HppService::rebuildItem() saat
        // menyimpan 1 baris hpp_kartu per event. Dengan ini SETIAP baris
        // (termasuk Pembelian) pasti punya qty & tanggal yang sudah otomatis
        // ada di atas, DITAMBAH hpp_satuan & nilai rupiah — bukan lagi cuma
        // qty naik/turun tanpa nilai uang.
        $refTabelList = $mov->pluck('ref_tabel')->unique()->values()->all();
        $hppByKey = collect();
        if (!empty($refTabelList)) {
            $hppRows = DB::table('hpp_kartu')
                ->where('kode_barang', $kode)
                ->whereIn('ref_tabel', $refTabelList)
                ->get();
            $hppByKey = $hppRows->keyBy(fn($h) => $h->ref_tabel . '|' . $h->ref_id . '|' . $h->cabang);
        }

        // Saldo real-time sekarang (dari tabel stok) — dipakai untuk hitung
        // "saldo awal" yang tidak tercatat & sebagai angka pembanding.
        $stokQ = DB::table('stok')->where('kode_barang', $kode);
        if ($cabang) $stokQ->where('cabang', $cabang);
        $saldoSekarang = (float) $stokQ->sum('qty');

        $totalPergerakan = $mov->sum('delta');
        $saldoAwal = $saldoSekarang - $totalPergerakan; // plug: saldo sebelum baris tercatat pertama

        // Nilai rupiah saldo sekarang (gabungan cabang kalau tidak difilter) —
        // dari Kartu HPP (App\Services\HppService), sumber kebenaran nilai
        // persediaan — dipakai untuk hitung "nilai awal" (plug rupiah) yang
        // sama polanya seperti saldoAwal qty di atas.
        $hppSvc = app(\App\Services\HppService::class);
        $nilaiSekarang = $hppSvc->saldo($kode, $cabang)['nilai'];
        $totalNilaiMasukKeluar = $mov->sum(function ($m) use ($hppByKey) {
            $h = $hppByKey->get($m['ref_tabel'] . '|' . $m['id'] . '|' . $m['cabang']);
            if (!$h) return 0;
            return (float) $h->nilai_masuk - (float) $h->nilai_keluar;
        });
        $nilaiAwal = $nilaiSekarang - $totalNilaiMasukKeluar;

        // Hitung running balance (qty & rupiah) & filter sampai tanggal yang diminta
        $running = $saldoAwal;
        $runningNilai = $nilaiAwal;
        $hasil = [];
        foreach ($mov as $m) {
            $running += $m['delta'];
            $h = $hppByKey->get($m['ref_tabel'] . '|' . $m['id'] . '|' . $m['cabang']);
            $nilaiBaris = $h ? ((float) $h->nilai_masuk - (float) $h->nilai_keluar) : 0;
            $runningNilai += $nilaiBaris;
            if ($m['tgl'] <= $tanggal) {
                $m['saldo_setelah'] = $running;
                $m['qty_masuk']     = $h ? round((float) $h->qty_masuk, 2) : ($m['delta'] > 0 ? round($m['delta'], 2) : 0);
                $m['qty_keluar']    = $h ? round((float) $h->qty_keluar, 2) : ($m['delta'] < 0 ? round(abs($m['delta']), 2) : 0);
                $m['hpp_satuan']    = $h ? round((float) $h->hpp_satuan, 2) : null;
                $m['nilai']         = round($nilaiBaris, 2);
                $m['saldo_nilai']   = round($runningNilai, 2);
                unset($m['ref_tabel']);
                $hasil[] = $m;
            }
        }
        $saldoPerTanggal = count($hasil) ? end($hasil)['saldo_setelah'] : $saldoAwal;
        $nilaiPerTanggal = count($hasil) ? end($hasil)['saldo_nilai'] : round($nilaiAwal, 2);

        return response()->json([
            'kode_barang'       => $kode,
            'nama_barang'       => $barang->nama ?? $kode,
            'satuan'            => $barang->satuan1 ?? 'PCS',
            'cabang'            => $cabang,
            'tanggal'           => $tanggal,
            'saldo_awal'        => round($saldoAwal, 2),
            'saldo_per_tanggal' => round($saldoPerTanggal, 2),
            'saldo_sekarang'    => round($saldoSekarang, 2),
            'nilai_awal'        => round($nilaiAwal, 2),
            'nilai_per_tanggal' => round($nilaiPerTanggal, 2),
            'nilai_sekarang'    => round($nilaiSekarang, 2),
            'riwayat'           => array_reverse($hasil), // terbaru dulu
        ]);
    }

    // ─── STOK PER PERIODE (DARI TANGGAL ... SAMPAI TANGGAL) ─────────────────
    // Untuk cek cepat: per barang tampil Stok Awal (akhir hari sebelum "dari"),
    // total Masuk & Keluar selama periode, dan Stok Akhir (akhir hari "sampai").
    // Stok Awal/Akhir memakai hitungan yang sama dengan "Stok Per Tanggal"
    // (hitungStokPerTanggal), jadi angkanya pasti sama dengan menu itu.
    // Mutasi antar cabang tidak dihitung sebagai masuk/keluar saat "Semua
    // Cabang" (cuma pindah lokasi, total perusahaan tidak berubah).
    public function stokPeriode(Request $request)
    {
        $dari   = $request->get('dari') ?: '2000-01-01';
        $sampai = $request->get('sampai') ?: date('Y-m-d');
        foreach ([$dari, $sampai] as $t) {
            if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $t)) {
                return response()->json(['message' => 'Format tanggal harus YYYY-MM-DD'], 422);
            }
        }
        if ($dari > $sampai) {
            return response()->json(['message' => 'Tanggal "Dari" tidak boleh lebih besar dari "Sampai"'], 422);
        }
        $cabang = $request->get('cabang') ?: null;
        $search = $request->get('search') ?: null;
        $hanyaGerak = $request->boolean('hanya_bergerak');

        $sebelum = date('Y-m-d', strtotime($dari . ' -1 day'));
        $awal  = collect($this->hitungStokPerTanggal($sebelum, $cabang, $search, false)['data'])->keyBy('kode');
        $akhir = $this->hitungStokPerTanggal($sampai, $cabang, $search, false)['data'];
        $mov   = $this->pergerakanPeriode($dari, $sampai, $cabang);

        $rows = []; $tMasuk = 0.0; $tKeluar = 0.0; $tAkhir = 0.0; $tAwal = 0.0;
        foreach ($akhir as $r) {
            $a      = $awal->get($r['kode']);
            $qAwal  = $a ? (float) $a['qty'] : 0.0;
            $masuk  = round($mov[$r['kode']]['masuk']  ?? 0.0, 2);
            $keluar = round($mov[$r['kode']]['keluar'] ?? 0.0, 2);
            if ($hanyaGerak && $masuk == 0.0 && $keluar == 0.0) continue;
            $rows[] = [
                'kode' => $r['kode'], 'nama' => $r['nama'], 'satuan' => $r['satuan'], 'kategori' => $r['kategori'],
                'awal' => $qAwal, 'masuk' => $masuk, 'keluar' => $keluar,
                'akhir' => (float) $r['qty'], 'nilai_akhir' => (float) $r['nilai'],
            ];
            $tAwal += $qAwal; $tMasuk += $masuk; $tKeluar += $keluar; $tAkhir += (float) $r['qty'];
        }

        return response()->json([
            'dari' => $dari, 'sampai' => $sampai, 'cabang' => $cabang,
            'summary' => [
                'total_barang' => count($rows), 'total_awal' => round($tAwal, 2),
                'total_masuk' => round($tMasuk, 2), 'total_keluar' => round($tKeluar, 2),
                'total_akhir' => round($tAkhir, 2),
            ],
            'data' => $rows,
        ]);
    }

    /** Total masuk & keluar per kode barang pada rentang tanggal (inklusif). */
    private function pergerakanPeriode(string $dari, string $sampai, ?string $cabang): array
    {
        $out = [];
        $add = function ($kode, float $d) use (&$out) {
            if ($d == 0.0) return;
            if (!isset($out[$kode])) $out[$kode] = ['masuk' => 0.0, 'keluar' => 0.0];
            if ($d > 0) $out[$kode]['masuk'] += $d; else $out[$kode]['keluar'] += -$d;
        };
        $agg = function (string $tabel, string $cabCol, float $arah) use ($dari, $sampai, $cabang, $add) {
            $q = DB::table($tabel)->whereBetween('tgl', [$dari, $sampai])
                ->selectRaw('kode_barang, SUM(qty) as total')->groupBy('kode_barang');
            if ($cabang) $q->where($cabCol, $cabang);
            $q->get()->each(fn($r) => $add($r->kode_barang, $arah * (float) $r->total));
        };
        $agg('trx_jual', 'cabang', -1);
        $agg('trx_beli', 'cabang', 1);
        $agg('barang_masuk', 'cabang', 1);
        $agg('barang_keluar', 'cabang', -1);

        $rq = DB::table('trx_retur')->whereBetween('tgl', [$dari, $sampai])
            ->selectRaw('kode_barang, jenis, SUM(qty) as total')->groupBy('kode_barang', 'jenis');
        if ($cabang) $rq->where('cabang', $cabang);
        $rq->get()->each(fn($r) => $add($r->kode_barang, ($r->jenis === 'Jual' ? 1 : -1) * (float) $r->total));

        // Mutasi lama (1 barang per baris): hanya relevan kalau difilter per cabang
        if ($cabang) {
            $agg('trx_mutasi', 'dari_cabang', -1);
            $agg('trx_mutasi', 'ke_cabang', 1);
        }

        // Mutasi paket: keluar saat dikirim, masuk saat dikonfirmasi (qty_diterima)
        DB::table('mutasi_kirim_detail')
            ->join('mutasi_kirim', 'mutasi_kirim_detail.mutasi_kirim_id', '=', 'mutasi_kirim.id')
            ->where('mutasi_kirim.status', '!=', 'Dibatalkan')
            ->where(fn($w) => $w->whereBetween('mutasi_kirim.tgl', [$dari, $sampai])
                ->orWhereBetween('mutasi_kirim.waktu_terima', [$dari . ' 00:00:00', $sampai . ' 23:59:59']))
            ->select('mutasi_kirim_detail.kode_barang', 'mutasi_kirim_detail.qty_kirim', 'mutasi_kirim_detail.qty_diterima',
                     'mutasi_kirim.tgl', 'mutasi_kirim.dari_cabang', 'mutasi_kirim.ke_cabang', 'mutasi_kirim.status', 'mutasi_kirim.waktu_terima')
            ->get()->each(function ($r) use ($dari, $sampai, $cabang, $add) {
                $keluar = ($r->tgl >= $dari && $r->tgl <= $sampai) ? -(float) $r->qty_kirim : 0.0;
                $masuk  = 0.0;
                if (in_array($r->status, ['Selesai', 'Selesai (Ada Selisih)']) && (float) $r->qty_diterima != 0) {
                    $tglMasuk = $r->waktu_terima ? substr($r->waktu_terima, 0, 10) : $r->tgl;
                    if ($tglMasuk >= $dari && $tglMasuk <= $sampai) $masuk = (float) $r->qty_diterima;
                }
                if ($cabang) {
                    if ($r->dari_cabang === $cabang) $add($r->kode_barang, $keluar);
                    if ($r->ke_cabang === $cabang)   $add($r->kode_barang, $masuk);
                } else {
                    $add($r->kode_barang, $keluar + $masuk); // pindah antar cabang saling meniadakan
                }
            });

        // Opname (selisih fisik vs sistem) — plus jadi masuk, minus jadi keluar
        $oq = DB::table('stok_opname_detail')
            ->join('stok_opname', 'stok_opname_detail.opname_id', '=', 'stok_opname.id')
            ->where('stok_opname.status', 'Selesai')->whereBetween('stok_opname.tgl', [$dari, $sampai])
            ->selectRaw('stok_opname_detail.kode_barang as kode_barang,
                SUM(CASE WHEN stok_opname_detail.selisih > 0 THEN stok_opname_detail.selisih ELSE 0 END) as pos,
                SUM(CASE WHEN stok_opname_detail.selisih < 0 THEN stok_opname_detail.selisih ELSE 0 END) as neg')
            ->groupBy('stok_opname_detail.kode_barang');
        if ($cabang) $oq->where('stok_opname.cabang', $cabang);
        $oq->get()->each(function ($r) use ($add) {
            $add($r->kode_barang, (float) $r->pos);
            $add($r->kode_barang, (float) $r->neg);
        });

        return $out;
    }

    // ─── STOK SEMUA BARANG PER TANGGAL ──────────────────────────────────────
    // Laporan stok SEMUA barang pada satu tanggal (bukan per item seperti Kartu
    // Stok). Cara hitung sama dengan Kartu Stok: saldo `stok` sekarang
    // dikurangi seluruh pergerakan yang terjadi SETELAH tanggal itu
    // (Penjualan, Pembelian, Retur, Barang Masuk/Keluar, Mutasi, Opname) —
    // jadi tetap rekonsiliasi dengan saldo real-time walau ada stok awal yang
    // di-set manual tanpa riwayat. Nilai = stok × HPP rata-rata (Kartu HPP,
    // hanya dari pembelian) per tanggal itu; belum ada pembelian = nilai 0.
    public function stokPerTanggal(Request $request)
    {
        $tanggal = $request->get('tanggal') ?: date('Y-m-d');
        if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $tanggal)) {
            return response()->json(['message' => 'Format tanggal harus YYYY-MM-DD'], 422);
        }
        return response()->json($this->hitungStokPerTanggal(
            $tanggal, $request->get('cabang') ?: null, $request->get('search') ?: null,
            $request->boolean('sembunyi_nol')
        ));
    }

    private function hitungStokPerTanggal(string $tanggal, ?string $cabang, ?string $search, bool $sembunyiNol): array
    {
        // 1) Saldo sekarang per (barang, cabang)
        $now = [];
        $q = DB::table('stok')->selectRaw('kode_barang, cabang, SUM(qty) as qty')->groupBy('kode_barang', 'cabang');
        if ($cabang) $q->where('cabang', $cabang);
        foreach ($q->get() as $r) $now[$r->kode_barang][$r->cabang] = (float) $r->qty;

        // 2) Pergerakan SETELAH tanggal (net), per (barang, cabang)
        $delta = [];
        $tambah = function ($kode, $cab, $d) use (&$delta, $cabang) {
            if ($cabang && $cab !== $cabang) return;
            $delta[$kode][$cab] = ($delta[$kode][$cab] ?? 0.0) + $d;
        };
        $agg = function (string $tabel, string $cabCol, float $arah, string $qtyCol = 'qty') use ($tanggal, $tambah) {
            DB::table($tabel)->where('tgl', '>', $tanggal)
                ->selectRaw("kode_barang, $cabCol as cab, SUM($qtyCol) as total")->groupBy('kode_barang', $cabCol)->get()
                ->each(fn($r) => $tambah($r->kode_barang, $r->cab, $arah * (float) $r->total));
        };
        $agg('trx_jual', 'cabang', -1);
        $agg('trx_beli', 'cabang', 1);
        $agg('barang_masuk', 'cabang', 1);
        $agg('barang_keluar', 'cabang', -1);
        DB::table('trx_retur')->where('tgl', '>', $tanggal)
            ->selectRaw('kode_barang, cabang as cab, jenis, SUM(qty) as total')->groupBy('kode_barang', 'cabang', 'jenis')->get()
            ->each(fn($r) => $tambah($r->kode_barang, $r->cab, ($r->jenis === 'Jual' ? 1 : -1) * (float) $r->total));
        $agg('trx_mutasi', 'dari_cabang', -1);
        $agg('trx_mutasi', 'ke_cabang', 1);

        // Mutasi paket: keluar saat dikirim; masuk saat dikonfirmasi (qty_diterima)
        DB::table('mutasi_kirim_detail')
            ->join('mutasi_kirim', 'mutasi_kirim_detail.mutasi_kirim_id', '=', 'mutasi_kirim.id')
            ->where('mutasi_kirim.status', '!=', 'Dibatalkan')
            ->where(fn($w) => $w->where('mutasi_kirim.tgl', '>', $tanggal)->orWhere('mutasi_kirim.waktu_terima', '>', $tanggal . ' 23:59:59'))
            ->select('mutasi_kirim_detail.kode_barang', 'mutasi_kirim_detail.qty_kirim', 'mutasi_kirim_detail.qty_diterima',
                     'mutasi_kirim.tgl', 'mutasi_kirim.dari_cabang', 'mutasi_kirim.ke_cabang', 'mutasi_kirim.status', 'mutasi_kirim.waktu_terima')
            ->get()->each(function ($r) use ($tanggal, $tambah) {
                if ($r->tgl > $tanggal) $tambah($r->kode_barang, $r->dari_cabang, -(float) $r->qty_kirim);
                if (in_array($r->status, ['Selesai', 'Selesai (Ada Selisih)']) && (float) $r->qty_diterima != 0) {
                    $tglMasuk = $r->waktu_terima ? substr($r->waktu_terima, 0, 10) : $r->tgl;
                    if ($tglMasuk > $tanggal) $tambah($r->kode_barang, $r->ke_cabang, (float) $r->qty_diterima);
                }
            });

        DB::table('stok_opname_detail')
            ->join('stok_opname', 'stok_opname_detail.opname_id', '=', 'stok_opname.id')
            ->where('stok_opname.status', 'Selesai')->where('stok_opname.tgl', '>', $tanggal)
            ->selectRaw('stok_opname_detail.kode_barang as kode_barang, stok_opname.cabang as cab, SUM(stok_opname_detail.selisih) as total')
            ->groupBy('stok_opname_detail.kode_barang', 'stok_opname.cabang')->get()
            ->each(fn($r) => $tambah($r->kode_barang, $r->cab, (float) $r->total));

        // 3) HPP rata-rata terakhir s.d. tanggal (Kartu HPP, hanya dari pembelian)
        $sub = DB::table('hpp_kartu')->where('tgl', '<=', $tanggal)->where('saldo_hpp', '>', 0)
            ->selectRaw('kode_barang, cabang, MAX(urutan) as u')->groupBy('kode_barang', 'cabang');
        $hppCab = []; $hppItem = [];
        DB::table('hpp_kartu as h')
            ->joinSub($sub, 'm', fn($j) => $j->on('h.kode_barang', '=', 'm.kode_barang')->on('h.cabang', '=', 'm.cabang')->on('h.urutan', '=', 'm.u'))
            ->select('h.kode_barang', 'h.cabang', 'h.saldo_hpp', 'h.tgl', 'h.urutan')->get()
            ->each(function ($h) use (&$hppCab, &$hppItem) {
                $hppCab[$h->kode_barang][$h->cabang] = (float) $h->saldo_hpp;
                $k = $h->tgl . '|' . str_pad((string) $h->urutan, 10, '0', STR_PAD_LEFT);
                if (!isset($hppItem[$h->kode_barang]) || $k > $hppItem[$h->kode_barang][0]) $hppItem[$h->kode_barang] = [$k, (float) $h->saldo_hpp];
            });

        // 4) Susun baris — SEMUA barang di master
        $cabangList = $cabang ? [$cabang] : DB::table('cabang')->orderBy('nama')->pluck('nama')->all();
        $bq = DB::table('barang')->select('kode', 'nama', 'satuan1', 'kategori')->orderBy('nama');
        if ($search) $bq->where(fn($w) => $w->where('nama', 'like', "%$search%")->orWhere('kode', 'like', "%$search%"));

        $rows = []; $totQty = 0.0; $totNilai = 0.0; $adaStok = 0; $minus = 0;
        foreach ($bq->get() as $b) {
            $perCab = []; $qty = 0.0; $nilai = 0.0;
            $cabKeys = array_unique(array_merge(array_keys($now[$b->kode] ?? []), array_keys($delta[$b->kode] ?? [])));
            foreach ($cabKeys as $cab) {
                $v = round(($now[$b->kode][$cab] ?? 0.0) - ($delta[$b->kode][$cab] ?? 0.0), 2);
                if ($v == 0.0) continue;
                $perCab[$cab] = $v;
                $qty += $v;
                if ($v > 0) {
                    $hpp = $hppCab[$b->kode][$cab] ?? ($hppItem[$b->kode][1] ?? 0.0);
                    $nilai += $v * $hpp;
                }
            }
            $qty = round($qty, 2);
            if ($sembunyiNol && $qty == 0.0) continue;
            $hppRata = $qty > 0 && $nilai > 0 ? $nilai / $qty : 0.0;
            if ($qty != 0.0) $adaStok++;
            if ($qty < 0) $minus++;
            $totQty += $qty; $totNilai += $nilai;
            $rows[] = [
                'kode' => $b->kode, 'nama' => $b->nama, 'satuan' => $b->satuan1 ?: 'PCS', 'kategori' => $b->kategori,
                'qty' => $qty, 'per_cabang' => (object) $perCab,
                'hpp' => round($hppRata, 2), 'nilai' => round($nilai, 2),
            ];
        }

        return [
            'tanggal' => $tanggal, 'cabang' => $cabang, 'cabang_list' => array_values($cabangList),
            'summary' => [
                'total_barang' => count($rows), 'barang_ada_stok' => $adaStok, 'barang_minus' => $minus,
                'total_qty' => round($totQty, 2), 'total_nilai' => round($totNilai, 2),
            ],
            'data' => $rows,
        ];
    }
}
