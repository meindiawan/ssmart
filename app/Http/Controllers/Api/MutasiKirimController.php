<?php

namespace App\Http\Controllers\Api;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * MUTASI BARANG (PAKET) — perpindahan stok antar cabang, bisa banyak
 * barang sekaligus dalam 1 kode mutasi, dengan alur konfirmasi 2 sisi:
 * ─────────────────────────────────────────────────────────────────────
 *   1) DIKIRIM   — cabang asal input paket (banyak barang), stok cabang
 *                  asal LANGSUNG berkurang sejumlah yang dicatat kirim.
 *                  Kode mutasi ini yang dicetak jadi struk/surat jalan.
 *   2) DICEK     — cabang tujuan mencocokkan fisik barang yang datang
 *                  dengan qty yang tercatat di kode mutasi tsb.
 *   3) ACC       — cabang tujuan konfirmasi qty yang BENAR-BENAR diterima
 *                  per barang (default = qty kirim, bisa diubah kalau
 *                  fisiknya beda). Stok cabang tujuan bertambah sesuai
 *                  qty yang dikonfirmasi. Kalau ada beda dengan qty
 *                  kirim, otomatis tercatat sebagai selisih (kurang/
 *                  lebih) yang bisa ditindaklanjuti terpisah.
 * Status paket: Dikirim → Selesai | Selesai (Ada Selisih) | Dibatalkan.
 * Extends TransaksiController supaya bisa pakai helper stok yang sama
 * (adjustStok, stokTersedia, stokBolehMinus, cariBarang, applyFilterTanggal,
 * paginated) — biar stok tetap satu sumber kebenaran dengan modul lain.
 * ═══════════════════════════════════════════════════════════════════════
 */
class MutasiKirimController extends TransaksiController
{
    // ─── NOMOR REFERENSI OTOMATIS: MUT-20260721-0001 ─────────────────────
    private function nextNoRef(string $tgl): string
    {
        $prefix = 'MUT-' . date('Ymd', strtotime($tgl));
        $count  = DB::table('mutasi_kirim')->where('no_ref', 'like', $prefix . '-%')->count() + 1;
        $noRef  = $prefix . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        while (DB::table('mutasi_kirim')->where('no_ref', $noRef)->exists()) {
            $count++;
            $noRef = $prefix . '-' . str_pad($count, 4, '0', STR_PAD_LEFT);
        }
        return $noRef;
    }

    // ─── RIWAYAT (LIST) ────────────────────────────────────────────────
    public function index(Request $request)
    {
        $q = DB::table('mutasi_kirim')->orderByDesc('tgl')->orderByDesc('id');

        if ($cab = $request->get('cabang')) {
            $q->where(fn($qq) => $qq->where('dari_cabang', $cab)->orWhere('ke_cabang', $cab));
        }
        if ($arah = $request->get('arah')) { // 'keluar' (dari cabang ini) | 'masuk' (ke cabang ini) — dipakai bareng ?cabang=
            if ($cab && $arah === 'keluar') { $q->where('dari_cabang', $cab); }
            if ($cab && $arah === 'masuk')  { $q->where('ke_cabang', $cab); }
        }
        if ($status = $request->get('status')) $q->where('status', $status);
        if ($s = $request->get('search')) {
            $q->where(fn($qq) => $qq->where('no_ref', 'like', "%$s%")
                ->orWhere('keterangan', 'like', "%$s%")
                ->orWhere('dari_cabang', 'like', "%$s%")
                ->orWhere('ke_cabang', 'like', "%$s%"));
        }
        $this->applyFilterTanggal($q, $request, 'tgl');

        // Ringkasan status untuk kartu KPI di atas tabel — dihitung dari
        // SELURUH data yang cocok filter cabang/tanggal/pencarian (bukan
        // hanya status yang lagi dipilih), supaya kartunya tetap jadi
        // "tombol filter" yang akurat jumlahnya.
        $countBase = clone $q;
        // buang filter status supaya rekap tetap menghitung semua status
        $countBase = DB::table('mutasi_kirim')->orderByDesc('id');
        if ($cab) {
            $countBase->where(fn($qq) => $qq->where('dari_cabang', $cab)->orWhere('ke_cabang', $cab));
            if ($arah === 'keluar') $countBase->where('dari_cabang', $cab);
            if ($arah === 'masuk')  $countBase->where('ke_cabang', $cab);
        }
        if ($s) {
            $countBase->where(fn($qq) => $qq->where('no_ref', 'like', "%$s%")
                ->orWhere('keterangan', 'like', "%$s%")
                ->orWhere('dari_cabang', 'like', "%$s%")
                ->orWhere('ke_cabang', 'like', "%$s%"));
        }
        $this->applyFilterTanggal($countBase, $request, 'tgl');
        $summary = [
            'menunggu' => (clone $countBase)->where('status', 'Dikirim')->count(),
            'selesai'  => (clone $countBase)->where('status', 'Selesai')->count(),
            'selisih'  => (clone $countBase)->where('status', 'Selesai (Ada Selisih)')->count(),
            'batal'    => (clone $countBase)->where('status', 'Dibatalkan')->count(),
        ];

        $perPage = (int) $request->get('per_page', 20);
        if ($perPage <= 0 || $perPage > 99000) $perPage = 99999;
        $paginator = $q->paginate($perPage);

        // Tempel ringkasan qty per paket (jumlah item & total qty kirim)
        // supaya tabel riwayat tidak perlu request detail satu-satu.
        $ids = collect($paginator->items())->pluck('id');
        $agg = DB::table('mutasi_kirim_detail')
            ->whereIn('mutasi_kirim_id', $ids)
            ->select('mutasi_kirim_id', DB::raw('COUNT(*) as jumlah_item'), DB::raw('SUM(qty_kirim) as total_qty'))
            ->groupBy('mutasi_kirim_id')->get()->keyBy('mutasi_kirim_id');

        $items = collect($paginator->items())->map(function ($row) use ($agg) {
            $a = $agg->get($row->id);
            $row->jumlah_item = $a->jumlah_item ?? 0;
            $row->total_qty   = (float) ($a->total_qty ?? 0);
            return $row;
        });
        $paginator->setCollection($items);

        return $this->paginated($paginator, ['summary' => $summary]);
    }

    // ─── DETAIL 1 PAKET (untuk modal detail, cetak struk/faktur, konfirmasi) ──
    private function buildDetailResponse(string $noRef): array
    {
        $header = DB::table('mutasi_kirim')->where('no_ref', $noRef)->first();
        if (!$header) return [];

        $items = DB::table('mutasi_kirim_detail')
            ->leftJoin('barang', 'mutasi_kirim_detail.kode_barang', '=', 'barang.kode')
            ->where('mutasi_kirim_id', $header->id)
            ->select(
                'mutasi_kirim_detail.*',
                DB::raw('COALESCE(barang.nama, mutasi_kirim_detail.nama_barang) as nama_barang_live'),
                'barang.satuan1'
            )
            ->orderBy('mutasi_kirim_detail.id')
            ->get();

        $selisih = DB::table('mutasi_kirim_selisih')
            ->where('mutasi_kirim_id', $header->id)
            ->orderBy('id')
            ->get();

        return ['mutasi' => $header, 'items' => $items, 'selisih' => $selisih];
    }

    public function show(string $noRef)
    {
        $data = $this->buildDetailResponse($noRef);
        if (empty($data)) return response()->json(['message' => 'Mutasi tidak ditemukan'], 404);
        return response()->json($data);
    }

    // ─── BUAT PAKET MUTASI BARU (multi-barang) ───────────────────────────
    public function store(Request $request)
    {
        $data = $request->validate([
            'tgl'                  => 'required|date',
            'dari_cabang'          => 'required|string|exists:cabang,nama',
            'ke_cabang'            => 'required|string|exists:cabang,nama|different:dari_cabang',
            'dikirim_oleh'         => 'nullable|string|max:100',
            'keterangan'           => 'nullable|string|max:255',
            'items'                => 'required|array|min:1',
            'items.*.kode_barang'  => 'required|string',
            'items.*.qty'          => 'required|numeric|min:0.01',
            'items.*.keterangan'   => 'nullable|string|max:255',
        ]);

        $stokBolehMinus = $this->stokBolehMinus();

        return DB::transaction(function () use ($data, $stokBolehMinus) {
            // Resolusi & validasi tiap baris dulu, sebelum menyentuh stok/DB,
            // supaya kalau ada satu baris gagal, tidak ada efek separuh jalan.
            $resolved = [];
            foreach ($data['items'] as $item) {
                $barang = $this->cariBarang($item['kode_barang']);
                if (!$barang) {
                    throw ValidationException::withMessages(['items' => "Barang dengan kode '{$item['kode_barang']}' tidak ditemukan di Master Barang."]);
                }
                $qty = (float) $item['qty'];
                if (!$stokBolehMinus) {
                    $tersedia = $this->stokTersedia($barang->kode, $data['dari_cabang']);
                    if ($tersedia < $qty) {
                        throw ValidationException::withMessages(['items' => "Stok {$barang->nama} di {$data['dari_cabang']} tidak cukup. Tersedia: {$tersedia} {$barang->satuan1}."]);
                    }
                }
                $resolved[] = ['barang' => $barang, 'qty' => $qty, 'keterangan' => $item['keterangan'] ?? null];
            }

            $noRef = $this->nextNoRef($data['tgl']);
            $headerId = DB::table('mutasi_kirim')->insertGetId([
                'no_ref'       => $noRef,
                'tgl'          => $data['tgl'],
                'dari_cabang'  => $data['dari_cabang'],
                'ke_cabang'    => $data['ke_cabang'],
                'status'       => 'Dikirim',
                'keterangan'   => $data['keterangan'] ?? null,
                'dikirim_oleh' => $data['dikirim_oleh'] ?? null,
                'created_at'   => now(), 'updated_at' => now(),
            ]);

            foreach ($resolved as $r) {
                DB::table('mutasi_kirim_detail')->insert([
                    'mutasi_kirim_id' => $headerId,
                    'kode_barang'     => $r['barang']->kode,
                    'nama_barang'     => $r['barang']->nama,
                    'qty_kirim'       => $r['qty'],
                    'satuan'          => $r['barang']->satuan1 ?? 'PCS',
                    'qty_diterima'    => 0,
                    'keterangan'      => $r['keterangan'],
                    'selisih'         => 0,
                    'created_at'      => now(), 'updated_at' => now(),
                ]);
                // Barang secara fisik keluar dari cabang asal saat paket dikirim.
                $this->adjustStok($r['barang']->kode, $data['dari_cabang'], -$r['qty']);
            }

            return response()->json($this->buildDetailResponse($noRef), 201);
        });
    }

    // ─── EDIT PAKET (hanya selama status masih 'Dikirim', belum di-ACC) ──
    public function update(Request $request, string $noRef)
    {
        $header = DB::table('mutasi_kirim')->where('no_ref', $noRef)->first();
        if (!$header) return response()->json(['message' => 'Mutasi tidak ditemukan'], 404);
        if ($header->status !== 'Dikirim') {
            return response()->json(['message' => 'Mutasi yang sudah dikonfirmasi/dibatalkan tidak bisa diedit.'], 422);
        }

        $data = $request->validate([
            'tgl'                  => 'required|date',
            'dari_cabang'          => 'required|string|exists:cabang,nama',
            'ke_cabang'            => 'required|string|exists:cabang,nama|different:dari_cabang',
            'dikirim_oleh'         => 'nullable|string|max:100',
            'keterangan'           => 'nullable|string|max:255',
            'items'                => 'required|array|min:1',
            'items.*.kode_barang'  => 'required|string',
            'items.*.qty'          => 'required|numeric|min:0.01',
            'items.*.keterangan'   => 'nullable|string|max:255',
        ]);

        $stokBolehMinus = $this->stokBolehMinus();

        return DB::transaction(function () use ($data, $stokBolehMinus, $header) {
            // Kembalikan dulu stok cabang asal LAMA (batalkan efek pengiriman
            // sebelumnya), baru validasi & terapkan ulang dengan data baru —
            // supaya edit tidak pernah dobel-kurangi/lebih stok.
            $oldItems = DB::table('mutasi_kirim_detail')->where('mutasi_kirim_id', $header->id)->get();
            foreach ($oldItems as $oi) {
                $this->adjustStok($oi->kode_barang, $header->dari_cabang, (float) $oi->qty_kirim);
            }

            $resolved = [];
            try {
                foreach ($data['items'] as $item) {
                    $barang = $this->cariBarang($item['kode_barang']);
                    if (!$barang) {
                        throw ValidationException::withMessages(['items' => "Barang dengan kode '{$item['kode_barang']}' tidak ditemukan di Master Barang."]);
                    }
                    $qty = (float) $item['qty'];
                    if (!$stokBolehMinus) {
                        $tersedia = $this->stokTersedia($barang->kode, $data['dari_cabang']);
                        if ($tersedia < $qty) {
                            throw ValidationException::withMessages(['items' => "Stok {$barang->nama} di {$data['dari_cabang']} tidak cukup. Tersedia: {$tersedia} {$barang->satuan1}."]);
                        }
                    }
                    $resolved[] = ['barang' => $barang, 'qty' => $qty, 'keterangan' => $item['keterangan'] ?? null];
                }
            } catch (ValidationException $e) {
                // Gagal validasi baris baru → kembalikan stok ke kondisi semula
                // (kurangi lagi sesuai catatan lama) supaya transaksi tetap konsisten,
                // lalu lempar ulang supaya DB::transaction() rollback total.
                foreach ($oldItems as $oi) {
                    $this->adjustStok($oi->kode_barang, $header->dari_cabang, -(float) $oi->qty_kirim);
                }
                throw $e;
            }

            DB::table('mutasi_kirim_detail')->where('mutasi_kirim_id', $header->id)->delete();
            DB::table('mutasi_kirim')->where('id', $header->id)->update([
                'tgl'          => $data['tgl'],
                'dari_cabang'  => $data['dari_cabang'],
                'ke_cabang'    => $data['ke_cabang'],
                'keterangan'   => $data['keterangan'] ?? null,
                'dikirim_oleh' => $data['dikirim_oleh'] ?? $header->dikirim_oleh,
                'updated_at'   => now(),
            ]);

            foreach ($resolved as $r) {
                DB::table('mutasi_kirim_detail')->insert([
                    'mutasi_kirim_id' => $header->id,
                    'kode_barang'     => $r['barang']->kode,
                    'nama_barang'     => $r['barang']->nama,
                    'qty_kirim'       => $r['qty'],
                    'satuan'          => $r['barang']->satuan1 ?? 'PCS',
                    'qty_diterima'    => 0,
                    'keterangan'      => $r['keterangan'],
                    'selisih'         => 0,
                    'created_at'      => now(), 'updated_at' => now(),
                ]);
                $this->adjustStok($r['barang']->kode, $data['dari_cabang'], -$r['qty']);
            }

            return response()->json($this->buildDetailResponse($header->no_ref));
        });
    }

    // ─── BATALKAN PAKET (hanya selama status masih 'Dikirim') ────────────
    public function cancel(Request $request, string $noRef)
    {
        $header = DB::table('mutasi_kirim')->where('no_ref', $noRef)->first();
        if (!$header) return response()->json(['message' => 'Mutasi tidak ditemukan'], 404);
        if ($header->status !== 'Dikirim') {
            return response()->json(['message' => 'Hanya mutasi berstatus "Dikirim" (belum dikonfirmasi tujuan) yang bisa dibatalkan.'], 422);
        }
        $data = $request->validate(['alasan' => 'nullable|string|max:255', 'oleh' => 'nullable|string|max:100']);

        DB::transaction(function () use ($header, $data) {
            $items = DB::table('mutasi_kirim_detail')->where('mutasi_kirim_id', $header->id)->get();
            foreach ($items as $it) {
                // Kembalikan stok cabang asal seperti sebelum dikirim
                $this->adjustStok($it->kode_barang, $header->dari_cabang, (float) $it->qty_kirim);
            }
            DB::table('mutasi_kirim')->where('id', $header->id)->update([
                'status'          => 'Dibatalkan',
                'dibatalkan_oleh' => $data['oleh'] ?? null,
                'waktu_batal'     => now(),
                'alasan_batal'    => $data['alasan'] ?? null,
                'updated_at'      => now(),
            ]);
        });

        return response()->json(['message' => 'Mutasi dibatalkan, stok cabang asal dikembalikan.']);
    }

    // ─── KONFIRMASI PENERIMAAN (ACC oleh cabang tujuan) ──────────────────
    // Dipanggil setelah cabang tujuan mencocokkan fisik barang yang datang
    // dengan qty yang tercatat dikirim. qty_diterima per baris BOLEH beda
    // dari qty_kirim (kurang/lebih) — selisihnya otomatis tercatat.
    public function confirm(Request $request, string $noRef)
    {
        $header = DB::table('mutasi_kirim')->where('no_ref', $noRef)->first();
        if (!$header) return response()->json(['message' => 'Mutasi tidak ditemukan'], 404);
        if ($header->status !== 'Dikirim') {
            return response()->json(['message' => 'Mutasi ini sudah dikonfirmasi atau dibatalkan sebelumnya.'], 422);
        }

        $data = $request->validate([
            'diterima_oleh'          => 'nullable|string|max:100',
            'catatan_terima'         => 'nullable|string|max:500',
            'items'                  => 'required|array|min:1',
            'items.*.id'             => 'required|integer|exists:mutasi_kirim_detail,id',
            'items.*.qty_diterima'   => 'required|numeric|min:0',
        ]);

        return DB::transaction(function () use ($data, $header) {
            $adaSelisih = false;

            foreach ($data['items'] as $item) {
                $detail = DB::table('mutasi_kirim_detail')->find($item['id']);
                if (!$detail || $detail->mutasi_kirim_id != $header->id) continue;

                $qtyDiterima = (float) $item['qty_diterima'];
                $selisih     = round($qtyDiterima - (float) $detail->qty_kirim, 2);

                DB::table('mutasi_kirim_detail')->where('id', $detail->id)->update([
                    'qty_diterima' => $qtyDiterima,
                    'selisih'      => $selisih,
                    'updated_at'   => now(),
                ]);

                // Stok tujuan bertambah PERSIS sejumlah yang benar-benar
                // dikonfirmasi diterima (bukan sejumlah yang dikirim) —
                // supaya saldo stok selalu mencerminkan fisik barang.
                if ($qtyDiterima != 0) {
                    $this->adjustStok($detail->kode_barang, $header->ke_cabang, $qtyDiterima);
                }

                if ($selisih != 0) {
                    $adaSelisih = true;
                    DB::table('mutasi_kirim_selisih')->insert([
                        'mutasi_kirim_id'        => $header->id,
                        'mutasi_kirim_detail_id' => $detail->id,
                        'kode_barang'            => $detail->kode_barang,
                        'nama_barang'            => $detail->nama_barang,
                        'jenis'                  => $selisih < 0 ? 'Kurang' : 'Lebih',
                        'qty_selisih'            => abs($selisih),
                        'status'                 => 'Belum Ditindaklanjuti',
                        'created_at'             => now(), 'updated_at' => now(),
                    ]);
                }
            }

            DB::table('mutasi_kirim')->where('id', $header->id)->update([
                'status'          => $adaSelisih ? 'Selesai (Ada Selisih)' : 'Selesai',
                'ada_selisih'     => $adaSelisih,
                'diterima_oleh'   => $data['diterima_oleh'] ?? null,
                'catatan_terima'  => $data['catatan_terima'] ?? null,
                'waktu_terima'    => now(),
                'updated_at'      => now(),
            ]);

            return response()->json($this->buildDetailResponse($header->no_ref));
        });
    }

    // ─── HAPUS PERMANEN DARI RIWAYAT ──────────────────────────────────────
    // Beda dengan cancel() (yang cuma menandai "Dibatalkan" tapi baris
    // riwayatnya tetap ada) — ini benar-benar menghapus baris dari riwayat.
    // Boleh dilakukan di status apa pun, tapi efek stok yang sudah terjadi
    // harus dibalik dulu supaya saldo stok tetap akurat setelah baris ini
    // hilang dari riwayat:
    //   - Dikirim / Selesai / Selesai (Ada Selisih): stok cabang ASAL sudah
    //     berkurang sejak dikirim → kembalikan (+qty_kirim).
    //   - Selesai / Selesai (Ada Selisih): stok cabang TUJUAN sudah
    //     bertambah sejak di-ACC → kembalikan (-qty_diterima).
    //   - Dibatalkan: efek di cabang asal sudah dibalik saat dibatalkan,
    //     jadi tidak perlu sentuh stok sama sekali di sini.
    // Baris di mutasi_kirim_detail & mutasi_kirim_selisih ikut terhapus
    // otomatis lewat foreign key cascadeOnDelete().
    public function destroy(string $noRef)
    {
        $header = DB::table('mutasi_kirim')->where('no_ref', $noRef)->first();
        if (!$header) return response()->json(['message' => 'Mutasi tidak ditemukan'], 404);

        DB::transaction(function () use ($header) {
            $items = DB::table('mutasi_kirim_detail')->where('mutasi_kirim_id', $header->id)->get();

            if ($header->status !== 'Dibatalkan') {
                foreach ($items as $it) {
                    $this->adjustStok($it->kode_barang, $header->dari_cabang, (float) $it->qty_kirim);
                }
            }
            if (in_array($header->status, ['Selesai', 'Selesai (Ada Selisih)'])) {
                foreach ($items as $it) {
                    if ((float) $it->qty_diterima != 0) {
                        $this->adjustStok($it->kode_barang, $header->ke_cabang, -(float) $it->qty_diterima);
                    }
                }
            }

            DB::table('mutasi_kirim')->where('id', $header->id)->delete();
        });

        return response()->json(['message' => 'Mutasi dihapus dari riwayat, efek stok yang sudah terjadi telah dibalik.']);
    }

    // ─── DAFTAR SELISIH (dashboard ringkas lintas paket, opsional dipakai) ──
    public function selisihList(Request $request)
    {
        $q = DB::table('mutasi_kirim_selisih')
            ->join('mutasi_kirim', 'mutasi_kirim_selisih.mutasi_kirim_id', '=', 'mutasi_kirim.id')
            ->select('mutasi_kirim_selisih.*', 'mutasi_kirim.no_ref', 'mutasi_kirim.dari_cabang', 'mutasi_kirim.ke_cabang', 'mutasi_kirim.tgl')
            ->orderByDesc('mutasi_kirim_selisih.id');

        if ($cab = $request->get('cabang')) {
            $q->where(fn($qq) => $qq->where('mutasi_kirim.dari_cabang', $cab)->orWhere('mutasi_kirim.ke_cabang', $cab));
        }
        if ($status = $request->get('status')) $q->where('mutasi_kirim_selisih.status', $status);

        return response()->json($q->get());
    }

    // ─── TINDAK LANJUTI 1 SELISIH — catat aksi & opsional sesuaikan stok ──
    public function resolveSelisih(Request $request, int $id)
    {
        $row = DB::table('mutasi_kirim_selisih')->find($id);
        if (!$row) return response()->json(['message' => 'Data selisih tidak ditemukan'], 404);
        if ($row->status === 'Sudah Ditindaklanjuti') {
            return response()->json(['message' => 'Selisih ini sudah pernah ditindaklanjuti.'], 422);
        }

        $data = $request->validate([
            'tindakan'         => 'required|string|max:255',
            'catatan'          => 'nullable|string|max:500',
            'diselesaikan_oleh'=> 'nullable|string|max:100',
            'sesuaikan_stok'   => 'nullable|boolean',
            'cabang_sesuai'    => 'required_if:sesuaikan_stok,true|nullable|string|exists:cabang,nama',
            'qty_sesuai'       => 'required_if:sesuaikan_stok,true|nullable|numeric|min:0.01',
            'arah'             => 'required_if:sesuaikan_stok,true|nullable|in:tambah,kurang',
        ]);

        DB::transaction(function () use ($data, $row) {
            if (!empty($data['sesuaikan_stok'])) {
                $delta = (float) $data['qty_sesuai'] * ($data['arah'] === 'kurang' ? -1 : 1);
                $this->adjustStok($row->kode_barang, $data['cabang_sesuai'], $delta);
            }
            DB::table('mutasi_kirim_selisih')->where('id', $row->id)->update([
                'status'            => 'Sudah Ditindaklanjuti',
                'tindakan'          => $data['tindakan'],
                'catatan'           => $data['catatan'] ?? null,
                'diselesaikan_oleh' => $data['diselesaikan_oleh'] ?? null,
                'waktu_selesai'     => now(),
                'updated_at'        => now(),
            ]);

            // Kalau semua selisih dalam paket ini sudah ditindaklanjuti,
            // tandai juga di header supaya gampang difilter di riwayat.
            $sisaBelum = DB::table('mutasi_kirim_selisih')
                ->where('mutasi_kirim_id', $row->mutasi_kirim_id)
                ->where('status', 'Belum Ditindaklanjuti')->count();
            if ($sisaBelum === 0) {
                DB::table('mutasi_kirim')->where('id', $row->mutasi_kirim_id)->update(['updated_at' => now()]);
            }
        });

        return response()->json(['message' => 'Selisih ditandai sudah ditindaklanjuti.']);
    }
}
