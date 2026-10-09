<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * POS CONTROLLER — Kasir Penjualan & Pembelian (multi-barang sekaligus)
 * ─────────────────────────────────────────────────────────────────────
 * Menu ini adalah "kulit" baru yang lebih cepat/enak dipakai kasir, TAPI
 * secara konstruksi tetap menulis ke tabel yang SAMA dengan modul
 * Transaksi > Penjualan/Pembelian biasa (trx_jual / trx_beli), lewat
 * helper yang sama (cariBarang, konversiSatuan, adjustStok — diwarisi
 * dari TransaksiController). Konsekuensinya:
 *   - Jurnal otomatis (DashboardController::buildJurnal) ikut mencatat
 *     transaksi dari POS ini TANPA perubahan apa pun di sana.
 *   - Laporan, stok, dan riwayat di modul Transaksi lama tetap konsisten.
 * Yang beda hanya: 1 kali "Simpan" bisa menyimpan BANYAK baris barang
 * sekaligus (dikelompokkan dengan `no_nota`), plus fitur kasir modern:
 * diskon per-baris & per-nota, grosir/ecer, wajib supplier utk beli,
 * dan poin pelanggan utk jual — semuanya direkap di tabel `pos_nota`
 * supaya strukturnya bisa dicetak ulang kapan saja.
 * ═══════════════════════════════════════════════════════════════════════
 */
class PosController extends TransaksiController
{
    // ─── SETTING: Rp per 1 poin ─────────────────────────────────────────
    private function rpPerPoin(): float
    {
        $v = DB::table('settings')->where('key', 'pos_rp_per_poin')->value('value');
        return $v !== null && (float) $v > 0 ? (float) $v : 10000; // default: Rp10.000 = 1 poin
    }

    // ─── NOMOR NOTA OTOMATIS: POS-J-20260717-0001 / POS-B-... ───────────
    private function nextNoNota(string $tgl, string $jenis): string
    {
        $kode   = $jenis === 'Jual' ? 'J' : 'B';
        $prefix = 'POS-' . $kode . '-' . date('Ymd', strtotime($tgl));
        $count  = DB::table('pos_nota')->where('no_nota', 'like', $prefix . '-%')->count() + 1;
        $noNota = $prefix . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        while (DB::table('pos_nota')->where('no_nota', $noNota)->exists()) {
            $count++;
            $noNota = $prefix . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        }
        return $noNota;
    }

    /* ═══════════════════════════════════════════════════════════════════
     * SHIFT KASIR — "login shift" (isi kas awal) sampai "tutup shift"
     * (isi kas akhir), meniru aplikasi kasir desktop. Selama shift masih
     * berstatus 'buka', layar Riwayat di Kasir POS hanya menampilkan nota
     * yang dibuat pada shift tsb. Satu cabang hanya boleh punya 1 shift
     * 'buka' pada satu waktu.
     * ═══════════════════════════════════════════════════════════════════ */

    // ─── SHIFT YANG SEDANG AKTIF (BUKA) DI SATU CABANG — dipakai saat POS
    //     dibuka/di-refresh supaya sesi kasir tidak hilang ────────────────
    public function shiftAktif(Request $request)
    {
        $data = $request->validate(['cabang' => 'required|string']);
        $shift = DB::table('pos_shift')
            ->where('cabang', $data['cabang'])
            ->where('status', 'buka')
            ->orderByDesc('id')
            ->first();
        return response()->json(['shift' => $shift]);
    }

    // ─── LOGIN SHIFT / KAS AWAL SHIFT ────────────────────────────────────
    // Kalau cabang tsb sudah punya shift yang masih 'buka', dikembalikan
    // apa adanya (idempotent) supaya kasir yang refresh halaman tidak
    // membuat shift baru berkali-kali — persis "Kas Akhir kasir saat ini"
    // di dialog Welcome Shift aplikasi desktop.
    public function bukaShift(Request $request)
    {
        $data = $request->validate([
            'cabang'   => 'required|string|exists:cabang,nama',
            'kasir'    => 'required|string|max:100',
            'kas_awal' => 'nullable|numeric|min:0',
        ]);

        $existing = DB::table('pos_shift')
            ->where('cabang', $data['cabang'])->where('status', 'buka')
            ->orderByDesc('id')->first();
        if ($existing) {
            return response()->json(['shift' => $existing]);
        }

        $nomorShiftTerakhir = (int) DB::table('pos_shift')
            ->where('cabang', $data['cabang'])
            ->whereDate('waktu_mulai', now()->toDateString())
            ->max('nomor_shift');

        $noRef = 'SHF-' . now()->format('Ymd-His') . '-' . strtoupper(substr(preg_replace('/[^A-Za-z0-9]/', '', $data['kasir']), 0, 4));

        $id = DB::table('pos_shift')->insertGetId([
            'no_referensi' => $noRef,
            'cabang'       => $data['cabang'],
            'kasir'        => $data['kasir'],
            'nomor_shift'  => $nomorShiftTerakhir + 1,
            'kas_awal'     => (float) ($data['kas_awal'] ?? 0),
            'status'       => 'buka',
            'waktu_mulai'  => now(),
            'created_at'   => now(), 'updated_at' => now(),
        ]);

        $shift = DB::table('pos_shift')->find($id);
        return response()->json(['shift' => $shift], 201);
    }

    // ─── TUTUP SHIFT (isi kas akhir, keluar dari sesi kasir) ─────────────
    public function tutupShift(Request $request, int $id)
    {
        $shift = DB::table('pos_shift')->find($id);
        if (!$shift) return response()->json(['message' => 'Shift tidak ditemukan'], 404);
        if ($shift->status !== 'buka') return response()->json(['message' => 'Shift ini sudah ditutup'], 422);

        $data = $request->validate([
            'kas_akhir' => 'nullable|numeric|min:0',
            'catatan'   => 'nullable|string|max:255',
        ]);

        DB::table('pos_shift')->where('id', $id)->update([
            'kas_akhir'     => $data['kas_akhir'] ?? null,
            'status'        => 'tutup',
            'waktu_selesai' => now(),
            'catatan'       => $data['catatan'] ?? null,
            'updated_at'    => now(),
        ]);

        return response()->json(['message' => 'Shift ditutup', 'shift' => DB::table('pos_shift')->find($id)]);
    }

    // ─── SIMPAN TRANSAKSI KASIR: PENJUALAN (multi-barang) ────────────────
    public function storeJual(Request $request)
    {
        $data = $request->validate([
            'tgl'              => 'required|date',
            'cabang'           => 'required|string|exists:cabang,nama',
            'pelanggan'        => 'nullable|string|max:50|exists:pelanggan,kode',
            'tipe_harga'       => ['required', Rule::in(['Ecer', 'Grosir'])],
            'bayar'            => ['required', Rule::in(['Tunai', 'Kredit'])],
            // Wajib dipilih kalau Tunai — akun kas/bank tujuan uang masuk,
            // persis field "KODE KAS [F12]" di kasir desktop, supaya saldo
            // per-akun (mis. Kas Toko A vs Toko B) & modal tetap akurat.
            'kode_kas'         => ['required_if:bayar,Tunai', 'nullable', 'string', 'exists:coa,kode'],
            'diskon_nota'      => 'nullable|numeric|min:0',
            'poin_dipakai'     => 'nullable|integer|min:0',
            'kasir'            => 'nullable|string|max:100',
            'catatan'          => 'nullable|string|max:255',
            'shift_id'         => 'nullable|integer|exists:pos_shift,id',
            'items'                 => 'required|array|min:1',
            'items.*.kode_barang'   => 'required|string',
            'items.*.qty'           => 'required|numeric|min:0.01',
            'items.*.harga'         => 'required|numeric|min:0',
            'items.*.satuan'        => 'nullable|string|max:20',
            'items.*.diskon'        => 'nullable|numeric|min:0',
        ]);

        $diskonNota  = (float) ($data['diskon_nota'] ?? 0);
        $poinDipakai = (int) ($data['poin_dipakai'] ?? 0);
        if (($data['bayar'] ?? null) !== 'Tunai') $data['kode_kas'] = null;

        // Poin hanya bisa dipakai kalau pelanggan (bukan umum/walk-in) dipilih
        $pelangganRow = null;
        if ($data['pelanggan'] ?? null) {
            $pelangganRow = DB::table('pelanggan')->where('kode', $data['pelanggan'])->first();
        }
        if ($poinDipakai > 0) {
            if (!$pelangganRow) {
                throw ValidationException::withMessages(['poin_dipakai' => 'Pilih pelanggan terlebih dahulu untuk memakai poin.']);
            }
            if ($poinDipakai > (int) $pelangganRow->poin) {
                throw ValidationException::withMessages(['poin_dipakai' => "Poin pelanggan tidak cukup. Poin tersedia: {$pelangganRow->poin}."]);
            }
        }

        $stokBolehMinus = $this->stokBolehMinus();

        return DB::transaction(function () use ($data, $diskonNota, $poinDipakai, $pelangganRow, $stokBolehMinus) {
            $noNota = $this->nextNoNota($data['tgl'], 'Jual');

            // ── Tahap 1: resolusi tiap baris (barang, konversi satuan, subtotal) ──
            $resolved = [];
            $subtotal = 0;      // total sebelum diskon apa pun
            $diskonItemTotal = 0;
            foreach ($data['items'] as $item) {
                $barang = $this->cariBarang($item['kode_barang']);
                $qtyInput   = (float) $item['qty'];
                $hargaInput = (float) $item['harga'];
                $itemDiskon = (float) ($item['diskon'] ?? 0);

                $konv = $this->konversiSatuan($barang, $qtyInput, $hargaInput, $item['satuan'] ?? null);

                // Cek stok (qty asli sebelum konversi vs stok yang sudah dikonversi
                // ke satuan dasar — bandingkan dalam satuan dasar supaya konsisten)
                if (!$stokBolehMinus && $barang) {
                    $tersedia = $this->stokTersedia($barang->kode, $data['cabang']);
                    if ($tersedia < (float) $konv['qty']) {
                        throw ValidationException::withMessages([
                            'items' => "Stok {$barang->nama} tidak cukup di {$data['cabang']}. Tersedia: {$tersedia} {$barang->satuan1}.",
                        ]);
                    }
                }

                $lineSubtotal = $qtyInput * $hargaInput; // sama nilainya walau nanti dikonversi
                $subtotal += $lineSubtotal;
                $diskonItemTotal += $itemDiskon;

                $resolved[] = [
                    'barang'       => $barang,
                    'kode_input'   => $item['kode_barang'],
                    'konv'         => $konv,
                    'line_subtotal'=> $lineSubtotal,
                    'item_diskon'  => $itemDiskon,
                ];
            }

            $totalSebelumNota = $subtotal - $diskonItemTotal;
            $diskonNota = min($diskonNota, max($totalSebelumNota, 0));
            $potonganPoin = $poinDipakai * $this->rpPerPoin();
            $potonganPoin = min($potonganPoin, max($totalSebelumNota - $diskonNota, 0));
            $totalAkhir = max($totalSebelumNota - $diskonNota - $potonganPoin, 0);
            $diskonTambahanTotal = $diskonNota + $potonganPoin; // akan disebar proporsional ke tiap baris

            // ── Tahap 2: insert tiap baris ke trx_jual (struktur sama seperti
            //             modul Transaksi > Penjualan biasa) ──────────────────
            $sisaDiskonTambahan = $diskonTambahanTotal;
            foreach ($resolved as $i => $r) {
                $barang = $r['barang'];
                $konv   = $r['konv'];
                $isLast = $i === count($resolved) - 1;

                // Sebar diskon nota+poin proporsional ke tiap baris berdasar bobot
                // subtotal baris tsb, supaya nilai total di jurnal tetap akurat.
                // Baris terakhir menampung sisa pembulatan.
                $bagian = $totalSebelumNota > 0
                    ? round($diskonTambahanTotal * ($r['line_subtotal'] / max($subtotal, 0.01)))
                    : 0;
                if ($isLast) $bagian = $sisaDiskonTambahan;
                $sisaDiskonTambahan -= $bagian;
                $diskonBaris = $r['item_diskon'] + $bagian;

                $row = [
                    'no_nota'       => $noNota,
                    'tgl'           => $data['tgl'],
                    'cabang'        => $data['cabang'],
                    'kode_barang'   => $barang ? $barang->kode : $r['kode_input'],
                    'qty'           => $konv['qty'],
                    'harga'         => $konv['harga'],
                    'diskon'        => $diskonBaris,
                    'satuan'        => $konv['satuan'],
                    'qty_asal'      => $konv['qty_asal'],
                    'harga_asal'    => $konv['harga_asal'],
                    'bayar'         => $data['bayar'],
                    'kode_kas'      => $data['kode_kas'] ?? null,
                    'pelanggan'     => $data['pelanggan'] ?? null,
                    'tipe_harga'    => $data['tipe_harga'],
                    'keterangan'    => $data['catatan'] ?? null,
                    'tidak_dikenal' => !$barang,
                    'kode_asli'     => $barang ? null : $r['kode_input'],
                    'created_at'    => now(), 'updated_at' => now(),
                ];
                DB::table('trx_jual')->insert($row);
                $this->adjustStok($row['kode_barang'], $data['cabang'], -(float) $konv['qty']);
            }

            // ── Tahap 3: poin — earn dari total akhir, redeem dari poin_dipakai ──
            $poinDidapat = 0;
            if ($pelangganRow) {
                $poinDidapat = (int) floor($totalAkhir / $this->rpPerPoin());
                $poinBaru = max((int) $pelangganRow->poin - $poinDipakai + $poinDidapat, 0);
                DB::table('pelanggan')->where('id', $pelangganRow->id)->update([
                    'poin' => $poinBaru, 'updated_at' => now(),
                ]);
            }

            // ── Tahap 4: header nota (untuk cetak struk & riwayat POS) ──────────
            DB::table('pos_nota')->insert([
                'no_nota'      => $noNota,
                'jenis'        => 'Jual',
                'tgl'          => $data['tgl'],
                'cabang'       => $data['cabang'],
                'shift_id'     => $data['shift_id'] ?? null,
                'pelanggan'    => $data['pelanggan'] ?? null,
                'supplier'     => null,
                'tipe_harga'   => $data['tipe_harga'],
                'bayar'        => $data['bayar'],
                'kode_kas'     => $data['kode_kas'] ?? null,
                'jumlah_item'  => count($resolved),
                'subtotal'     => $subtotal,
                'diskon'       => $diskonItemTotal + $diskonTambahanTotal,
                'total'        => $totalAkhir,
                'poin_didapat' => $poinDidapat,
                'poin_dipakai' => $poinDipakai,
                'kasir'        => $data['kasir'] ?? null,
                'catatan'      => $data['catatan'] ?? null,
                'created_at'   => now(), 'updated_at' => now(),
            ]);

            return response()->json($this->buildNotaResponse($noNota), 201);
        });
    }

    // ─── SIMPAN TRANSAKSI KASIR: PEMBELIAN (multi-barang, wajib supplier) ─
    public function storeBeli(Request $request)
    {
        $data = $request->validate([
            'tgl'         => 'required|date',
            'cabang'      => 'required|string|exists:cabang,nama',
            'supplier'    => 'required|string|exists:supplier,nama',
            'bayar'       => ['required', Rule::in(['Tunai', 'Kredit'])],
            'kode_kas'    => ['required_if:bayar,Tunai', 'nullable', 'string', 'exists:coa,kode'],
            'diskon_nota' => 'nullable|numeric|min:0',
            'kasir'       => 'nullable|string|max:100',
            'catatan'     => 'nullable|string|max:255',
            'shift_id'    => 'nullable|integer|exists:pos_shift,id',
            'items'               => 'required|array|min:1',
            'items.*.kode_barang' => 'required|string',
            'items.*.qty'         => 'required|numeric|min:0.01',
            'items.*.harga'       => 'required|numeric|min:0',
            'items.*.satuan'      => 'nullable|string|max:20',
            'items.*.diskon'      => 'nullable|numeric|min:0',
        ]);
        if (($data['bayar'] ?? null) !== 'Tunai') $data['kode_kas'] = null;

        $diskonNota = (float) ($data['diskon_nota'] ?? 0);

        return DB::transaction(function () use ($data, $diskonNota) {
            $noNota = $this->nextNoNota($data['tgl'], 'Beli');

            $resolved = [];
            $subtotal = 0;
            $diskonItemTotal = 0;
            foreach ($data['items'] as $item) {
                $barang = $this->cariBarang($item['kode_barang']);
                $qtyInput   = (float) $item['qty'];
                $hargaInput = (float) $item['harga'];
                $itemDiskon = (float) ($item['diskon'] ?? 0);

                $konv = $this->konversiSatuan($barang, $qtyInput, $hargaInput, $item['satuan'] ?? null);

                $lineSubtotal = $qtyInput * $hargaInput;
                $subtotal += $lineSubtotal;
                $diskonItemTotal += $itemDiskon;

                $resolved[] = [
                    'barang'        => $barang,
                    'kode_input'    => $item['kode_barang'],
                    'konv'          => $konv,
                    'line_subtotal' => $lineSubtotal,
                    'item_diskon'   => $itemDiskon,
                ];
            }

            $totalSebelumNota = $subtotal - $diskonItemTotal;
            $diskonNota = min($diskonNota, max($totalSebelumNota, 0));
            $totalAkhir = max($totalSebelumNota - $diskonNota, 0);

            $sisaDiskonNota = $diskonNota;
            foreach ($resolved as $i => $r) {
                $barang = $r['barang'];
                $konv   = $r['konv'];
                $isLast = $i === count($resolved) - 1;

                $bagian = $subtotal > 0
                    ? round($diskonNota * ($r['line_subtotal'] / max($subtotal, 0.01)))
                    : 0;
                if ($isLast) $bagian = $sisaDiskonNota;
                $sisaDiskonNota -= $bagian;
                $diskonBaris = $r['item_diskon'] + $bagian;

                // Diskon (dalam satuan asli) ikut dipecah ke satuan dasar seperti
                // storeBeli biasa, supaya konsisten dengan konversi qty/harga.
                if ($konv['qty_asal'] !== null && $diskonBaris > 0 && (float) $konv['qty_asal'] > 0) {
                    $isi = (float) $konv['qty'] / (float) $konv['qty_asal'];
                    $diskonBaris = round($diskonBaris / max($isi, 1), 2);
                }

                $row = [
                    'no_nota'       => $noNota,
                    'tgl'           => $data['tgl'],
                    'cabang'        => $data['cabang'],
                    'kode_barang'   => $barang ? $barang->kode : $r['kode_input'],
                    'qty'           => $konv['qty'],
                    'harga'         => $konv['harga'],
                    'diskon'        => $diskonBaris,
                    'satuan'        => $konv['satuan'],
                    'qty_asal'      => $konv['qty_asal'],
                    'harga_asal'    => $konv['harga_asal'],
                    'bayar'         => $data['bayar'],
                    'kode_kas'      => $data['kode_kas'] ?? null,
                    'keterangan'    => $data['catatan'] ?? null,
                    'supplier'      => $data['supplier'],
                    'tidak_dikenal' => !$barang,
                    'kode_asli'     => $barang ? null : $r['kode_input'],
                    'created_at'    => now(), 'updated_at' => now(),
                ];
                DB::table('trx_beli')->insert($row);
                $this->adjustStok($row['kode_barang'], $data['cabang'], (float) $konv['qty']);
            }

            DB::table('pos_nota')->insert([
                'no_nota'      => $noNota,
                'jenis'        => 'Beli',
                'tgl'          => $data['tgl'],
                'cabang'       => $data['cabang'],
                'shift_id'     => $data['shift_id'] ?? null,
                'pelanggan'    => null,
                'supplier'     => $data['supplier'],
                'tipe_harga'   => null,
                'bayar'        => $data['bayar'],
                'kode_kas'     => $data['kode_kas'] ?? null,
                'jumlah_item'  => count($resolved),
                'subtotal'     => $subtotal,
                'diskon'       => $diskonItemTotal + $diskonNota,
                'total'        => $totalAkhir,
                'poin_didapat' => 0,
                'poin_dipakai' => 0,
                'kasir'        => $data['kasir'] ?? null,
                'catatan'      => $data['catatan'] ?? null,
                'created_at'   => now(), 'updated_at' => now(),
            ]);

            return response()->json($this->buildNotaResponse($noNota), 201);
        });
    }

    // ─── Bentuk response lengkap 1 nota (header + baris barang) — dipakai
    //     langsung setelah simpan (untuk struk) & untuk cetak ulang ─────────
    private function buildNotaResponse(string $noNota): array
    {
        $nota = DB::table('pos_nota')->where('no_nota', $noNota)->first();
        if (!$nota) return [];

        $table = $nota->jenis === 'Jual' ? 'trx_jual' : 'trx_beli';
        $items = DB::table($table)
            ->leftJoin('barang', "$table.kode_barang", '=', 'barang.kode')
            ->where("$table.no_nota", $noNota)
            ->select("$table.*", 'barang.nama as nama_barang', 'barang.satuan1')
            ->orderBy("$table.id")
            ->get();

        $pelangganNama = null;
        if ($nota->pelanggan) {
            $pelangganNama = DB::table('pelanggan')->where('kode', $nota->pelanggan)->value('nama');
        }

        return [
            'nota'  => $nota,
            'items' => $items,
            'pelanggan_nama' => $pelangganNama,
        ];
    }

    // ─── AMBIL 1 NOTA (untuk cetak ulang struk dari Riwayat) ─────────────
    public function getNota(string $noNota)
    {
        $data = $this->buildNotaResponse($noNota);
        if (empty($data)) return response()->json(['message' => 'Nota tidak ditemukan'], 404);
        return response()->json($data);
    }

    // ─── RIWAYAT NOTA POS (list + filter, untuk cetak ulang / pantauan) ──
    public function riwayatNota(Request $request)
    {
        $q = DB::table('pos_nota')->orderByDesc('tgl')->orderByDesc('id');
        if ($jenis = $request->get('jenis'))   $q->where('jenis', $jenis === 'jual' ? 'Jual' : 'Beli');
        if ($cabang = $request->get('cabang')) $q->where('cabang', $cabang);
        if ($request->filled('shift_id'))      $q->where('shift_id', (int) $request->get('shift_id'));
        $this->applyFilterTanggal($q, $request, 'tgl');
        // Cari bebas: no. nota, nama pelanggan/supplier, atau nama kasir —
        // supaya kasir tinggal ketik apa saja yang diingat soal nota itu.
        if ($s = trim((string) $request->get('search'))) {
            $q->where(function ($w) use ($s) {
                $w->where('no_nota', 'like', "%$s%")
                  ->orWhere('pelanggan', 'like', "%$s%")
                  ->orWhere('supplier', 'like', "%$s%")
                  ->orWhere('kasir', 'like', "%$s%");
            });
        }

        $summary = (clone $q)->selectRaw('COUNT(*) as jumlah, COALESCE(SUM(total),0) as total_nominal')->first();

        $perPage = (int) $request->get('per_page', 20);
        if ($perPage <= 0 || $perPage > 99000) $perPage = 99999;

        return $this->paginated($q->paginate($perPage), [
            'summary' => [
                'jumlah'        => (int) $summary->jumlah,
                'total_nominal' => (float) $summary->total_nominal,
            ],
        ]);
    }

    // ─── HAPUS NOTA (batalkan transaksi POS): kembalikan stok & poin ─────
    public function destroyNota(string $noNota)
    {
        $nota = DB::table('pos_nota')->where('no_nota', $noNota)->first();
        if (!$nota) return response()->json(['message' => 'Nota tidak ditemukan'], 404);

        DB::transaction(function () use ($nota, $noNota) {
            $this->reverseNotaEffects($noNota, $nota);
            DB::table('pos_nota')->where('no_nota', $noNota)->delete();
        });

        return response()->json(['message' => 'Transaksi POS dibatalkan, stok & poin dikembalikan']);
    }

    // ─── Balikkan efek stok & poin dari 1 nota (dipakai sebelum menghapus
    //     ATAU sebelum menulis ulang isinya saat "Edit Nota") ─────────────
    private function reverseNotaEffects(string $noNota, object $nota): void
    {
        $table = $nota->jenis === 'Jual' ? 'trx_jual' : 'trx_beli';
        $arah  = $nota->jenis === 'Jual' ? 1 : -1; // kebalikan dari saat disimpan

        DB::table($table)->where('no_nota', $noNota)->get()->each(function ($row) use ($arah) {
            $this->adjustStok($row->kode_barang, $row->cabang, $arah * (float) $row->qty);
        });
        DB::table($table)->where('no_nota', $noNota)->delete();

        // Kembalikan poin: batalkan poin yang didapat, kembalikan poin yang dipakai
        if ($nota->jenis === 'Jual' && $nota->pelanggan) {
            $pel = DB::table('pelanggan')->where('kode', $nota->pelanggan)->first();
            if ($pel) {
                $poinBaru = max((int) $pel->poin - $nota->poin_didapat + $nota->poin_dipakai, 0);
                DB::table('pelanggan')->where('id', $pel->id)->update(['poin' => $poinBaru, 'updated_at' => now()]);
            }
        }
    }

    /* ═══════════════════════════════════════════════════════════════════
     * EDIT NOTA — timpa ulang isi 1 nota yang SUDAH ADA (no_nota tetap
     * sama, tidak membuat transaksi baru). Dipakai layar Kasir POS saat
     * kasir membuka nota lama utk koreksi: ganti qty, satuan (PCS↔KARTON),
     * harga, diskon, tambah/hapus barang. Efek stok & poin nota lama
     * dibalik dulu (reverseNotaEffects), baru diterapkan ulang sesuai
     * data baru — supaya tidak dobel/kurang.
     * ═══════════════════════════════════════════════════════════════════ */
    public function updateJual(Request $request, string $noNota)
    {
        $notaLama = DB::table('pos_nota')->where('no_nota', $noNota)->where('jenis', 'Jual')->first();
        if (!$notaLama) return response()->json(['message' => 'Nota tidak ditemukan'], 404);

        $data = $request->validate([
            'tgl'              => 'required|date',
            'cabang'           => 'required|string|exists:cabang,nama',
            'pelanggan'        => 'nullable|string|max:50|exists:pelanggan,kode',
            'tipe_harga'       => ['required', Rule::in(['Ecer', 'Grosir'])],
            'bayar'            => ['required', Rule::in(['Tunai', 'Kredit'])],
            'kode_kas'         => ['required_if:bayar,Tunai', 'nullable', 'string', 'exists:coa,kode'],
            'diskon_nota'      => 'nullable|numeric|min:0',
            'poin_dipakai'     => 'nullable|integer|min:0',
            'kasir'            => 'nullable|string|max:100',
            'catatan'          => 'nullable|string|max:255',
            'items'                 => 'required|array|min:1',
            'items.*.kode_barang'   => 'required|string',
            'items.*.qty'           => 'required|numeric|min:0.01',
            'items.*.harga'         => 'required|numeric|min:0',
            'items.*.satuan'        => 'nullable|string|max:20',
            'items.*.diskon'        => 'nullable|numeric|min:0',
        ]);
        if (($data['bayar'] ?? null) !== 'Tunai') $data['kode_kas'] = null;

        $diskonNota  = (float) ($data['diskon_nota'] ?? 0);
        $poinDipakai = (int) ($data['poin_dipakai'] ?? 0);
        $stokBolehMinus = $this->stokBolehMinus();

        return DB::transaction(function () use ($data, $diskonNota, $poinDipakai, $stokBolehMinus, $noNota, $notaLama) {
            // ── Balikkan dulu efek nota lama (stok & poin) sebelum menulis ulang
            $this->reverseNotaEffects($noNota, $notaLama);

            $pelangganRow = null;
            if ($data['pelanggan'] ?? null) {
                $pelangganRow = DB::table('pelanggan')->where('kode', $data['pelanggan'])->first();
            }
            if ($poinDipakai > 0 && (!$pelangganRow || $poinDipakai > (int) $pelangganRow->poin)) {
                throw ValidationException::withMessages(['poin_dipakai' => 'Poin yang dipakai melebihi poin pelanggan saat ini.']);
            }

            $resolved = [];
            $subtotal = 0;
            $diskonItemTotal = 0;
            foreach ($data['items'] as $item) {
                $barang = $this->cariBarang($item['kode_barang']);
                $qtyInput   = (float) $item['qty'];
                $hargaInput = (float) $item['harga'];
                $itemDiskon = (float) ($item['diskon'] ?? 0);

                $konv = $this->konversiSatuan($barang, $qtyInput, $hargaInput, $item['satuan'] ?? null);

                if (!$stokBolehMinus && $barang) {
                    $tersedia = $this->stokTersedia($barang->kode, $data['cabang']);
                    if ($tersedia < (float) $konv['qty']) {
                        throw ValidationException::withMessages(['items' => "Stok {$barang->nama} tidak cukup di {$data['cabang']}. Tersedia: {$tersedia} {$barang->satuan1}."]);
                    }
                }

                $lineSubtotal = $qtyInput * $hargaInput;
                $subtotal += $lineSubtotal;
                $diskonItemTotal += $itemDiskon;

                $resolved[] = [
                    'barang' => $barang, 'kode_input' => $item['kode_barang'], 'konv' => $konv,
                    'line_subtotal' => $lineSubtotal, 'item_diskon' => $itemDiskon,
                ];
            }

            $totalSebelumNota = $subtotal - $diskonItemTotal;
            $diskonNota   = min($diskonNota, max($totalSebelumNota, 0));
            $potonganPoin = $poinDipakai * $this->rpPerPoin();
            $potonganPoin = min($potonganPoin, max($totalSebelumNota - $diskonNota, 0));
            $totalAkhir   = max($totalSebelumNota - $diskonNota - $potonganPoin, 0);
            $diskonTambahanTotal = $diskonNota + $potonganPoin;

            $sisaDiskonTambahan = $diskonTambahanTotal;
            foreach ($resolved as $i => $r) {
                $barang = $r['barang'];
                $konv   = $r['konv'];
                $isLast = $i === count($resolved) - 1;

                $bagian = $subtotal > 0
                    ? round($diskonTambahanTotal * ($r['line_subtotal'] / max($subtotal, 0.01)))
                    : 0;
                if ($isLast) $bagian = $sisaDiskonTambahan;
                $sisaDiskonTambahan -= $bagian;
                $diskonBaris = $r['item_diskon'] + $bagian;

                $row = [
                    'no_nota'      => $noNota,
                    'tgl'          => $data['tgl'],
                    'cabang'       => $data['cabang'],
                    'kode_barang'  => $barang ? $barang->kode : $r['kode_input'],
                    'qty'          => $konv['qty'],
                    'harga'        => $konv['harga'],
                    'diskon'       => $diskonBaris,
                    'satuan'       => $konv['satuan'],
                    'qty_asal'     => $konv['qty_asal'],
                    'harga_asal'   => $konv['harga_asal'],
                    'bayar'        => $data['bayar'],
                    'kode_kas'     => $data['kode_kas'] ?? null,
                    'pelanggan'    => $data['pelanggan'] ?? null,
                    'tipe_harga'   => $data['tipe_harga'],
                    'keterangan'   => $data['catatan'] ?? null,
                    'tidak_dikenal' => !$barang,
                    'kode_asli'    => $barang ? null : $r['kode_input'],
                    'created_at'   => now(), 'updated_at' => now(),
                ];
                DB::table('trx_jual')->insert($row);
                $this->adjustStok($row['kode_barang'], $data['cabang'], -(float) $konv['qty']);
            }

            $poinDidapat = 0;
            if ($pelangganRow) {
                $poinDidapat = (int) floor($totalAkhir / $this->rpPerPoin());
                $poinBaru = max((int) $pelangganRow->poin - $poinDipakai + $poinDidapat, 0);
                DB::table('pelanggan')->where('id', $pelangganRow->id)->update([
                    'poin' => $poinBaru, 'updated_at' => now(),
                ]);
            }

            DB::table('pos_nota')->where('no_nota', $noNota)->update([
                'tgl'          => $data['tgl'],
                'cabang'       => $data['cabang'],
                'pelanggan'    => $data['pelanggan'] ?? null,
                'tipe_harga'   => $data['tipe_harga'],
                'bayar'        => $data['bayar'],
                'kode_kas'     => $data['kode_kas'] ?? null,
                'jumlah_item'  => count($resolved),
                'subtotal'     => $subtotal,
                'diskon'       => $diskonItemTotal + $diskonTambahanTotal,
                'total'        => $totalAkhir,
                'poin_didapat' => $poinDidapat,
                'poin_dipakai' => $poinDipakai,
                'kasir'        => $data['kasir'] ?? $notaLama->kasir,
                'catatan'      => $data['catatan'] ?? null,
                'updated_at'   => now(),
            ]);

            return response()->json($this->buildNotaResponse($noNota));
        });
    }

    // ─── EDIT NOTA: PEMBELIAN (sama seperti updateJual tapi tanpa poin) ───
    public function updateBeli(Request $request, string $noNota)
    {
        $notaLama = DB::table('pos_nota')->where('no_nota', $noNota)->where('jenis', 'Beli')->first();
        if (!$notaLama) return response()->json(['message' => 'Nota tidak ditemukan'], 404);

        $data = $request->validate([
            'tgl'         => 'required|date',
            'cabang'      => 'required|string|exists:cabang,nama',
            'supplier'    => 'required|string|exists:supplier,nama',
            'bayar'       => ['required', Rule::in(['Tunai', 'Kredit'])],
            'kode_kas'    => ['required_if:bayar,Tunai', 'nullable', 'string', 'exists:coa,kode'],
            'diskon_nota' => 'nullable|numeric|min:0',
            'kasir'       => 'nullable|string|max:100',
            'catatan'     => 'nullable|string|max:255',
            'items'               => 'required|array|min:1',
            'items.*.kode_barang' => 'required|string',
            'items.*.qty'         => 'required|numeric|min:0.01',
            'items.*.harga'       => 'required|numeric|min:0',
            'items.*.satuan'      => 'nullable|string|max:20',
            'items.*.diskon'      => 'nullable|numeric|min:0',
        ]);
        if (($data['bayar'] ?? null) !== 'Tunai') $data['kode_kas'] = null;

        $diskonNota = (float) ($data['diskon_nota'] ?? 0);

        return DB::transaction(function () use ($data, $diskonNota, $noNota, $notaLama) {
            $this->reverseNotaEffects($noNota, $notaLama);

            $resolved = [];
            $subtotal = 0;
            $diskonItemTotal = 0;
            foreach ($data['items'] as $item) {
                $barang = $this->cariBarang($item['kode_barang']);
                $qtyInput   = (float) $item['qty'];
                $hargaInput = (float) $item['harga'];
                $itemDiskon = (float) ($item['diskon'] ?? 0);

                $konv = $this->konversiSatuan($barang, $qtyInput, $hargaInput, $item['satuan'] ?? null);

                $lineSubtotal = $qtyInput * $hargaInput;
                $subtotal += $lineSubtotal;
                $diskonItemTotal += $itemDiskon;

                $resolved[] = [
                    'barang' => $barang, 'kode_input' => $item['kode_barang'], 'konv' => $konv,
                    'line_subtotal' => $lineSubtotal, 'item_diskon' => $itemDiskon,
                ];
            }

            $totalSebelumNota = $subtotal - $diskonItemTotal;
            $diskonNota = min($diskonNota, max($totalSebelumNota, 0));
            $totalAkhir = max($totalSebelumNota - $diskonNota, 0);

            $sisaDiskonNota = $diskonNota;
            foreach ($resolved as $i => $r) {
                $barang = $r['barang'];
                $konv   = $r['konv'];
                $isLast = $i === count($resolved) - 1;

                $bagian = $subtotal > 0
                    ? round($diskonNota * ($r['line_subtotal'] / max($subtotal, 0.01)))
                    : 0;
                if ($isLast) $bagian = $sisaDiskonNota;
                $sisaDiskonNota -= $bagian;
                $diskonBaris = $r['item_diskon'] + $bagian;

                if ($konv['qty_asal'] !== null && $diskonBaris > 0 && (float) $konv['qty_asal'] > 0) {
                    $isi = (float) $konv['qty'] / (float) $konv['qty_asal'];
                    $diskonBaris = round($diskonBaris / max($isi, 1), 2);
                }

                $row = [
                    'no_nota'      => $noNota,
                    'tgl'          => $data['tgl'],
                    'cabang'       => $data['cabang'],
                    'kode_barang'  => $barang ? $barang->kode : $r['kode_input'],
                    'qty'          => $konv['qty'],
                    'harga'        => $konv['harga'],
                    'diskon'       => $diskonBaris,
                    'satuan'       => $konv['satuan'],
                    'qty_asal'     => $konv['qty_asal'],
                    'harga_asal'   => $konv['harga_asal'],
                    'bayar'        => $data['bayar'],
                    'kode_kas'     => $data['kode_kas'] ?? null,
                    'keterangan'   => $data['catatan'] ?? null,
                    'supplier'     => $data['supplier'],
                    'tidak_dikenal' => !$barang,
                    'kode_asli'    => $barang ? null : $r['kode_input'],
                    'created_at'   => now(), 'updated_at' => now(),
                ];
                DB::table('trx_beli')->insert($row);
                $this->adjustStok($row['kode_barang'], $data['cabang'], (float) $konv['qty']);
            }

            DB::table('pos_nota')->where('no_nota', $noNota)->update([
                'tgl'         => $data['tgl'],
                'cabang'      => $data['cabang'],
                'supplier'    => $data['supplier'],
                'bayar'       => $data['bayar'],
                'kode_kas'    => $data['kode_kas'] ?? null,
                'jumlah_item' => count($resolved),
                'subtotal'    => $subtotal,
                'diskon'      => $diskonItemTotal + $diskonNota,
                'total'       => $totalAkhir,
                'kasir'       => $data['kasir'] ?? $notaLama->kasir,
                'catatan'     => $data['catatan'] ?? null,
                'updated_at'  => now(),
            ]);

            return response()->json($this->buildNotaResponse($noNota));
        });
    }
}
