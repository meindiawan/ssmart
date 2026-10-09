<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * SaldoAwalController — fitur "Saldo Awal" untuk migrasi ke sistem baru.
 * Dua bagian:
 *   1. Saldo Awal Akun     → tabel saldo_awal_akun (Kas, Piutang, Hutang,
 *                             Modal, dst — SEMUA akun Neraca kecuali
 *                             Persediaan 1105 yang punya alurnya sendiri).
 *   2. Saldo Awal Inventory→ barang_masuk dengan sumber='Saldo Awal Manual'
 *                             (beda dari sumber='Saldo Awal' yang dibuat
 *                             OTOMATIS oleh HppService::generateSaldoAwalPersediaan()
 *                             — supaya keduanya tidak saling menimpa).
 * Lihat App\Http\Controllers\Api\DashboardController::buildJurnal() untuk
 * bagaimana kedua sumber ini masuk ke Jurnal & Neraca.
 */
class SaldoAwalController extends Controller
{
    // Akun yang TIDAK boleh diisi lewat Saldo Awal Akun (biasa) karena
    // punya mekanisme saldo awal sendiri / adalah akun sistem (plug account).
    private array $akunDikecualikan = ['1105', '3102', '3103'];

    // ─── SALDO AWAL AKUN ────────────────────────────────────────────────
    public function akunIndex()
    {
        $akun = DB::table('coa')
            ->whereIn('kat', ['Aset', 'Liabilitas', 'Modal'])
            ->whereNotIn('kode', $this->akunDikecualikan)
            ->orderBy('kode')->get();

        $cabang = DB::table('cabang')->orderBy('nama')->pluck('nama');
        $saldo  = DB::table('saldo_awal_akun')->get();

        return response()->json([
            'akun'   => $akun,
            'cabang' => $cabang,
            'saldo'  => $saldo,
        ]);
    }

    public function akunSave(Request $request)
    {
        $data = $request->validate([
            'items'               => 'required|array|min:1',
            'items.*.kode_akun'   => 'required|string|max:10',
            'items.*.cabang'      => 'required|string|max:100',
            'items.*.tgl'         => 'required|date',
            'items.*.nominal'     => 'required|numeric',
            'items.*.keterangan'  => 'nullable|string',
        ]);

        $disimpan = 0; $dihapus = 0; $gagal = [];
        foreach ($data['items'] as $it) {
            if (in_array($it['kode_akun'], $this->akunDikecualikan)) {
                $gagal[] = "{$it['kode_akun']}: akun ini tidak boleh diisi lewat Saldo Awal Akun";
                continue;
            }
            if (!DB::table('coa')->where('kode', $it['kode_akun'])->exists()) {
                $gagal[] = "{$it['kode_akun']}: kode akun tidak ditemukan";
                continue;
            }
            $nominal = (float) $it['nominal'];
            if ($nominal <= 0) {
                // Nominal 0/kosong = hapus baris (kalau ada)
                $dihapus += DB::table('saldo_awal_akun')
                    ->where('kode_akun', $it['kode_akun'])->where('cabang', $it['cabang'])
                    ->delete();
                continue;
            }
            $existing = DB::table('saldo_awal_akun')
                ->where('kode_akun', $it['kode_akun'])->where('cabang', $it['cabang'])->first();
            if ($existing) {
                DB::table('saldo_awal_akun')->where('id', $existing->id)->update([
                    'tgl' => $it['tgl'], 'nominal' => $nominal,
                    'keterangan' => $it['keterangan'] ?? null, 'updated_at' => now(),
                ]);
            } else {
                DB::table('saldo_awal_akun')->insert([
                    'kode_akun' => $it['kode_akun'], 'cabang' => $it['cabang'],
                    'tgl' => $it['tgl'], 'nominal' => $nominal,
                    'keterangan' => $it['keterangan'] ?? null,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
            $disimpan++;
        }

        return response()->json([
            'message'  => "Saldo Awal Akun disimpan: {$disimpan} baris" . ($dihapus ? ", {$dihapus} baris dihapus (nominal 0)" : ''),
            'disimpan' => $disimpan, 'dihapus' => $dihapus, 'gagal' => $gagal,
        ]);
    }

    public function akunDestroy(int $id)
    {
        $row = DB::table('saldo_awal_akun')->find($id);
        if (!$row) return response()->json(['error' => 'Tidak ditemukan'], 404);
        DB::table('saldo_awal_akun')->delete($id);
        return response()->json(['message' => 'Saldo Awal Akun dihapus']);
    }

    // ─── SALDO AWAL INVENTORY (manual) ─────────────────────────────────
    public function inventoryIndex(Request $request)
    {
        // BUGFIX: sebelumnya hanya menampilkan sumber='Saldo Awal Manual', jadi
        // baris hasil "Jalankan Deteksi Otomatis" (sumber='Saldo Awal', dibuat
        // oleh HppService::generateSaldoAwalPersediaan()) tidak pernah kelihatan
        // di daftar ini walau sudah berhasil tersimpan & masuk jurnal 1105/1106.
        // Sekarang keduanya ditampilkan, dibedakan lewat kolom `sumber` (badge
        // di frontend) — supaya user bisa lihat hasil Deteksi Otomatis juga.
        $q = DB::table('barang_masuk')
            ->join('barang', 'barang_masuk.kode_barang', '=', 'barang.kode')
            ->whereIn('barang_masuk.sumber', ['Saldo Awal Manual', 'Saldo Awal'])
            ->select('barang_masuk.*', 'barang.nama as nama_barang')
            ->orderByDesc('barang_masuk.tgl')->orderBy('barang.nama');

        if ($cab = $request->get('cabang')) $q->where('barang_masuk.cabang', $cab);
        if ($s = $request->get('search')) {
            $q->where(fn($q) => $q->where('barang.nama', 'like', "%$s%")->orWhere('barang_masuk.kode_barang', 'like', "%$s%"));
        }

        return response()->json($q->get());
    }

    private function stokBolehMinus(): bool
    {
        $v = DB::table('settings')->where('key', 'stok_boleh_minus')->value('value');
        return $v === null ? true : $v === '1';
    }

    private function updateStok(string $kodeBarang, string $cabang, float $delta): void
    {
        $bolehMinus = $this->stokBolehMinus();
        $existing = DB::table('stok')->where('kode_barang', $kodeBarang)->where('cabang', $cabang)->first();
        if ($existing) {
            $newQty = $existing->qty + $delta;
            if (!$bolehMinus) $newQty = max(0, $newQty);
            DB::table('stok')->where('kode_barang', $kodeBarang)->where('cabang', $cabang)
                ->update(['qty' => $newQty, 'updated_at' => now()]);
        } else {
            $newQty = $bolehMinus ? $delta : max(0, $delta);
            DB::table('stok')->insert([
                'kode_barang' => $kodeBarang, 'cabang' => $cabang, 'qty' => $newQty,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    // Import/simpan banyak baris sekaligus (dari grid input manual ATAU dari
    // Import Excel). Setiap baris kode_barang+cabang unik: kalau sudah ada
    // baris "Saldo Awal Manual" utk kombinasi itu, di-UPDATE (bukan nambah
    // baris baru) — supaya bisa dikoreksi berkali-kali sebelum final tanpa
    // stok dobel-dobel ditambahkan.
    public function inventoryImport(Request $request)
    {
        $data = $request->validate([
            'items'                 => 'required|array|min:1',
            'items.*.kode_barang'   => 'required|string',
            'items.*.cabang'        => 'required|string|max:100',
            'items.*.qty'           => 'required|numeric',
            'items.*.harga_beli'    => 'nullable|numeric|min:0',
            'items.*.tgl'           => 'required|date',
        ]);

        $ditambah = 0; $diperbarui = 0; $gagal = [];
        $cabangValid = DB::table('cabang')->pluck('nama')->all();

        foreach ($data['items'] as $it) {
            $barang = DB::table('barang')->where('kode', $it['kode_barang'])->first();
            if (!$barang) { $gagal[] = "{$it['kode_barang']}: barang tidak ditemukan di Master Barang"; continue; }
            if (!in_array($it['cabang'], $cabangValid)) { $gagal[] = "{$it['kode_barang']}: cabang '{$it['cabang']}' tidak ditemukan"; continue; }
            $qty = (float) $it['qty'];
            if ($qty <= 0) { $gagal[] = "{$it['kode_barang']}: qty harus lebih dari 0"; continue; }
            $harga = (float) ($it['harga_beli'] ?? 0);

            $existing = DB::table('barang_masuk')
                ->where('sumber', 'Saldo Awal Manual')
                ->where('kode_barang', $it['kode_barang'])->where('cabang', $it['cabang'])
                ->first();

            if ($existing) {
                // Sesuaikan stok: keluarkan qty lama, masukkan qty baru
                $this->updateStok($it['kode_barang'], $it['cabang'], $qty - (float) $existing->qty);
                DB::table('barang_masuk')->where('id', $existing->id)->update([
                    'tgl' => $it['tgl'], 'qty' => $qty, 'harga_beli' => $harga,
                    'satuan' => $barang->satuan1 ?? 'PCS', 'updated_at' => now(),
                ]);
                $diperbarui++;
            } else {
                DB::table('barang_masuk')->insert([
                    'no_dok' => 'SALDO-AWAL', 'tgl' => $it['tgl'], 'cabang' => $it['cabang'],
                    'kode_barang' => $it['kode_barang'], 'satuan' => $barang->satuan1 ?? 'PCS',
                    'qty' => $qty, 'harga_beli' => $harga, 'sumber' => 'Saldo Awal Manual',
                    'keterangan' => 'Saldo Awal Inventory (input manual)',
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                $this->updateStok($it['kode_barang'], $it['cabang'], $qty);
                $ditambah++;
            }
        }

        return response()->json([
            'message'    => "Saldo Awal Inventory: {$ditambah} ditambah, {$diperbarui} diperbarui" . ($gagal ? ", " . count($gagal) . " gagal" : ''),
            'ditambah'   => $ditambah, 'diperbarui' => $diperbarui, 'gagal' => $gagal,
        ]);
    }

    public function inventoryDestroy(int $id)
    {
        $row = DB::table('barang_masuk')->where('id', $id)->where('sumber', 'Saldo Awal Manual')->first();
        if (!$row) return response()->json(['error' => 'Tidak ditemukan'], 404);
        $this->updateStok($row->kode_barang, $row->cabang, -(float) $row->qty);
        DB::table('barang_masuk')->delete($id);
        return response()->json(['message' => 'Saldo Awal Inventory dihapus, stok disesuaikan']);
    }
}
