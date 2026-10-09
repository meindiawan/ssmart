<?php

namespace App\Services;

/**
 * Pemetaan akun kasir → cabang & shift (satu tempat, mudah diubah).
 *
 *   Awalan akun menentukan cabang (nama harus sama dengan Master Cabang):
 *     BAE → Bae · PDR → Padurenan · UGM → Ugm · PSR → Pasar
 *     BK  → Putri 2 · BCN → Putri 1 · selain itu (TS…, ADM…) → Pusat
 *   Shift: akun berakhiran angka 1 = Pagi, selain itu = Siang. KECUALI akun
 *   sehari penuh (awalan ADM… dan PSR…) = Sehari — bukan pagi, bukan siang.
 *
 * Contoh: BAEA1 → Bae/Pagi · PDRB2 → Padurenan/Siang · TSB1 → Pusat/Pagi ·
 *         PSRA → Pasar/Sehari · ADM2 → Pusat/Sehari.
 */
class KasirAkunService
{
    public const CABANG_AWALAN = [
        'BAE' => 'Bae',
        'PDR' => 'Padurenan',
        'UGM' => 'Ugm',
        'PSR' => 'Pasar',
        'BK'  => 'Putri 2',
        'BCN' => 'Putri 1',
    ];
    public const CABANG_DEFAULT = 'Pusat';

    /** Akun sehari penuh (satu kasir sepanjang hari, tanpa pembagian pagi/siang). */
    public const SEHARI_AWALAN = ['ADM', 'PSR'];

    /** "BAE-A1", " baea1 " → "BAEA1" (huruf besar, tanpa tanda baca/spasi). */
    public static function normal(?string $kasir): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', (string) $kasir));
    }

    public static function cabang(?string $kasir): string
    {
        $k = self::normal($kasir);
        foreach (self::CABANG_AWALAN as $awalan => $cabang) {
            if (str_starts_with($k, $awalan)) return $cabang;
        }
        return self::CABANG_DEFAULT;
    }

    public static function shift(?string $kasir): string
    {
        $k = self::normal($kasir);
        foreach (self::SEHARI_AWALAN as $awalan) {
            if (str_starts_with($k, $awalan)) return 'Sehari';
        }
        return str_ends_with($k, '1') ? 'Pagi' : 'Siang';
    }

    /** "pagi"/"1" → 'Pagi'; "siang"/"2" → 'Siang'; "sehari"/"all"/"full" → 'Sehari'; selain itu null. */
    public static function normalisasiShift(?string $s): ?string
    {
        $s = strtolower(trim((string) $s));
        return match ($s) {
            'pagi', '1' => 'Pagi',
            'siang', '2' => 'Siang',
            'sehari', 'seharian', 'all', 'full', 'fullday', 'allday' => 'Sehari',
            default => null,
        };
    }
}
