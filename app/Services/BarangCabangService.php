<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Master Barang per cabang.
 *
 * `barang` = katalog gabungan semua cabang (tidak berubah). `barang_cabang` =
 * harga jual khusus tiap cabang + penanda barang terdaftar di cabang mana.
 * Semua fungsi di sini aman dipanggil walau migration belum dijalankan
 * (otomatis jadi no-op), supaya aplikasi tidak error sebelum `php artisan migrate`.
 */
class BarangCabangService
{
    public const KOLOM_HARGA = ['harga_jual', 'harga_grosir', 'harga_cabang'];

    private static ?bool $ada = null;

    public static function ada(): bool
    {
        if (self::$ada === null) {
            self::$ada = Schema::hasTable('barang_cabang');
        }
        return self::$ada;
    }

    /**
     * Batasi query `barang` ke barang milik $cabang (terdaftar di barang_cabang
     * ATAU sudah punya saldo stok di cabang itu) dan ikutkan harga khususnya
     * sebagai kolom bc_harga_* untuk di-overlay lewat overlayHarga().
     */
    public static function filterCabang($q, string $cabang, bool $hanyaTerdaftar = true)
    {
        if (!self::ada()) return $q;

        $q->leftJoin('barang_cabang as bc', function ($j) use ($cabang) {
            $j->on('bc.kode', '=', 'barang.kode')->where('bc.cabang', '=', $cabang);
        })->addSelect('bc.harga_jual as bc_harga_jual', 'bc.harga_grosir as bc_harga_grosir', 'bc.harga_cabang as bc_harga_cabang', 'bc.id as bc_id');

        if ($hanyaTerdaftar) {
            $q->where(function ($w) use ($cabang) {
                $w->whereNotNull('bc.id')
                  ->orWhereExists(function ($s) use ($cabang) {
                      $s->select(DB::raw(1))->from('stok')
                        ->whereColumn('stok.kode_barang', 'barang.kode')
                        ->where('stok.cabang', $cabang);
                  });
            });
        }
        return $q;
    }

    /** Ganti harga_* baris barang dengan harga khusus cabang (kalau > 0), buang kolom bantu bc_*. */
    public static function overlayHarga(object $row): object
    {
        $khusus = false;
        foreach (self::KOLOM_HARGA as $k) {
            $v = $row->{'bc_' . $k} ?? null;
            if ($v !== null && (float) $v > 0) {
                $row->{$k} = $v;
                $khusus = true;
            }
            unset($row->{'bc_' . $k});
        }
        unset($row->bc_id);
        $row->harga_khusus_cabang = $khusus;
        return $row;
    }

    /**
     * Simpan harga khusus sebuah barang di sebuah cabang.
     * $hanyaPositif = true → hanya kolom yang nilainya > 0 yang ditimpa
     * (dipakai import Excel: nilai 0/kosong di file tidak menghapus harga yang sudah ada).
     */
    public static function simpanHarga(string $kode, string $cabang, array $harga, bool $hanyaPositif = false): void
    {
        if (!self::ada()) return;

        $set = [];
        foreach (self::KOLOM_HARGA as $k) {
            if (!array_key_exists($k, $harga)) continue;
            $v = (float) $harga[$k];
            if ($hanyaPositif && $v <= 0) continue;
            $set[$k] = $v;
        }

        $row = DB::table('barang_cabang')->where('kode', $kode)->where('cabang', $cabang)->first();
        if ($row) {
            if ($set) DB::table('barang_cabang')->where('id', $row->id)->update($set + ['updated_at' => now()]);
        } else {
            DB::table('barang_cabang')->insert(array_merge(
                ['harga_jual' => 0, 'harga_grosir' => 0, 'harga_cabang' => 0],
                $set,
                ['kode' => $kode, 'cabang' => $cabang, 'created_at' => now(), 'updated_at' => now()]
            ));
        }
    }

    /** Peta ringkas seluruh harga khusus: {cabang: {kode: [jual, grosir, cabang]}} — dipakai UI transaksi/POS. */
    public static function petaHarga(): array
    {
        if (!self::ada()) return [];
        $peta = [];
        DB::table('barang_cabang')
            ->where(fn($w) => $w->where('harga_jual', '>', 0)->orWhere('harga_grosir', '>', 0)->orWhere('harga_cabang', '>', 0))
            ->select('kode', 'cabang', 'harga_jual', 'harga_grosir', 'harga_cabang')
            ->orderBy('id')
            ->chunk(5000, function ($rows) use (&$peta) {
                foreach ($rows as $r) {
                    $peta[$r->cabang][$r->kode] = [(float) $r->harga_jual, (float) $r->harga_grosir, (float) $r->harga_cabang];
                }
            });
        return $peta;
    }

    public static function hapusKode(string $kode): void
    {
        if (self::ada()) DB::table('barang_cabang')->where('kode', $kode)->delete();
    }

    public static function hapusSemua(): void
    {
        if (self::ada()) DB::table('barang_cabang')->delete();
    }

    public static function hapusCabang(string $cabang): int
    {
        return self::ada() ? DB::table('barang_cabang')->where('cabang', $cabang)->delete() : 0;
    }

    /** Daftarkan barang ke cabang-cabang tempat ia pernah bertransaksi (harga ikut standar). */
    public static function daftarkanDariTransaksi(array $kodes): int
    {
        if (!self::ada() || !$kodes) return 0;
        $kodes = array_map('strval', $kodes);
        $n = 0;
        foreach (['trx_jual', 'trx_beli'] as $tbl) {
            foreach (array_chunk(array_values(array_unique($kodes)), 500) as $chunk) {
                $pairs = DB::table($tbl)->whereIn('kode_barang', $chunk)
                    ->select('kode_barang', 'cabang')->distinct()->get();
                foreach ($pairs as $p) {
                    if (!$p->cabang) continue;
                    $ada = DB::table('barang_cabang')->where('kode', $p->kode_barang)->where('cabang', $p->cabang)->exists();
                    if (!$ada) {
                        DB::table('barang_cabang')->insert([
                            'kode' => $p->kode_barang, 'cabang' => $p->cabang,
                            'harga_jual' => 0, 'harga_grosir' => 0, 'harga_cabang' => 0,
                            'created_at' => now(), 'updated_at' => now(),
                        ]);
                        $n++;
                    }
                }
            }
        }
        return $n;
    }

    // ─── COCOKKAN ULANG TRANSAKSI "TIDAK DIKENAL" ───────────────────────────
    // Penyebab paling umum banner "kode barang belum terdaftar di Master Barang":
    //  (a) transaksi diimport sebelum Master Barang ada → baris ditandai
    //      tidak_dikenal walau sekarang kodenya sudah ada di Master;
    //  (b) kode di file penjualan ternyata BARCODE / kode alternatif barang
    //      (bukan kode utamanya), sehingga tersimpan apa adanya.
    // Fungsi ini memperbaiki keduanya tanpa upload ulang file: (a) tanda
    // dibersihkan, (b) kode transaksi diganti ke kode utama barang HANYA kalau
    // cocoknya tepat 1 barang (ambigu = dibiarkan, supaya tidak salah barang).
    // Stok, jurnal manual, dan Kartu HPP tidak disentuh — sama seperti tombol
    // "Masukkan ke Master Barang" yang sudah ada.
    public static function cocokkanTransaksiTidakDikenal(): array
    {
        $hasil = ['flag_dibersihkan' => 0, 'dialihkan_ke_kode_master' => 0, 'kode_dialihkan' => [], 'ambigu' => [], 'masih_tidak_ada' => 0];

        // (a) kode sudah ada di Master tapi tanda ⚠️ masih menempel
        foreach (['trx_jual', 'trx_beli'] as $tbl) {
            $hasil['flag_dibersihkan'] += DB::table($tbl)
                ->where('tidak_dikenal', true)
                ->whereExists(function ($s) use ($tbl) {
                    $s->select(DB::raw(1))->from('barang')->whereColumn('barang.kode', $tbl . '.kode_barang');
                })
                ->update(['tidak_dikenal' => false, 'kode_asli' => null, 'updated_at' => now()]);
        }

        // (b) kode transaksi yang benar-benar tidak ada di barang.kode
        $orphan = [];
        foreach (['trx_jual', 'trx_beli'] as $tbl) {
            $kodes = DB::table($tbl)
                ->whereNotExists(function ($s) use ($tbl) {
                    $s->select(DB::raw(1))->from('barang')->whereColumn('barang.kode', $tbl . '.kode_barang');
                })
                ->distinct()->pluck('kode_barang');
            foreach ($kodes as $k) $orphan[(string) $k] = true;
        }
        if (!$orphan) return $hasil;

        $norm = fn($s) => strtoupper(trim((string) $s));
        $angka = function ($s) use ($norm) {
            $n = $norm($s);
            return ($n !== '' && ctype_digit($n)) ? (ltrim($n, '0') ?: '0') : null;
        };

        $petaTepat = []; // NORM  => [kodeMaster => true]
        $petaAngka = []; // digit tanpa 0 depan => [kodeMaster => true]
        foreach (DB::table('barang')->select('kode', 'barcode', 'barcode2', 'barcode3')->cursor() as $b) {
            foreach ([$b->kode, $b->barcode, $b->barcode2, $b->barcode3] as $v) {
                if ($v === null || trim((string) $v) === '') continue;
                $petaTepat[$norm($v)][$b->kode] = true;
                if (($a = $angka($v)) !== null) $petaAngka[$a][$b->kode] = true;
            }
        }

        $dialihkan = [];
        foreach (array_keys($orphan) as $lama) {
            $lama = (string) $lama; // PHP mengubah kunci array numerik jadi int — kembalikan ke string
            $cand = $petaTepat[$norm($lama)] ?? [];
            if (!$cand && ($a = $angka($lama)) !== null) $cand = $petaAngka[$a] ?? [];

            if (count($cand) === 1) {
                $baru = (string) array_key_first($cand);
                if ($baru === (string) $lama) continue;
                foreach (['trx_jual', 'trx_beli'] as $tbl) {
                    DB::table($tbl)->where('kode_barang', $lama)->update([
                        'kode_barang' => $baru, 'tidak_dikenal' => false, 'kode_asli' => null, 'updated_at' => now(),
                    ]);
                }
                $dialihkan[$baru] = true;
                $hasil['dialihkan_ke_kode_master']++;
                if (count($hasil['kode_dialihkan']) < 50) $hasil['kode_dialihkan'][] = "{$lama} → {$baru}";
            } elseif (count($cand) > 1) {
                $hasil['ambigu'][] = $lama . ' (cocok ke: ' . implode(', ', array_slice(array_keys($cand), 0, 3)) . ')';
            } else {
                $hasil['masih_tidak_ada']++;
            }
        }

        if ($dialihkan) self::daftarkanDariTransaksi(array_map('strval', array_keys($dialihkan)));
        $hasil['ambigu'] = array_slice($hasil['ambigu'], 0, 50);
        return $hasil;
    }
}
