<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

class TransaksiController extends Controller
{
    // ─── KARTU HPP ───────────────────────────────────────────────────────────
    // Setiap kali stok tersentuh (lihat adjustStok di bawah), Kartu HPP (biaya
    // rata-rata bergerak, per cabang — lihat App\Services\HppService) untuk
    // barang tersebut dibangun ulang otomatis, supaya Jurnal & Laba Rugi SELALU
    // memakai harga pokok dari riwayat masuk/keluar ASLI, bukan dari kolom
    // `barang.modal` yang manual. $deferHppRebuild dipakai saat import massal
    // (banyak baris, barang yang sama bisa berulang) supaya tiap kode barang
    // cuma dibangun ulang SEKALI di akhir batch, bukan setiap baris.
    protected bool $deferHppRebuild = false;
    protected array $pendingHppRebuild = [];

    protected function touchHpp(string $kodeBarang): void
    {
        if ($this->deferHppRebuild) {
            $this->pendingHppRebuild[$kodeBarang] = true;
            return;
        }
        app(\App\Services\HppService::class)->rebuildItem($kodeBarang);
    }

    protected function flushPendingHpp(): void
    {
        foreach (array_keys($this->pendingHppRebuild) as $kode) {
            app(\App\Services\HppService::class)->rebuildItem($kode);
        }
        $this->pendingHppRebuild = [];
    }

    // ─── STOK HELPER ─────────────────────────────────────────────────────────
    // Menyesuaikan saldo stok realtime di tabel `stok` setiap ada
    // transaksi Penjualan (mengurangi) atau Pembelian (menambah).
    // Dipakai supaya modul Penjualan & Pembelian "menarik" data stok yang sama
    // dengan modul Stok (StokController) & tetap sinkron.
    // Setting `stok_boleh_minus` (di Master > Pengaturan) menentukan apakah
    // stok boleh sampai negatif (mis. saat mengejar catatan lama) atau
    // ditahan maksimal 0.
    protected function stokBolehMinus(): bool
    {
        $v = DB::table('settings')->where('key', 'stok_boleh_minus')->value('value');
        // Default: boleh minus (true) jika setting belum pernah diatur
        return $v === null ? true : $v === '1';
    }

    protected function adjustStok(string $kodeBarang, string $cabang, float $delta): void
    {
        $bolehMinus = $this->stokBolehMinus();
        $existing = DB::table('stok')->where('kode_barang', $kodeBarang)->where('cabang', $cabang)->first();
        if ($existing) {
            $newQty = $existing->qty + $delta;
            if (!$bolehMinus) $newQty = max(0, $newQty);
            DB::table('stok')->where('id', $existing->id)->update(['qty' => $newQty, 'updated_at' => now()]);
        } else {
            $newQty = $bolehMinus ? $delta : max(0, $delta);
            DB::table('stok')->insert([
                'kode_barang' => $kodeBarang, 'cabang' => $cabang,
                'qty' => $newQty, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        if ($delta != 0) $this->touchHpp($kodeBarang);
    }

    protected function stokTersedia(string $kodeBarang, string $cabang): float
    {
        $s = DB::table('stok')->where('kode_barang', $kodeBarang)->where('cabang', $cabang)->first();
        return $s ? (float) $s->qty : 0;
    }

    // Cari barang berdasarkan kode ATAU salah satu barcode — dipakai saat import
    // dari laporan kasir yang kolom "Kode Barang"-nya sebenarnya barcode.
    protected function cariBarang(string $kodeAtauBarcode): ?object
    {
        $q = DB::table('barang')
            ->where('kode', $kodeAtauBarcode)
            ->orWhere('barcode', $kodeAtauBarcode)
            ->orWhere('barcode2', $kodeAtauBarcode)
            ->orWhere('barcode3', $kodeAtauBarcode);

        // Perbandingan string di atas gagal kalau ada perbedaan angka 0 di
        // depan antara sumber data (mis. laporan kasir lama menyimpan barcode
        // TANPA leading zero seperti "89686043204", sedangkan Master Barang
        // menyimpannya DENGAN leading zero "089686043204") — keduanya barang
        // yang sama tapi tidak match sebagai string. Kalau kode yang dicari
        // berupa angka murni, tambahkan juga pencocokan numerik (leading zero
        // diabaikan). Kode non-angka (mis. "CUT1", "MMXL") tidak kena efek ini.
        if (ctype_digit($kodeAtauBarcode)) {
            $asInt = ltrim($kodeAtauBarcode, '0') ?: '0';
            $q->orWhereRaw("CAST(kode AS UNSIGNED) = ?", [$asInt])
              ->orWhereRaw("CAST(barcode AS UNSIGNED) = ?", [$asInt])
              ->orWhereRaw("CAST(barcode2 AS UNSIGNED) = ?", [$asInt])
              ->orWhereRaw("CAST(barcode3 AS UNSIGNED) = ?", [$asInt]);
        }

        return $q->first();
    }

    // Cocokkan barang berdasarkan NAMA (persis, case-insensitive, spasi ganda
    // diabaikan). Return null kalau tidak ada yang cocok ATAU ada lebih dari
    // satu barang bernama sama (ambigu → lebih aman ditandai "kode tidak dikenal").
    protected function cariBarangByNama(string $nama): ?object
    {
        $norm = mb_strtolower(trim(preg_replace('/\s+/', ' ', $nama)));
        if ($norm === '') return null;
        $hasil = DB::table('barang')
            ->whereRaw("LOWER(TRIM(REPLACE(nama, '  ', ' '))) = ?", [$norm])
            ->limit(2)->get();
        return $hasil->count() === 1 ? $hasil->first() : null;
    }

    // ─── KONVERSI SATUAN OTOMATIS ───────────────────────────────────────────
    // Supaya kasir bisa input transaksi dalam DUS/KARTON tanpa harus menghitung
    // manual ke PCS, dan supaya Omzet/HPP/Laba Rugi tidak "meledak" gara-gara
    // qty & harga tercampur beda satuan. `barang.satuan1` = satuan dasar,
    // `barang.satuan2` = satuan kemasan (mis. DUS), `barang.isi` = berapa
    // satuan1 dalam 1 satuan2 (mis. isi=12 → 1 DUS = 12 PCS).
    //
    // Aturan konversi: kalau satuan yang dipilih sama dengan satuan2 barang
    // dan isi > 0, qty dikonversi ke satuan dasar (qty × isi) dan harga
    // dikonversi jadi harga-per-satuan-dasar (harga ÷ isi) — supaya qty×harga
    // (Omzet) dan qty×modal (HPP) tetap konsisten dalam satuan yang sama
    // seperti sebelumnya, tanpa perlu ubah rumus laporan sama sekali.
    // Satuan3 belum punya rasio konversi di Master Barang, jadi diperlakukan
    // seperti satuan dasar (tidak dikonversi) — kasir tetap bisa pilih tapi
    // qty/harga-nya dianggap sudah dalam hitungan satuan dasar.
    protected function konversiSatuan(?object $barang, float $qtyInput, float $hargaInput, ?string $satuanInput): array
    {
        $satuanDasar = $barang?->satuan1 ?? 'PCS';
        $satuan      = trim($satuanInput ?? '') ?: $satuanDasar;
        $isi         = (float) ($barang?->isi ?? 1);
        // isi3 = berapa satuan DASAR dalam 1 Satuan 3 (bukan berapa Satuan 2 —
        // supaya "Isi per Satuan 3" di Master Barang tetap intuitif diisi
        // relatif ke satuan dasar, sama seperti Isi untuk Satuan 2).
        $isi3        = (float) ($barang?->isi3 ?? 1);

        $isSatuan2 = $barang && $barang->satuan2 && strcasecmp(trim($barang->satuan2), $satuan) === 0;
        $isSatuan3 = $barang && $barang->satuan3 && strcasecmp(trim($barang->satuan3), $satuan) === 0;

        if ($isSatuan2 && $isi > 0) {
            return [
                'satuan'     => $satuan,
                'qty_asal'   => $qtyInput,
                'harga_asal' => $hargaInput,
                'qty'        => round($qtyInput * $isi, 4),
                'harga'      => round($hargaInput / $isi, 2),
            ];
        }

        if ($isSatuan3 && $isi3 > 0) {
            return [
                'satuan'     => $satuan,
                'qty_asal'   => $qtyInput,
                'harga_asal' => $hargaInput,
                'qty'        => round($qtyInput * $isi3, 4),
                'harga'      => round($hargaInput / $isi3, 2),
            ];
        }

        // Satuan dasar (atau tidak dikenal) — simpan apa adanya
        return [
            'satuan'     => $satuan,
            'qty_asal'   => null,
            'harga_asal' => null,
            'qty'        => $qtyInput,
            'harga'      => $hargaInput,
        ];
    }

    // ─── PERBAIKAN RETROAKTIF KONVERSI SATUAN TRANSAKSI LAMA ────────────────
    // Kasus: transaksi Penjualan/Pembelian diinput SEBELUM Master Barang
    // punya Satuan2/3 & Isi terisi (mis. baris "5 KARTON" waktu itu isi-nya
    // masih kosong) → konversiSatuan() waktu itu TIDAK mengonversi apa-apa,
    // qty/harga tersimpan MENTAH dengan qty_asal/harga_asal NULL. Begitu
    // Satuan2/3 & Isi di Master Barang dilengkapi belakangan (lewat menu
    // "Isi Satuan Massal"), baris-baris lama itu TIDAK otomatis ikut
    // terkonversi — karena datanya sudah kepalang tersimpan sebelumnya.
    // Dua method di bawah mencari baris-baris begitu (ciri: qty_asal NULL,
    // TAPI kolom `satuan`-nya sama persis dengan satuan2/satuan3 barang YANG
    // SEKARANG isi-nya > 1) lalu mengonversinya seolah-olah konversi itu
    // sudah dijalankan sejak awal.
    protected function ambilKandidatKonversi(string $table): array
    {
        $rows = DB::table($table)
            ->join('barang', "$table.kode_barang", '=', 'barang.kode')
            ->whereNull("$table.qty_asal")
            ->whereNotNull("$table.satuan")
            ->where("$table.satuan", '!=', '')
            ->select(
                "$table.id", "$table.tgl", "$table.cabang", "$table.kode_barang",
                "barang.nama", "$table.qty", "$table.harga", "$table.satuan",
                "barang.satuan2", "barang.isi", "barang.satuan3", "barang.isi3"
            )
            ->get();

        $kandidat = [];
        foreach ($rows as $r) {
            $satuan = trim($r->satuan);
            $isi = null;
            if ($r->satuan2 && strcasecmp(trim($r->satuan2), $satuan) === 0 && (float) $r->isi > 1) {
                $isi = (float) $r->isi;
            } elseif ($r->satuan3 && strcasecmp(trim($r->satuan3), $satuan) === 0 && (float) $r->isi3 > 1) {
                $isi = (float) $r->isi3;
            }
            if ($isi === null) continue; // bukan kandidat, satuan sudah dasar / isi belum diisi

            $qtyLama   = (float) $r->qty;
            $hargaLama = (float) $r->harga;
            $kandidat[] = [
                'id'          => $r->id,
                'tgl'         => $r->tgl,
                'cabang'      => $r->cabang,
                'kode_barang' => $r->kode_barang,
                'nama'        => $r->nama,
                'satuan'      => $satuan,
                'isi'         => $isi,
                'qty_lama'    => $qtyLama,
                'harga_lama'  => $hargaLama,
                'qty_baru'    => round($qtyLama * $isi, 4),
                'harga_baru'  => round($hargaLama / $isi, 2),
            ];
        }
        return $kandidat;
    }

    public function previewPerbaikanKonversi(Request $request)
    {
        $jual = $this->ambilKandidatKonversi('trx_jual');
        $beli = $this->ambilKandidatKonversi('trx_beli');

        $ringkas = function (array $rows) {
            $nilaiLama = array_sum(array_map(fn($r) => $r['qty_lama'] * $r['harga_lama'], $rows));
            $nilaiBaru = array_sum(array_map(fn($r) => $r['qty_baru'] * $r['harga_baru'], $rows));
            return [
                'jumlah_baris'     => count($rows),
                'total_nilai_lama' => round($nilaiLama, 2),
                'total_nilai_baru' => round($nilaiBaru, 2),
                'contoh'           => array_slice($rows, 0, 30),
            ];
        };

        return response()->json([
            'jual'        => $ringkas($jual),
            'beli'        => $ringkas($beli),
            'total_baris' => count($jual) + count($beli),
        ]);
    }

    public function terapkanPerbaikanKonversi(Request $request)
    {
        $request->validate(['konfirmasi' => 'required|string']);
        if (trim($request->input('konfirmasi')) !== 'PERBAIKI KONVERSI') {
            return response()->json([
                'message' => 'Konfirmasi tidak sesuai. Ketik persis "PERBAIKI KONVERSI" untuk melanjutkan.',
            ], 422);
        }

        $totalDiperbaiki = 0;
        DB::transaction(function () use (&$totalDiperbaiki) {
            // trx_jual: qty tercatat MENGURANGI stok (arah -1). trx_beli: MENAMBAH (arah +1).
            foreach (['trx_jual' => -1, 'trx_beli' => 1] as $table => $arahStok) {
                $kandidat = $this->ambilKandidatKonversi($table);
                foreach ($kandidat as $k) {
                    DB::table($table)->where('id', $k['id'])->update([
                        'qty'        => $k['qty_baru'],
                        'harga'      => $k['harga_baru'],
                        'qty_asal'   => $k['qty_lama'],
                        'harga_asal' => $k['harga_lama'],
                        'updated_at' => now(),
                    ]);
                    // Stok sebelumnya sudah disesuaikan sebesar qty_lama (mentah,
                    // dianggap satuan dasar). Sekarang qty yang benar adalah
                    // qty_baru — koreksi stok dengan SELISIHNYA saja supaya tidak
                    // dihitung dobel.
                    $selisih = $k['qty_baru'] - $k['qty_lama'];
                    if ($selisih != 0) {
                        $this->adjustStok($k['kode_barang'], $k['cabang'], $arahStok * $selisih);
                    }
                    $totalDiperbaiki++;
                }
            }
        });

        return response()->json([
            'message'          => "Berhasil memperbaiki {$totalDiperbaiki} baris transaksi lama (qty & harga dikonversi ke satuan dasar, stok disesuaikan otomatis).",
            'total_diperbaiki' => $totalDiperbaiki,
        ]);
    }

    // Terapkan filter tanggal umum ke query transaksi: mendukung filter per
    // hari/minggu/bulan/rentang custom. `bulan` dipertahankan untuk kompatibilitas.
    protected function applyFilterTanggal($q, Request $request, string $kolomTgl = 'tgl'): void
    {
        if ($request->get('bulan'))  $q->whereRaw("DATE_FORMAT($kolomTgl,'%Y-%m')=?", [$request->get('bulan')]);
        if ($request->get('tgl'))    $q->whereDate($kolomTgl, $request->get('tgl'));
        if ($request->get('dari'))   $q->whereDate($kolomTgl, '>=', $request->get('dari'));
        if ($request->get('sampai')) $q->whereDate($kolomTgl, '<=', $request->get('sampai'));
    }

    // ─── PENJUALAN ───────────────────────────────────────────────────────────
    public function getJual(Request $request)
    {
        // Query dasar (join + filter) TANPA select, supaya bisa di-clone dengan
        // aman untuk query ringkasan (aggregate) tanpa ikut membawa kolom-kolom
        // non-aggregate dari tabel `barang` (yang bisa bikin error di MySQL
        // dengan sql_mode ONLY_FULL_GROUP_BY kalau dicampur COUNT/SUM tanpa GROUP BY).
        $base = DB::table('trx_jual')
            ->leftJoin('barang', 'trx_jual.kode_barang', '=', 'barang.kode');
        if ($request->get('cabang')) $base->where('trx_jual.cabang', $request->get('cabang'));
        $this->applyFilterTanggal($base, $request, 'tgl');
        // Pencarian bebas: nama/kode barang, no. nota, atau keterangan — supaya
        // 1 kotak cari saja cukup utk menemukan transaksi tanpa perlu tahu
        // filternya harus yang mana dulu.
        if ($s = trim((string) $request->get('search'))) {
            $base->where(function ($w) use ($s) {
                $w->where('barang.nama', 'like', "%$s%")
                  ->orWhere('trx_jual.kode_barang', 'like', "%$s%")
                  ->orWhere('trx_jual.no_nota', 'like', "%$s%")
                  ->orWhere('trx_jual.keterangan', 'like', "%$s%");
            });
        }

        // Ringkasan (jumlah transaksi & total nominal) dihitung dari SELURUH
        // data yang cocok dengan filter — bukan cuma 30/50 baris di halaman
        // yang sedang ditampilkan — supaya kartu "X transaksi · Total: Rp..."
        // selalu akurat berapa pun jumlah datanya.
        $summary = (clone $base)
            ->selectRaw('COUNT(*) as jumlah, COALESCE(SUM(trx_jual.qty*trx_jual.harga - COALESCE(trx_jual.diskon,0)),0) as total_nominal')
            ->first();

        $q = $base->select('trx_jual.*', 'barang.nama as nama_barang', 'barang.ppn as ppn_master', 'barang.modal', 'barang.harga_jual')
            ->selectRaw('COALESCE(trx_jual.ppn, barang.ppn) as ppn_efektif')
            ->selectRaw("COALESCE((SELECT hk.nilai_keluar FROM hpp_kartu hk WHERE hk.ref_tabel = 'trx_jual' AND hk.ref_id = trx_jual.id LIMIT 1), 0) as hpp_kartu")
            ->orderByDesc('tgl')->orderByDesc('trx_jual.id');

        $perPage = (int) $request->get('per_page', 50);
        if ($perPage <= 0 || $perPage > 99000) $perPage = 99999; // "Semua"

        return $this->paginated($q->paginate($perPage), [
            'summary' => [
                'jumlah'        => (int) $summary->jumlah,
                'total_nominal' => (float) $summary->total_nominal,
            ],
        ]);
    }

    public function storeJual(Request $request)
    {
        $data = $request->validate([
            'tgl'          => 'required|date',
            'cabang'       => 'required|string|exists:cabang,nama',
            'kode_barang'  => 'required|string',
            'qty'          => 'required|numeric|min:0.01',
            'harga'        => 'required|numeric|min:0',
            'satuan'       => 'nullable|string|max:20',
            'diskon'       => 'nullable|numeric|min:0',
            // Override status PPN per baris transaksi — kalau tidak dikirim
            // (null), ikut status di Master Barang seperti sebelumnya.
            'ppn'          => ['nullable', Rule::in(['Kena PPN', 'Non-PPN'])],
            'bayar'        => ['required', Rule::in(['Tunai', 'Kredit'])],
            // Wajib diisi kalau Tunai, supaya jelas uang masuk ke akun kas/bank
            // mana (bukan otomatis "1101 - Kas" saja) — perlu utk saldo per-akun.
            'kode_kas'     => ['required_if:bayar,Tunai', 'nullable', 'string', 'exists:coa,kode'],
            'keterangan'   => 'nullable|string|max:255',
            // no_nota — dipakai form Penjualan/Pembelian grid multi-baris (transaksi.js)
            // untuk mengelompokkan beberapa baris barang sekaligus jadi 1 transaksi,
            // sama seperti mekanisme Kasir POS (no_nota), tapi prefix beda (TXJ-/TXB-)
            // supaya tidak tertukar dengan nota Kasir POS.
            'no_nota'      => 'nullable|string|max:30',
        ]);
        $data['diskon'] = $data['diskon'] ?? 0;
        if (($data['bayar'] ?? null) !== 'Tunai') $data['kode_kas'] = null;

        // Cocokkan kode yang diinput (bisa kode master ATAU salah satu barcode
        // hasil scan) ke Master Barang. Kalau TIDAK ketemu, transaksi tetap
        // disimpan (supaya kasir tidak macet saat scan gagal / barang belum
        // ada di master) tapi ditandai `tidak_dikenal` agar mudah dicek nanti.
        $barang = $this->cariBarang($data['kode_barang']);
        $kodeInput = $data['kode_barang'];
        if ($barang) {
            $data['kode_barang']   = $barang->kode; // normalisasi ke kode master
            $data['tidak_dikenal'] = false;
            $data['kode_asli']     = null;
        } else {
            $data['tidak_dikenal'] = true;
            $data['kode_asli']     = $kodeInput;
        }

        // Konversi otomatis ke satuan dasar (mis. input "2 DUS" → disimpan
        // sebagai qty dalam PCS) supaya Omzet/HPP/Laba Rugi tetap akurat
        // walau kasir mencatat dalam satuan kemasan.
        $konv = $this->konversiSatuan($barang, (float) $data['qty'], (float) $data['harga'], $data['satuan'] ?? null);
        $data['satuan']     = $konv['satuan'];
        $data['qty_asal']   = $konv['qty_asal'];
        $data['harga_asal'] = $konv['harga_asal'];
        $data['qty']        = $konv['qty'];
        $data['harga']      = $konv['harga'];
        if ($konv['qty_asal'] !== null && (float) $data['diskon'] > 0 && (float) $konv['qty_asal'] > 0) {
            // Diskon per-baris ikut dipecah ke satuan dasar (mis. diskon per DUS → per PCS),
            // konsisten dengan cara Pembelian menghitungnya.
            $isi = (float) $konv['qty'] / (float) $konv['qty_asal'];
            $data['diskon'] = round(((float) $data['diskon']) / max($isi, 1), 2);
        }

        // Cek stok tersedia di cabang tersebut — hanya diblokir jika setting
        // "stok boleh minus" dimatikan (default: boleh minus dulu, sehingga
        // barang dengan stok 0/belum ada datanya tetap bisa dijual dan
        // stoknya boleh menjadi minus)
        if (!$this->stokBolehMinus()) {
            $tersedia = $this->stokTersedia($data['kode_barang'], $data['cabang']);
            if ($tersedia < (float) $data['qty']) {
                return response()->json([
                    'message' => "Stok tidak cukup. Stok tersedia di {$data['cabang']}: {$tersedia}",
                ], 422);
            }
        }

        // Setiap transaksi Penjualan WAJIB punya no_nota — kalau frontend tidak
        // kirim (mis. form lama / API dipanggil langsung), generate otomatis
        // di sini supaya tidak ada lagi transaksi tanpa nomor.
        if (empty($data['no_nota'])) {
            $data['no_nota'] = $this->generateNoTransaksi('trx_jual', 'no_nota', 'TXJ', $data['tgl']);
        }

        $id = DB::table('trx_jual')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));

        // Otomatis kurangi stok
        $this->adjustStok($data['kode_barang'], $data['cabang'], -(float) $data['qty']);

        return response()->json(DB::table('trx_jual')->find($id), 201);
    }

    public function destroyJual(int $id)
    {
        $row = DB::table('trx_jual')->find($id);
        if (!$row) return response()->json(['message' => 'Tidak ditemukan'], 404);
        DB::table('trx_jual')->delete($id);
        // Kembalikan stok yang tadi dikurangi
        $this->adjustStok($row->kode_barang, $row->cabang, (float) $row->qty);
        // Kalau baris ini bagian dari 1 nota POS (kasir input banyak barang
        // sekaligus), sinkronkan ulang ringkasan nota-nya (jumlah item,
        // subtotal, total) supaya tidak "nyangkut" nilai lama — atau hapus
        // total notanya kalau baris terakhir yang dihapus.
        if (!empty($row->no_nota)) $this->syncPosNota($row->no_nota);
        return response()->json(['message' => 'Penjualan dihapus, stok dikembalikan']);
    }

    public function importJual(Request $request)
    {
        return $this->importTrx($request, 'trx_jual', 'kode_barang', 'barang', 'kode', -1);
    }

    // ─── RESET DATA (Penjualan & Pembelian) ─────────────────────────────────
    // Menghapus SEMUA baris trx_jual & trx_beli sekaligus, dipakai saat mau
    // input ulang data dari nol (mis. data lama hasil import salah/dobel).
    // Sebelum menghapus, stok dikembalikan dulu ke saldo SEBELUM transaksi²
    // tsb ada — supaya tabel `stok` (yang juga dipakai barang_masuk/keluar &
    // stok awal) tidak ikut kacau/negatif setelah baris jual-beli dihapus.
    // Wajib kirim body { "konfirmasi": "HAPUS SEMUA" } sebagai pengaman.
    public function resetJualBeli(Request $request)
    {
        $request->validate(['konfirmasi' => 'required|string']);
        if (trim($request->input('konfirmasi')) !== 'HAPUS SEMUA') {
            return response()->json([
                'message' => 'Konfirmasi tidak sesuai. Ketik persis "HAPUS SEMUA" untuk melanjutkan.',
            ], 422);
        }

        $jumlahJual = DB::table('trx_jual')->count();
        $jumlahBeli = DB::table('trx_beli')->count();

        $kodeTerdampak = DB::table('trx_jual')->distinct()->pluck('kode_barang')
            ->merge(DB::table('trx_beli')->distinct()->pluck('kode_barang'))->unique();

        DB::transaction(function () {
            DB::table('trx_jual')
                ->selectRaw('kode_barang, cabang, SUM(qty) as total_qty')
                ->groupBy('kode_barang', 'cabang')
                ->get()
                ->each(fn($r) => $this->adjustStok($r->kode_barang, $r->cabang, (float) $r->total_qty));

            DB::table('trx_beli')
                ->selectRaw('kode_barang, cabang, SUM(qty) as total_qty')
                ->groupBy('kode_barang', 'cabang')
                ->get()
                ->each(fn($r) => $this->adjustStok($r->kode_barang, $r->cabang, -(float) $r->total_qty));

            DB::table('trx_jual')->delete();
            DB::table('trx_beli')->delete();
        });

        // adjustStok() di atas membangun ulang Kartu HPP SEBELUM baris
        // trx_jual/trx_beli terhapus (masih memakai data lama) — bangun ulang
        // SEKALI LAGI di sini, sesudah delete, supaya Kartu HPP benar-benar
        // bersih/sinkron dengan kondisi setelah reset.
        foreach ($kodeTerdampak as $kode) {
            app(\App\Services\HppService::class)->rebuildItem($kode);
        }

        return response()->json([
            'message' => "Berhasil menghapus {$jumlahJual} transaksi Penjualan dan {$jumlahBeli} transaksi Pembelian. Saldo stok sudah dikembalikan ke posisi sebelum transaksi tsb (stok awal/opname/barang masuk-keluar tidak ikut terhapus).",
            'jual_dihapus' => $jumlahJual,
            'beli_dihapus' => $jumlahBeli,
        ]);
    }

    // ─── PEMBELIAN ───────────────────────────────────────────────────────────
    public function getBeli(Request $request)
    {
        $base = DB::table('trx_beli')
            ->leftJoin('barang', 'trx_beli.kode_barang', '=', 'barang.kode');
        if ($request->get('cabang')) $base->where('trx_beli.cabang', $request->get('cabang'));
        $this->applyFilterTanggal($base, $request, 'tgl');
        if ($s = trim((string) $request->get('search'))) {
            $base->where(function ($w) use ($s) {
                $w->where('barang.nama', 'like', "%$s%")
                  ->orWhere('trx_beli.kode_barang', 'like', "%$s%")
                  ->orWhere('trx_beli.no_nota', 'like', "%$s%")
                  ->orWhere('trx_beli.supplier', 'like', "%$s%")
                  ->orWhere('trx_beli.operator', 'like', "%$s%")
                  ->orWhere('trx_beli.keterangan', 'like', "%$s%");
            });
        }
        // Filter persis per operator/akun penginput (?operator=ADM3)
        if ($op = trim((string) $request->get('operator'))) $base->where('trx_beli.operator', $op);

        $summary = (clone $base)
            ->selectRaw('COUNT(*) as jumlah, COALESCE(SUM(trx_beli.qty*trx_beli.harga - COALESCE(trx_beli.diskon,0)),0) as total_nominal')
            ->first();

        $q = $base->select('trx_beli.*', 'barang.nama as nama_barang', 'barang.ppn as ppn_master')
            ->selectRaw('COALESCE(trx_beli.ppn, barang.ppn) as ppn_efektif')
            ->orderByDesc('tgl')->orderByDesc('trx_beli.id');

        $perPage = (int) $request->get('per_page', 50);
        if ($perPage <= 0 || $perPage > 99000) $perPage = 99999;

        return $this->paginated($q->paginate($perPage), [
            'summary' => [
                'jumlah'        => (int) $summary->jumlah,
                'total_nominal' => (float) $summary->total_nominal,
            ],
        ]);
    }

    public function storeBeli(Request $request)
    {
        $data = $request->validate([
            'tgl'         => 'required|date',
            'cabang'      => 'required|string|exists:cabang,nama',
            'kode_barang' => 'required|string',
            'qty'         => 'required|numeric|min:0.01',
            'harga'       => 'required|numeric|min:0',
            'satuan'      => 'nullable|string|max:20',
            'diskon'      => 'nullable|numeric|min:0',
            // Override status PPN per baris transaksi — kalau tidak dikirim
            // (null), ikut status di Master Barang seperti sebelumnya.
            'ppn'         => ['nullable', Rule::in(['Kena PPN', 'Non-PPN'])],
            'bayar'       => ['required', Rule::in(['Tunai', 'Kredit'])],
            'kode_kas'    => ['required_if:bayar,Tunai', 'nullable', 'string', 'exists:coa,kode'],
            'keterangan'  => 'nullable|string|max:255',
            // Setiap Pembelian wajib punya supplier — dicocokkan ke Master Supplier
            // (menu Data Master > Supplier) supaya hutang usaha & riwayat pembelian
            // per supplier bisa direkap dengan benar di modul Kontak.
            'supplier'    => 'required|string|exists:supplier,nama',
            'no_nota'     => 'nullable|string|max:30',
            // Akun/operator yang menginput transaksi (mis. OFFICER, ADM3, BCNA1) —
            // dipakai untuk melacak asal data pembelian. Opsional.
            'operator'    => 'nullable|string|max:30',
            // Opsional: kalau diisi dari grid Input Pembelian (kolom "Kadaluarsa"),
            // otomatis dicatat sebagai 1 baris baru di tabel barang_kadaluarsa
            // supaya langsung nyambung ke menu Data Master > Kadaluarsa tanpa
            // perlu diinput ulang manual.
            'tgl_exp'     => 'nullable|date',
            'batch'       => 'nullable|string|max:50',
        ]);
        $tglExp = $data['tgl_exp'] ?? null;
        $batch  = $data['batch'] ?? null;
        unset($data['tgl_exp'], $data['batch']);
        $data['diskon'] = $data['diskon'] ?? 0;
        if (($data['bayar'] ?? null) !== 'Tunai') $data['kode_kas'] = null;

        $barang = $this->cariBarang($data['kode_barang']);
        $kodeInput = $data['kode_barang'];
        if ($barang) {
            $data['kode_barang']   = $barang->kode;
            $data['tidak_dikenal'] = false;
            $data['kode_asli']     = null;
        } else {
            $data['tidak_dikenal'] = true;
            $data['kode_asli']     = $kodeInput;
        }

        // Sama seperti Penjualan: konversi otomatis ke satuan dasar supaya
        // nilai Pembelian & stok tetap konsisten walau dicatat per DUS/KARTON.
        // Diskon (kalau ada) dianggap sudah dalam satuan yang sama dengan
        // harga sebelum dikonversi, jadi diikutkan proporsional.
        $konv = $this->konversiSatuan($barang, (float) $data['qty'], (float) $data['harga'], $data['satuan'] ?? null);
        $data['satuan']     = $konv['satuan'];
        $data['qty_asal']   = $konv['qty_asal'];
        $data['harga_asal'] = $konv['harga_asal'];
        $data['qty']        = $konv['qty'];
        $data['harga']      = $konv['harga'];
        if ($konv['qty_asal'] !== null && (float) $data['diskon'] > 0 && (float) $konv['qty_asal'] > 0) {
            // Diskon per-baris ikut dipecah ke satuan dasar (mis. diskon per DUS → per PCS)
            $isi = (float) $konv['qty'] / (float) $konv['qty_asal'];
            $data['diskon'] = round(((float) $data['diskon']) / max($isi, 1), 2);
        }

        // Sama seperti Penjualan: pastikan setiap Pembelian punya no_nota.
        if (empty($data['no_nota'])) {
            $data['no_nota'] = $this->generateNoTransaksi('trx_beli', 'no_nota', 'TXB', $data['tgl']);
        }

        $id = DB::table('trx_beli')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));

        // Otomatis tambah stok
        $this->adjustStok($data['kode_barang'], $data['cabang'], (float) $data['qty']);

        // Kalau tanggal kadaluarsa diisi di baris pembelian ini, catat sekalian
        // ke barang_kadaluarsa (qty dalam satuan dasar, sama seperti stok).
        if ($tglExp) {
            DB::table('barang_kadaluarsa')->insert([
                'tgl'         => $data['tgl'],
                'cabang'      => $data['cabang'],
                'kode_barang' => $data['kode_barang'],
                'batch'       => $batch,
                'qty'         => $data['qty'],
                'tgl_exp'     => $tglExp,
                'created_at'  => now(),
                'updated_at'  => now(),
            ]);
        }

        return response()->json(DB::table('trx_beli')->find($id), 201);
    }

    public function destroyBeli(int $id)
    {
        $row = DB::table('trx_beli')->find($id);
        if (!$row) return response()->json(['message' => 'Tidak ditemukan'], 404);
        DB::table('trx_beli')->delete($id);
        // Kurangi kembali stok yang tadi ditambahkan
        $this->adjustStok($row->kode_barang, $row->cabang, -(float) $row->qty);
        if (!empty($row->no_nota)) $this->syncPosNota($row->no_nota);
        return response()->json(['message' => 'Pembelian dihapus, stok disesuaikan']);
    }

    // ─── SINKRON ULANG HEADER `pos_nota` SETELAH 1 BARIS DIHAPUS ─────────
    // Dipakai oleh destroyJual/destroyBeli supaya nota POS (dibuat lewat
    // Kasir POS, banyak barang sekaligus dalam 1 struk) tetap konsisten
    // saat kasir menghapus 1 barang yang salah ketik dari riwayat lama —
    // tanpa perlu membatalkan seluruh transaksi. Kalau baris terakhir pada
    // nota tsb yang dihapus, header nota-nya ikut dihapus (nota kosong).
    private function syncPosNota(string $noNota): void
    {
        $nota = DB::table('pos_nota')->where('no_nota', $noNota)->first();
        if (!$nota) return;

        $table = $nota->jenis === 'Jual' ? 'trx_jual' : 'trx_beli';
        $sisa  = DB::table($table)->where('no_nota', $noNota)->get();

        if ($sisa->isEmpty()) {
            DB::table('pos_nota')->where('no_nota', $noNota)->delete();
            return;
        }

        $subtotal = $sisa->sum(fn ($r) => (float) $r->qty * (float) $r->harga);
        $diskon   = $sisa->sum(fn ($r) => (float) ($r->diskon ?? 0));
        DB::table('pos_nota')->where('no_nota', $noNota)->update([
            'jumlah_item' => $sisa->count(),
            'subtotal'    => $subtotal,
            'diskon'      => $diskon,
            'total'       => max($subtotal - $diskon, 0),
            'updated_at'  => now(),
        ]);
    }

    public function importBeli(Request $request)
    {
        return $this->importTrx($request, 'trx_beli', 'kode_barang', 'barang', 'kode', 1);
    }

    // ─── ISI SUPPLIER BELAKANGAN (untuk Pembelian hasil Import Excel yang
    // suppliernya sengaja dikosongkan saat import) ─────────────────────────
    // Dipanggil dari tombol "✏️ Isi Supplier" di Riwayat Pembelian. Bisa
    // menyasar 1 nota sekaligus (no_nota, dari grid Input Pembelian) atau
    // baris-baris lepas hasil import 1-baris = 1-transaksi (ids[]).
    public function setSupplierBeli(Request $request)
    {
        $data = $request->validate([
            'no_nota'  => 'nullable|string|max:30',
            'ids'      => 'nullable|array',
            'ids.*'    => 'integer',
            'supplier' => 'required|string|exists:supplier,nama',
        ]);

        $q = DB::table('trx_beli');
        if (!empty($data['no_nota'])) {
            $q->where('no_nota', $data['no_nota']);
        } elseif (!empty($data['ids'])) {
            $q->whereIn('id', $data['ids']);
        } else {
            return response()->json(['message' => 'no_nota atau ids wajib diisi'], 422);
        }

        $n = $q->update(['supplier' => $data['supplier'], 'updated_at' => now()]);

        return response()->json([
            'message' => $n > 0 ? "Supplier diperbarui untuk {$n} baris transaksi" : 'Tidak ada baris yang cocok/diperbarui',
            'updated' => $n,
        ]);
    }

    // ─── JASA ────────────────────────────────────────────────────────────────
    public function getJasa(Request $request)
    {
        $q = DB::table('trx_jasa')
            ->leftJoin('jasa', 'trx_jasa.kode_jasa', '=', 'jasa.kode')
            ->select('trx_jasa.*', 'jasa.nama as nama_jasa', 'jasa.ppn as ppn_jasa')
            ->orderByDesc('tgl')->orderByDesc('trx_jasa.id');
        if ($request->get('cabang')) $q->where('trx_jasa.cabang', $request->get('cabang'));
        $this->applyFilterTanggal($q, $request, 'tgl');
        if ($s = trim((string) $request->get('search'))) {
            $q->where(function ($w) use ($s) {
                $w->where('jasa.nama', 'like', "%$s%")->orWhere('trx_jasa.kode_jasa', 'like', "%$s%");
            });
        }
        return $this->paginated($q->paginate($request->get('per_page', 50)));
    }

    public function storeJasa(Request $request)
    {
        $data = $request->validate([
            'tgl'      => 'required|date',
            'cabang'   => 'required|string|exists:cabang,nama',
            'kode_jasa'=> 'required|string|exists:jasa,kode',
            'qty'      => 'required|numeric|min:0.01',
            'harga'    => 'required|numeric|min:0',
            'bayar'    => ['required', Rule::in(['Tunai', 'Kredit'])],
        ]);
        $data['no_transaksi'] = $this->generateNoTransaksi('trx_jasa', 'no_transaksi', 'JS', $data['tgl']);
        $id = DB::table('trx_jasa')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('trx_jasa')->find($id), 201);
    }

    public function destroyJasa(int $id)
    {
        DB::table('trx_jasa')->delete($id);
        return response()->json(['message' => 'Jasa dihapus']);
    }

    // ─── SEWA ────────────────────────────────────────────────────────────────
    public function getSewa(Request $request)
    {
        $q = DB::table('trx_sewa')->orderByDesc('tgl')->orderByDesc('id');
        if ($request->get('cabang')) $q->where('cabang', $request->get('cabang'));
        $this->applyFilterTanggal($q, $request, 'tgl');
        if ($s = trim((string) $request->get('search'))) {
            $q->where(function ($w) use ($s) {
                $w->where('nama_penyewa', 'like', "%$s%")->orWhere('item', 'like', "%$s%");
            });
        }
        return $this->paginated($q->paginate($request->get('per_page', 50)));
    }

    public function storeSewa(Request $request)
    {
        $data = $request->validate([
            'tgl'           => 'required|date',
            'cabang'        => 'required|string|exists:cabang,nama',
            'nama_penyewa'  => 'required|string|max:200',
            'item'          => 'required|string|max:200',
            'tgl_mulai'     => 'required|date',
            'tgl_selesai'   => 'required|date|after_or_equal:tgl_mulai',
            'biaya'         => 'required|numeric|min:0',
            'ppn'           => ['required', Rule::in(['Kena PPN', 'Non-PPN'])],
            'bayar'         => ['required', Rule::in(['Tunai', 'Kredit'])],
        ]);
        $data['no_transaksi'] = $this->generateNoTransaksi('trx_sewa', 'no_transaksi', 'SW', $data['tgl']);
        $id = DB::table('trx_sewa')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('trx_sewa')->find($id), 201);
    }

    public function destroySewa(int $id)
    {
        DB::table('trx_sewa')->delete($id);
        return response()->json(['message' => 'Sewa dihapus']);
    }

    // NB: Modul "Mutasi Barang" versi lama (1 baris = 1 barang, tabel
    // trx_mutasi) sudah digantikan oleh MutasiKirimController (paket
    // multi-barang: mutasi_kirim + mutasi_kirim_detail) — lihat
    // routes/api.php prefix('mutasi-kirim'). Data trx_mutasi lama tetap
    // dibaca di StokController::kartuStok() demi riwayat kartu stok lama.

    // ─── RETUR ───────────────────────────────────────────────────────────────
    public function getRetur(Request $request)
    {
        $q = DB::table('trx_retur')
            ->leftJoin('barang', 'trx_retur.kode_barang', '=', 'barang.kode')
            ->select('trx_retur.*', 'barang.nama as nama_barang', 'barang.ppn', 'barang.satuan1')
            ->orderByDesc('tgl')->orderByDesc('trx_retur.id');
        if ($request->get('cabang')) $q->where('trx_retur.cabang', $request->get('cabang'));
        if ($s = trim((string) $request->get('search'))) {
            $q->where(function ($w) use ($s) {
                $w->where('barang.nama', 'like', "%$s%")
                  ->orWhere('trx_retur.kode_barang', 'like', "%$s%")
                  ->orWhere('trx_retur.keterangan', 'like', "%$s%");
            });
        }
        return response()->json($q->get());
    }

    public function storeRetur(Request $request)
    {
        $data = $request->validate([
            'tgl'         => 'required|date',
            'cabang'      => 'required|string|exists:cabang,nama',
            'jenis'       => ['required', Rule::in(['Jual', 'Beli'])],
            'kode_barang' => 'required|string|exists:barang,kode',
            'qty'         => 'required|numeric|min:0.01',
            'harga'       => 'required|numeric|min:0',
            'satuan'      => 'nullable|string|max:20',
            'bayar'       => ['required', Rule::in(['Tunai', 'Kredit'])],
            'keterangan'  => 'nullable|string|max:255',
        ]);

        // Konversi qty/harga ke satuan dasar (persis pola Penjualan/Pembelian)
        // supaya stok & jurnal tetap akurat berapa pun satuan yang dipakai.
        $barang = $this->cariBarang($data['kode_barang']);
        $konv   = $this->konversiSatuan($barang, (float) $data['qty'], (float) $data['harga'], $data['satuan'] ?? null);

        $row = [
            'no_transaksi' => $this->generateNoTransaksi('trx_retur', 'no_transaksi', 'RT', $data['tgl']),
            'tgl' => $data['tgl'], 'cabang' => $data['cabang'], 'jenis' => $data['jenis'],
            'kode_barang' => $data['kode_barang'],
            'qty' => $konv['qty'], 'harga' => $konv['harga'],
            'satuan' => $konv['satuan'], 'qty_asal' => $konv['qty_asal'], 'harga_asal' => $konv['harga_asal'],
            'bayar' => $data['bayar'], 'keterangan' => $data['keterangan'] ?? null,
            'created_at' => now(), 'updated_at' => now(),
        ];
        $id = DB::table('trx_retur')->insertGetId($row);

        // Retur Jual = pelanggan mengembalikan barang ke kita → stok bertambah.
        // Retur Beli = kita mengembalikan barang ke supplier → stok berkurang.
        $arah = $data['jenis'] === 'Jual' ? 1 : -1;
        $this->adjustStok($data['kode_barang'], $data['cabang'], $arah * (float) $konv['qty']);

        return response()->json(DB::table('trx_retur')->find($id), 201);
    }

    public function destroyRetur(int $id)
    {
        $row = DB::table('trx_retur')->find($id);
        if (!$row) return response()->json(['message' => 'Tidak ditemukan'], 404);
        DB::table('trx_retur')->delete($id);
        $arah = $row->jenis === 'Jual' ? -1 : 1;
        $this->adjustStok($row->kode_barang, $row->cabang, $arah * (float) $row->qty);
        return response()->json(['message' => 'Retur dihapus, stok dikembalikan']);
    }

    // ─── KASBON ──────────────────────────────────────────────────────────────
    public function getKasbon(Request $request)
    {
        $q = DB::table('trx_kasbon')
            ->leftJoin('karyawan', 'trx_kasbon.karyawan_id', '=', 'karyawan.id')
            ->select('trx_kasbon.*', 'karyawan.kode as kode_karyawan')
            ->orderByDesc('trx_kasbon.tgl')->orderByDesc('trx_kasbon.id');
        if ($request->get('cabang'))      $q->where('trx_kasbon.cabang', $request->get('cabang'));
        if ($request->get('karyawan_id')) $q->where('trx_kasbon.karyawan_id', $request->get('karyawan_id'));
        if ($s = trim((string) $request->get('search'))) {
            $q->where(function ($w) use ($s) {
                $w->where('trx_kasbon.nama_karyawan', 'like', "%$s%")
                  ->orWhere('trx_kasbon.keterangan', 'like', "%$s%");
            });
        }
        $data = $q->get();
        $saldo = $data->reduce(fn($c, $r) => $r->jenis === 'Diberikan' ? $c + $r->nominal : $c - $r->nominal, 0);

        // Rekap sisa kasbon per karyawan — dipakai buat panel ringkasan &
        // supaya admin bisa lihat siapa saja yang masih punya sisa kasbon.
        $perKaryawan = DB::table('trx_kasbon')
            ->join('karyawan', 'trx_kasbon.karyawan_id', '=', 'karyawan.id')
            ->selectRaw("karyawan.id, karyawan.kode, karyawan.nama,
                SUM(CASE WHEN trx_kasbon.jenis = 'Diberikan' THEN trx_kasbon.nominal ELSE -trx_kasbon.nominal END) as saldo")
            ->groupBy('karyawan.id', 'karyawan.kode', 'karyawan.nama')
            ->havingRaw('saldo != 0')
            ->orderBy('karyawan.nama')
            ->get();

        return response()->json(['data' => $data, 'saldo' => $saldo, 'per_karyawan' => $perKaryawan]);
    }

    public function storeKasbon(Request $request)
    {
        $data = $request->validate([
            'tgl'          => 'required|date',
            'cabang'       => 'required|string|exists:cabang,nama',
            'karyawan_id'  => 'required|integer|exists:karyawan,id',
            'jenis'        => ['required', Rule::in(['Diberikan', 'Dibayar'])],
            'nominal'      => 'required|numeric|min:0',
            'keterangan'   => 'nullable|string',
        ]);
        $karyawan = DB::table('karyawan')->find($data['karyawan_id']);
        $data['nama_karyawan'] = $karyawan->nama; // ikut disimpan utk histori kalau nama/karyawan berubah nanti
        $data['no_transaksi'] = $this->generateNoTransaksi('trx_kasbon', 'no_transaksi', 'KB', $data['tgl']);
        $id = DB::table('trx_kasbon')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('trx_kasbon')->find($id), 201);
    }

    public function destroyKasbon(int $id)
    {
        DB::table('trx_kasbon')->delete($id);
        return response()->json(['message' => 'Kasbon dihapus']);
    }

    // ─── CASHBON PELANGGAN ───────────────────────────────────────────────────
    public function getCashbon(Request $request)
    {
        $q = DB::table('trx_cashbon')->orderByDesc('tgl')->orderByDesc('id');
        if ($request->get('cabang')) $q->where('cabang', $request->get('cabang'));
        if ($s = trim((string) $request->get('search'))) $q->where('nama_pelanggan', 'like', "%$s%");
        $data = $q->get();
        $saldo = $data->reduce(fn($c, $r) => $r->jenis === 'Diberikan' ? $c + $r->nominal : $c - $r->nominal, 0);
        return response()->json(['data' => $data, 'saldo' => $saldo]);
    }

    public function storeCashbon(Request $request)
    {
        $data = $request->validate([
            'tgl'            => 'required|date',
            'cabang'         => 'required|string|exists:cabang,nama',
            'nama_pelanggan' => 'required|string|max:200',
            'jenis'          => ['required', Rule::in(['Diberikan', 'Dibayar'])],
            'nominal'        => 'required|numeric|min:0',
        ]);
        $data['no_transaksi'] = $this->generateNoTransaksi('trx_cashbon', 'no_transaksi', 'CB', $data['tgl']);
        $id = DB::table('trx_cashbon')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('trx_cashbon')->find($id), 201);
    }

    public function destroyCashbon(int $id)
    {
        DB::table('trx_cashbon')->delete($id);
        return response()->json(['message' => 'Cashbon dihapus']);
    }

    // ─── BIAYA / PENGELUARAN ─────────────────────────────────────────────────
    public function getBiaya(Request $request)
    {
        $q = DB::table('trx_biaya')
            ->leftJoin('coa', 'trx_biaya.kode_akun', '=', 'coa.kode')
            ->select('trx_biaya.*', 'coa.nama as nama_akun')
            ->orderByDesc('tgl')->orderByDesc('trx_biaya.id');
        if ($request->get('cabang')) $q->where('trx_biaya.cabang', $request->get('cabang'));
        $this->applyFilterTanggal($q, $request, 'tgl');
        if ($s = trim((string) $request->get('search'))) {
            $q->where(function ($w) use ($s) {
                $w->where('coa.nama', 'like', "%$s%")
                  ->orWhere('trx_biaya.kode_akun', 'like', "%$s%")
                  ->orWhere('trx_biaya.keterangan', 'like', "%$s%")
                  ->orWhere('trx_biaya.no_bukti', 'like', "%$s%");
            });
        }
        return $this->paginated($q->paginate($request->get('per_page', 50)));
    }

    // Ringkasan/rekap pengeluaran untuk filter periode (harian/mingguan/bulanan/
    // tahunan lewat dari-sampai) + data grafik: per kategori, per tanggal, per
    // cabang, dan daftar pengeluaran terbesar. Dihitung dari SELURUH data yang
    // cocok filter (bukan cuma 1 halaman) supaya total & grafik selalu akurat.
    public function getBiayaSummary(Request $request)
    {
        $base = DB::table('trx_biaya')->leftJoin('coa', 'trx_biaya.kode_akun', '=', 'coa.kode');
        if ($request->get('cabang')) $base->where('trx_biaya.cabang', $request->get('cabang'));
        $this->applyFilterTanggal($base, $request, 'trx_biaya.tgl');

        $total = (clone $base)
            ->selectRaw('COUNT(*) as jumlah, COALESCE(SUM(nominal),0) as total')
            ->first();

        $perKategori = (clone $base)
            ->selectRaw('trx_biaya.kode_akun, COALESCE(coa.nama, trx_biaya.kode_akun) as nama_akun, COUNT(*) as jumlah, SUM(nominal) as total')
            ->groupBy('trx_biaya.kode_akun', 'coa.nama')
            ->orderByDesc('total')
            ->get();

        $perTanggal = (clone $base)
            ->selectRaw('trx_biaya.tgl, SUM(nominal) as total')
            ->groupBy('trx_biaya.tgl')
            ->orderBy('trx_biaya.tgl')
            ->get();

        $perCabang = (clone $base)
            ->selectRaw('trx_biaya.cabang, SUM(nominal) as total')
            ->groupBy('trx_biaya.cabang')
            ->orderByDesc('total')
            ->get();

        $terbesar = (clone $base)
            ->select('trx_biaya.*', 'coa.nama as nama_akun')
            ->orderByDesc('nominal')
            ->limit(8)
            ->get();

        return response()->json([
            'jumlah_transaksi' => (int) ($total->jumlah ?? 0),
            'total_nominal'    => (float) ($total->total ?? 0),
            'per_kategori'     => $perKategori,
            'per_tanggal'      => $perTanggal,
            'per_cabang'       => $perCabang,
            'terbesar'         => $terbesar,
        ]);
    }

    public function storeBiaya(Request $request)
    {
        $data = $request->validate([
            'tgl'        => 'required|date',
            'cabang'     => 'required|string|exists:cabang,nama',
            'kode_akun'  => 'required|string|exists:coa,kode',
            'nominal'    => 'required|numeric|min:0',
            'bayar'      => ['required', Rule::in(['Kas', 'Bank'])],
            'keterangan' => 'nullable|string|max:255',
        ]);

        // Generate nomor bukti/kode pengeluaran otomatis: BX-YYYYMMDD-XXXX
        $data['no_bukti'] = $this->nextNoBukti($data['tgl']);

        $id = DB::table('trx_biaya')->insertGetId(array_merge($data, ['created_at' => now(), 'updated_at' => now()]));
        return response()->json(DB::table('trx_biaya')->find($id), 201);
    }

    // ─── IMPORT PENGELUARAN DARI EXCEL (laporan setoran kasir) ───────────────
    // Dipakai Transaksi ▸ Pengeluaran ▸ "Import Excel". Frontend yang membaca
    // file Excel-nya; di sini tinggal validasi & simpan ke trx_biaya.
    // ANTI-DOBEL: kalau baris yang sama persis (tgl+cabang+akun+nominal+keterangan)
    // sudah ada di database, hanya selisihnya yang dimasukkan — jadi import ulang
    // file yang sama aman, sedangkan 2 pengeluaran kembar di hari yang sama
    // (mis. 2× "SUSUK 50.000") tetap masuk dua-duanya.
    public function importBiaya(Request $request)
    {
        $data = $request->validate([
            'cabang'             => 'required|string|exists:cabang,nama',
            'kode_akun'          => 'required|string|exists:coa,kode',
            'bayar'              => ['required', Rule::in(['Kas', 'Bank'])],
            'items'              => 'required|array|min:1|max:1000',
            'items.*.tgl'        => 'required|date',
            'items.*.nominal'    => 'required|numeric|min:1',
            'items.*.keterangan' => 'nullable|string|max:255',
        ]);

        $cache = [];
        $added = 0; $dilewati = 0; $total = 0.0;
        // hitung kemunculan di batch ini, bandingkan dgn yang sudah ada di DB
        $perKunci = [];
        foreach ($data['items'] as $it) {
            $ket = trim((string) ($it['keterangan'] ?? ''));
            $kunci = $it['tgl'] . '|' . $ket . '|' . round((float) $it['nominal'], 2);
            $perKunci[$kunci][] = ['tgl' => $it['tgl'], 'ket' => $ket, 'nominal' => (float) $it['nominal']];
        }

        DB::transaction(function () use ($data, $perKunci, &$cache, &$added, &$dilewati, &$total) {
            foreach ($perKunci as $baris) {
                $contoh = $baris[0];
                $sudahAda = DB::table('trx_biaya')
                    ->where('cabang', $data['cabang'])
                    ->where('kode_akun', $data['kode_akun'])
                    ->whereDate('tgl', $contoh['tgl'])
                    ->where('nominal', $contoh['nominal'])
                    ->where(function ($w) use ($contoh) {
                        $contoh['ket'] === ''
                            ? $w->whereNull('keterangan')->orWhere('keterangan', '')
                            : $w->where('keterangan', $contoh['ket']);
                    })->count();
                foreach (array_slice($baris, $sudahAda) as $b) {
                    DB::table('trx_biaya')->insert([
                        'tgl'        => $b['tgl'],
                        'cabang'     => $data['cabang'],
                        'kode_akun'  => $data['kode_akun'],
                        'nominal'    => $b['nominal'],
                        'bayar'      => $data['bayar'],
                        'keterangan' => $b['ket'] !== '' ? $b['ket'] : null,
                        'no_bukti'   => $this->generateNoTransaksiCached('trx_biaya', 'no_bukti', 'BX', $b['tgl'], $cache),
                        'created_at' => now(), 'updated_at' => now(),
                    ]);
                    $added++; $total += $b['nominal'];
                }
                $dilewati += min($sudahAda, count($baris));
            }
        });

        return response()->json([
            'added'    => $added,
            'dilewati' => $dilewati,
            'total'    => $total,
            'message'  => "Import pengeluaran selesai: {$added} baris masuk" . ($dilewati ? ", {$dilewati} dilewati (sudah ada)" : ''),
        ]);
    }

    private function nextNoBukti(string $tgl): string
    {
        return $this->generateNoTransaksi('trx_biaya', 'no_bukti', 'BX', $tgl);
    }

    // ─── GENERATOR NOMOR TRANSAKSI OTOMATIS (DIPAKAI SEMUA JENIS TRANSAKSI) ──
    // Format: {PREFIX}-{YYYYMMDD}-{urutan 4 digit}, mis. TXJ-20260813-0007.
    // Dipakai supaya SETIAP transaksi (Penjualan, Pembelian, Jasa, Sewa,
    // Retur, Kasbon, Cashbon, Biaya) otomatis dapat nomor tanpa perlu diisi
    // manual, dan dijamin tidak dobel — nomor dicek ulang ke DB (bukan cuma
    // dihitung dari COUNT) sebelum dipakai, supaya aman walau ada baris lama
    // yang urutannya bolong (mis. bekas dihapus).
    private function generateNoTransaksi(string $table, string $column, string $prefix, string $tgl): string
    {
        $cache = [];
        return $this->generateNoTransaksiCached($table, $column, $prefix, $tgl, $cache);
    }

    // Versi dengan cache eksternal — dipakai saat generate banyak nomor
    // sekaligus dalam 1 request (mis. loop import Excel) supaya tidak perlu
    // query COUNT ke DB berulang-ulang untuk tanggal yang sama.
    private function generateNoTransaksiCached(string $table, string $column, string $prefix, ?string $tgl, array &$cache): string
    {
        $key = $prefix . '-' . date('Ymd', $tgl ? strtotime($tgl) : time());
        if (!isset($cache[$key])) {
            $cache[$key] = DB::table($table)->where($column, 'like', $key . '-%')->count();
        }
        do {
            $cache[$key]++;
            $no = $key . '-' . str_pad($cache[$key], 4, '0', STR_PAD_LEFT);
        } while (DB::table($table)->where($column, $no)->exists());
        return $no;
    }

    // Dipanggil frontend (grid multi-baris Penjualan/Pembelian) SEBELUM baris
    // barang dikirim satu-satu, supaya semua baris dalam 1 kali "Simpan"
    // (termasuk yang cuma 1 barang) sama-sama dikelompokkan pakai 1 no_nota
    // yang sudah pasti unik — bukan digenerate di browser (Date.now() bisa
    // tabrakan & tidak tervalidasi ke DB).
    public function nomorBaru(Request $request)
    {
        $data = $request->validate([
            'jenis' => ['required', Rule::in(['jual', 'beli'])],
            'tgl'   => 'required|date',
        ]);
        $table  = $data['jenis'] === 'jual' ? 'trx_jual' : 'trx_beli';
        $prefix = $data['jenis'] === 'jual' ? 'TXJ' : 'TXB';
        return response()->json(['no_nota' => $this->generateNoTransaksi($table, 'no_nota', $prefix, $data['tgl'])]);
    }

    // Dipanggil frontend saat kasir pilih mode "Ketik" (nomor transaksi
    // manual) — cek dulu ke DB apakah nomor itu sudah dipakai transaksi lain
    // sebelum baris barang mulai disimpan, supaya tidak ada nomor dobel.
    public function cekNomor(Request $request)
    {
        $data = $request->validate([
            'jenis'   => ['required', Rule::in(['jual', 'beli'])],
            'no_nota' => 'required|string|max:30',
        ]);
        $table = $data['jenis'] === 'jual' ? 'trx_jual' : 'trx_beli';
        $ada   = DB::table($table)->where('no_nota', $data['no_nota'])->exists();
        return response()->json(['tersedia' => !$ada]);
    }

    public function destroyBiaya(int $id)
    {
        DB::table('trx_biaya')->delete($id);
        return response()->json(['message' => 'Biaya dihapus']);
    }

    // ─── PROTEKSI IMPORT DOBEL ───────────────────────────────────────────────
    // Hash dihitung dari SELURUH baris (bukan per-chunk) supaya konsisten
    // walau frontend memecah pengiriman jadi beberapa request kecil.
    private function hashImport(string $jenis, string $cabang, array $items): string
    {
        $baris = array_map(function ($i) use ($jenis) {
            $row = [
                'tgl'    => $i['tgl']    ?? null,
                'kode'   => trim($i['kode_barang'] ?? ''),
                'qty'    => (float) ($i['qty'] ?? 0),
                'harga'  => (float) ($i['harga'] ?? 0),
                'satuan' => $i['satuan'] ?? null,
            ];
            if ($jenis === 'beli') {
                $row['diskon']   = (float) ($i['diskon'] ?? 0);
                $row['supplier'] = $i['supplier'] ?? null;
            }
            // Cabang per baris (file import multi-cabang). Hanya ikut di-hash kalau
            // diisi, supaya sidik jari import lama (tanpa kolom ini) tidak berubah.
            if (!empty($i['cabang'])) $row['cabang'] = $i['cabang'];
            return $row;
        }, $items);
        return hash('sha256', json_encode([$jenis, $cabang, $baris]));
    }

    // Dipanggil SEKALI oleh frontend (dengan SELURUH baris hasil baca Excel,
    // sebelum dipecah per-chunk) tepat sebelum tombol "Import Sekarang" mulai
    // mengirim data. Kalau kombinasi jenis+cabang+isi baris ini SAMA PERSIS
    // dengan import yang sudah pernah selesai sebelumnya, kita beri tahu
    // penggunanya (kapan & berapa) supaya mereka bisa membatalkan kalau memang
    // tidak sengaja mau import ulang.
    public function cekDuplikatImport(Request $request)
    {
        $request->validate([
            'jenis'  => ['required', Rule::in(['jual', 'beli'])],
            'cabang' => 'required|string',
            'items'  => 'required|array|min:1',
        ]);
        $hash = $this->hashImport($request->jenis, $request->cabang, $request->items);
        $sebelumnya = DB::table('import_batch')->where('hash', $hash)->orderByDesc('id')->first();

        return response()->json([
            'hash'     => $hash,
            'duplikat' => (bool) $sebelumnya,
            'info'     => $sebelumnya ? [
                'kapan'         => $sebelumnya->created_at,
                'jumlah_baris'  => (int) $sebelumnya->jumlah_baris,
                'total_nominal' => (float) $sebelumnya->total_nominal,
            ] : null,
        ]);
    }

    // Dipanggil SEKALI oleh frontend setelah SEMUA chunk import selesai
    // diproses (bukan per-chunk), supaya "sidik jari" file ini baru dianggap
    // resmi tercatat kalau importnya benar-benar berhasil dijalankan sampai
    // akhir — import yang dibatalkan di tengah jalan (mis. preview doang,
    // atau gagal sebagian) tidak ikut mengunci hash-nya.
    public function catatImportSelesai(Request $request)
    {
        $data = $request->validate([
            'jenis'         => ['required', Rule::in(['jual', 'beli'])],
            'cabang'        => 'required|string',
            'hash'          => 'required|string|size:64',
            'jumlah_baris'  => 'required|integer|min:0',
            'total_nominal' => 'required|numeric|min:0',
        ]);
        DB::table('import_batch')->insert(array_merge($data, [
            'created_at' => now(), 'updated_at' => now(),
        ]));
        return response()->json(['message' => 'Tercatat']);
    }

    // $stokArah: -1 untuk mengurangi stok (Penjualan), +1 untuk menambah stok (Pembelian)
    private function importTrx(Request $request, string $table, string $keyCol, string $refTable, string $refCol, int $stokArah = 0)
    {
        // Cabang default (dari pilihan di form) BOLEH kosong kalau tiap baris file
        // membawa kolom "Cabang" sendiri (import multi-cabang, mis. laporan pembelian
        // gabungan). Cabang tiap baris dicocokkan ke Master Cabang tanpa peduli
        // huruf besar/kecil; baris dengan cabang tak dikenal dilewati & dilaporkan.
        $request->validate([
            'cabang'      => 'nullable|string|exists:cabang,nama',
            'items'       => 'required|array',
            'items.*.tgl' => 'required|date',
            'buat_barang_baru' => 'nullable|boolean',
            'hpp_termasuk_ppn' => 'nullable|boolean',
            'lewati_nota_ada'  => 'nullable|boolean',
        ]);
        // Pembelian: kalau kode/nama barang di file belum ada di Master Barang,
        // otomatis dibuatkan barangnya (supaya ikut terbentuk Jurnal — buildJurnal
        // memakai INNER JOIN ke `barang`). Harga jual = HPP sementara.
        $buatBarangBaru = $table === 'trx_beli' && $request->boolean('buat_barang_baru');
        $barangBaru = [];   // kode => true (dibuat di batch ini)
        $kodeSentuh = [];   // kode barang yang disentuh batch ini (utk sinkron harga jual = HPP)
        $peta_cabang = [];
        foreach (DB::table('cabang')->pluck('nama') as $nm) $peta_cabang[mb_strtolower(trim($nm))] = $nm;
        // Penjualan: kasir & shift per baris (kolom "Kasir"/"Shift" di file). Kolom DB-nya dibuat
        // migration add_kasir_shift_ke_trx_jual — kalau belum dijalankan, import tetap jalan
        // (tanpa kasir/shift) dan respons memberi catatan supaya user menjalankan migrate.
        $adaKolomKasir = $table === 'trx_jual'
            && \Illuminate\Support\Facades\Schema::hasColumn('trx_jual', 'kasir')
            && \Illuminate\Support\Facades\Schema::hasColumn('trx_jual', 'shift');
        $kasirTanpaKolom = false;
        // HPP di file sudah termasuk PPN? (opsi di form Import Penjualan) → dibagi (1+tarif)
        // khusus baris Kena PPN, supaya sama basisnya dgn DPP penjualan di Laba Rugi.
        $hppTermasukPpn = $table === 'trx_jual' && $request->boolean('hpp_termasuk_ppn');
        $tarifPpn = 0.11;
        if ($hppTermasukPpn) {
            $st = DB::table('settings')->where('key', 'tarif_ppn')->first();
            if ($st) $tarifPpn = (float) $st->value / 100;
        }
        $cabangTidakValid = [];
        // Pembelian: supplier BOLEH dikosongkan saat import — supaya barang di
        // Excel bisa langsung diimpor dulu (banyak baris sekaligus), baru
        // suppliernya diisi belakangan lewat "✏️ Isi Supplier" di Riwayat
        // Pembelian (lihat TransaksiController::setSupplierBeli). Kalau diisi
        // (baik lewat request.supplier sebagai default, atau per baris lewat
        // items.*.supplier), tetap dipakai seperti biasa & tervalidasi harus
        // ada di Master Supplier.
        $supplierDefault = null;
        if ($table === 'trx_beli') {
            $request->validate(['supplier' => 'nullable|string|exists:supplier,nama']);
            $supplierDefault = $request->input('supplier') ?: null;
        }
        $bolehMinus = $this->stokBolehMinus();
        $added = 0; $ditandai = 0; $skipped = 0; $tidakDitemukan = [];
        // PROTEKSI NOTA DOBEL (khusus Pembelian): nota dgn No. Faktur + Tanggal + Cabang
        // yang SUDAH ada di database dilewati seluruhnya — import ulang file/tanggal yang
        // sama tidak menggandakan nota; hanya nomor faktur yang belum ada yang masuk.
        // Snapshot diambil SEBELUM baris pertama disisipkan, jadi baris-baris 1 nota
        // yang sama di batch ini tetap masuk semua. Baris tanpa No. Faktur tidak dicek
        // (nomornya dibuat otomatis). Matikan dgn lewati_nota_ada=false.
        $lewatiNotaAda = $table === 'trx_beli' && $request->boolean('lewati_nota_ada', true);
        $notaAda = [];          // "no_nota|tgl|cabang" => true (sudah ada di DB sebelum batch ini)
        $notaDilewati = [];     // no_nota => true
        $barisDobel = 0;
        if ($lewatiNotaAda) {
            $daftarNota = [];
            foreach ($request->items as $it) {
                $nn = trim((string)($it['no_nota'] ?? ''));
                if ($nn !== '') $daftarNota[$nn] = true;
            }
            foreach (array_chunk(array_keys($daftarNota), 500) as $potong) {
                foreach (DB::table($table)->whereIn('no_nota', $potong)->select('no_nota', 'tgl', 'cabang')->distinct()->get() as $r) {
                    $notaAda[mb_strtolower($r->no_nota) . '|' . substr((string)$r->tgl, 0, 10) . '|' . mb_strtolower((string)$r->cabang)] = true;
                }
            }
        }
        // Tunda pembangunan-ulang Kartu HPP sampai akhir batch (barang yang
        // sama bisa muncul berkali-kali di 1 file import) — lihat flushPendingHpp().
        $this->deferHppRebuild = true;
        // Setiap baris hasil import dianggap 1 transaksi tersendiri (bukan
        // digabung dalam 1 nota) — pakai cache supaya tidak query COUNT ke DB
        // berulang untuk tanggal yang sama di dalam 1 batch import.
        $prefix = $table === 'trx_jual' ? 'TXJ' : 'TXB';
        $noNotaCache = [];
        $noNotaTglCabang = []; // no_nota => "tgl|cabang" pertama yang memakainya di batch ini
        $bentrokDibetulkan = 0; // jumlah baris yang no_nota-nya dari file ternyata bentrok & dibetulkan
        $adaKolomKeterangan = \Illuminate\Support\Facades\Schema::hasColumn($table, 'keterangan');
        // Penjualan: kolom "Pelanggan" / "Kode Pelanggan" di file → ditautkan ke Master Pelanggan
        // (trx_jual.pelanggan = kode pelanggan), supaya di menu Kontak ▸ Pelanggan bisa dilihat
        // riwayat & total pembeliannya. Pelanggan yang belum ada di Master dibuat otomatis.
        $adaKolomPelanggan = $table === 'trx_jual'
            && \Illuminate\Support\Facades\Schema::hasColumn('trx_jual', 'pelanggan');
        $cachePelanggan = [];
        $pelangganBaru  = 0;

        foreach ($request->items as $item) {
            $kodeInput = trim($item[$keyCol] ?? '');
            // Baris tanpa kode sama sekali tidak bisa disimpan (tidak ada
            // apa pun untuk dicatat), ini satu-satunya kasus yang di-skip.
            if (!$kodeInput) { $skipped++; continue; }

            // Cabang baris ini: kolom "Cabang" di file kalau ada, kalau tidak
            // pakai cabang default dari form.
            $cabangItem = trim((string)($item['cabang'] ?? ''));
            $kasirItem  = $table === 'trx_jual'
                ? \App\Services\KasirAkunService::normal((string)($item['kasir'] ?? $item['operator'] ?? ''))
                : '';
            if ($cabangItem !== '')       $cabangItem = $peta_cabang[mb_strtolower($cabangItem)] ?? null;
            elseif ($request->cabang)     $cabangItem = $request->cabang;
            elseif ($kasirItem !== '')    $cabangItem = $peta_cabang[mb_strtolower(\App\Services\KasirAkunService::cabang($kasirItem))] ?? null; // tebak dari akun kasir
            else                          $cabangItem = null;
            if (!$cabangItem) {
                $skipped++;
                if (count($cabangTidakValid) < 20) $cabangTidakValid[] = trim((string)($item['cabang'] ?? '')) ?: '(kosong)';
                continue;
            }

            // Nota ini (No. Faktur + Tanggal + Cabang) sudah pernah masuk → lewati.
            if ($lewatiNotaAda) {
                $nnCek = trim((string)($item['no_nota'] ?? ''));
                if ($nnCek !== '' && isset($notaAda[mb_strtolower($nnCek) . '|' . substr((string)$item['tgl'], 0, 10) . '|' . mb_strtolower((string)$cabangItem)])) {
                    $barisDobel++;
                    $notaDilewati[$nnCek] = true;
                    continue;
                }
            }

            // Cocokkan dengan kode ATAU barcode (laporan kasir sering pakai barcode)
            $barang = $this->cariBarang($kodeInput);
            // Pembelian: laporan pembelian dari kasir lama kadang HANYA punya
            // nama barang (tanpa kode/barcode). Kalau kode/barcode tidak ketemu,
            // coba cocokkan ke nama barang di Master (persis, tanpa peduli
            // huruf besar/kecil & spasi ganda) — hanya dipakai kalau namanya
            // unik di Master supaya tidak salah tempel ke barang lain.
            if (!$barang && $table === 'trx_beli') {
                $barang = $this->cariBarangByNama($kodeInput);
            }
            // Masih tidak ketemu → buat otomatis di Master Barang (kalau diminta).
            if (!$barang && $buatBarangBaru) {
                $barang = $this->buatBarangDariImport($kodeInput, $item, $supplierDefault);
                if ($barang) $barangBaru[$barang->kode] = true;
            }
            $kode = $barang ? $barang->kode : $kodeInput;
            if ($table === 'trx_beli' && $barang) $kodeSentuh[(string) $barang->kode] = true;
            $qtyInput   = (float)($item['qty'] ?? 1);
            $hargaInput = (float)($item['harga'] ?? 0);

            // Konversi otomatis kalau baris import menyebutkan satuan (mis. hasil
            // export laporan kasir yang punya kolom "Satuan") — sama seperti input manual.
            $konv = $this->konversiSatuan($barang, $qtyInput, $hargaInput, $item['satuan'] ?? null);
            $qty  = $konv['qty'];

            // Penjualan: lewati baris jika stok tidak cukup DAN stok tidak boleh minus
            // (hanya berlaku untuk barang yang dikenali; barang tak dikenal tidak
            // bisa dicek stoknya secara valid, jadi tetap dimasukkan & ditandai)
            if ($stokArah < 0 && $barang && !$bolehMinus && $this->stokTersedia($kode, $cabangItem) < $qty) {
                $skipped++;
                continue;
            }

            // No. Referensi: kalau file import menyertakan kolom "No. Referensi"
            // (mis. hasil export Riwayat Penjualan/Pembelian, atau template Import),
            // pakai itu APA ADANYA — supaya baris-baris dengan No. Referensi yang
            // sama otomatis kegroup jadi 1 nota di Riwayat (sama seperti transaksi
            // yang diinput lewat grid Penjualan/Pembelian). Kalau kosong/tidak ada
            // di file, tetap auto-generate seperti sebelumnya (1 baris = 1 nota).
            //
            // PROTEKSI DOBEL: 1 no_nota HARUS cuma mewakili 1 tanggal+cabang yang
            // sama (1 nota = 1 transaksi). Kalau nomor referensi dari file ternyata
            // sudah dipakai baris lain dengan tanggal/cabang BEDA (baik di batch
            // import ini maupun data yang sudah ada di DB), berarti nomor itu
            // bentrok/tidak unik dari sumbernya — jangan digabung paksa, tapi
            // otomatis diberi nomor baru yang pasti unik.
            $noNotaInput = trim($item['no_nota'] ?? '');
            $noNotaFinal = $this->resolveNoNotaImport(
                $table, $prefix, $noNotaInput, (string)$item['tgl'], (string)$cabangItem,
                $noNotaTglCabang, $noNotaCache
            );
            if ($noNotaInput !== '' && $noNotaFinal !== $noNotaInput) $bentrokDibetulkan++;

            $row = [
                'no_nota'       => $noNotaFinal,
                'tgl'           => $item['tgl'],
                'cabang'        => $cabangItem,
                $keyCol         => $kode,
                'qty'           => $qty,
                'harga'         => $konv['harga'],
                'satuan'        => $konv['satuan'],
                'qty_asal'      => $konv['qty_asal'],
                'harga_asal'    => $konv['harga_asal'],
                'bayar'         => in_array($item['bayar'] ?? '', ['Tunai', 'Kredit']) ? $item['bayar'] : 'Tunai',
                'tidak_dikenal' => !$barang,
                'kode_asli'     => $barang ? null : $kodeInput,
                'created_at'    => now(), 'updated_at' => now(),
            ];
            // diskon per-baris berlaku untuk Penjualan MAUPUN Pembelian (kedua tabel
            // sudah punya kolom ini — lihat migration create_pos_module). Sebelumnya
            // hanya diisi utk trx_beli, jadi kolom "Diskon" di template Import
            // Penjualan diam-diam terabaikan.
            $row['diskon'] = (float)($item['diskon'] ?? 0);

            // Status PPN per baris — kalau file import menyertakan kolom "PPN"
            // ('Kena PPN' / 'Non-PPN'), pakai itu sebagai OVERRIDE utk baris ini
            // (persis field yang sama dipakai input manual Penjualan/Pembelian,
            // lihat migration add_ppn_override_ke_trx_jual_beli). Kosong/tidak
            // ada di file → tetap null, otomatis ikut status PPN di Master Barang
            // (perilaku lama, tidak berubah).
            $ppnInput = trim((string)($item['ppn'] ?? ''));
            $row['ppn'] = in_array($ppnInput, ['Kena PPN', 'Non-PPN']) ? $ppnInput : null;

            // HPP (harga pokok) per baris — KHUSUS Penjualan. Kalau file import
            // menyertakan kolom "HPP" (mis. dari laporan "Penjualan By Barang"
            // sistem kasir lama, yang sudah menghitung harga pokok rata-rata
            // versi kasir SAAT itu), simpan sebagai HPP OTORITATIF baris ini
            // (kolom trx_jual.hpp — lihat migration add_hpp_ke_trx_jual & dipakai
            // sebagai override di HppService::gatherEvents) — supaya pergerakan
            // HPP/Laba Rugi TIDAK bergantung semata pada rata-rata Kartu HPP yang
            // mungkin belum punya riwayat Pembelian lengkap. Nilai di kolom "HPP"
            // diisi PER SATUAN sesuai baris (yang sama dgn kolom "Satuan"/"Harga"
            // baris ini) — dikonversi otomatis dgn faktor yang sama seperti Harga
            // kalau baris ini pakai Satuan 2/3. Kosong/0 → dibiarkan null, HPP
            // baris ini otomatis dihitung dari rata-rata Kartu HPP (perilaku lama).
            if ($table === 'trx_jual') {
                $hppInput = (float)($item['hpp'] ?? 0);
                if ($hppInput > 0 && $hppTermasukPpn && (($row['ppn'] ?: ($barang->ppn ?? null)) === 'Kena PPN')) {
                    $hppInput = round($hppInput / (1 + $tarifPpn), 4);
                }
                if ($hppInput > 0) {
                    // Faktor konversi yang sama persis dipakai konversiSatuan() utk
                    // Harga (qty_base / qty_input) — supaya HPP per satuan besar
                    // (mis. KARTON) ikut dibagi isi jadi HPP per satuan dasar, lalu
                    // dikalikan qty (base) utk dapat HPP TOTAL baris ini.
                    $faktorKonv = $qtyInput > 0 ? ($qty / $qtyInput) : 1.0;
                    $hppPerSatuanDasar = $faktorKonv > 0 ? $hppInput / $faktorKonv : $hppInput;
                    $row['hpp'] = round($qty * $hppPerSatuanDasar, 2);
                }
            }

            if ($table === 'trx_jual') {
                if ($adaKolomKasir) {
                    $row['kasir'] = $kasirItem !== '' ? mb_substr($kasirItem, 0, 30) : null;
                    $row['shift'] = \App\Services\KasirAkunService::normalisasiShift($item['shift'] ?? null)
                        ?? ($kasirItem !== '' ? \App\Services\KasirAkunService::shift($kasirItem) : null);
                } elseif ($kasirItem !== '') {
                    $kasirTanpaKolom = true;
                }
            }
            if ($table === 'trx_beli') {
                $row['supplier'] = trim($item['supplier'] ?? '') ?: $supplierDefault;
                // Akun/operator asal transaksi (kolom "Operator" di file import)
                $row['operator'] = trim((string)($item['operator'] ?? '')) ?: null;
            }
            if ($adaKolomKeterangan) {
                $row['keterangan'] = trim($item['keterangan'] ?? '') ?: null;
            }
            if ($adaKolomPelanggan) {
                $row['pelanggan'] = $this->resolvePelangganImport($item, $cachePelanggan, $pelangganBaru);
            }

            DB::table($table)->insert($row);

            // Otomatis sesuaikan stok sesuai arah transaksi — tetap dilakukan
            // walau barang belum dikenal, memakai kode aslinya sebagai kunci,
            // supaya begitu barang itu didaftarkan ke Master, stoknya sudah nyambung.
            if ($stokArah !== 0) {
                $this->adjustStok($kode, $cabangItem, $stokArah * $qty);
            }

            $added++;
            if (!$barang) {
                $ditandai++;
                if (count($tidakDitemukan) < 30) $tidakDitemukan[] = $kodeInput;
            }
        }
        // Harga jual barang otomatis (penanda di kolom keterangan) = HPP terkini.
        // Snapshot harga SEBELUM rebuild: hanya harga yang masih sama dgn HPP lama
        // (belum diubah manual) yang ikut digeser ke HPP baru.
        $penandaAuto = self::PENANDA_BARANG_AUTO;
        $snap = [];
        if ($kodeSentuh) {
            foreach (DB::table('barang')->whereIn('kode', array_map('strval', array_keys($kodeSentuh)))
                ->where('keterangan', 'like', $penandaAuto . '%')->get() as $b) {
                $snap[$b->kode] = $b;
            }
        }
        $this->deferHppRebuild = false;
        $this->flushPendingHpp();
        foreach ($snap as $lama) {
            $kodeB = (string) $lama->kode;
            $baru = DB::table('barang')->where('kode', $kodeB)->first();
            if (!$baru || (float) $baru->modal <= 0) continue;
            $upd = [];
            foreach (['harga_jual', 'harga_grosir', 'harga_cabang'] as $kol) {
                if (abs((float) $lama->$kol - (float) $lama->modal) < 0.01 || (float) $lama->$kol == 0.0) {
                    $upd[$kol] = (float) $baru->modal;
                }
            }
            if ($upd) DB::table('barang')->where('kode', $kodeB)->update($upd + ['updated_at' => now()]);
        }
        if ($barangBaru) {
            // Daftarkan ke cabang tempat barang bertransaksi → muncul di Master Barang cabang.
            \App\Services\BarangCabangService::daftarkanDariTransaksi(array_map('strval', array_keys($barangBaru)));
        }
        return response()->json([
            'kasir_tanpa_kolom'  => $kasirTanpaKolom,                                    // file punya kasir tapi kolom DB belum ada → jalankan php artisan migrate
            'barang_baru'        => count($barangBaru),                                  // jumlah barang baru yg dibuat otomatis di Master
            'barang_baru_contoh' => array_slice(array_map('strval', array_keys($barangBaru)), 0, 30),
            'added'              => $added,       // total baris berhasil masuk (termasuk yang ditandai)
            'ditandai'           => $ditandai,     // dari 'added', berapa yang kode/barcode-nya tak dikenal
            'skipped'            => $skipped,      // baris tanpa kode sama sekali / stok tak cukup
            'tidak_ditemukan'    => $tidakDitemukan,
            'pelanggan_baru'     => $pelangganBaru,   // pelanggan di file yang belum ada di Master Pelanggan → dibuat otomatis
            'nomor_dibetulkan'   => $bentrokDibetulkan, // no_nota dari file yang bentrok & otomatis diganti nomor baru
            'cabang_tidak_valid' => $cabangTidakValid,  // nama cabang di file yang tidak ada di Master Cabang (baris dilewati)
            'baris_dobel_dilewati' => $barisDobel,                       // baris dari nota yang sudah ada (No. Faktur+Tanggal+Cabang sama) → tidak dimasukkan lagi
            'nota_dobel_dilewati'  => array_slice(array_keys($notaDilewati), 0, 50),
            'jumlah_nota_dobel'    => count($notaDilewati),
        ]);
    }

    // Penanda di kolom `keterangan` Master Barang untuk barang yang dibuat
    // otomatis oleh Import Pembelian (harga jual = HPP sementara).
    const PENANDA_BARANG_AUTO = 'Dibuat otomatis dari Import Pembelian';

    // Buat 1 barang baru di Master Barang dari baris import Pembelian yang
    // kode/namanya belum terdaftar. Kebijakan sistem: barang default "Kena PPN"
    // (lihat migration set_semua_barang_kena_ppn); status PPN transaksi tetap
    // ditentukan override per baris. Harga jual/grosir/cabang = harga beli baris
    // ini dulu, lalu digeser ke HPP rata-rata setelah Kartu HPP dibangun.
    // Return null kalau kode > 50 karakter (batas kolom) → baris tetap masuk
    // sebagai "kode tidak dikenal" seperti sebelumnya.
    protected function buatBarangDariImport(string $kodeInput, array $item, ?string $supplierDefault): ?object
    {
        $kode = trim($kodeInput);
        if ($kode === '' || mb_strlen($kode) > 50) return null;

        $nama    = trim((string) ($item['nama'] ?? '')) ?: $kode;
        $satuan  = trim((string) ($item['satuan'] ?? '')) ?: 'PCS';
        $harga   = max((float) ($item['harga'] ?? 0), 0);
        $supplier = trim((string) ($item['supplier'] ?? '')) ?: $supplierDefault;

        DB::table('barang')->insertOrIgnore([
            'kode'         => $kode,
            'nama'         => mb_substr($nama, 0, 255),
            'ppn'          => 'Kena PPN',
            'satuan1'      => mb_substr($satuan, 0, 20),
            'isi'          => 1,
            'isi3'         => 1,
            'modal'        => $harga,
            'harga_jual'   => $harga,
            'harga_grosir' => $harga,
            'harga_cabang' => $harga,
            'supplier'     => $supplier ? mb_substr($supplier, 0, 100) : null,
            'stok_min'     => 0,
            'stok_max'     => 0,
            'keterangan'   => self::PENANDA_BARANG_AUTO . ' — harga jual sementara = HPP, silakan sesuaikan',
            'created_at'   => now(),
            'updated_at'   => now(),
        ]);

        return DB::table('barang')->where('kode', $kode)->first();
    }

    // Aturan PPN dari No. Referensi/Faktur: diawali "TS" + angka + "-" (nota
    // internal, mis. TS1-250926008) → Non-PPN; selain itu (faktur asli supplier)
    // → Kena PPN. Sama dgn ppnDariNoNota() di transaksi.js.
    protected function ppnDariNoNota(string $noNota): string
    {
        return preg_match('/^TS\d*-/i', trim($noNota)) ? 'Non-PPN' : 'Kena PPN';
    }

    // ─── UBAH NO. FAKTUR PEMBELIAN ───────────────────────────────────────────
    // Dipakai saat nota internal "TS…-" ternyata sudah punya nomor faktur asli
    // dari supplier. Menyasar 1 nota (no_nota_lama) atau baris lepas (ids[]).
    // ppn: 'auto' (default; TS…- = Non-PPN, selain itu Kena PPN) | 'Kena PPN' |
    // 'Non-PPN' | 'tetap'. Karena status PPN mempengaruhi HPP (harga Kena PPN
    // di-DPP-kan) & Jurnal (PPN Masukan), Kartu HPP barang terkait dibangun ulang.
    public function ubahNoNotaBeli(Request $request)
    {
        $data = $request->validate([
            'no_nota_baru' => 'required|string|max:30',
            'no_nota_lama' => 'nullable|string|max:30',
            'ids'          => 'nullable|array',
            'ids.*'        => 'integer',
            'ppn'          => ['nullable', Rule::in(['auto', 'Kena PPN', 'Non-PPN', 'tetap'])],
        ]);
        $baru = trim(preg_replace('/\s+/', ' ', $data['no_nota_baru']));
        if ($baru === '') return response()->json(['message' => 'No. faktur baru wajib diisi'], 422);

        $q = DB::table('trx_beli');
        if (!empty($data['no_nota_lama'])) {
            $q->where('no_nota', $data['no_nota_lama']);
        } elseif (!empty($data['ids'])) {
            $q->whereIn('id', $data['ids']);
        } else {
            return response()->json(['message' => 'no_nota_lama atau ids wajib diisi'], 422);
        }
        $rows = $q->get(['id', 'no_nota', 'tgl', 'cabang', 'kode_barang']);
        if ($rows->isEmpty()) return response()->json(['message' => 'Nota tidak ditemukan'], 404);

        $lama = $rows->first()->no_nota;
        if ($lama && str_starts_with($lama, 'POS-')) {
            return response()->json(['message' => 'Nota dari Kasir POS tidak bisa diubah nomornya di sini — ubah lewat layar Kasir POS.'], 422);
        }
        if ($rows->pluck('tgl')->unique()->count() > 1 || $rows->pluck('cabang')->unique()->count() > 1) {
            return response()->json(['message' => 'Baris-baris ini beda tanggal/cabang, tidak bisa disatukan dalam 1 nomor faktur.'], 422);
        }
        $ids = $rows->pluck('id')->all();
        $tgl = $rows->first()->tgl; $cabang = $rows->first()->cabang;

        // 1 no_nota = 1 tanggal + 1 cabang. Kalau nomor baru sudah dipakai nota lain
        // di tgl+cabang yang sama → digabung (mis. 2 nota TS dari 1 faktur supplier);
        // kalau beda tgl/cabang → tolak supaya tidak tercampur.
        $bentrok = DB::table('trx_beli')->where('no_nota', $baru)->whereNotIn('id', $ids)
            ->where(fn($w) => $w->where('tgl', '!=', $tgl)->orWhere('cabang', '!=', $cabang))->exists();
        if ($bentrok) {
            return response()->json(['message' => "No. faktur {$baru} sudah dipakai transaksi lain di tanggal/cabang berbeda."], 422);
        }
        if (DB::table('pos_nota')->where('no_nota', $baru)->exists()) {
            return response()->json(['message' => "No. faktur {$baru} sudah dipakai nota Kasir POS."], 422);
        }

        $mode = $data['ppn'] ?? 'auto';
        $upd = ['no_nota' => $baru, 'updated_at' => now()];
        if ($mode === 'auto') $upd['ppn'] = $this->ppnDariNoNota($baru);
        elseif ($mode !== 'tetap') $upd['ppn'] = $mode;

        DB::transaction(function () use ($ids, $upd, $lama, $baru) {
            foreach (array_chunk($ids, 500) as $chunk) {
                DB::table('trx_beli')->whereIn('id', $chunk)->update($upd);
            }
            if ($lama) DB::table('pos_nota')->where('no_nota', $lama)->update(['no_nota' => $baru, 'updated_at' => now()]);
        });

        // PPN mempengaruhi HPP → bangun ulang Kartu HPP barang di nota ini.
        $kodeList = $rows->pluck('kode_barang')->unique()->values();
        foreach ($kodeList as $kode) app(\App\Services\HppService::class)->rebuildItem((string) $kode);

        $ppnTxt = $upd['ppn'] ?? null;
        return response()->json([
            'message' => "No. faktur diubah ke {$baru} ({$rows->count()} baris)"
                . ($ppnTxt ? ", status PPN → {$ppnTxt}" : '')
                . ". Kartu HPP {$kodeList->count()} barang dihitung ulang.",
            'updated' => $rows->count(),
            'no_nota' => $baru,
            'ppn'     => $ppnTxt,
        ]);
    }

    // Tautkan pelanggan 1 baris import Penjualan ke Master Pelanggan, return KODE pelanggan
    // (atau null kalau baris tidak menyebut pelanggan). Urutan pencocokan:
    //   1. kolom "Kode Pelanggan" (kode persis di Master)
    //   2. kolom "Pelanggan" (nama, tanpa peduli huruf besar/kecil) → pelanggan pertama bernama itu
    //   3. belum ada → dibuat otomatis di Master (kode dari file, atau PLG-00001 dst)
    private function resolvePelangganImport(array $item, array &$cache, int &$baru): ?string
    {
        $kode = trim((string) ($item['pelanggan_kode'] ?? ''));
        $nama = trim((string) ($item['pelanggan'] ?? ''));
        if ($kode === '' && $nama === '') return null;

        $ck = mb_strtolower($kode . '|' . $nama);
        if (array_key_exists($ck, $cache)) return $cache[$ck];

        $hasil = null;
        if ($kode !== '') {
            $row = DB::table('pelanggan')->where('kode', $kode)->first();
            if ($row) $hasil = $row->kode;
        }
        if ($hasil === null && $nama !== '') {
            $row = DB::table('pelanggan')->whereRaw('LOWER(nama) = ?', [mb_strtolower($nama)])->orderBy('id')->first();
            if ($row) $hasil = $row->kode;
        }
        if ($hasil === null) {
            $namaBaru = $nama !== '' ? $nama : $kode;
            $kodeBaru = ($kode !== '' && mb_strlen($kode) <= 50) ? $kode : $this->kodePelangganBerikut();
            DB::table('pelanggan')->insert([
                'kode' => $kodeBaru, 'nama' => mb_substr($namaBaru, 0, 255), 'poin' => 0,
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $hasil = $kodeBaru;
            $baru++;
        }
        return $cache[$ck] = $hasil;
    }

    // Kode pelanggan otomatis berikutnya: PLG-00001, PLG-00002, …
    private function kodePelangganBerikut(): string
    {
        $maks = 0;
        foreach (DB::table('pelanggan')->where('kode', 'like', 'PLG-%')->pluck('kode') as $k) {
            $n = (int) substr($k, 4);
            if ($n > $maks) $maks = $n;
        }
        return 'PLG-' . str_pad((string) ($maks + 1), 5, '0', STR_PAD_LEFT);
    }

    // Menentukan no_nota final 1 baris import — lihat catatan panjang di atas
    // pemanggilnya. $tglCabangCache dipassing by-reference supaya baris2
    // berikutnya dalam batch yang sama tahu kombinasi tgl/cabang mana yang
    // sudah "memegang" no_nota tsb.
    private function resolveNoNotaImport(string $table, string $prefix, string $noNotaInput, string $tgl, string $cabang, array &$tglCabangCache, array &$noNotaCache): string
    {
        if ($noNotaInput === '') {
            return $this->generateNoTransaksiCached($table, 'no_nota', $prefix, $tgl, $noNotaCache);
        }

        $kombinasi = $tgl . '|' . $cabang;

        // Sudah pernah dipakai baris lain di batch ini dgn tgl+cabang SAMA → gabung (normal).
        if (($tglCabangCache[$noNotaInput] ?? null) === $kombinasi) {
            return $noNotaInput;
        }

        // Belum pernah dipakai di batch ini — cek juga ke data yang sudah ada di DB.
        if (!isset($tglCabangCache[$noNotaInput])) {
            $bentrokDb = DB::table($table)->where('no_nota', $noNotaInput)
                ->where(function ($q) use ($tgl, $cabang) {
                    $q->where('tgl', '!=', $tgl)->orWhere('cabang', '!=', $cabang);
                })->exists();
            if (!$bentrokDb) {
                $tglCabangCache[$noNotaInput] = $kombinasi;
                return $noNotaInput;
            }
        }

        // Bentrok — nomor ini sudah "dipegang" kombinasi tgl+cabang lain. Baris
        // ini tetap dianggap 1 nota tersendiri utk kombinasi tgl+cabang-nya,
        // jadi dikasih nomor baru yang unik (bukan gagal/skip).
        $altKey = 'X~' . $noNotaInput . '~' . $kombinasi;
        if (!isset($tglCabangCache[$altKey])) {
            $tglCabangCache[$altKey] = $this->generateNoTransaksiCached($table, 'no_nota', $prefix, $tgl, $noNotaCache);
        }
        return $tglCabangCache[$altKey];
    }

    // ─── PERBAIKAN NOMOR TRANSAKSI DOBEL (DATA LAMA) ─────────────────────────
    // Dipanggil dari tombol "🔧 Perbaiki Nomor Dobel" di halaman Transaksi.
    // Aturan: 1 no_nota HARUS cuma mewakili 1 nota = 1 tanggal + 1 cabang yang
    // sama. Kalau ditemukan no_nota yang dipakai baris dgn tanggal ATAU cabang
    // BERBEDA, berarti itu sebenarnya transaksi lain yang kebetulan kebagian
    // nomor sama (mis. dari import lama yang No. Referensi-nya di file sumber
    // ternyata tidak unik). Kombinasi tgl+cabang yang paling lama (id terkecil)
    // tetap pegang nomor asli; kombinasi lain otomatis dapat nomor baru unik.
    public function perbaikiNomorDobel()
    {
        $hasil = [];
        foreach ([['trx_jual', 'TXJ'], ['trx_beli', 'TXB']] as [$table, $prefix]) {
            $hasil[$table] = $this->perbaikiNomorDobelTabel($table, $prefix);
        }
        $totalNota  = array_sum(array_column($hasil, 'nota_diperbaiki'));
        $totalBaris = array_sum(array_column($hasil, 'baris_dipindah'));
        return response()->json([
            'message' => $totalNota > 0
                ? "Ditemukan {$totalNota} nomor transaksi dobel — {$totalBaris} baris otomatis dipindah ke nomor baru."
                : 'Tidak ditemukan nomor transaksi dobel. Semua sudah unik.',
            'detail'  => $hasil,
        ]);
    }

    private function perbaikiNomorDobelTabel(string $table, string $prefix): array
    {
        $rows = DB::table($table)->whereNotNull('no_nota')->where('no_nota', '!=', '')
            ->orderBy('id')->get(['id', 'no_nota', 'tgl', 'cabang']);

        $notaDiperbaiki = 0; $barisDipindah = 0; $cache = [];

        foreach ($rows->groupBy('no_nota') as $noNota => $groupRows) {
            $subGroups = $groupRows->groupBy(fn($r) => $r->tgl . '|' . $r->cabang);
            if ($subGroups->count() <= 1) continue; // aman — memang 1 nota utuh, bukan dobel

            $notaDiperbaiki++;
            $first = true;
            foreach ($subGroups as $sub) {
                if ($first) { $first = false; continue; } // kombinasi tgl+cabang paling lama tetap pakai nomor asli
                $contoh = $sub->first();
                $noBaru = $this->generateNoTransaksiCached($table, 'no_nota', $prefix, $contoh->tgl, $cache);
                DB::table($table)->whereIn('id', $sub->pluck('id')->all())->update(['no_nota' => $noBaru]);
                $barisDipindah += $sub->count();
            }
        }

        return ['nota_diperbaiki' => $notaDiperbaiki, 'baris_dipindah' => $barisDipindah];
    }

    // ─── SINKRONISASI / COMPARE DATA IMPORT ─────────────────────────────────
    // Dipakai dari menu "Cek Sinkronisasi": user upload ULANG file yang sama
    // dipakai buat Import Penjualan/Pembelian, lalu tiap barisnya dibandingkan
    // dengan yang SUDAH tersimpan di trx_jual/trx_beli. TIDAK menulis apa pun
    // ke database — murni pembanding/laporan. Tiap baris file diberi status:
    //   - masuk_ok           : ketemu transaksinya DAN ikut dihitung di Jurnal
    //   - masuk_tidak_jurnal : ketemu transaksinya, TAPI kode barangnya tidak
    //                          (lagi) terdaftar di Master Barang — buildJurnal()
    //                          di DashboardController pakai INNER JOIN ke tabel
    //                          `barang`, jadi baris begini tetap ada di Riwayat
    //                          Transaksi tapi "hilang" dari Jurnal & semua
    //                          laporan turunannya (Neraca, Laba Rugi, dll).
    //   - tidak_masuk        : sama sekali tidak ketemu transaksi yang cocok —
    //                          kemungkinan dilewati saat proses import dulu
    //                          (baris tanpa kode, atau utk Penjualan: stok
    //                          tidak cukup saat itu & "Stok Boleh Minus" mati).
    public function cekSinkronisasiJual(Request $request)
    {
        return $this->cekSinkronisasi($request, 'trx_jual', -1);
    }

    public function cekSinkronisasiBeli(Request $request)
    {
        return $this->cekSinkronisasi($request, 'trx_beli', 1);
    }

    private function cekSinkronisasi(Request $request, string $table, int $stokArah)
    {
        $request->validate([
            'cabang'      => 'required|string|exists:cabang,nama',
            'items'       => 'required|array|min:1',
            'items.*.tgl' => 'required|date',
        ]);

        $cabang = $request->cabang;
        $items  = $request->items;

        // Rentang tanggal dari file — supaya query pembanding cuma menyisir
        // periode yang relevan, bukan seluruh tabel transaksi.
        $tglList = array_column($items, 'tgl');
        $dari = min($tglList);
        $sampai = max($tglList);

        // Preload baris trx yang sudah ada di rentang tsb, dikelompokkan jadi
        // "bucket" berdasarkan tanda tangan tgl|kode|qty|harga. Tiap baris
        // file yang cocok "memakai" (pop) 1 id dari bucket-nya, supaya kalau
        // ada beberapa transaksi identik (sama tgl/kode/qty/harga) di file
        // maupun di database, jumlahnya tetap dicocokkan 1:1 dan tidak
        // dihitung dobel.
        $existing = DB::table($table)
            ->where('cabang', $cabang)
            ->whereDate('tgl', '>=', $dari)
            ->whereDate('tgl', '<=', $sampai)
            ->select('id', 'tgl', 'kode_barang', 'qty', 'harga')
            ->get();

        $bucket = [];
        foreach ($existing as $row) {
            $sig = $this->sigTrx($row->tgl, $row->kode_barang, $row->qty, $row->harga);
            $bucket[$sig][] = $row->id;
        }

        // Cache: apakah suatu kode barang terdaftar di Master saat ini —
        // dipakai berulang, jadi jangan query barang tiap baris.
        $masterCache = [];
        $terdaftarDiMaster = function (string $kode) use (&$masterCache) {
            if (!array_key_exists($kode, $masterCache)) {
                $masterCache[$kode] = DB::table('barang')->where('kode', $kode)->exists();
            }
            return $masterCache[$kode];
        };

        $hasil = [];
        $ringkasan = ['total' => 0, 'masuk_ok' => 0, 'masuk_tidak_jurnal' => 0, 'tidak_masuk' => 0];

        foreach ($items as $item) {
            $ringkasan['total']++;
            $kodeInput = trim($item['kode_barang'] ?? '');
            $qtyInput  = isset($item['qty']) && $item['qty'] !== '' ? (float) $item['qty'] : null;
            $hargaInput = (float) ($item['harga'] ?? 0);
            $tgl = $item['tgl'];

            $baris = [
                'tgl'         => $tgl,
                'kode_barang' => $kodeInput,
                'nama'        => $item['nama'] ?? '',
                'qty'         => $qtyInput,
                'harga'       => $hargaInput,
                'no_nota'     => $item['no_nota'] ?? '',
            ];

            // Dua kasus ini persis kondisi yang bikin baris DILEWATI SAAT
            // IMPORT (baik oleh parser file di frontend maupun oleh backend
            // importTrx) — jadi bisa langsung dipastikan tidak_masuk tanpa
            // perlu cek ke database sama sekali.
            if ($kodeInput === '') {
                $baris['status'] = 'tidak_masuk';
                $baris['alasan'] = 'Baris tanpa kode barang — otomatis dilewati saat proses import.';
                $ringkasan['tidak_masuk']++;
                $hasil[] = $baris;
                continue;
            }
            if ($qtyInput === null || $qtyInput <= 0) {
                $baris['status'] = 'tidak_masuk';
                $baris['alasan'] = 'Qty kosong / tidak valid — otomatis dilewati saat proses import.';
                $ringkasan['tidak_masuk']++;
                $hasil[] = $baris;
                continue;
            }

            // Samakan persis dengan logika importTrx(): cocokkan kode/barcode
            // ke Master, lalu konversi satuan (kalau baris menyebutkan
            // satuan) — supaya tanda tangan yang dicari sama persis dengan
            // yang dulu benar-benar disimpan ke tabel transaksi.
            $barang = $this->cariBarang($kodeInput);
            $kode   = $barang ? $barang->kode : $kodeInput;
            $konv   = $this->konversiSatuan($barang, $qtyInput, $hargaInput, $item['satuan'] ?? null);
            $qty    = $konv['qty'];
            $harga  = $konv['harga'];

            $sig = $this->sigTrx($tgl, $kode, $qty, $harga);
            if (!empty($bucket[$sig])) {
                array_shift($bucket[$sig]); // "pakai" satu baris DB untuk baris file ini
                if ($terdaftarDiMaster($kode)) {
                    $baris['status'] = 'masuk_ok';
                    $ringkasan['masuk_ok']++;
                } else {
                    $baris['status'] = 'masuk_tidak_jurnal';
                    $baris['alasan'] = "Kode barang \"{$kode}\" tidak (lagi) terdaftar di Master Barang, jadi transaksi ini tersimpan di Riwayat tapi TIDAK ikut dihitung di Jurnal & Laporan Keuangan.";
                    $ringkasan['masuk_tidak_jurnal']++;
                }
            } else {
                $baris['status'] = 'tidak_masuk';
                if (!$barang) {
                    $baris['alasan'] = 'Kode/barcode tidak ditemukan di Master Barang, dan tidak ada transaksi yang cocok di database — kemungkinan gagal/terlewat saat proses import.';
                } elseif ($stokArah < 0) {
                    $baris['alasan'] = 'Tidak ditemukan transaksi yang cocok — kemungkinan dilewati karena stok tidak cukup saat proses import (setting "Stok Boleh Minus" nonaktif), atau qty/harga di file berbeda dari yang tersimpan.';
                } else {
                    $baris['alasan'] = 'Tidak ditemukan transaksi yang cocok di database — kemungkinan gagal/terlewat saat proses import, atau qty/harga di file berbeda dari yang tersimpan.';
                }
                $ringkasan['tidak_masuk']++;
            }
            $hasil[] = $baris;
        }

        return response()->json(['ringkasan' => $ringkasan, 'detail' => $hasil]);
    }

    // Tanda tangan pembanding satu baris transaksi — dipakai untuk mencocokkan
    // baris file import dengan baris yang sudah tersimpan di database tanpa
    // perlu bergantung pada kolom id/no_nota (yang tidak ada di file asal).
    private function sigTrx($tgl, string $kode, float $qty, float $harga): string
    {
        $tglNorm = substr((string) $tgl, 0, 10); // buang bagian jam kalau ada, biar date vs datetime tetap sama
        return $tglNorm . '|' . $kode . '|' . round($qty, 3) . '|' . round($harga, 2);
    }

    // ─── BARANG TIDAK TERDETEKSI ────────────────────────────────────────────
    // Akar masalah "Riwayat Penjualan vs Laporan Laba Rugi beda angka": kalau
    // kode_barang di trx_jual/trx_beli TIDAK cocok dengan kode manapun di
    // Master Barang (baris disimpan tetap jalan & ditandai `tidak_dikenal`
    // saat input/import — lihat storeJual/storeBeli/importTrx), baris
    // tersebut TETAP muncul di Riwayat, tapi "hilang" total dari Jurnal &
    // semua laporan turunannya karena DashboardController::buildJurnal()
    // memakai INNER JOIN ke tabel barang, bukan LEFT JOIN. Method ini
    // men-scan langsung ke trx_jual/trx_beli (tidak perlu upload ulang file)
    // untuk menemukan & meringkas kode-kode barang yang bermasalah tsb.
    public function barangTidakTerdeteksi(Request $request)
    {
        $cabang = $request->get('cabang');
        $dari   = $request->get('dari');
        $sampai = $request->get('sampai');

        $scan = function (string $table) use ($cabang, $dari, $sampai) {
            $q = DB::table($table)
                ->whereNotExists(function ($sub) use ($table) {
                    $sub->select(DB::raw(1))->from('barang')
                        ->whereColumn('barang.kode', $table . '.kode_barang');
                });
            if ($cabang) $q->where('cabang', $cabang);
            if ($dari)   $q->where('tgl', '>=', $dari);
            if ($sampai) $q->where('tgl', '<=', $sampai);

            return $q->selectRaw('
                    kode_barang,
                    MAX(kode_asli) as kode_asli,
                    COUNT(*) as jumlah_transaksi,
                    SUM(qty) as total_qty,
                    SUM(qty*harga) as total_nilai,
                    SUM(qty*harga)/NULLIF(SUM(qty),0) as harga_rata,
                    MIN(tgl) as tgl_pertama,
                    MAX(tgl) as tgl_terakhir
                ')
                ->groupBy('kode_barang')
                ->orderByDesc('total_nilai')
                ->get();
        };

        $jual = $scan('trx_jual');
        $beli = $scan('trx_beli');
        $beliByKode = $beli->keyBy('kode_barang');

        // Kode yang muncul di Penjualan (prioritas utama, ini yang bikin
        // Laba Rugi meleset) — modal_usulan diambil dari rata-rata harga
        // Pembelian kode yang sama kalau riwayatnya ada, kalau tidak ada
        // dibiarkan 0 supaya jelas kelihatan perlu diisi manual.
        $items = $jual->map(function ($r) use ($beliByKode) {
            $b = $beliByKode->get($r->kode_barang);
            return [
                'kode_barang'       => $r->kode_barang,
                'nama_usulan'       => $r->kode_asli ?: $r->kode_barang,
                'jumlah_transaksi'  => (int) $r->jumlah_transaksi,
                'qty_terjual'       => (float) $r->total_qty,
                'omzet'             => (float) $r->total_nilai,
                'harga_jual_usulan' => round((float) $r->harga_rata, 2),
                'modal_usulan'      => $b ? round((float) $b->harga_rata, 2) : 0,
                'ada_riwayat_beli'  => (bool) $b,
                'tgl_pertama'       => $r->tgl_pertama,
                'tgl_terakhir'      => $r->tgl_terakhir,
            ];
        })->values();

        // Kode yang tidak dikenal tapi HANYA muncul di Pembelian (tidak
        // pernah terjual) — tetap ditampilkan terpisah supaya Jurnal
        // Pembelian & Stok-nya juga ikut benar, walau tidak berdampak ke
        // Laba Rugi Penjualan.
        $jualKode = $jual->pluck('kode_barang')->flip();
        $itemsBeliSaja = $beli->filter(fn($r) => !isset($jualKode[$r->kode_barang]))
            ->map(fn($r) => [
                'kode_barang'       => $r->kode_barang,
                'nama_usulan'       => $r->kode_asli ?: $r->kode_barang,
                'jumlah_transaksi'  => (int) $r->jumlah_transaksi,
                'qty_terjual'       => 0,
                'omzet'             => 0,
                'harga_jual_usulan' => round((float) $r->harga_rata, 2),
                'modal_usulan'      => round((float) $r->harga_rata, 2),
                'ada_riwayat_beli'  => true,
                'tgl_pertama'       => $r->tgl_pertama,
                'tgl_terakhir'      => $r->tgl_terakhir,
            ])->values();

        return response()->json([
            'items'                       => $items,
            'items_beli_saja'             => $itemsBeliSaja,
            'total_omzet_belum_tercatat'  => (float) $items->sum('omzet'),
        ]);
    }

    // Eksekusi tombol "Masukkan ke Master Barang" dari tab Barang Tidak
    // Terdeteksi. Sengaja pakai `kode` yang PERSIS SAMA dengan kode_barang
    // yang sudah tersimpan di trx_jual/trx_beli — begitu baris Master
    // Barang ini ada, INNER JOIN di buildJurnal() otomatis "menemukan"
    // transaksi lama tsb lagi, jadi baris trx_jual/trx_beli lama TIDAK
    // PERLU diedit satu-satu. Flag `tidak_dikenal` di baris lama ikut
    // dibersihkan supaya tampilan Riwayat Penjualan/Pembelian juga update.
    public function masukkanBarangTidakTerdeteksi(Request $request)
    {
        $request->validate([
            'items'                => 'required|array|min:1',
            'items.*.kode_barang'  => 'required|string|max:50',
            'items.*.nama'         => 'required|string|max:200',
            'items.*.kategori'     => 'nullable|string|max:100',
            'items.*.ppn'          => ['nullable', Rule::in(['Kena PPN', 'Non-PPN'])],
            'items.*.satuan1'      => 'nullable|string|max:20',
            'items.*.modal'        => 'nullable|numeric|min:0',
            'items.*.harga_jual'   => 'nullable|numeric|min:0',
        ]);

        $berhasil = [];
        $gagal = [];

        foreach ($request->items as $it) {
            $kode = trim($it['kode_barang']);
            if ($kode === '') {
                $gagal[] = ['kode_barang' => $kode, 'alasan' => 'Kode barang kosong'];
                continue;
            }
            if (DB::table('barang')->where('kode', $kode)->exists()) {
                $gagal[] = ['kode_barang' => $kode, 'alasan' => 'Sudah ada di Master Barang'];
                continue;
            }
            // Kode ini ternyata barcode/kode alternatif barang yang SUDAH ada → jangan dibuat
            // barang dobel; transaksinya cukup dicocokkan ke kode utamanya (tombol "Cocokkan Otomatis").
            $sudahAda = $this->cariBarang($kode);
            if ($sudahAda) {
                $gagal[] = ['kode_barang' => $kode, 'alasan' => "Sudah terdaftar sebagai kode {$sudahAda->kode} (kode ini barcode/alternatifnya) — pakai \"Cocokkan Otomatis\" supaya tidak jadi barang dobel"];
                continue;
            }

            DB::table('barang')->insert([
                'kode'         => $kode,
                'nama'         => trim($it['nama']) ?: $kode,
                'kategori'     => $it['kategori'] ?? null,
                'ppn'          => $it['ppn'] ?? 'Non-PPN',
                'satuan1'      => $it['satuan1'] ?? 'PCS',
                'isi'          => 1,
                'isi3'         => 1,
                'modal'        => (float) ($it['modal'] ?? 0),
                'harga_jual'   => (float) ($it['harga_jual'] ?? 0),
                'harga_grosir' => 0,
                'harga_cabang' => 0,
                'stok_min'     => 0,
                'stok_max'     => 0,
                'created_at'   => now(),
                'updated_at'   => now(),
            ]);

            // Bersihkan flag tidak_dikenal di baris transaksi lama yang
            // kodenya sama, supaya Riwayat Penjualan/Pembelian tidak lagi
            // menampilkan peringatan ⚠️ untuk baris-baris ini.
            DB::table('trx_jual')->where('kode_barang', $kode)->where('tidak_dikenal', true)
                ->update(['tidak_dikenal' => false, 'kode_asli' => null, 'updated_at' => now()]);
            DB::table('trx_beli')->where('kode_barang', $kode)->where('tidak_dikenal', true)
                ->update(['tidak_dikenal' => false, 'kode_asli' => null, 'updated_at' => now()]);

            $berhasil[] = ['kode_barang' => $kode, 'nama' => trim($it['nama'])];
        }

        // Daftarkan juga ke cabang-cabang tempat barang ini pernah bertransaksi,
        // supaya langsung muncul di Master Barang cabang tsb.
        \App\Services\BarangCabangService::daftarkanDariTransaksi(array_column($berhasil, 'kode_barang'));

        return response()->json([
            'message'  => count($berhasil) . ' barang berhasil dimasukkan ke Master Barang, ' . count($gagal) . ' dilewati.',
            'berhasil' => $berhasil,
            'gagal'    => $gagal,
        ]);
    }
    // Tombol "Cocokkan Otomatis" di Sinkronisasi Data ▸ Barang Tidak Terdeteksi
    // (dan dipanggil otomatis setelah Import Master Barang). Lihat penjelasan di
    // BarangCabangService::cocokkanTransaksiTidakDikenal().
    public function cocokkanBarangTidakTerdeteksi()
    {
        $r = \App\Services\BarangCabangService::cocokkanTransaksiTidakDikenal();
        $r['message'] = "{$r['dialihkan_ke_kode_master']} kode dicocokkan ke kode utama barang, "
            . "{$r['flag_dibersihkan']} baris dibersihkan dari tanda ⚠️, "
            . count($r['ambigu']) . " kode ambigu dilewati, {$r['masih_tidak_ada']} kode memang belum ada di Master Barang.";
        return response()->json($r);
    }
}
