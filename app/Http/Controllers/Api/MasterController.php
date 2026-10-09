<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use App\Services\BarangCabangService;

class MasterController extends Controller
{
    // ─── CABANG ──────────────────────────────────────────────────────────────
    public function getCabang()
    {
        return response()->json(DB::table('cabang')->orderBy('nama')->get());
    }

    public function storeCabang(Request $request)
    {
        $data = $request->validate([
            'nama'   => 'required|string|max:100|unique:cabang,nama',
            'alamat' => 'nullable|string|max:255',
            'telp'   => 'nullable|string|max:30',
        ]);
        $id = DB::table('cabang')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('cabang')->find($id), 201);
    }

    public function updateCabang(Request $request, int $id)
    {
        $data = $request->validate([
            'nama'   => ['required','string','max:100', Rule::unique('cabang','nama')->ignore($id)],
            'alamat' => 'nullable|string|max:255',
            'telp'   => 'nullable|string|max:30',
        ]);
        DB::table('cabang')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('cabang')->find($id));
    }

    public function destroyCabang(int $id)
    {
        DB::table('cabang')->delete($id);
        return response()->json(['message' => 'Cabang dihapus']);
    }

    // ─── COA ─────────────────────────────────────────────────────────────────
    public function getCoa()
    {
        return response()->json(DB::table('coa')->orderBy('kode')->get());
    }

    public function storeCoa(Request $request)
    {
        $data = $request->validate([
            'kode'   => 'required|string|max:10|unique:coa,kode',
            'nama'   => 'required|string|max:100',
            'kat'    => ['required', Rule::in(['Aset', 'Liabilitas', 'Modal', 'Pendapatan', 'Beban'])],
            // Tandai akun ini sebagai "Kas" (uang tunai/bank) supaya muncul
            // sebagai pilihan Kode Kas di Kasir Penjualan/Pembelian.
            'is_kas' => 'nullable|boolean',
        ]);
        $data['normal'] = in_array($data['kat'], ['Aset', 'Beban']) ? 'D' : 'K';
        $data['is_default'] = false;
        $data['is_kas'] = (bool) ($data['is_kas'] ?? false);
        $id = DB::table('coa')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('coa')->find($id), 201);
    }

    // Hanya izinkan mengubah status "Kas" (dipakai utk menandai akun standar
    // 1101/1102 atau akun baru sbg pilihan Kode Kas) — kode/kategori akun
    // standar tetap dikunci supaya tidak merusak Jurnal & Laporan yang ada.
    public function updateCoa(Request $request, int $id)
    {
        $akun = DB::table('coa')->find($id);
        if (!$akun) return response()->json(['message' => 'Akun tidak ditemukan'], 404);
        $data = $request->validate(['is_kas' => 'required|boolean']);
        DB::table('coa')->where('id', $id)->update(['is_kas' => $data['is_kas'], 'updated_at' => now()]);
        return response()->json(DB::table('coa')->find($id));
    }

    public function destroyCoa(int $id)
    {
        $akun = DB::table('coa')->find($id);
        if ($akun && $akun->is_default) {
            return response()->json(['error' => 'Akun standar tidak dapat dihapus'], 422);
        }
        DB::table('coa')->delete($id);
        return response()->json(['message' => 'Akun dihapus']);
    }

    // ─── BARANG ──────────────────────────────────────────────────────────────
    public function getBarang(Request $request)
    {
        $cabang = $request->get('cabang');
        $stokSub = DB::table('stok')->select('kode_barang', DB::raw('SUM(qty) as stok_total'));
        if ($cabang) $stokSub->where('cabang', $cabang);
        $stokSub->groupBy('kode_barang');

        $q = DB::table('barang')
            ->leftJoinSub($stokSub, 's', 'barang.kode', '=', 's.kode_barang')
            ->select('barang.*', DB::raw('COALESCE(s.stok_total, 0) as stok_total'))
            ->orderBy('barang.nama');
        if ($s = $request->get('search')) {
            $q->where(function($q) use ($s) {
                $q->where('barang.kode', 'like', "%$s%")
                  ->orWhere('barang.barcode', 'like', "%$s%")
                  ->orWhere('barang.barcode2', 'like', "%$s%")
                  ->orWhere('barang.barcode3', 'like', "%$s%")
                  ->orWhere('barang.nama', 'like', "%$s%");
            });
        }
        if ($kat = $request->get('kategori')) {
            $q->where('barang.kategori', $kat);
        }
        // Pilih 1 cabang = tampilkan HANYA barang milik cabang itu dengan harga
        // jual cabang tsb (harga kosong = ikut harga standar). Tanpa cabang =
        // katalog gabungan semua cabang seperti biasa.
        if ($cabang) BarangCabangService::filterCabang($q, $cabang);

        $perPage = (int)($request->get('per_page', 50));
        if ($perPage <= 0 || $perPage > 99000) $perPage = 99999; // "Semua"
        $p = $q->paginate($perPage);
        if ($cabang && BarangCabangService::ada()) {
            $p->getCollection()->transform(fn($r) => BarangCabangService::overlayHarga($r));
        }
        return $this->paginated($p);
    }

    // Peta harga khusus per cabang {cabang: {kode: [jual, grosir, cabang]}} —
    // dimuat sekali di STATE (state.js) supaya form Penjualan/Pembelian & Kasir POS
    // memakai harga cabang yang dipilih tanpa request per barang.
    public function hargaCabang()
    {
        return response()->json((object) BarangCabangService::petaHarga());
    }

    public function getAllBarang(Request $request)
    {
        $cabang = $request->get('cabang');
        $stok = DB::table('stok')->select('kode_barang', DB::raw('SUM(qty) as stok_total'))
            ->when($cabang, fn($q) => $q->where('cabang', $cabang))
            ->groupBy('kode_barang')->pluck('stok_total', 'kode_barang');

        $q = DB::table('barang')->select('barang.*')->orderBy('barang.nama');
        // ?cabang=X hanya menimpa HARGA dengan harga cabang (tanpa menyaring barangnya) —
        // dipakai form Edit Barang saat Master sedang difilter per cabang.
        if ($cabang) BarangCabangService::filterCabang($q, $cabang, false);

        return response()->json(
            $q->get()->map(function ($b) use ($stok, $cabang) {
                if ($cabang && BarangCabangService::ada()) BarangCabangService::overlayHarga($b);
                $b->stok_total = (float) ($stok[$b->kode] ?? 0);
                return $b;
            })
        );
    }

    public function storeBarang(Request $request)
    {
        $data = $request->validate([
            'kode'         => 'required|string|max:50|unique:barang,kode',
            'barcode'      => 'nullable|string|max:50',
            'barcode2'     => 'nullable|string|max:50',
            'barcode3'     => 'nullable|string|max:50',
            'nama'         => 'required|string|max:200',
            'kategori'     => 'nullable|string|max:100',
            'sub_kategori' => 'nullable|string|max:100',
            'supplier'     => 'nullable|string|max:100',
            'ppn'          => ['required', Rule::in(['Kena PPN', 'Non-PPN'])],
            'satuan1'      => 'nullable|string|max:20',
            'satuan2'      => 'nullable|string|max:20',
            'satuan3'      => 'nullable|string|max:20',
            'isi'          => 'nullable|integer|min:1',
            'isi3'         => 'nullable|integer|min:1',
            'modal'        => 'nullable|numeric|min:0',
            'harga_jual'   => 'nullable|numeric|min:0',
            'harga_grosir' => 'nullable|numeric|min:0',
            'harga_cabang' => 'nullable|numeric|min:0',
            'stok_min'     => 'nullable|integer|min:0',
            'stok_max'     => 'nullable|integer|min:0',
            // Stok Awal — supaya barang baru bisa langsung diisi saldo stok
            // pembukaan (mis. hasil stok opname / migrasi dari toko lama)
            // TANPA harus membuat transaksi Pembelian. Bisa kirim satu
            // cabang (stok_awal + stok_awal_cabang) atau banyak cabang
            // sekaligus lewat stok_awal_multi.
            // Cabang tempat barang ini didaftarkan (harga jual di form = harga cabang tsb).
            // Kosong = katalog gabungan saja, seperti sebelumnya.
            'cabang'             => 'nullable|string|exists:cabang,nama',
            'stok_awal'          => 'nullable|numeric|min:0',
            'stok_awal_cabang'   => 'nullable|string|exists:cabang,nama',
            'stok_awal_multi'          => 'nullable|array',
            'stok_awal_multi.*.cabang' => 'required_with:stok_awal_multi|string|exists:cabang,nama',
            'stok_awal_multi.*.qty'    => 'required_with:stok_awal_multi|numeric|min:0',
        ]);

        $stokAwal      = $data['stok_awal'] ?? null;
        $stokAwalCabang= $data['stok_awal_cabang'] ?? null;
        $stokAwalMulti = $data['stok_awal_multi'] ?? [];
        $cabangBarang  = $data['cabang'] ?? null;
        unset($data['stok_awal'], $data['stok_awal_cabang'], $data['stok_awal_multi'], $data['cabang']);

        $data = array_merge([
            'modal' => 0, 'harga_jual' => 0, 'harga_grosir' => 0, 'harga_cabang' => 0,
            'satuan1' => 'PCS', 'isi' => 1, 'isi3' => 1, 'stok_min' => 0, 'stok_max' => 0,
        ], array_filter($data, fn($v) => !is_null($v)));
        $id = DB::table('barang')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));

        if ($cabangBarang) {
            BarangCabangService::simpanHarga($data['kode'], $cabangBarang, [
                'harga_jual' => $data['harga_jual'] ?? 0, 'harga_grosir' => $data['harga_grosir'] ?? 0, 'harga_cabang' => $data['harga_cabang'] ?? 0,
            ]);
        }

        // Simpan saldo stok awal langsung ke tabel `stok` (bukan lewat
        // trx_beli), sehingga tidak muncul di riwayat Pembelian / tidak
        // mempengaruhi HPP pembelian — murni saldo pembukaan per cabang.
        if ($stokAwalCabang && $stokAwal !== null) {
            $this->setStokAwal($data['kode'], $stokAwalCabang, (float) $stokAwal);
        }
        foreach ($stokAwalMulti as $row) {
            $this->setStokAwal($data['kode'], $row['cabang'], (float) $row['qty']);
        }

        return response()->json(DB::table('barang')->find($id), 201);
    }

    // Set (bukan tambah) saldo stok awal sebuah barang di sebuah cabang.
    // Dipakai hanya saat barang baru dibuat, jadi upsert biasa sudah cukup.
    private function setStokAwal(string $kodeBarang, string $cabang, float $qty): void
    {
        DB::table('stok')->updateOrInsert(
            ['kode_barang' => $kodeBarang, 'cabang' => $cabang],
            ['qty' => $qty, 'updated_at' => now(), 'created_at' => now()]
        );
    }

    public function updateBarang(Request $request, int $id)
    {
        $data = $request->validate([
            'nama'         => 'sometimes|string|max:200',
            'barcode'      => 'nullable|string|max:50',
            'barcode2'     => 'nullable|string|max:50',
            'barcode3'     => 'nullable|string|max:50',
            'kategori'     => 'nullable|string|max:100',
            'sub_kategori' => 'nullable|string|max:100',
            'supplier'     => 'nullable|string|max:100',
            'ppn'          => ['sometimes', Rule::in(['Kena PPN', 'Non-PPN'])],
            'satuan1'      => 'nullable|string|max:20',
            'satuan2'      => 'nullable|string|max:20',
            'satuan3'      => 'nullable|string|max:20',
            'isi'          => 'nullable|integer|min:1',
            'isi3'         => 'nullable|integer|min:1',
            'modal'        => 'sometimes|numeric|min:0',
            'harga_jual'   => 'nullable|numeric|min:0',
            'harga_grosir' => 'nullable|numeric|min:0',
            'harga_cabang' => 'nullable|numeric|min:0',
            'stok_min'     => 'nullable|integer|min:0',
            'stok_max'     => 'nullable|integer|min:0',
            // Kalau diisi, 3 harga jual (HGA TOKO/HRG PARTAI/HRG CABANG) disimpan sebagai
            // harga KHUSUS cabang itu — harga standar di katalog gabungan tidak berubah.
            'cabang'       => 'nullable|string|exists:cabang,nama',
        ]);
        $cabangBarang = $data['cabang'] ?? null;
        unset($data['cabang']);

        if ($cabangBarang && BarangCabangService::ada()) {
            $kode = DB::table('barang')->where('id', $id)->value('kode');
            if ($kode !== null) {
                $harga = array_intersect_key($data, array_flip(BarangCabangService::KOLOM_HARGA));
                BarangCabangService::simpanHarga($kode, $cabangBarang, array_map(fn($v) => $v ?? 0, $harga));
            }
            $data = array_diff_key($data, array_flip(BarangCabangService::KOLOM_HARGA));
        }

        if ($data) DB::table('barang')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('barang')->find($id));
    }

    public function destroyBarang(int $id)
    {
        $kode = DB::table('barang')->where('id', $id)->value('kode');
        DB::table('barang')->delete($id);
        if ($kode !== null) BarangCabangService::hapusKode($kode);
        return response()->json(['message' => 'Barang dihapus']);
    }

    // ─── KARTU HPP — riwayat barang masuk/keluar & rata-rata berjalan ─────────
    // Dipanggil saat 1 barang di Master diklik: menampilkan SETIAP pergerakan
    // (Pembelian, Barang Masuk, Retur, Mutasi, Opname, Penjualan, dst) lengkap
    // dengan harga & HPP rata-rata SAAT itu — sumber kebenarannya App\Services\
    // HppService (Kartu HPP), BUKAN kolom `barang.modal`. `barang.modal`
    // sendiri kini otomatis disinkronkan dari sini (lihat HppService::
    // rebuildItem), murni sebagai angka ringkasan/kompatibilitas.
    public function kartuHpp(Request $request, string $kode)
    {
        $barang = DB::table('barang')->where('kode', $kode)->first();
        if (!$barang) return response()->json(['error' => 'Barang tidak ditemukan'], 404);

        $cabang = $request->get('cabang');
        $hpp = app(\App\Services\HppService::class);

        // Saldo per cabang (supaya kelihatan HPP-nya beda2 tiap cabang)
        $daftarCabang = DB::table('cabang')->orderBy('nama')->pluck('nama');
        $saldoPerCabang = $daftarCabang->map(function ($cab) use ($hpp, $kode) {
            $s = $hpp->saldo($kode, $cab);
            return ['cabang' => $cab, 'qty' => round($s['qty'], 2), 'nilai' => round($s['nilai'], 2), 'hpp' => round($s['hpp'], 2)];
        })->filter(fn($s) => $s['qty'] != 0 || $s['nilai'] != 0)->values();

        $saldoGlobal = $hpp->saldo($kode, null);
        $riwayat = $hpp->riwayat($kode, $cabang, 300);

        return response()->json([
            'kode_barang'      => $barang->kode,
            'nama_barang'      => $barang->nama,
            'satuan'           => $barang->satuan1 ?? 'PCS',
            'hpp_rata2_global' => round($saldoGlobal['hpp'], 2),
            'qty_global'       => round($saldoGlobal['qty'], 2),
            'nilai_global'     => round($saldoGlobal['nilai'], 2),
            'per_cabang'       => $saldoPerCabang,
            'riwayat'          => $riwayat,
            'ada_riwayat'      => $riwayat->count() > 0,
        ]);
    }

    // ─── HAPUS SEMUA MASTER BARANG SEKALIGUS ───────────────────────────────
    // Tombol "Hapus Semua Barang" — untuk kasus mau input ulang Master Barang
    // dari nol (mis. data lama salah/dobel hasil import). Ikut menghapus
    // baris terkait di tabel `stok` & `barang_kadaluarsa` supaya tidak ada
    // data "yatim" yang menunjuk ke kode barang yang sudah tidak ada.
    // Transaksi (trx_jual/trx_beli/dst) yang SUDAH ADA tetap dibiarkan apa
    // adanya (histori keuangan tidak boleh hilang) — hanya datanya akan
    // tampil sebagai "barang tidak dikenal" karena kode barangnya sudah
    // tidak ada lagi di Master Barang. Wajib kirim body
    // { "konfirmasi": "HAPUS SEMUA BARANG" } sebagai pengaman ekstra.
    public function destroyAllBarang(Request $request)
    {
        $request->validate(['konfirmasi' => 'required|string']);
        if (trim($request->input('konfirmasi')) !== 'HAPUS SEMUA BARANG') {
            return response()->json([
                'message' => 'Konfirmasi tidak sesuai. Ketik persis "HAPUS SEMUA BARANG" untuk melanjutkan.',
            ], 422);
        }

        $jumlah = DB::table('barang')->count();

        DB::transaction(function () {
            DB::table('stok')->delete();
            DB::table('barang_kadaluarsa')->delete();
            DB::table('barang')->delete();
            BarangCabangService::hapusSemua();
        });

        return response()->json([
            'message' => "Berhasil menghapus {$jumlah} barang beserta seluruh saldo stok & data kadaluarsanya. Riwayat transaksi Penjualan/Pembelian lama TIDAK ikut terhapus.",
            'dihapus' => $jumlah,
        ]);
    }

    // ─── STOK BARANG (per cabang) — dipakai dari Edit Barang ───────────────────
    // Beda dengan endpoint di StokController: ini untuk SET langsung saldo stok
    // sebuah barang di tiap cabang (dianggap saldo pembukaan / stok awal),
    // BUKAN transaksi barang masuk/keluar — jadi tidak menyentuh HPP/jurnal.
    // Cocok dipakai saat barang lama (hasil import) belum ada catatan stoknya.
    public function getStokBarang(int $id)
    {
        $barang = DB::table('barang')->find($id);
        if (!$barang) return response()->json(['error' => 'Barang tidak ditemukan'], 404);

        $existing = DB::table('stok')->where('kode_barang', $barang->kode)->pluck('qty', 'cabang');
        $cabangList = DB::table('cabang')->orderBy('nama')->pluck('nama');

        $stok = $cabangList->map(fn($c) => [
            'cabang' => $c,
            'qty'    => (float) ($existing[$c] ?? 0),
        ])->values();

        return response()->json([
            'kode'  => $barang->kode,
            'nama'  => $barang->nama,
            'stok'  => $stok,
        ]);
    }

    public function setStokBarang(Request $request, int $id)
    {
        $barang = DB::table('barang')->find($id);
        if (!$barang) return response()->json(['error' => 'Barang tidak ditemukan'], 404);

        $data = $request->validate([
            'stok'            => 'required|array',
            'stok.*.cabang'   => 'required|string|exists:cabang,nama',
            'stok.*.qty'      => 'required|numeric|min:0',
        ]);

        foreach ($data['stok'] as $row) {
            $existing = DB::table('stok')
                ->where('kode_barang', $barang->kode)
                ->where('cabang', $row['cabang'])
                ->first();
            if ($existing) {
                DB::table('stok')->where('id', $existing->id)
                    ->update(['qty' => $row['qty'], 'updated_at' => now()]);
            } else {
                DB::table('stok')->insert([
                    'kode_barang' => $barang->kode,
                    'cabang'      => $row['cabang'],
                    'qty'         => $row['qty'],
                    'created_at'  => now(),
                    'updated_at'  => now(),
                ]);
            }
        }

        $total = DB::table('stok')->where('kode_barang', $barang->kode)->sum('qty');
        return response()->json(['message' => 'Stok diperbarui', 'stok_total' => (float) $total]);
    }

    public function isiModalOtomatis(Request $request)
    {
        $overwrite = $request->boolean('overwrite', false);

        $rata = DB::table('trx_beli')
            ->selectRaw('kode_barang, SUM(qty*harga - COALESCE(diskon,0)) / SUM(qty) as rata_rata, SUM(qty) as total_qty')
            ->groupBy('kode_barang')
            ->havingRaw('SUM(qty) > 0')
            ->get();

        $updated = [];
        $skipped = [];

        foreach ($rata as $r) {
            $barang = DB::table('barang')->where('kode', $r->kode_barang)->first();
            if (!$barang) {
                $skipped[] = ['kode' => $r->kode_barang, 'alasan' => 'Kode barang tidak ada di Master Barang'];
                continue;
            }
            if (!$overwrite && (float) $barang->modal > 0) {
                continue;
            }
            $modalBaru = round((float) $r->rata_rata, 2);
            if ($modalBaru <= 0) {
                $skipped[] = ['kode' => $barang->kode, 'nama' => $barang->nama, 'alasan' => 'Rata-rata harga beli 0/tidak valid'];
                continue;
            }
            DB::table('barang')->where('kode', $barang->kode)->update(['modal' => $modalBaru, 'updated_at' => now()]);
            $updated[] = [
                'kode' => $barang->kode, 'nama' => $barang->nama,
                'modal_lama' => (float) $barang->modal, 'modal_baru' => $modalBaru,
                'dari_qty_beli' => (float) $r->total_qty,
            ];
        }

        $tanpaRiwayatBeli = DB::table('trx_jual')
            ->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
            ->where(fn($w) => $w->where('barang.modal', 0)->orWhereNull('barang.modal'))
            ->whereNotIn('trx_jual.kode_barang', DB::table('trx_beli')->select('kode_barang'))
            ->selectRaw('barang.kode, barang.nama, SUM(trx_jual.qty) as qty_terjual')
            ->groupBy('barang.kode', 'barang.nama')
            ->orderByDesc('qty_terjual')
            ->limit(100)
            ->get();

        return response()->json([
            'message'             => count($updated) . ' barang berhasil diisi Harga Modal otomatis dari rata-rata harga Pembelian.',
            'jumlah_diupdate'     => count($updated),
            'detail'              => $updated,
            'dilewati'            => $skipped,
            'perlu_input_manual'  => $tanpaRiwayatBeli,
        ]);
    }

    public function importBarang(Request $request)
    {
        $request->validate([
            'items'         => 'required|array',
            'items.*.kode'  => 'required|string',
            'items.*.nama'  => 'required|string',
            // Import Stok Awal massal (opsional) — kolom TOKO/GUDANG di file
            // sumber dipetakan ke SATU cabang masing-masing untuk seluruh
            // baris di batch ini. Nilai minus (mis. data lama yang stok
            // fisiknya tidak masuk akal karena pembelian tidak selalu
            // tercatat) SELALU dianggap 0 di sini — bukan pilihan, supaya
            // endpoint ini konsisten dipakai lewat cara apapun (bukan cuma
            // dari form Import Excel yang sudah menolkannya duluan di frontend).
            'stok_toko_cabang'   => 'nullable|string|exists:cabang,nama',
            'stok_gudang_cabang' => 'nullable|string|exists:cabang,nama',
            'items.*.stok_toko'   => 'nullable|numeric',
            'items.*.stok_gudang' => 'nullable|numeric',
            // Cabang tujuan import. Diisi → file ini dianggap DAFTAR BARANG cabang tsb:
            // barang didaftarkan ke cabang itu dan harga jual di file disimpan sebagai
            // harga cabang tsb. Kosong → perilaku lama (harga standar katalog gabungan).
            'cabang'             => 'nullable|string|exists:cabang,nama',
        ]);
        $cabangTujuan = $request->input('cabang') ?: null;
        $hargaCabangDiisi = 0;
        $added = 0; $updated = 0; $skipped = 0; $stokDiisi = 0;
        $peringatan = []; // baris yang tetap masuk tapi ada nilai janggal yang diabaikan/diperbaiki
        $gagal = [];      // baris yang gagal disimpan (error DB), tidak menggagalkan baris lain
        $stokTokoCabang   = $request->input('stok_toko_cabang');
        $stokGudangCabang = $request->input('stok_gudang_cabang');

        // Kolom integer di tabel `barang` (stok_min, stok_max, isi) bertipe INT
        // standar MySQL (maks ±2.147.483.647). Kalau nilai yang dikirim jauh
        // lebih besar dari itu — biasanya karena kolom di Excel-nya salah/tertukar
        // dengan kolom barcode (13 digit) — jangan biarkan proses INSERT gagal
        // total, cukup nolkan nilainya untuk baris itu saja & catat sebagai peringatan.
        $INT_MAX = 2147483647;
        $clampInt = function ($val, string $kode, string $namaKolom) use (&$peringatan, $INT_MAX) {
            $v = (int) $val;
            if ($v > $INT_MAX || $v < -$INT_MAX) {
                $peringatan[] = "{$kode}: nilai {$namaKolom} ({$val}) tidak wajar (kemungkinan salah kolom di Excel, mis. tertukar dengan barcode) — diabaikan, diset 0.";
                return 0;
            }
            return $v;
        };

        foreach ($request->items as $item) {
            $kode = trim($item['kode'] ?? '');
            // `=== ''` (bukan `!$kode`): kode "0" adalah kode barang yang sah, jangan ikut terbuang.
            if ($kode === '') { $skipped++; continue; }

            // Mapping kolom Excel Toko Sumini ke kolom DB
            $ppnVal = 'Kena PPN';
            // Kalau KATEGORI = ROKOK atau Sub rokok → Non-PPN, bisa dikustomisasi
            // Default tetap Kena PPN kecuali dikirim eksplisit
            if (isset($item['ppn'])) {
                $ppnVal = in_array($item['ppn'], ['Kena PPN','Non-PPN']) ? $item['ppn'] : 'Kena PPN';
            }

            $data = [
                'nama'         => trim($item['nama'] ?? ''),
                'barcode'      => trim($item['barcode'] ?? $item['KODE_BARCODE'] ?? '') ?: null,
                'barcode2'     => trim($item['barcode2'] ?? $item['KODE_BARCODE_2'] ?? '') ?: null,
                'barcode3'     => trim($item['barcode3'] ?? $item['KODE_BARCODE_3'] ?? '') ?: null,
                'kategori'     => trim($item['kategori'] ?? $item['KATEGORI'] ?? '') ?: null,
                'sub_kategori' => trim($item['sub_kategori'] ?? $item['SUB_KATEGORI'] ?? '') ?: null,
                'supplier'     => trim($item['supplier'] ?? $item['SUPPLIER'] ?? '') ?: null,
                'ppn'          => $ppnVal,
                'satuan1'      => trim($item['satuan1'] ?? $item['SATUAN_1'] ?? 'PCS') ?: 'PCS',
                'satuan2'      => trim($item['satuan2'] ?? $item['SATUAN_2'] ?? '') ?: null,
                'satuan3'      => trim($item['satuan3'] ?? $item['SATUAN_3'] ?? '') ?: null,
                'isi'          => $clampInt($item['isi'] ?? $item['ISI'] ?? 1, $kode, 'Isi') ?: 1,
                'isi3'         => $clampInt($item['isi3'] ?? $item['ISI_3'] ?? 1, $kode, 'Isi 3') ?: 1,
                // HPP/Harga Modal TIDAK diimpor dari Excel — HPP hanya berasal dari
                // Pembelian (Kartu HPP). Barang baru mulai dari 0; kolom HPP/modal di
                // file (kalau ada) diabaikan sepenuhnya.
                'modal'        => 0,
                'harga_jual'   => (float)($item['harga_jual'] ?? $item['HARGA_TOKO_1'] ?? 0),
                'harga_grosir' => (float)($item['harga_grosir'] ?? $item['HARGA_PARTAI_1'] ?? 0),
                'harga_cabang' => (float)($item['harga_cabang'] ?? $item['HARGA_CABANG_1'] ?? 0),
                'stok_min'     => $clampInt($item['stok_min'] ?? $item['STOK_MIN'] ?? 0, $kode, 'Stok Min'),
                'stok_max'     => $clampInt($item['stok_max'] ?? $item['STOK_MAX'] ?? 0, $kode, 'Stok Max'),
            ];

            // Simpan per-baris di dalam try/catch — kalau satu baris gagal (mis.
            // masih ada error DB tak terduga lainnya), baris-baris lain tetap lanjut
            // diproses, bukan seluruh import batal gara-gara satu baris bermasalah.
            try {
                $hargaFile = [
                    'harga_jual'   => $data['harga_jual'],
                    'harga_grosir' => $data['harga_grosir'],
                    'harga_cabang' => $data['harga_cabang'],
                ];
                $existing = DB::table('barang')->where('kode', $kode)->first();
                if ($existing) {
                    $upd = $data;

                    // Import TIDAK PERNAH menyentuh HPP/Harga Modal barang yang sudah ada
                    // (nilainya dikelola otomatis dari Pembelian lewat Kartu HPP).
                    unset($upd['modal']);

                    // Harga jual di file yang berubah otomatis menggantikan harga lama.
                    // Nilai 0/kosong di file TIDAK menghapus harga yang sudah ada.
                    // Kalau ada cabang tujuan, harga file masuk ke harga cabang itu dan
                    // harga standar katalog hanya diisi bila masih kosong.
                    foreach (BarangCabangService::KOLOM_HARGA as $k) {
                        if ($hargaFile[$k] <= 0) { unset($upd[$k]); continue; }
                        if ($cabangTujuan && (float) ($existing->{$k} ?? 0) > 0) unset($upd[$k]);
                    }

                    DB::table('barang')->where('kode', $kode)->update(array_merge($upd, ['updated_at' => now()]));
                    $updated++;
                } else {
                    DB::table('barang')->insert(array_merge(['kode' => $kode], $data, ['created_at' => now(), 'updated_at' => now()]));
                    $added++;
                }

                if ($cabangTujuan) {
                    BarangCabangService::simpanHarga($kode, $cabangTujuan, $hargaFile, true);
                    $hargaCabangDiisi++;
                }

                // Stok Awal massal — nilai minus SELALU dinolkan (lihat catatan validasi
                // di atas), dan baris yang kolomnya kosong (null) tidak menyentuh stok sama
                // sekali (bukan berarti stoknya 0).
                if ($stokTokoCabang && isset($item['stok_toko']) && $item['stok_toko'] !== null) {
                    $this->setStokAwal($kode, $stokTokoCabang, max(0, (float) $item['stok_toko']));
                    $stokDiisi++;
                }
                if ($stokGudangCabang && isset($item['stok_gudang']) && $item['stok_gudang'] !== null) {
                    $this->setStokAwal($kode, $stokGudangCabang, max(0, (float) $item['stok_gudang']));
                    $stokDiisi++;
                }
            } catch (\Throwable $e) {
                $skipped++;
                $gagal[] = "{$kode}: " . $e->getMessage();
            }
        }
        return response()->json([
            'added'      => $added,
            'updated'    => $updated,
            'skipped'    => $skipped,
            'stok_diisi' => $stokDiisi,
            'terdaftar_di_cabang' => $hargaCabangDiisi,
            'peringatan' => array_slice($peringatan, 0, 50),
            'gagal'      => array_slice($gagal, 0, 20),
        ]);
    }

    // ─── IMPORT AMAN: SATUAN 2/3 & ISI SAJA ─────────────────────────────────
    // Berbeda dengan importBarang() di atas (yang menimpa SEMUA kolom termasuk
    // Harga Modal/Harga Jual/Harga Grosir/Harga Cabang kalau ada di file),
    // endpoint ini HANYA pernah menyentuh kolom satuan1/satuan2/satuan3/isi/isi3.
    // Kolom lain di body (kalau ikut terkirim) diabaikan total — supaya aman
    // dipakai untuk "melengkapi" data Satuan/Isi barang yang sudah pernah
    // diimpor/diinput sebelumnya tanpa risiko menimpa harga yang sudah benar.
    public function importSatuanMassal(Request $request)
    {
        $request->validate([
            'items'        => 'required|array',
            'items.*.kode' => 'required|string',
        ]);

        $INT_MAX = 2147483647;
        $updated = 0; $tidakDitemukan = 0; $dilewati = 0;
        $tidakDitemukanList = [];

        foreach ($request->items as $item) {
            $kode = trim($item['kode'] ?? '');
            if (!$kode) { $dilewati++; continue; }

            $barang = DB::table('barang')->where('kode', $kode)->first();
            if (!$barang) {
                $tidakDitemukan++;
                if (count($tidakDitemukanList) < 30) $tidakDitemukanList[] = $kode;
                continue;
            }

            // Hanya masukkan kolom yang benar-benar dikirim di baris ini, supaya
            // baris yang cuma punya sebagian kolom terisi tidak menimpa kolom
            // lain jadi kosong/1 secara tidak sengaja.
            $data = [];
            if (!empty(trim((string) ($item['satuan1'] ?? '')))) {
                $data['satuan1'] = trim($item['satuan1']);
            }
            if (array_key_exists('satuan2', $item)) {
                $data['satuan2'] = trim((string) $item['satuan2']) ?: null;
            }
            if (array_key_exists('satuan3', $item)) {
                $data['satuan3'] = trim((string) $item['satuan3']) ?: null;
            }
            if (array_key_exists('isi', $item) && trim((string) $item['isi']) !== '') {
                $v = (int) $item['isi'];
                $data['isi'] = ($v > 0 && $v <= $INT_MAX) ? $v : 1;
            }
            if (array_key_exists('isi3', $item) && trim((string) $item['isi3']) !== '') {
                $v = (int) $item['isi3'];
                $data['isi3'] = ($v > 0 && $v <= $INT_MAX) ? $v : 1;
            }

            if (!$data) { $dilewati++; continue; }

            DB::table('barang')->where('kode', $kode)->update(array_merge($data, ['updated_at' => now()]));
            $updated++;
        }

        return response()->json([
            'updated'          => $updated,
            'tidak_ditemukan'  => $tidakDitemukan,
            'dilewati'         => $dilewati,
            'contoh_tidak_ditemukan' => $tidakDitemukanList,
        ]);
    }

    // ─── JASA ────────────────────────────────────────────────────────────────
    public function getJasa()
    {
        return response()->json(DB::table('jasa')->orderBy('nama')->get());
    }

    public function storeJasa(Request $request)
    {
        $data = $request->validate([
            'kode'   => 'required|string|max:50|unique:jasa,kode',
            'nama'   => 'required|string|max:200',
            'ppn'    => ['required', Rule::in(['Kena PPN', 'Non-PPN'])],
            'harga'  => 'nullable|numeric|min:0',
        ]);
        $data['harga'] = $data['harga'] ?? 0;
        $id = DB::table('jasa')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('jasa')->find($id), 201);
    }

    public function updateJasa(Request $request, int $id)
    {
        $data = $request->validate([
            'nama'  => 'sometimes|string|max:200',
            'ppn'   => ['sometimes', Rule::in(['Kena PPN', 'Non-PPN'])],
            'harga' => 'sometimes|numeric|min:0',
        ]);
        DB::table('jasa')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('jasa')->find($id));
    }

    public function destroyJasa(int $id)
    {
        DB::table('jasa')->delete($id);
        return response()->json(['message' => 'Jasa dihapus']);
    }

    // ─── PELANGGAN ───────────────────────────────────────────────────────────
    public function getPelanggan(Request $request)
    {
        $q = DB::table('pelanggan')->orderBy('nama');
        if ($s = $request->get('search')) {
            $q->where(fn($q) => $q->where('kode', 'like', "%$s%")->orWhere('nama', 'like', "%$s%"));
        }
        return response()->json($q->get());
    }

    public function storePelanggan(Request $request)
    {
        $data = $request->validate([
            'kode'   => 'required|string|max:50|unique:pelanggan,kode',
            'nama'   => 'required|string|max:200',
            'telp'   => 'nullable|string|max:30',
            'alamat' => 'nullable|string|max:255',
            'poin'   => 'nullable|integer|min:0',
        ]);
        $data['poin'] = $data['poin'] ?? 0;
        $id = DB::table('pelanggan')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('pelanggan')->find($id), 201);
    }

    public function updatePelanggan(Request $request, int $id)
    {
        $data = $request->validate([
            'nama'   => 'sometimes|string|max:200',
            'telp'   => 'nullable|string|max:30',
            'alamat' => 'nullable|string|max:255',
            'poin'   => 'nullable|integer|min:0',
        ]);
        DB::table('pelanggan')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('pelanggan')->find($id));
    }

    public function destroyPelanggan(int $id)
    {
        DB::table('pelanggan')->delete($id);
        return response()->json(['message' => 'Pelanggan dihapus']);
    }

    // ─── IMPORT MASTER (Pelanggan, Jasa, COA) ────────────────────────────────
    // Semua endpoint import di bawah menerima { items: [...] } (dikirim per-chunk
    // dari frontend, lihat public/js/modules/import-master.js), tidak pernah
    // berhenti di tengah kalau ada 1 baris bermasalah — baris itu dilewati dan
    // dicatat di `errors`. Nilai kosong di file TIDAK menghapus data lama.

    private function cleanStr($v, ?int $max = null): string
    {
        $v = trim((string) ($v ?? ''));
        return ($max && mb_strlen($v) > $max) ? mb_substr($v, 0, $max) : $v;
    }

    public function importPelanggan(Request $request)
    {
        $request->validate(['items' => 'required|array|max:5000']);
        $added = 0; $updated = 0; $skipped = 0; $errors = [];

        // Nomor urut kode otomatis (PLG-00001 dst) untuk baris yang kolom kodenya kosong.
        $next = 0;
        foreach (DB::table('pelanggan')->where('kode', 'like', 'PLG-%')->pluck('kode') as $k) {
            $n = (int) substr($k, 4);
            if ($n > $next) $next = $n;
        }

        foreach ($request->items as $i => $item) {
            $nama = $this->cleanStr($item['nama'] ?? '', 255);
            if ($nama === '') { $skipped++; continue; }
            $kode = $this->cleanStr($item['kode'] ?? '', 50);

            $data = [];
            $telp = $this->cleanStr($item['telp'] ?? '', 30);
            if ($telp !== '') $data['telp'] = $telp;
            $alamat = $this->cleanStr($item['alamat'] ?? '', 255);
            if ($alamat !== '') $data['alamat'] = $alamat;
            if (isset($item['poin']) && $item['poin'] !== '' && $item['poin'] !== null) {
                $data['poin'] = max(0, (int) round((float) $item['poin']));
            }

            try {
                if ($kode !== '') {
                    $existing = DB::table('pelanggan')->where('kode', $kode)->first();
                } else {
                    // Tanpa kode: cocokkan dengan pelanggan bernama sama supaya import ulang tidak menggandakan.
                    $existing = DB::table('pelanggan')->whereRaw('LOWER(nama) = ?', [mb_strtolower($nama)])->first();
                }

                if ($existing) {
                    DB::table('pelanggan')->where('id', $existing->id)
                        ->update(array_merge(['nama' => $nama], $data, ['updated_at' => now()]));
                    $updated++;
                } else {
                    if ($kode === '') { $next++; $kode = 'PLG-' . str_pad($next, 5, '0', STR_PAD_LEFT); }
                    DB::table('pelanggan')->insert(array_merge(
                        ['kode' => $kode, 'nama' => $nama, 'poin' => 0], $data,
                        ['created_at' => now(), 'updated_at' => now()]
                    ));
                    $added++;
                }
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Baris " . ($i + 1) . " ({$nama}): " . $e->getMessage();
            }
        }
        return response()->json(['added' => $added, 'updated' => $updated, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 20)]);
    }

    public function importJasa(Request $request)
    {
        $request->validate(['items' => 'required|array|max:5000']);
        $added = 0; $updated = 0; $skipped = 0; $errors = [];

        foreach ($request->items as $i => $item) {
            $kode = $this->cleanStr($item['kode'] ?? '', 50);
            $nama = $this->cleanStr($item['nama'] ?? '', 200);
            if ($kode === '' || $nama === '') { $skipped++; continue; }

            $ppnRaw = mb_strtolower($this->cleanStr($item['ppn'] ?? ''));
            $ppn = null;
            if ($ppnRaw !== '') {
                $ppn = (in_array($ppnRaw, ['kena ppn', 'kena', 'ppn', 'ya', 'y', '1', 'true', 'yes'], true))
                    ? 'Kena PPN' : 'Non-PPN';
            }
            $harga = (isset($item['harga']) && $item['harga'] !== '' && $item['harga'] !== null)
                ? max(0, (float) $item['harga']) : null;

            try {
                $existing = DB::table('jasa')->where('kode', $kode)->first();
                if ($existing) {
                    $upd = ['nama' => $nama, 'updated_at' => now()];
                    if ($ppn !== null)   $upd['ppn']   = $ppn;
                    if ($harga !== null) $upd['harga'] = $harga;
                    DB::table('jasa')->where('id', $existing->id)->update($upd);
                    $updated++;
                } else {
                    DB::table('jasa')->insert([
                        'kode' => $kode, 'nama' => $nama, 'ppn' => $ppn ?? 'Non-PPN',
                        'harga' => $harga ?? 0, 'created_at' => now(), 'updated_at' => now(),
                    ]);
                    $added++;
                }
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Baris " . ($i + 1) . " ({$kode}): " . $e->getMessage();
            }
        }
        return response()->json(['added' => $added, 'updated' => $updated, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 20)]);
    }

    // Kategori akun: terima istilah umum (Asset, Hutang, Ekuitas, Biaya, dst) & jatuhkan
    // ke 5 kategori resmi. Kalau kosong/tak dikenal, tebak dari digit pertama kode akun.
    private function normalKategoriCoa(string $raw, string $kode): ?string
    {
        $k = preg_replace('/[^a-z]/', '', mb_strtolower($raw));
        $map = [
            'aset' => 'Aset', 'asset' => 'Aset', 'harta' => 'Aset', 'aktiva' => 'Aset',
            'liabilitas' => 'Liabilitas', 'kewajiban' => 'Liabilitas', 'hutang' => 'Liabilitas', 'utang' => 'Liabilitas',
            'modal' => 'Modal', 'ekuitas' => 'Modal', 'equity' => 'Modal',
            'pendapatan' => 'Pendapatan', 'penjualan' => 'Pendapatan', 'revenue' => 'Pendapatan', 'income' => 'Pendapatan',
            'beban' => 'Beban', 'biaya' => 'Beban', 'expense' => 'Beban',
        ];
        if (isset($map[$k])) return $map[$k];
        return match (substr($kode, 0, 1)) {
            '1' => 'Aset', '2' => 'Liabilitas', '3' => 'Modal', '4' => 'Pendapatan',
            '5', '6', '7', '8', '9' => 'Beban',
            default => null,
        };
    }

    public function importCoa(Request $request)
    {
        $request->validate(['items' => 'required|array|max:2000']);
        $added = 0; $updated = 0; $skipped = 0; $errors = [];

        foreach ($request->items as $i => $item) {
            $kode = $this->cleanStr($item['kode'] ?? '', 10);
            $nama = $this->cleanStr($item['nama'] ?? '', 100);
            if ($kode === '' || $nama === '') { $skipped++; continue; }

            $kat = $this->normalKategoriCoa($this->cleanStr($item['kat'] ?? ''), $kode);
            if (!$kat) { $skipped++; $errors[] = "Baris " . ($i + 1) . " ({$kode}): kategori tidak dikenali"; continue; }
            $normal = in_array($kat, ['Aset', 'Beban']) ? 'D' : 'K';

            $isKasRaw = mb_strtolower($this->cleanStr($item['is_kas'] ?? ''));
            $isKas = in_array($isKasRaw, ['1', 'y', 'ya', 'yes', 'true', 'kas', 'x'], true);

            try {
                $existing = DB::table('coa')->where('kode', $kode)->first();
                if ($existing) {
                    // Akun standar dikunci (sama seperti updateCoa) supaya Jurnal & Laporan tidak rusak.
                    if ($existing->is_default) { $skipped++; $errors[] = "{$kode}: akun standar, dilewati"; continue; }
                    $upd = ['nama' => $nama, 'kat' => $kat, 'normal' => $normal, 'updated_at' => now()];
                    if ($isKasRaw !== '') $upd['is_kas'] = ($kat === 'Aset') && $isKas;
                    DB::table('coa')->where('id', $existing->id)->update($upd);
                    $updated++;
                } else {
                    DB::table('coa')->insert([
                        'kode' => $kode, 'nama' => $nama, 'kat' => $kat, 'normal' => $normal,
                        'is_default' => false, 'is_kas' => ($kat === 'Aset') && $isKas,
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                    $added++;
                }
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Baris " . ($i + 1) . " ({$kode}): " . $e->getMessage();
            }
        }
        return response()->json(['added' => $added, 'updated' => $updated, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 20)]);
    }

    // ─── KADALUARSA ──────────────────────────────────────────────────────────
    public function getKadaluarsa(Request $request)
    {
        $q = DB::table('barang_kadaluarsa')
            ->leftJoin('barang', 'barang_kadaluarsa.kode_barang', '=', 'barang.kode')
            ->select('barang_kadaluarsa.*', 'barang.nama as nama_barang')
            ->orderBy('tgl_exp');
        if ($request->get('cabang')) $q->where('barang_kadaluarsa.cabang', $request->get('cabang'));
        return response()->json($q->get());
    }

    public function storeKadaluarsa(Request $request)
    {
        $data = $request->validate([
            'tgl'         => 'required|date',
            'cabang'      => 'required|string',
            'kode_barang' => 'required|string|exists:barang,kode',
            'batch'       => 'nullable|string|max:50',
            'qty'         => 'required|numeric|min:1',
            'tgl_exp'     => 'required|date',
        ]);
        $id = DB::table('barang_kadaluarsa')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('barang_kadaluarsa')->find($id), 201);
    }

    public function destroyKadaluarsa(int $id)
    {
        DB::table('barang_kadaluarsa')->delete($id);
        return response()->json(['message' => 'Data kadaluarsa dihapus']);
    }

    // ─── SETTINGS ────────────────────────────────────────────────────────────
    public function getSettings()
    {
        $settings = DB::table('settings')->get()->keyBy('key');
        return response()->json([
            'tarif_ppn'        => (float)($settings['tarif_ppn']->value ?? 11),
            'nama_toko'        => $settings['nama_toko']->value ?? 'Toko Sumini',
            // Default: stok BOLEH minus (belum aktifkan validasi ketat, sesuai permintaan sementara)
            'stok_boleh_minus' => ($settings['stok_boleh_minus']->value ?? '1') === '1',
            // Rp berapa = 1 poin pelanggan di Kasir POS (default Rp10.000 = 1 poin)
            'pos_rp_per_poin'  => (float)($settings['pos_rp_per_poin']->value ?? 10000),
            // Bentuk usaha — dipakai rekapPphFinal() utk tentukan apakah masih
            // boleh pakai tarif PPh Final 0,5% (PP 20/2026 mengecualikan CV/
            // Firma/PT biasa sejak 22 Apr 2026) & apakah dapat fasilitas bebas
            // pajak Rp500jt/tahun pertama (khusus WP Orang Pribadi).
            'bentuk_usaha'     => $settings['bentuk_usaha']->value ?? 'WP Orang Pribadi',
        ]);
    }

    public function updateSettings(Request $request)
    {
        $data = $request->validate([
            'tarif_ppn'        => 'sometimes|numeric|min:0|max:100',
            'stok_boleh_minus' => 'sometimes|boolean',
            'pos_rp_per_poin'  => 'sometimes|numeric|min:1',
            'bentuk_usaha'     => 'sometimes|in:WP Orang Pribadi,PT Perorangan,Koperasi,CV/Firma/PT Biasa',
        ]);
        if (array_key_exists('tarif_ppn', $data)) {
            DB::table('settings')->updateOrInsert(['key' => 'tarif_ppn'], ['value' => $data['tarif_ppn'], 'updated_at' => now()]);
        }
        if (array_key_exists('stok_boleh_minus', $data)) {
            DB::table('settings')->updateOrInsert(['key' => 'stok_boleh_minus'], ['value' => $data['stok_boleh_minus'] ? '1' : '0', 'updated_at' => now()]);
        }
        if (array_key_exists('pos_rp_per_poin', $data)) {
            DB::table('settings')->updateOrInsert(['key' => 'pos_rp_per_poin'], ['value' => $data['pos_rp_per_poin'], 'updated_at' => now()]);
        }
        if (array_key_exists('bentuk_usaha', $data)) {
            DB::table('settings')->updateOrInsert(['key' => 'bentuk_usaha'], ['value' => $data['bentuk_usaha'], 'updated_at' => now()]);
        }
        return response()->json(['message' => 'Setting disimpan'] + $data);
    }

    // ─── SALDO AWAL PERSEDIAAN (migrasi) ───────────────────────────────────
    // Dipanggil setelah Import Penjualan yang HPP-nya diambil dari laporan
    // kasir lama untuk barang yang tidak punya riwayat Pembelian di sistem
    // ini — supaya akun 1105 (Persediaan) tidak minus di Neraca, tanpa
    // mengubah HPP/Laba Rugi yang sudah otomatis benar. Sama persis dengan
    // `php artisan saldo-awal:generate`, versi API biar bisa dipicu dari
    // tombol di frontend. Lihat HppService::generateSaldoAwalPersediaan().
    public function generateSaldoAwal()
    {
        $hpp = app(\App\Services\HppService::class);
        $hasil = $hpp->generateSaldoAwalPersediaan();
        return response()->json([
            'message' => "Saldo Awal Persediaan diperbarui untuk {$hasil['barang_disentuh']} barang.",
        ] + $hasil);
    }
}
