<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

class SidSyncController extends Controller
{
    const SID_API_KEY  = '1c36be2a4bb74fce2adffa5a8dfdc5631';
    const SID_BASE_URL = 'https://sidretail.id/api';

    // ─── Generate kode TRX unik ──────────────────────────────────
    private function nextTrx(): string
    {
        $counter = DB::table('sid_trx_counter')->first();
        $n = ($counter->counter ?? 1000) + 1;
        DB::table('sid_trx_counter')->update(['counter' => $n]);
        return 'TSYNC' . $n;
    }

    // ─── Query ke SID API ────────────────────────────────────────
    private function sidQuery(string $sql): array
    {
        $trx = $this->nextTrx();
        $url = self::SID_BASE_URL . '/' . self::SID_API_KEY . '/' . $trx . '/' . $sql;

        try {
            $res = Http::timeout(15)->get($url);
            $body = $res->json();
            if (!$body || ($body['status'] ?? '') !== 'success') {
                throw new \Exception($body['result'] ?? 'SID API error');
            }
            return $body['data'] ?? [];
        } catch (\Exception $e) {
            Log::error('SID API error: ' . $e->getMessage() . ' | SQL: ' . $sql);
            throw $e;
        }
    }

    // ─── STATUS SYNC ─────────────────────────────────────────────
    public function status()
    {
        $logs = DB::table('sid_sync_log')->orderByDesc('sync_at')->limit(10)->get();
        $lastSync = DB::table('sid_sync_log')->orderByDesc('sync_at')->first();
        $totalSynced = DB::table('sid_synced')->count();
        $todaySynced = DB::table('sid_synced')
            ->whereDate('created_at', today())->count();

        // Cek koneksi SID
        $sidOk = false;
        try {
            $this->sidQuery('select 1+1 as test');
            $sidOk = true;
        } catch (\Exception $e) {
            $sidOk = false;
        }

        return response()->json([
            'koneksi_sid'   => $sidOk,
            'last_sync'     => $lastSync,
            'total_synced'  => $totalSynced,
            'today_synced'  => $todaySynced,
            'logs'          => $logs,
        ]);
    }

    // ─── SYNC PENJUALAN ──────────────────────────────────────────
    public function syncPenjualan(Request $request)
    {
        $tanggal = $request->get('tanggal', date('d/m/Y'));  // format SID: dd/mm/yyyy
        $berhasil = 0; $dilewati = 0; $gagal = 0; $pesan = [];
        $kodeTerdampak = []; // dikumpulkan dulu, Kartu HPP dibangun ulang sekali per kode di akhir

        try {
            // Ambil header penjualan dari SID untuk tanggal tertentu
            $sql     = "select kode,tanggal,pelanggan,nama_pelanggan,jumlah,bayar,operator,jenis,lunas,kode_kas from penjualan where tanggal='{$tanggal}' and tahan='False'";
            $headers = $this->sidQuery($sql);

            foreach ($headers as $h) {
                $kodeSid = $h['kode'];

                // Skip jika sudah pernah disync
                if (DB::table('sid_synced')->where('kode_sid', $kodeSid)->exists()) {
                    $dilewati++;
                    continue;
                }

                try {
                    // Ambil detail item penjualan
                    $sqlItem = "select kode_barang,nama_barang,satuan,qty,harga,diskon,subtotal,hpp from itempenjualan where kode='{$kodeSid}'";
                    $items   = $this->sidQuery($sqlItem);

                    // Konversi tanggal SID (dd/mm/yyyy) ke (yyyy-mm-dd)
                    $tglParts = explode('/', $h['tanggal']);
                    $tgl = count($tglParts) === 3
                        ? $tglParts[2] . '-' . $tglParts[1] . '-' . $tglParts[0]
                        : date('Y-m-d');

                    // Tentukan cabang — pakai operator SID sebagai referensi cabang
                    // atau mapping manual; default ke cabang pertama
                    $cabang = $this->mapCabang($h['operator'] ?? '');

                    // Simpan ke trx_jual per item
                    foreach ($items as $item) {
                        $kodeBarang = $item['kode_barang'] ?? '';
                        $qty        = (float)($item['qty'] ?? 0);
                        $harga      = (float)($item['harga'] ?? 0);
                        // HPP baris ini versi SID (dihitung kasir saat transaksi
                        // terjadi) — disimpan APA ADANYA supaya Jurnal/Laba Rugi
                        // tidak lagi bergantung 100% ke Harga Modal Master Barang
                        // yang bisa saja masih 0/belum diisi.
                        $hppItem    = (float)($item['hpp'] ?? 0);

                        // Cek apakah barang ada di master
                        $barang = DB::table('barang')
                            ->where('kode', $kodeBarang)
                            ->orWhere('barcode', $kodeBarang)
                            ->first();

                        if (!$barang) {
                            // Auto-insert barang dari SID jika belum ada
                            $barang = $this->upsertBarangFromSid($kodeBarang, $item);
                        }

                        $kodeBarangLocal = $barang ? $barang->kode : $kodeBarang;

                        DB::table('trx_jual')->insert([
                            'tgl'         => $tgl,
                            'cabang'      => $cabang,
                            'kode_barang' => $kodeBarangLocal,
                            'qty'         => $qty,
                            'harga'       => $harga,
                            'hpp'         => $hppItem > 0 ? $hppItem : null,
                            'bayar'       => ($h['lunas'] ?? 'True') === 'True' ? 'Tunai' : 'Kredit',
                            'keterangan'  => 'SYNC SID: ' . $kodeSid,
                            'created_at'  => now(),
                            'updated_at'  => now(),
                        ]);

                        // Update stok — kurangi stok di cabang
                        $this->kurangiStok($kodeBarangLocal, $cabang, $qty);
                        $kodeTerdampak[$kodeBarangLocal] = true;
                    }

                    // Tandai nota ini sudah disync
                    DB::table('sid_synced')->insert([
                        'jenis'    => 'penjualan',
                        'kode_sid' => $kodeSid,
                        'tanggal'  => $tgl,
                        'jumlah'   => (float)($h['jumlah'] ?? 0),
                        'created_at' => now(),
                        'updated_at' => now(),
                    ]);

                    $berhasil++;
                } catch (\Exception $e) {
                    $gagal++;
                    $pesan[] = "Gagal nota {$kodeSid}: " . $e->getMessage();
                }
            }

        } catch (\Exception $e) {
            $pesan[] = 'Error koneksi SID: ' . $e->getMessage();
        }

        // Kartu HPP: bangun ulang sekali per kode barang yang tersentuh sync ini
        // (bukan per baris) — juga otomatis menghormati `hpp` asli dari SID
        // sebagai override (lihat HppService::gatherEvents).
        $hppSvc = app(\App\Services\HppService::class);
        foreach (array_keys($kodeTerdampak) as $kode) {
            $hppSvc->rebuildItem($kode);
        }

        // Catat log
        DB::table('sid_sync_log')->insert([
            'jenis'    => 'penjualan',
            'sync_at'  => now(),
            'berhasil' => $berhasil,
            'dilewati' => $dilewati,
            'gagal'    => $gagal,
            'pesan'    => implode('; ', array_slice($pesan, 0, 5)),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'berhasil' => $berhasil,
            'dilewati' => $dilewati,
            'gagal'    => $gagal,
            'pesan'    => $pesan,
        ]);
    }

    // ─── PERBAIKI HPP NOTA LAMA (yang sudah kadung disync SEBELUM kolom
    //     `hpp` ada) ──────────────────────────────────────────────────
    // Untuk baris trx_jual hasil SYNC SID yang hpp-nya masih kosong (nota
    // lama, disync sebelum migration ini), method ini menelusuri balik
    // kode nota SID (disimpan di kolom `keterangan`), tarik ulang detail
    // itempenjualan dari SID, lalu isi kolom `hpp` sesuai nilai ASLI di
    // nota tsb — bukan menebak dari Harga Modal sekarang. Dibatasi
    // `limit` nota per panggilan (default 100) supaya tidak timeout;
    // panggil berulang sampai `tersisa` = 0.
    //
    // Sekaligus, untuk barang yang Harga Modal-nya di Master MASIH 0,
    // diisi otomatis dari rata-rata HPP ternota (SUM(hpp)/SUM(qty)) hasil
    // perbaikan ini — HANYA kalau modal saat ini benar-benar 0/kosong,
    // supaya tidak menimpa Harga Modal yang sudah diisi manual.
    public function perbaikiHppLama(Request $request)
    {
        $limit = (int)($request->get('limit', 100));

        $notaBermasalah = DB::table('trx_jual')
            ->whereNull('hpp')
            ->where('keterangan', 'like', 'SYNC SID: %')
            ->select(DB::raw("DISTINCT SUBSTRING(keterangan, 11) as kode_sid"))
            ->limit($limit)
            ->pluck('kode_sid');

        $notaDiperbaiki = 0; $barisDiperbaiki = 0; $gagal = 0; $pesan = [];
        $kodeTerdampak = [];

        foreach ($notaBermasalah as $kodeSid) {
            try {
                $sqlItem = "select kode_barang,qty,harga,hpp from itempenjualan where kode='{$kodeSid}'";
                $items   = $this->sidQuery($sqlItem);

                // Baris trx_jual utk nota ini yg masih kosong hpp-nya, urut
                // sesuai id (insert) — dipasangkan 1:1 dgn urutan item dari
                // SID (urutan sync & urutan query SID konsisten).
                $baris = DB::table('trx_jual')
                    ->where('keterangan', 'SYNC SID: ' . $kodeSid)
                    ->whereNull('hpp')
                    ->orderBy('id')
                    ->get();

                foreach ($baris as $i => $row) {
                    $item = $items[$i] ?? null;
                    if (!$item) continue;
                    $hppItem = (float)($item['hpp'] ?? 0);
                    if ($hppItem <= 0) continue;

                    DB::table('trx_jual')->where('id', $row->id)->update(['hpp' => $hppItem]);
                    $barisDiperbaiki++;
                    $kodeTerdampak[$row->kode_barang] = true;
                }
                $notaDiperbaiki++;
            } catch (\Exception $e) {
                $gagal++;
                $pesan[] = "Gagal nota {$kodeSid}: " . $e->getMessage();
            }
        }

        // Isi Harga Modal Master Barang yang masih 0, dari rata-rata HPP
        // ternota yang baru saja diperbaiki (tertimbang qty).
        $barangDiisi = DB::table('trx_jual')
            ->whereNotNull('hpp')
            ->where(function ($w) {
                $w->where('harga', '>', 0);
            })
            ->select('kode_barang', DB::raw('SUM(hpp) as total_hpp'), DB::raw('SUM(qty) as total_qty'))
            ->groupBy('kode_barang')
            ->havingRaw('SUM(qty) > 0')
            ->get()
            ->filter(function ($r) {
                $b = DB::table('barang')->where('kode', $r->kode_barang)->first();
                return $b && (float)$b->modal <= 0;
            })
            ->each(function ($r) {
                $modalBaru = round($r->total_hpp / $r->total_qty, 2);
                if ($modalBaru > 0) {
                    DB::table('barang')->where('kode', $r->kode_barang)->update(['modal' => $modalBaru]);
                }
            });

        // Kartu HPP: bangun ulang kode barang yang barisnya baru saja diisi HPP
        // otoritatif dari SID, supaya ledger & barang.modal ikut sinkron.
        $hppSvc = app(\App\Services\HppService::class);
        foreach (array_keys($kodeTerdampak) as $kode) {
            $hppSvc->rebuildItem($kode);
        }

        $tersisa = DB::table('trx_jual')
            ->whereNull('hpp')
            ->where('keterangan', 'like', 'SYNC SID: %')
            ->select(DB::raw("DISTINCT SUBSTRING(keterangan, 11)"))
            ->limit(1000)
            ->count();

        return response()->json([
            'nota_diperbaiki'  => $notaDiperbaiki,
            'baris_diperbaiki' => $barisDiperbaiki,
            'barang_modal_terisi' => $barangDiisi->count(),
            'gagal'    => $gagal,
            'tersisa'  => $tersisa,
            'pesan'    => $pesan,
        ]);
    }

    // ─── SYNC RANGE TANGGAL ──────────────────────────────────────
    public function syncRange(Request $request)
    {
        $request->validate([
            'dari'    => 'required|date',
            'sampai'  => 'required|date|after_or_equal:dari',
        ]);

        $dari   = new \DateTime($request->dari);
        $sampai = new \DateTime($request->sampai);
        $totalBerhasil = 0; $totalDilewati = 0; $totalGagal = 0;

        while ($dari <= $sampai) {
            $tglSid = $dari->format('d/m/Y');
            $req = new Request(['tanggal' => $tglSid]);
            $res = $this->syncPenjualan($req)->getData(true);
            $totalBerhasil += $res['berhasil'];
            $totalDilewati += $res['dilewati'];
            $totalGagal    += $res['gagal'];
            $dari->modify('+1 day');
        }

        return response()->json([
            'berhasil' => $totalBerhasil,
            'dilewati' => $totalDilewati,
            'gagal'    => $totalGagal,
        ]);
    }

    // ─── SYNC BARANG DARI SID ────────────────────────────────────
    public function syncBarang(Request $request)
    {
        $berhasil = 0; $dilewati = 0;
        $limit  = (int)($request->get('limit', 100));
        $offset = (int)($request->get('offset', 0));

        try {
            $sql  = "select kode,nama,kategori,satuanbeli,satuan,satuan2,satuan3,isi,isi2,hpp,harga_toko,harga_partai,stokmin,stokmax,supplier,kode_barcode,kode_barcode2,kode_barcode3 from barang limit {$limit} offset {$offset}";
            $list = $this->sidQuery($sql);

            foreach ($list as $b) {
                $kode = trim($b['kode'] ?? '');
                if (!$kode) continue;

                $data = [
                    'nama'         => trim($b['nama'] ?? ''),
                    'barcode'      => trim($b['kode_barcode'] ?? '') ?: null,
                    'barcode2'     => trim($b['kode_barcode2'] ?? '') ?: null,
                    'barcode3'     => trim($b['kode_barcode3'] ?? '') ?: null,
                    'kategori'     => trim($b['kategori'] ?? '') ?: null,
                    'supplier'     => trim($b['supplier'] ?? '') ?: null,
                    'ppn'          => 'Kena PPN',
                    'satuan1'      => trim($b['satuanbeli'] ?? 'PCS') ?: 'PCS',
                    'satuan2'      => trim($b['satuan2'] ?? '') ?: null,
                    'satuan3'      => trim($b['satuan3'] ?? '') ?: null,
                    'isi'          => (int)(float)($b['isi'] ?? 1) ?: 1,
                    'modal'        => (float)($b['hpp'] ?? 0),
                    'harga_jual'   => (float)($b['harga_toko'] ?? 0),
                    'harga_grosir' => (float)($b['harga_partai'] ?? 0),
                    'stok_min'     => (int)(float)($b['stokmin'] ?? 0),
                    'stok_max'     => (int)(float)($b['stokmax'] ?? 0),
                    'updated_at'   => now(),
                ];

                $existing = DB::table('barang')->where('kode', $kode)->first();
                if ($existing) {
                    DB::table('barang')->where('kode', $kode)->update($data);
                    $dilewati++;
                } else {
                    DB::table('barang')->insert(array_merge(['kode' => $kode, 'created_at' => now()], $data));
                    $berhasil++;
                }
            }
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }

        DB::table('sid_sync_log')->insert([
            'jenis'    => 'barang',
            'sync_at'  => now(),
            'berhasil' => $berhasil,
            'dilewati' => $dilewati,
            'gagal'    => 0,
            'pesan'    => "Offset {$offset}, limit {$limit}",
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json([
            'ditambah'   => $berhasil,
            'diperbarui' => $dilewati,
            'total'      => $berhasil + $dilewati,
        ]);
    }

    // ─── SYNC STOK DARI SID ──────────────────────────────────────
    public function syncStok(Request $request)
    {
        $cabang  = $request->get('cabang', '');
        $berhasil = 0;

        try {
            // Ambil stok toko dari field 'toko' di tabel barang SID
            $sql  = "select kode,toko,gudang from barang where toko > 0 or gudang > 0";
            $list = $this->sidQuery($sql);

            $cabangLocal = $cabang ?: $this->cabangDefault();

            foreach ($list as $b) {
                $kode = trim($b['kode']);
                $qty  = (float)($b['toko'] ?? 0);
                if ($qty <= 0) continue;

                // Cek barang ada di lokal
                $barangAda = DB::table('barang')->where('kode', $kode)->exists();
                if (!$barangAda) continue;

                $existing = DB::table('stok')
                    ->where('kode_barang', $kode)
                    ->where('cabang', $cabangLocal)
                    ->first();

                if ($existing) {
                    DB::table('stok')->where('id', $existing->id)
                        ->update(['qty' => $qty, 'updated_at' => now()]);
                } else {
                    DB::table('stok')->insert([
                        'kode_barang' => $kode,
                        'cabang'      => $cabangLocal,
                        'qty'         => $qty,
                        'created_at'  => now(),
                        'updated_at'  => now(),
                    ]);
                }
                $berhasil++;
            }
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }

        DB::table('sid_sync_log')->insert([
            'jenis'    => 'stok',
            'sync_at'  => now(),
            'berhasil' => $berhasil,
            'dilewati' => 0,
            'gagal'    => 0,
            'pesan'    => "Sync stok ke cabang: {$cabangLocal}",
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return response()->json(['diperbarui' => $berhasil]);
    }

    // ─── HELPERS ─────────────────────────────────────────────────
    private function mapCabang(string $operator): string
    {
        // Mapping operator SID ke nama cabang lokal
        // Bisa dikustomisasi di sini
        $map = DB::table('sid_cabang_map')->pluck('cabang_lokal', 'operator_sid')->toArray();
        if (isset($map[$operator])) return $map[$operator];
        return $this->cabangDefault();
    }

    private function cabangDefault(): string
    {
        $c = DB::table('cabang')->orderBy('id')->first();
        return $c ? $c->nama : 'Pusat';
    }

    private function upsertBarangFromSid(string $kode, array $item): ?object
    {
        if (!$kode) return null;
        try {
            // Coba ambil detail barang dari SID
            $detail = $this->sidQuery("select kode,nama,kategori,satuanbeli,satuan,hpp,harga_toko,kode_barcode from barang where kode='{$kode}'");
            $b = $detail[0] ?? null;
            if (!$b) {
                // Fallback dari data item penjualan
                $b = [
                    'kode'         => $kode,
                    'nama'         => $item['nama_barang'] ?? $kode,
                    'kategori'     => null,
                    'satuanbeli'   => $item['satuan'] ?? 'PCS',
                    'hpp'          => $item['hpp'] ?? 0,
                    'harga_toko'   => $item['harga'] ?? 0,
                    'kode_barcode' => $kode,
                ];
            }

            $data = [
                'kode'       => trim($b['kode']),
                'nama'       => trim($b['nama'] ?? $kode),
                'barcode'    => trim($b['kode_barcode'] ?? '') ?: null,
                'kategori'   => trim($b['kategori'] ?? '') ?: null,
                'ppn'        => 'Kena PPN',
                'satuan1'    => trim($b['satuanbeli'] ?? 'PCS') ?: 'PCS',
                'modal'      => (float)($b['hpp'] ?? 0),
                'harga_jual' => (float)($b['harga_toko'] ?? 0),
                'created_at' => now(),
                'updated_at' => now(),
            ];

            DB::table('barang')->insertOrIgnore($data);
            return DB::table('barang')->where('kode', trim($b['kode']))->first();
        } catch (\Exception $e) {
            return null;
        }
    }

    private function kurangiStok(string $kodeBarang, string $cabang, float $qty): void
    {
        $stok = DB::table('stok')->where('kode_barang', $kodeBarang)->where('cabang', $cabang)->first();
        if ($stok) {
            DB::table('stok')->where('id', $stok->id)
                ->update(['qty' => max(0, $stok->qty - $qty), 'updated_at' => now()]);
        }
    }

    // ─── MAPPING CABANG ──────────────────────────────────────────
    public function getCabangMap()
    {
        // Pastikan tabel ada
        if (!Schema::hasTable('sid_cabang_map')) return response()->json([]);
        return response()->json(DB::table('sid_cabang_map')->get());
    }

    public function saveCabangMap(Request $request)
    {
        $request->validate(['items' => 'required|array']);
        if (!Schema::hasTable('sid_cabang_map')) {
            DB::statement("CREATE TABLE sid_cabang_map (id BIGINT AUTO_INCREMENT PRIMARY KEY, operator_sid VARCHAR(50), cabang_lokal VARCHAR(100), created_at TIMESTAMP, updated_at TIMESTAMP)");
        }
        DB::table('sid_cabang_map')->truncate();
        foreach ($request->items as $item) {
            if (!empty($item['operator_sid']) && !empty($item['cabang_lokal'])) {
                DB::table('sid_cabang_map')->insert([
                    'operator_sid'  => $item['operator_sid'],
                    'cabang_lokal'  => $item['cabang_lokal'],
                    'created_at'    => now(),
                    'updated_at'    => now(),
                ]);
            }
        }
        return response()->json(['message' => 'Mapping disimpan']);
    }

    // ─── LIST OPERATOR DI SID (untuk mapping) ────────────────────
    public function getOperatorSid()
    {
        try {
            $data = $this->sidQuery("select distinct operator from penjualan limit 50");
            return response()->json($data);
        } catch (\Exception $e) {
            return response()->json(['error' => $e->getMessage()], 500);
        }
    }
}
