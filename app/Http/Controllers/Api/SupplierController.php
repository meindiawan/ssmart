<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

// ─── SUPPLIER ───────────────────────────────────────────────────────────────
// Master data supplier/pemasok. Dipakai sebagai sumber dropdown wajib saat
// input Transaksi > Pembelian (lihat TransaksiController::storeBeli/importTrx)
// supaya setiap pembelian bisa ditelusuri dari supplier mana barangnya
// berasal — dan ikut ditampilkan di modul Kontak (KontakController) untuk
// rekap hutang usaha per supplier.
class SupplierController extends Controller
{
    public function index(Request $request)
    {
        $q = DB::table('supplier')->orderBy('nama');
        if ($s = $request->get('search')) {
            $q->where(fn($q) => $q->where('nama', 'like', "%$s%")->orWhere('kontak', 'like', "%$s%"));
        }
        return response()->json($q->get());
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'nama'       => 'required|string|max:255|unique:supplier,nama',
            'kontak'     => 'nullable|string|max:100',
            'telp'       => 'nullable|string|max:30',
            'alamat'     => 'nullable|string',
            'keterangan' => 'nullable|string',
        ]);
        $id = DB::table('supplier')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('supplier')->find($id), 201);
    }

    // Import massal dari Excel (dikirim per-chunk oleh import-master.js).
    // Cocokkan berdasarkan NAMA (tidak peduli huruf besar/kecil): sudah ada → isi
    // kontak/telp/alamat/keterangan yang di file terisi (yang kosong tidak menghapus
    // data lama), belum ada → dibuat baru. Nama supplier lama TIDAK diubah, jadi
    // referensi di trx_beli tetap nyambung.
    public function import(Request $request)
    {
        $request->validate(['items' => 'required|array|max:5000']);
        $added = 0; $updated = 0; $skipped = 0; $errors = [];
        $limit = ['kontak' => 100, 'telp' => 30, 'alamat' => null, 'keterangan' => null];

        foreach ($request->items as $i => $item) {
            $nama = trim((string) ($item['nama'] ?? ''));
            if ($nama === '') { $skipped++; continue; }
            if (mb_strlen($nama) > 255) { $nama = mb_substr($nama, 0, 255); }

            $data = [];
            foreach ($limit as $f => $max) {
                $v = trim((string) ($item[$f] ?? ''));
                if ($v !== '') $data[$f] = $max ? mb_substr($v, 0, $max) : $v;
            }

            try {
                $existing = DB::table('supplier')->whereRaw('LOWER(nama) = ?', [mb_strtolower($nama)])->first();
                if ($existing) {
                    if ($data) DB::table('supplier')->where('id', $existing->id)->update(array_merge($data, ['updated_at' => now()]));
                    $updated++;
                } else {
                    DB::table('supplier')->insert(array_merge(['nama' => $nama], $data, ['created_at' => now(), 'updated_at' => now()]));
                    $added++;
                }
            } catch (\Throwable $e) {
                $skipped++;
                $errors[] = "Baris " . ($i + 1) . " ({$nama}): " . $e->getMessage();
            }
        }
        return response()->json(['added' => $added, 'updated' => $updated, 'skipped' => $skipped, 'errors' => array_slice($errors, 0, 20)]);
    }

    public function update(Request $request, int $id)
    {
        $data = $request->validate([
            'nama'       => ['sometimes', 'string', 'max:255', Rule::unique('supplier', 'nama')->ignore($id)],
            'kontak'     => 'nullable|string|max:100',
            'telp'       => 'nullable|string|max:30',
            'alamat'     => 'nullable|string',
            'keterangan' => 'nullable|string',
        ]);
        $supplier = DB::table('supplier')->find($id);
        if (!$supplier) return response()->json(['message' => 'Supplier tidak ditemukan'], 404);

        // Kalau nama diganti, ikut update referensi teks di trx_beli & barang_masuk
        // supaya riwayat pembelian & Kontak tetap nyambung ke supplier yang sama.
        if (!empty($data['nama']) && $data['nama'] !== $supplier->nama) {
            DB::table('trx_beli')->where('supplier', $supplier->nama)->update(['supplier' => $data['nama']]);
            DB::table('barang_masuk')->where('supplier', $supplier->nama)->update(['supplier' => $data['nama']]);
            DB::table('kontak_catatan')->where('tipe', 'Supplier')->where('nama', $supplier->nama)->update(['nama' => $data['nama']]);
        }

        DB::table('supplier')->where('id', $id)->update(array_merge($data, ['updated_at' => now()]));
        return response()->json(DB::table('supplier')->find($id));
    }

    public function destroy(int $id)
    {
        $supplier = DB::table('supplier')->find($id);
        if (!$supplier) return response()->json(['message' => 'Supplier tidak ditemukan'], 404);

        $dipakai = DB::table('trx_beli')->where('supplier', $supplier->nama)->exists();
        if ($dipakai) {
            return response()->json([
                'message' => 'Supplier ini sudah dipakai di data Pembelian dan tidak bisa dihapus. Ubah namanya kalau perlu, atau biarkan supaya riwayat pembelian tetap tertelusur.',
            ], 422);
        }

        DB::table('supplier')->delete($id);
        return response()->json(['message' => 'Supplier dihapus']);
    }
}
