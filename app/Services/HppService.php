<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * HppService — mesin Kartu HPP (moving average cost, PER CABANG)
 * ─────────────────────────────────────────────────────────────────────
 * Prinsip: HPP TIDAK PERNAH diambil dari `barang.modal` (yang cuma angka
 * manual/sekali-isi). HPP dihitung dari RIWAYAT ASLI barang masuk & keluar
 * di setiap cabang:
 *
 *   - Barang MASUK dengan harga tertentu → rata-rata baru dihitung:
 *       hpp_baru = (nilai_lama + qty_masuk × harga_masuk) / (qty_lama + qty_masuk)
 *     Kalau harga beli naik/turun dibanding sebelumnya, hasilnya otomatis
 *     ter-rata-rata di sini (bukan ditimpa).
 *   - Barang KELUAR memakai hpp rata-rata yang berlaku SAAT itu (tidak
 *     mengubah rata-rata), dicatat sebagai nilai HPP baris tersebut —
 *     inilah yang muncul di Jurnal & Laba Rugi.
 *   - PPN Masukan TIDAK ikut menaikkan HPP. `trx_beli.harga` disimpan
 *     TERMASUK PPN (harga di nota/faktur), persis seperti dipakai di
 *     Jurnal (DashboardController::buildJurnal — akun 1105 Persediaan
 *     didebet sebesar DPP saja, PPN Masukan-nya masuk akun 1106
 *     terpisah). Kalau baris Pembelian itu "Kena PPN" (override per
 *     baris trx_beli.ppn, fallback ke barang.ppn), harga yang dipakai
 *     utk hitung rata-rata di sini di-DPP-kan dulu (dibagi 1+tarif) —
 *     supaya Kartu HPP konsisten dgn Jurnal & tidak menghitung pajak
 *     yang sebenarnya bisa dikreditkan (bukan biaya) sebagai bagian
 *     dari harga pokok penjualan.
 *
 * Sumber data mengikuti persis sumber yang sudah dipakai fitur Kartu Stok
 * (StokController::kartuStok) supaya konsisten dengan saldo qty yang sudah
 * berjalan: trx_beli, trx_jual, trx_retur, barang_masuk, barang_keluar,
 * trx_mutasi (lama), mutasi_kirim/mutasi_kirim_detail (paket), dan
 * stok_opname_detail.
 *
 * rebuildItem() membangun ULANG dari nol kartu HPP satu kode barang setiap
 * kali ada transaksi yang menyentuh barang itu (dipanggil dari titik-titik
 * adjustStok/updateStok di controller terkait) — ini yang membuat sistem
 * ini otomatis ikut mengoreksi diri kalau ada transaksi lama yang diedit
 * atau dihapus, tanpa perlu logika tambah/kurang manual yang rawan meleset.
 *
 * ─── ATURAN TERBARU: HPP HANYA DARI PEMBELIAN ──────────────────────────
 * HPP hanya boleh terbentuk kalau barang itu SUDAH PERNAH dibeli
 * (Pembelian / Barang Masuk bersumber Pembelian Tunai, harga > 0):
 *   - Belum ada pembelian sama sekali  → HPP = 0.
 *   - HPP dari nota/kasir lama (trx_jual.hpp) & barang.modal TIDAK dipakai.
 *   - Baris 'Saldo Awal' / 'Saldo Awal Manual' (migrasi/input saldo awal) bukan
 *     pembelian → diabaikan.
 *   - Retur Jual / Opname (+) / Mutasi tanpa basis biaya tidak menambah
 *     stok bernilai (netral), supaya rata-rata tidak ter-dilusi.
 *   - Penjualan yang qty-nya melebihi stok hasil pembelian TIDAK membuat
 *     saldo jadi minus (di-nol-kan), supaya pembelian berikutnya tidak
 *     ter-rata-rata dengan "utang stok".
 *   - Kalau stok hasil pembelian habis/minus tapi barang itu pernah dibeli,
 *     dipakai harga rata-rata terakhir (bukan 0).
 * Ubah konstanta di bawah kalau perlu kembali ke perilaku lama.
 * ═══════════════════════════════════════════════════════════════════════
 */
class HppService
{
    /** true = HPP hanya dari Pembelian (lihat penjelasan di atas). */
    public const HANYA_DARI_PEMBELIAN = true;

    /** true = kalau cabang itu belum punya biaya sendiri tapi barangnya
     *  pernah dibeli (di cabang mana pun, tanggal ≤ penjualan), pakai harga
     *  beli terakhir itu. false = ketat per cabang (belum beli di cabang itu = 0). */
    public const PAKAI_HARGA_BELI_CABANG_LAIN = true;

    /** true = kalau barang itu PERNAH dibeli (tanggal berapa pun) tapi penjualannya
     *  terjadi SEBELUM pembelian pertama, HPP penjualan itu memakai rata-rata
     *  pembelian TERAWAL barang tsb (cabang yang sama dulu, kalau tidak ada baru
     *  cabang lain). Pembelian yang datang belakangan TIDAK mengubah HPP
     *  penjualan sebelumnya (rata-rata tetap berjalan menurut urutan tanggal).
     *  false = penjualan sebelum pembelian pertama → HPP 0. Barang yang SAMA
     *  SEKALI belum pernah dibeli selalu HPP 0, apa pun nilai konstanta ini. */
    public const PAKAI_PEMBELIAN_TERAWAL = true;

    /** Harga masuk utk sebuah event masuk. Return null = tidak ada basis
     *  biaya (tidak ikut dicatat di Kartu HPP). $lastBeli diisi kalau event
     *  ini adalah Pembelian berharga > 0. */
    private function hargaMasuk(array $e, array $mutasiHpp, float $hppSebelum, ?float &$lastBeli): ?float
    {
        $mutasi = $e['ref_tabel'] === 'mutasi_kirim_detail';
        $harga = $mutasi ? ($mutasiHpp[$e['ref_id']] ?? null) : ($e['harga'] ?? null);

        if (!$mutasi && in_array($e['ref_tabel'], ['trx_beli', 'barang_masuk'], true)
            && $harga !== null && $harga > 0) {
            $lastBeli = (float) $harga;   // PEMBELIAN asli
            return (float) $harga;
        }
        if ($mutasi && $harga !== null && $harga > 0) {
            return (float) $harga;        // biaya dibawa dari cabang asal (yang asalnya dari pembelian)
        }
        // Opname(+) dengan HPP yang diisi manual (boleh 0): dianggap "saldo awal
        // bernilai" seperti pembelian utk Kartu HPP, tapi jurnalnya tetap jurnal
        // opname (lihat DashboardController::buildJurnal), bukan jurnal pembelian.
        if (!$mutasi && $e['ref_tabel'] === 'stok_opname_detail' && $harga !== null) {
            return (float) $harga;
        }
        // Retur Jual / Opname(+) / Mutasi tanpa biaya / pembelian berharga 0:
        // netral di rata-rata berjalan; kalau belum ada basis biaya → null.
        return $hppSebelum > 0 ? $hppSebelum : null;
    }

    /** HPP per satuan utk event keluar. 0 = belum ada pembelian. */
    private function hargaKeluar(array $e, float $hppSebelum, ?float $lastHpp, ?float $lastBeli, ?float $beliAwal = null): float
    {
        if (!self::HANYA_DARI_PEMBELIAN && isset($e['harga_override'])) return (float) $e['harga_override'];
        if ($hppSebelum > 0) return $hppSebelum;
        if ($lastHpp !== null && $lastHpp > 0) return $lastHpp;
        if (self::PAKAI_HARGA_BELI_CABANG_LAIN && $lastBeli !== null && $lastBeli > 0) return $lastBeli;
        // Belum ada pembelian SEBELUM penjualan ini, tapi barangnya pernah dibeli
        // di tanggal lain → pakai rata-rata pembelian terawal (bukan 0).
        if (self::PAKAI_PEMBELIAN_TERAWAL && $beliAwal !== null && $beliAwal > 0) return $beliAwal;
        return 0.0;
    }

    /** Harga rata-rata pembelian pada TANGGAL TERAWAL tiap cabang + gabungan
     *  semua cabang (kunci '*'). Hanya Pembelian / Barang Masuk berharga > 0
     *  (Saldo Awal sudah dibuang di gatherEvents). Tanggal sesudahnya tidak ikut,
     *  jadi pembelian susulan tidak mengubah HPP penjualan yang lebih dulu. */
    private function hargaBeliTerawal($events): array
    {
        $acc = [];
        foreach ($events as $e) {
            if ($e['arah'] !== 'masuk' || !in_array($e['ref_tabel'], ['trx_beli', 'barang_masuk'], true)) continue;
            $h = (float) ($e['harga'] ?? 0); $q = (float) $e['qty'];
            if ($h <= 0 || $q <= 0) continue;
            foreach ([$e['cabang'], '*'] as $k) {
                if (!isset($acc[$k])) $acc[$k] = ['tgl' => $e['tgl'], 'q' => 0.0, 'n' => 0.0];
                if ($acc[$k]['tgl'] === $e['tgl']) { $acc[$k]['q'] += $q; $acc[$k]['n'] += $q * $h; }
            }
        }
        return array_map(fn($a) => $a['q'] > 0 ? $a['n'] / $a['q'] : 0.0, $acc);
    }

    /** Tarif PPN dari Settings (persen → desimal), default 11% — sumber yang
     *  sama persis dipakai DashboardController::getTarif() supaya Kartu HPP
     *  & Jurnal selalu konsisten. Public supaya bisa dipakai
     *  generateSaldoAwalPersediaan() utk memisah kembali porsi PPN Masukan
     *  dari nilai DPP shortfall. */
    public function getTarif(): float
    {
        $setting = DB::table('settings')->where('key', 'tarif_ppn')->first();
        return $setting ? (float) $setting->value / 100 : 0.11;
    }

    /** Bangun ulang kartu HPP utk SATU kode barang (semua cabang sekaligus,
     *  supaya Mutasi antar cabang tetap konsisten kronologisnya). */
    public function rebuildItem(string $kodeBarang): void
    {
        DB::table('hpp_kartu')->where('kode_barang', $kodeBarang)->delete();

        $events = $this->gatherEvents($kodeBarang);
        if ($events->isEmpty()) {
            // Tidak ada riwayat sama sekali → jangan sentuh barang.modal (biarkan
            // nilai manual yang ada, kalau memang belum pernah ada transaksi).
            return;
        }

        $beliAwal = $this->hargaBeliTerawal($events);
        $saldo = [];       // ['cabang' => ['qty'=>float, 'nilai'=>float]]
        $mutasiHpp = [];   // [mutasi_kirim_detail_id => hpp per satuan saat dikirim]
        $lastHpp = [];     // ['cabang' => rata-rata positif terakhir]
        $lastBeli = null;  // harga Pembelian terakhir (cabang mana pun)
        $rows = [];
        $urutan = 0;

        foreach ($events as $e) {
            $urutan++;
            $cab = $e['cabang'];
            if (!isset($saldo[$cab])) $saldo[$cab] = ['qty' => 0.0, 'nilai' => 0.0];
            $before = $saldo[$cab];
            $hppSebelum = $before['qty'] > 0.0001 ? $before['nilai'] / $before['qty'] : 0.0;

            $row = [
                'tgl' => $e['tgl'], 'urutan' => $urutan, 'cabang' => $cab, 'kode_barang' => $kodeBarang,
                'tipe' => $e['tipe'], 'ref_tabel' => $e['ref_tabel'], 'ref_id' => $e['ref_id'],
                'ref' => $e['ref'] ?? null, 'keterangan' => $e['ket'] ?? null,
                'qty_masuk' => 0, 'harga_masuk' => 0, 'qty_keluar' => 0, 'hpp_satuan' => 0,
                'nilai_masuk' => 0, 'nilai_keluar' => 0,
                'saldo_qty_sebelum' => round($before['qty'], 2),
                'saldo_nilai_sebelum' => round($before['nilai'], 2),
                'saldo_hpp_sebelum' => round($hppSebelum, 2),
                'created_at' => now(), 'updated_at' => now(),
            ];

            if ($e['arah'] === 'masuk') {
                $qty = (float) $e['qty'];
                $harga = $this->hargaMasuk($e, $mutasiHpp, $hppSebelum, $lastBeli);
                // Opname(+) saat stok sistem minus: hanya sebanyak qty fisik yang
                // benar-benar ada yang dinilai (qty minus sudah terjual lebih dulu)
                if ($harga !== null && isset($e['qty_nilai'])) $qty = (float) $e['qty_nilai'];

                if ($harga === null) {
                    // Belum ada basis biaya dari pembelian → qty ini tidak ikut
                    // dinilai (saldo tetap), supaya tidak mengencerkan rata-rata.
                    $row['qty_masuk'] = round($qty, 2);
                    $row['hpp_satuan'] = round($hppSebelum, 2);
                } else {
                    $nilaiMasuk = $qty * $harga;
                    $newQty = $before['qty'] + $qty;
                    $newNilai = $before['nilai'] + $nilaiMasuk;
                    $newHpp = $newQty > 0.0001 ? $newNilai / $newQty : 0.0;

                    $row['qty_masuk'] = round($qty, 2);
                    $row['harga_masuk'] = round($harga, 2);
                    $row['nilai_masuk'] = round($nilaiMasuk, 2);
                    $row['hpp_satuan'] = round($newHpp, 2);
                    $saldo[$cab] = ['qty' => $newQty, 'nilai' => $newNilai];
                }
            } else {
                $qty = (float) $e['qty'];
                // HPP = rata-rata hasil PEMBELIAN. Belum ada pembelian → 0.
                $hppPakai = $this->hargaKeluar($e, $hppSebelum, $lastHpp[$cab] ?? null, $lastBeli, $beliAwal[$cab] ?? ($beliAwal['*'] ?? null));
                $nilaiKeluar = $qty * $hppPakai;

                if ($before['qty'] > 0.0001 && $qty < $before['qty'] - 0.0001) {
                    $newQty = $before['qty'] - $qty;
                    $newNilai = $before['nilai'] - $qty * $hppSebelum;
                } else {
                    // melebihi stok hasil pembelian → saldo di-nol-kan (tidak minus)
                    $newQty = 0.0;
                    $newNilai = 0.0;
                }

                $row['qty_keluar'] = round($qty, 2);
                $row['hpp_satuan'] = round($hppPakai, 2);
                $row['nilai_keluar'] = round($nilaiKeluar, 2);
                $saldo[$cab] = ['qty' => $newQty, 'nilai' => $newNilai];

                if ($e['ref_tabel'] === 'mutasi_kirim_detail') {
                    // simpan HPP saat dikirim, supaya sisi "masuk" di cabang tujuan
                    // membawa NILAI YANG SAMA (0 = tidak ada basis biaya)
                    $mutasiHpp[$e['ref_id']] = $hppPakai;
                }
            }

            $after = $saldo[$cab];
            if ($after['qty'] > 0.0001 && $after['nilai'] > 0) $lastHpp[$cab] = $after['nilai'] / $after['qty'];
            $row['saldo_qty'] = round($after['qty'], 2);
            $row['saldo_nilai'] = round($after['nilai'], 2);
            $row['saldo_hpp'] = round($after['qty'] > 0.0001 ? $after['nilai'] / $after['qty'] : 0.0, 2);

            $rows[] = $row;
        }

        foreach (array_chunk($rows, 500) as $chunk) {
            DB::table('hpp_kartu')->insert($chunk);
        }

        // Sinkronkan barang.modal = HPP rata-rata GABUNGAN semua cabang TERKINI,
        // murni sebagai angka tampilan/kompatibilitas (Analisis Margin, dsb) —
        // bukan lagi sumber, melainkan HASIL dari Kartu HPP ini.
        $qtyGlobal = array_sum(array_column($saldo, 'qty'));
        $nilaiGlobal = array_sum(array_column($saldo, 'nilai'));
        if ($qtyGlobal > 0.0001) {
            DB::table('barang')->where('kode', $kodeBarang)->update([
                'modal' => round($nilaiGlobal / $qtyGlobal, 2),
                'updated_at' => now(),
            ]);
        }
    }

    /** Bangun ulang SEMUA barang yang pernah punya pergerakan stok. Dipakai untuk
     *  backfill awal / recovery, lewat `php artisan hpp:rebuild`. */
    public function rebuildAll(?callable $onProgress = null): int
    {
        $kodeList = collect()
            ->merge(DB::table('trx_beli')->distinct()->pluck('kode_barang'))
            ->merge(DB::table('trx_jual')->distinct()->pluck('kode_barang'))
            ->merge(DB::table('trx_retur')->distinct()->pluck('kode_barang'))
            ->merge(DB::table('barang_masuk')->distinct()->pluck('kode_barang'))
            ->merge(DB::table('barang_keluar')->distinct()->pluck('kode_barang'))
            ->merge(DB::table('trx_mutasi')->distinct()->pluck('kode_barang'))
            ->merge(DB::table('mutasi_kirim_detail')->distinct()->pluck('kode_barang'))
            ->merge(DB::table('stok_opname_detail')->distinct()->pluck('kode_barang'))
            ->filter()->unique()->values();

        foreach ($kodeList as $i => $kode) {
            $this->rebuildItem($kode);
            if ($onProgress) $onProgress($i + 1, $kodeList->count(), $kode);
        }
        return $kodeList->count();
    }

    /** Saldo HPP terkini. $cabang null = digabung semua cabang (weighted). */
    public function saldo(string $kodeBarang, ?string $cabang = null): array
    {
        $q = DB::table('hpp_kartu')->where('kode_barang', $kodeBarang);
        if ($cabang) $q->where('cabang', $cabang);

        if ($cabang) {
            $last = (clone $q)->orderByDesc('tgl')->orderByDesc('urutan')->first();
            return [
                'qty' => (float) ($last->saldo_qty ?? 0),
                'nilai' => (float) ($last->saldo_nilai ?? 0),
                'hpp' => (float) ($last->saldo_hpp ?? 0),
            ];
        }

        // Gabungan semua cabang: ambil baris TERAKHIR per cabang, lalu jumlahkan.
        $perCabang = DB::table('hpp_kartu')
            ->where('kode_barang', $kodeBarang)
            ->select('cabang', 'tgl', 'urutan', 'saldo_qty', 'saldo_nilai')
            ->orderBy('cabang')->orderByDesc('tgl')->orderByDesc('urutan')
            ->get()->groupBy('cabang')->map->first();

        $qty = (float) $perCabang->sum('saldo_qty');
        $nilai = (float) $perCabang->sum('saldo_nilai');
        return ['qty' => $qty, 'nilai' => $nilai, 'hpp' => $qty > 0.0001 ? $nilai / $qty : 0.0];
    }

    /** Riwayat kartu HPP (terbaru dulu) utk ditampilkan saat item diklik. */
    public function riwayat(string $kodeBarang, ?string $cabang = null, int $limit = 300)
    {
        $q = DB::table('hpp_kartu')->where('kode_barang', $kodeBarang);
        if ($cabang) $q->where('cabang', $cabang);
        return $q->orderByDesc('tgl')->orderByDesc('urutan')->limit($limit)->get();
    }

    /** Cari nilai HPP (total, bukan per satuan) sebuah baris keluar berdasarkan
     *  tabel & id sumbernya — dipakai DashboardController::buildJurnal. */
    public function hppMapUntukJurnal(string $refTabel, array $refIds): array
    {
        if (empty($refIds)) return [];
        return DB::table('hpp_kartu')
            ->where('ref_tabel', $refTabel)->whereIn('ref_id', $refIds)
            ->where('qty_keluar', '>', 0)
            ->pluck('nilai_keluar', 'ref_id')->toArray();
    }

    /** Nilai HPP baris MASUK (mis. Retur Jual: barang kembali ke gudang) berdasarkan
     *  tabel & id sumbernya. Retur Jual itu event 'masuk' (qty_masuk), jadi TIDAK
     *  terambil oleh hppMapUntukJurnal() yang hanya membaca baris 'keluar' —
     *  akibatnya HPP Retur Jual dulu tidak pernah ikut jurnal. */
    public function hppMasukUntukJurnal(string $refTabel, array $refIds): array
    {
        if (empty($refIds)) return [];
        return DB::table('hpp_kartu')
            ->where('ref_tabel', $refTabel)->whereIn('ref_id', $refIds)
            ->where('qty_masuk', '>', 0)
            ->pluck('nilai_masuk', 'ref_id')->toArray();
    }

    /** Nilai persediaan (Rp) yang DIKIRIM pada tiap baris Mutasi (keluar dari
     *  cabang asal) = qty_kirim × HPP rata-rata saat dikirim. 0 = barang belum
     *  pernah dibeli (tidak ada nilai → tidak ikut jurnal). Dipakai buildJurnal()
     *  utk jurnal Mutasi Barang antar cabang.
     *  $refTabel: 'mutasi_kirim_detail' (paket) | 'trx_mutasi' (lama). */
    public function nilaiKirimMutasi(string $refTabel, array $refIds): array
    {
        if (empty($refIds)) return [];
        return DB::table('hpp_kartu')
            ->where('ref_tabel', $refTabel)->whereIn('ref_id', $refIds)
            ->where('qty_keluar', '>', 0)
            ->get(['ref_id', 'nilai_keluar', 'qty_keluar'])
            ->mapWithKeys(fn($r) => [$r->ref_id => [
                'nilai' => (float) $r->nilai_keluar,
                'satuan' => (float) $r->qty_keluar > 0 ? (float) $r->nilai_keluar / (float) $r->qty_keluar : 0.0,
            ]])->toArray();
    }

    /** Nilai (bertanda) Kartu HPP utk baris Opname — dipakai jurnal selisih
     *  stok opname (bisa masuk/qty+ maupun keluar/qty- tergantung selisih). */
    public function hppNilaiOpname(array $refIds): array
    {
        if (empty($refIds)) return [];
        return DB::table('hpp_kartu')
            ->where('ref_tabel', 'stok_opname_detail')->whereIn('ref_id', $refIds)
            ->get()->keyBy('ref_id')
            ->map(fn($r) => $r->qty_masuk > 0 ? (float) $r->nilai_masuk : -(float) $r->nilai_keluar)
            ->toArray();
    }

    /** Deteksi kekurangan Saldo Awal per cabang utk SATU kode barang — dipakai
     *  generateSaldoAwalPersediaan() utk barang yang HPP-nya diimpor dari
     *  laporan kasir lama (kolom HPP di Template Import Penjualan) tapi TIDAK
     *  PERNAH punya riwayat Pembelian/Barang Masuk di sistem ini. Tanpa baris
     *  "masuk" apa pun, akun Persediaan (1105) akan terus dikredit oleh
     *  Penjualan sampai minus. Cara membenarkannya BUKAN menaikkan HPP (itu
     *  akan membebani PPN Masukan ke Laba Rugi lagi — sudah benar dibersihkan
     *  di gatherEvents()), melainkan mengakui nilai stok yang sudah terlanjur
     *  ada lewat 1 baris Saldo Awal, SEBESAR titik saldo paling minus yang
     *  pernah dicapai sepanjang riwayat kronologis barang itu — supaya
     *  sesudah baris itu disisipkan di paling awal, saldo tidak pernah minus
     *  lagi di titik manapun sepanjang riwayat.
     *
     *  Return per cabang: ['tgl' => tanggal event PERTAMA cabang itu (baris
     *  Saldo Awal akan ditanggali 1 hari sebelum ini), 'qty' => qty
     *  kekurangan, 'nilai' => nilai kekurangan (DPP-only, sudah bersih PPN
     *  Masukan sejak dari override HPP)] — HANYA cabang yang benar-benar
     *  kekurangan (nilai minus melewati Rp 0) yang di-return. */
    public function deteksiKekuranganSaldoAwal(string $kodeBarang): array
    {
        $events = $this->gatherEvents($kodeBarang);
        if ($events->isEmpty()) return [];

        // Simulasi SAMA dengan rebuildItem() (HPP hanya dari pembelian, saldo
        // tidak minus). Kekurangan = bagian penjualan/keluar yang melebihi stok
        // hasil pembelian TAPI sudah punya HPP (> 0) — itu yang membuat akun
        // Persediaan (1105) terkredit lebih besar dari yang pernah didebet.
        // Barang yang belum pernah dibeli → HPP 0 → tidak ada kekurangan.
        $beliAwal = $this->hargaBeliTerawal($events);
        $saldo = [];
        $lastHpp = [];
        $lastBeli = null;
        $mutasiHpp = [];
        $kurang = [];    // ['cabang' => ['qty'=>float, 'nilai'=>float, 'tgl'=>string]]

        foreach ($events as $e) {
            $cab = $e['cabang'];
            if (!isset($saldo[$cab])) $saldo[$cab] = ['qty' => 0.0, 'nilai' => 0.0];
            if (!isset($kurang[$cab])) $kurang[$cab] = ['qty' => 0.0, 'nilai' => 0.0, 'tgl' => $e['tgl']];
            $before = $saldo[$cab];
            $hppSebelum = $before['qty'] > 0.0001 ? $before['nilai'] / $before['qty'] : 0.0;

            if ($e['arah'] === 'masuk') {
                $qty = (float) $e['qty'];
                $harga = $this->hargaMasuk($e, $mutasiHpp, $hppSebelum, $lastBeli);
                if ($harga !== null) {
                    $saldo[$cab] = ['qty' => $before['qty'] + $qty, 'nilai' => $before['nilai'] + $qty * $harga];
                }
            } else {
                $qty = (float) $e['qty'];
                $hppPakai = $this->hargaKeluar($e, $hppSebelum, $lastHpp[$cab] ?? null, $lastBeli, $beliAwal[$cab] ?? ($beliAwal['*'] ?? null));
                $tersedia = $before['qty'] > 0.0001 ? $before['qty'] : 0.0;
                if ($qty < $tersedia - 0.0001) {
                    $saldo[$cab] = ['qty' => $before['qty'] - $qty, 'nilai' => $before['nilai'] - $qty * $hppSebelum];
                } else {
                    if ($hppPakai > 0) {
                        $lebih = $qty - $tersedia;
                        $kurang[$cab]['qty'] += $lebih;
                        $kurang[$cab]['nilai'] += $lebih * $hppPakai;
                    }
                    $saldo[$cab] = ['qty' => 0.0, 'nilai' => 0.0];
                }
                if ($e['ref_tabel'] === 'mutasi_kirim_detail') $mutasiHpp[$e['ref_id']] = $hppPakai;
            }

            $after = $saldo[$cab];
            if ($after['qty'] > 0.0001 && $after['nilai'] > 0) $lastHpp[$cab] = $after['nilai'] / $after['qty'];
        }

        $hasil = [];
        foreach ($kurang as $cab => $m) {
            if ($m['nilai'] > 0.01 && $m['qty'] > 0) {
                $hasil[$cab] = ['tgl' => $m['tgl'], 'qty' => round($m['qty'], 2), 'nilai' => round($m['nilai'], 2)];
            }
        }
        return $hasil;
    }

    /** Generate/refresh baris Barang Masuk "Saldo Awal Persediaan" (sumber =
     *  'Saldo Awal') utk SEMUA barang yang kekurangan riwayat Pembelian di
     *  sistem ini — supaya akun 1105 (Persediaan) tidak minus di Neraca &
     *  Laba Rugi tetap benar (HPP tetap DPP-only, tidak berubah). Lihat
     *  komentar migration add_sumber_barang_masuk_dan_coa_saldo_awal & akun
     *  3103 di COA utk penjelasan kenapa desain ini yang dipakai.
     *
     *  Nilai kekurangan (dari deteksiKekuranganSaldoAwal, dihitung dari HPP
     *  impor yang SUDAH di-DPP-kan) dipisah lagi jadi 2 baris jurnal, BUKAN
     *  digabung jadi satu:
     *    - Dr 1105 (Persediaan)   = nilai DPP shortfall — ini yg nanti
     *      "habis" persis sebesar HPP saat barang itu terjual (sudah
     *      cocok/balance dgn cara HPP dihitung di Laba Rugi).
     *    - Dr 1106 (PPN Masukan)  = nilai_DPP × tarif_ppn — porsi pajak yg
     *      sudah pernah dibayar saat beli dulu, dikembalikan sebagai ASET
     *      TERSENDIRI (bukan ikut ditumpuk ke Persediaan), supaya kelihatan
     *      jelas di Neraca & BISA dikreditkan/dikompensasi thd PPN Keluaran
     *      kalau memang belum pernah diklaim.
     *    - Cr 3103 (Modal Saldo Awal) = jumlah keduanya — pengakuan modal
     *      migrasi, TIDAK menyentuh Laba Rugi sama sekali.
     *
     *  AMAN dijalankan berulang: baris Saldo Awal LAMA (auto-generated,
     *  sumber = 'Saldo Awal') dihapus dulu sebelum dihitung ulang dari
     *  histori ASLI (trx_beli/trx_jual/dst) — supaya deteksinya tidak ikut
     *  baris Saldo Awal lama (dobel), dan otomatis menyesuaikan turun kalau
     *  ada Import Pembelian susulan yang mengurangi/menghapus kekurangannya. */
    public function generateSaldoAwalPersediaan(?callable $onProgress = null): array
    {
        $tarif = $this->getTarif();
        $lama = DB::table('barang_masuk')->where('sumber', 'Saldo Awal')->pluck('kode_barang')->unique();
        DB::table('barang_masuk')->where('sumber', 'Saldo Awal')->delete();

        $kodeList = DB::table('trx_jual')->distinct()->pluck('kode_barang')
            ->merge($lama)->filter()->unique()->values();

        $rows = [];
        $totalDpp = 0.0;
        $totalPpn = 0.0;
        $barangDisentuh = 0;

        foreach ($kodeList as $i => $kode) {
            $kurang = $this->deteksiKekuranganSaldoAwal($kode);
            $adaKurang = false;
            foreach ($kurang as $cabang => $k) {
                if ($k['qty'] <= 0 || $k['nilai'] <= 0) continue;
                $tglAwal = date('Y-m-d', strtotime($k['tgl'] . ' -1 day'));
                $dpp = $k['nilai'];
                $ppnMasukan = round($dpp * $tarif, 2);
                $rows[] = [
                    'no_dok' => null, 'tgl' => $tglAwal, 'cabang' => $cabang, 'kode_barang' => $kode,
                    'satuan' => 'PCS', 'qty' => $k['qty'], 'harga_beli' => round($dpp / $k['qty'], 2),
                    'ppn_masukan' => $ppnMasukan,
                    'sumber' => 'Saldo Awal', 'supplier' => null,
                    'keterangan' => 'Saldo Awal Persediaan (migrasi otomatis dari histori Penjualan — HPP sudah bersih PPN Masukan, PPN Masukan diakui terpisah di 1106; lihat generateSaldoAwalPersediaan)',
                    'created_at' => now(), 'updated_at' => now(),
                ];
                $totalDpp += $dpp;
                $totalPpn += $ppnMasukan;
                $adaKurang = true;
            }
            if ($adaKurang) $barangDisentuh++;
            if ($onProgress) $onProgress($i + 1, $kodeList->count(), $kode);
        }

        foreach (array_chunk($rows, 300) as $chunk) {
            DB::table('barang_masuk')->insert($chunk);
        }

        // Bangun ulang Kartu HPP semua kode yang tersentuh (baik yang barusan
        // ditambah/diubah baris Saldo Awal-nya, maupun yang barusan DIHAPUS
        // korek­sinya karena sudah tidak kekurangan lagi) supaya hpp_kartu &
        // saldo langsung konsisten dengan baris Barang Masuk yang baru.
        // (ppn_masukan TIDAK ikut dipakai HppService — kolom itu murni utk
        // buildJurnal(), Kartu HPP hanya peduli qty & harga_beli/DPP.)
        foreach ($kodeList as $kode) {
            $this->rebuildItem($kode);
        }

        return [
            'barang_disentuh' => $barangDisentuh,
            'baris_dibuat'    => count($rows),
            'total_dpp'       => round($totalDpp, 2),
            'total_ppn_masukan' => round($totalPpn, 2),
            'total_nilai'     => round($totalDpp + $totalPpn, 2),
        ];
    }

    // ─── Kumpulkan seluruh event pergerakan 1 kode barang, siap-urut ──────
    private function gatherEvents(string $kodeBarang)
    {
        $events = collect();

        // rank menentukan urutan proses DALAM tanggal yang sama: barang masuk
        // (menaikkan/menurunkan rata-rata) diproses dulu, baru barang keluar
        // (memakai rata-rata yang sudah ter-update hari itu) — konvensi standar
        // kartu stok. Mutasi Keluar SELALU sebelum Mutasi Masuk pasangannya.
        $RANK_BELI = 0; $RANK_BARANG_MASUK = 1; $RANK_RETUR_JUAL = 2; $RANK_OPNAME_PLUS = 3;
        $RANK_MUTASI_KELUAR = 4; $RANK_MUTASI_MASUK = 5;
        $RANK_JUAL = 6; $RANK_BARANG_KELUAR = 7; $RANK_RETUR_BELI = 8; $RANK_OPNAME_MINUS = 9;

        $tarif = $this->getTarif();
        DB::table('trx_beli')->join('barang', 'trx_beli.kode_barang', '=', 'barang.kode')
            ->where('trx_beli.kode_barang', $kodeBarang)->orderBy('trx_beli.id')
            ->select('trx_beli.*', 'barang.ppn as ppn_master')->get()
            ->each(function ($r) use (&$events, $RANK_BELI, $tarif) {
                // Override per baris (trx_beli.ppn) diutamakan, fallback ke Master
                // Barang — sama seperti dipakai buildJurnal(). Kalau Kena PPN, harga
                // yang masuk faktur (termasuk PPN Masukan) di-DPP-kan dulu supaya
                // HPP TIDAK ikut naik gara-gara pajak yang bisa dikreditkan.
                $kena  = ($r->ppn ?: $r->ppn_master) === 'Kena PPN';
                $harga = $kena ? (float) $r->harga / (1 + $tarif) : (float) $r->harga;
                $events->push(['tgl' => $r->tgl, 'rank' => $RANK_BELI, 'id' => $r->id, 'arah' => 'masuk',
                    'cabang' => $r->cabang, 'qty' => (float) $r->qty, 'harga' => $harga,
                    'tipe' => 'Pembelian', 'ref_tabel' => 'trx_beli', 'ref_id' => $r->id,
                    'ref' => $r->no_nota ?: ('PB-' . $r->id), 'ket' => 'Pembelian' . ($kena ? ' (harga sudah dikurangi PPN Masukan)' : '')]);
            });

        DB::table('trx_jual')->join('barang', 'trx_jual.kode_barang', '=', 'barang.kode')
            ->where('trx_jual.kode_barang', $kodeBarang)->orderBy('trx_jual.id')
            ->select('trx_jual.*', 'barang.ppn as ppn_master')->get()
            ->each(function ($r) use (&$events, $RANK_JUAL, $tarif) {
                // `hpp` di trx_jual (kalau > 0) HPP OTORITATIF dari nota asli
                // (mis. hasil Sinkronisasi SID, atau Import Penjualan yang
                // menyertakan kolom HPP dari laporan kasir lama) — dihormati
                // sebagai override per-satuan, tidak dihitung ulang dari
                // rata-rata Kartu HPP.
                //
                // PENTING: persis seperti `trx_beli.harga` di atas, HPP dari
                // sumber-sumber ini (laporan kasir lama / SID) BIASANYA masih
                // TERMASUK PPN Masukan (harga beli di nota asli, sebelum
                // dipisah pajak yang bisa dikreditkan). Kalau baris Penjualan
                // ini "Kena PPN" (override per baris trx_jual.ppn, fallback ke
                // barang.ppn — sama seperti dipakai buildJurnal), DPP-kan dulu
                // sebelum dipakai sebagai HPP — supaya Kartu HPP & Laba Rugi
                // TIDAK ikut membebankan PPN Masukan yang seharusnya cuma
                // mengurangi utang PPN, bukan menambah harga pokok penjualan.
                $hppSatuan = (($r->hpp ?? 0) > 0 && (float) $r->qty > 0)
                    ? (float) $r->hpp / (float) $r->qty : null;
                $kena = ($r->ppn ?: $r->ppn_master) === 'Kena PPN';
                $override = ($hppSatuan !== null && $kena) ? $hppSatuan / (1 + $tarif) : $hppSatuan;
                $events->push(['tgl' => $r->tgl, 'rank' => $RANK_JUAL, 'id' => $r->id, 'arah' => 'keluar',
                    'cabang' => $r->cabang, 'qty' => (float) $r->qty, 'harga_override' => $override,
                    'tipe' => 'Penjualan', 'ref_tabel' => 'trx_jual', 'ref_id' => $r->id,
                    'ref' => $r->no_nota ?: ('PJ-' . $r->id),
                    'ket' => 'Penjualan' . (!self::HANYA_DARI_PEMBELIAN && $kena && $hppSatuan !== null ? ' (HPP sudah dikurangi PPN Masukan)' : '')]);
            });

        DB::table('trx_retur')->where('kode_barang', $kodeBarang)->orderBy('id')->get()
            ->each(function ($r) use (&$events, $RANK_RETUR_JUAL, $RANK_RETUR_BELI) {
                if ($r->jenis === 'Jual') {
                    $events->push(['tgl' => $r->tgl, 'rank' => $RANK_RETUR_JUAL, 'id' => $r->id, 'arah' => 'masuk',
                        'cabang' => $r->cabang, 'qty' => (float) $r->qty, 'harga' => null,
                        'tipe' => 'Retur Jual', 'ref_tabel' => 'trx_retur', 'ref_id' => $r->id,
                        'ref' => 'RT-' . $r->id, 'ket' => 'Retur Jual (barang kembali)']);
                } else {
                    $events->push(['tgl' => $r->tgl, 'rank' => $RANK_RETUR_BELI, 'id' => $r->id, 'arah' => 'keluar',
                        'cabang' => $r->cabang, 'qty' => (float) $r->qty,
                        'tipe' => 'Retur Beli', 'ref_tabel' => 'trx_retur', 'ref_id' => $r->id,
                        'ref' => 'RT-' . $r->id, 'ket' => 'Retur Beli (kembali ke supplier)']);
                }
            });

        DB::table('barang_masuk')->where('kode_barang', $kodeBarang)->orderBy('id')->get()
            ->each(function ($r) use (&$events, $RANK_BARANG_MASUK) {
                // 'Saldo Awal' (migrasi otomatis) BUKAN pembelian → tidak ikut HPP.
                if (self::HANYA_DARI_PEMBELIAN && str_starts_with((string) ($r->sumber ?? ''), 'Saldo Awal')) return; // 'Saldo Awal' & 'Saldo Awal Manual'
                $events->push(['tgl' => $r->tgl, 'rank' => $RANK_BARANG_MASUK, 'id' => $r->id, 'arah' => 'masuk',
                    'cabang' => $r->cabang, 'qty' => (float) $r->qty, 'harga' => (float) $r->harga_beli,
                    'tipe' => 'Barang Masuk', 'ref_tabel' => 'barang_masuk', 'ref_id' => $r->id,
                    'ref' => $r->no_dok ?: ('BM-' . $r->id), 'ket' => $r->supplier ? ('Dari ' . $r->supplier) : ($r->keterangan ?? '-')]);
            });

        DB::table('barang_keluar')->where('kode_barang', $kodeBarang)->orderBy('id')->get()
            ->each(function ($r) use (&$events, $RANK_BARANG_KELUAR) {
                $events->push(['tgl' => $r->tgl, 'rank' => $RANK_BARANG_KELUAR, 'id' => $r->id, 'arah' => 'keluar',
                    'cabang' => $r->cabang, 'qty' => (float) $r->qty,
                    'tipe' => 'Barang Keluar (' . $r->jenis . ')', 'ref_tabel' => 'barang_keluar', 'ref_id' => $r->id,
                    'ref' => $r->no_dok ?: ('BK-' . $r->id), 'ket' => $r->jenis . ($r->keterangan ? (' — ' . $r->keterangan) : '')]);
            });

        // Mutasi lama (trx_mutasi, 1 baris = 1 barang) — masih didukung utk data lama
        DB::table('trx_mutasi')->where('kode_barang', $kodeBarang)->orderBy('id')->get()
            ->each(function ($r) use (&$events, $RANK_MUTASI_KELUAR, $RANK_MUTASI_MASUK) {
                $events->push(['tgl' => $r->tgl, 'rank' => $RANK_MUTASI_KELUAR, 'id' => $r->id, 'arah' => 'keluar',
                    'cabang' => $r->dari_cabang, 'qty' => (float) $r->qty,
                    'tipe' => 'Mutasi Keluar', 'ref_tabel' => 'trx_mutasi', 'ref_id' => $r->id,
                    'ref' => 'MT-' . $r->id, 'ket' => 'Mutasi ke ' . $r->ke_cabang]);
                $events->push(['tgl' => $r->tgl, 'rank' => $RANK_MUTASI_MASUK, 'id' => $r->id, 'arah' => 'masuk',
                    'cabang' => $r->ke_cabang, 'qty' => (float) $r->qty, 'harga' => null,
                    'tipe' => 'Mutasi Masuk', 'ref_tabel' => 'trx_mutasi', 'ref_id' => $r->id,
                    'ref' => 'MT-' . $r->id, 'ket' => 'Mutasi dari ' . $r->dari_cabang]);
            });

        // Mutasi paket (mutasi_kirim + detail) — alur kirim → konfirmasi
        DB::table('mutasi_kirim_detail')
            ->join('mutasi_kirim', 'mutasi_kirim_detail.mutasi_kirim_id', '=', 'mutasi_kirim.id')
            ->where('mutasi_kirim_detail.kode_barang', $kodeBarang)
            ->where('mutasi_kirim.status', '!=', 'Dibatalkan')
            ->select('mutasi_kirim_detail.*', 'mutasi_kirim.no_ref', 'mutasi_kirim.tgl', 'mutasi_kirim.dari_cabang',
                'mutasi_kirim.ke_cabang', 'mutasi_kirim.status', 'mutasi_kirim.waktu_terima')
            ->orderBy('mutasi_kirim_detail.id')->get()
            ->each(function ($r) use (&$events, $RANK_MUTASI_KELUAR, $RANK_MUTASI_MASUK) {
                $events->push(['tgl' => $r->tgl, 'rank' => $RANK_MUTASI_KELUAR, 'id' => $r->id, 'arah' => 'keluar',
                    'cabang' => $r->dari_cabang, 'qty' => (float) $r->qty_kirim,
                    'tipe' => 'Mutasi Keluar', 'ref_tabel' => 'mutasi_kirim_detail', 'ref_id' => $r->id,
                    'ref' => $r->no_ref, 'ket' => 'Mutasi (paket) ke ' . $r->ke_cabang]);

                $sudahKonfirmasi = in_array($r->status, ['Selesai', 'Selesai (Ada Selisih)']);
                if ($sudahKonfirmasi && (float) $r->qty_diterima != 0) {
                    $tglMasuk = $r->waktu_terima ? substr($r->waktu_terima, 0, 10) : $r->tgl;
                    $events->push(['tgl' => $tglMasuk, 'rank' => $RANK_MUTASI_MASUK, 'id' => $r->id, 'arah' => 'masuk',
                        'cabang' => $r->ke_cabang, 'qty' => (float) $r->qty_diterima, 'harga' => null,
                        'tipe' => 'Mutasi Masuk', 'ref_tabel' => 'mutasi_kirim_detail', 'ref_id' => $r->id,
                        'ref' => $r->no_ref, 'ket' => 'Mutasi (paket) dari ' . $r->dari_cabang]);
                }
            });

        // Stok Opname yang sudah Selesai
        DB::table('stok_opname_detail')
            ->join('stok_opname', 'stok_opname_detail.opname_id', '=', 'stok_opname.id')
            ->where('stok_opname_detail.kode_barang', $kodeBarang)
            ->where('stok_opname.status', 'Selesai')
            ->select('stok_opname_detail.*', 'stok_opname.tgl', 'stok_opname.cabang', 'stok_opname.no_so', 'stok_opname.updated_at as so_updated')
            ->orderBy('stok_opname_detail.id')->get()
            ->each(function ($r) use (&$events, $RANK_OPNAME_PLUS, $RANK_OPNAME_MINUS) {
                $sel = (float) $r->selisih;
                if ($sel == 0) return;
                if ($sel > 0) {
                    $events->push(['tgl' => $r->tgl, 'rank' => $RANK_OPNAME_PLUS, 'id' => $r->id, 'arah' => 'masuk',
                        'cabang' => $r->cabang, 'qty' => $sel, 'harga' => $r->harga ?? null,
                        'qty_nilai' => ((float) $r->qty_sistem < 0) ? max(0.0, (float) $r->qty_fisik) : $sel,
                        'tipe' => 'Opname (+)', 'ref_tabel' => 'stok_opname_detail', 'ref_id' => $r->id,
                        'ref' => 'SO-' . $r->opname_id, 'ket' => 'Opname ' . $r->no_so . ' (fisik lebih)']);
                } else {
                    $events->push(['tgl' => $r->tgl, 'rank' => $RANK_OPNAME_MINUS, 'id' => $r->id, 'arah' => 'keluar',
                        'cabang' => $r->cabang, 'qty' => abs($sel),
                        'tipe' => 'Opname (-)', 'ref_tabel' => 'stok_opname_detail', 'ref_id' => $r->id,
                        'ref' => 'SO-' . $r->opname_id, 'ket' => 'Opname ' . $r->no_so . ' (fisik kurang)']);
                }
            });

        return $events->sortBy([
            ['tgl', 'asc'], ['rank', 'asc'], ['id', 'asc'],
        ])->values();
    }
}
