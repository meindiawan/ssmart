<?php

namespace App\Services;

use Carbon\Carbon;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * AsetPenyusutanService — mesin penyusutan Aset Tetap (metode Garis Lurus)
 * ─────────────────────────────────────────────────────────────────────
 * Sama seperti HppService: TIDAK ADA baris penyusutan yang disimpan di
 * database. Setiap kali dibutuhkan (untuk tampilan Jadwal Penyusutan di
 * modul Aset MAUPUN untuk baris Jurnal di DashboardController::buildJurnal)
 * jadwalnya dihitung ulang dari data aset_tetap saja — supaya kalau data
 * aset (nilai, tanggal, umur manfaat) diedit, jurnal & laporan otomatis
 * ikut menyesuaikan tanpa perlu "perbaiki data lama" secara manual.
 *
 * Aturan:
 *  - Penyusutan bulanan = (nilai_perolehan − nilai_residu) / umur_manfaat_bulan
 *  - Mulai disusutkan bulan BERIKUTNYA setelah bulan perolehan (bulan
 *    perolehan sendiri belum dibebankan, praktik umum yang paling
 *    sederhana untuk toko retail kecil).
 *  - Berhenti disusutkan kalau: umur manfaat sudah habis (akumulasi =
 *    nilai_perolehan − nilai_residu), ATAU status aset sudah "Dijual"/
 *    "Dihapus" dan sudah lewat tgl_stop, ATAU sudah sampai bulan berjalan.
 *  - Baris terakhir dipotong (tidak lebih dari sisa nilai yang belum
 *    disusutkan) supaya nilai buku tidak pernah minus dari nilai residu.
 * ═══════════════════════════════════════════════════════════════════════
 */
class AsetPenyusutanService
{
    /**
     * Hitung jadwal penyusutan bulanan lengkap satu aset, dari bulan
     * pertama sampai bulan berjalan (atau tgl_stop kalau sudah nonaktif).
     * @param object $aset Baris dari tabel aset_tetap
     * @return array<int, array{periode:string, tgl:string, nilai:float, akumulasi:float, nilai_buku:float}>
     */
    public function jadwal(object $aset): array
    {
        $nilaiSusut = max(0, (float) $aset->nilai_perolehan - (float) $aset->nilai_residu);
        $umur = max(0, (int) $aset->umur_manfaat_bulan);
        if ($nilaiSusut <= 0 || $umur <= 0) return [];

        $perBulan = $nilaiSusut / $umur;
        $mulai = Carbon::parse($aset->tgl_perolehan)->startOfMonth()->addMonthNoOverflow(); // bulan berikutnya
        $batasUmur = Carbon::parse($aset->tgl_perolehan)->startOfMonth()->addMonthsNoOverflow($umur); // 1 bulan setelah periode terakhir
        $batasWaktu = ($aset->status !== 'Aktif' && $aset->tgl_stop)
            ? Carbon::parse($aset->tgl_stop)->startOfMonth()->addMonthNoOverflow()
            : Carbon::now()->startOfMonth()->addMonthNoOverflow();
        $batas = $batasUmur->lt($batasWaktu) ? $batasUmur : $batasWaktu;

        $rows = [];
        $akumulasi = 0.0;
        $cursor = $mulai->copy();
        while ($cursor->lt($batas)) {
            $sisa = round($nilaiSusut - $akumulasi, 2);
            if ($sisa <= 0) break;
            $nilaiBulanIni = min($perBulan, $sisa);

            $akumulasi = round($akumulasi + $nilaiBulanIni, 2);
            $rows[] = [
                'periode'    => $cursor->format('Y-m'),
                'tgl'        => $cursor->copy()->endOfMonth()->format('Y-m-d'),
                'nilai'      => round($nilaiBulanIni, 2),
                'akumulasi'  => $akumulasi,
                'nilai_buku' => round((float) $aset->nilai_perolehan - $akumulasi, 2),
            ];
            $cursor->addMonthNoOverflow();
        }

        return $rows;
    }

    /**
     * Ringkasan posisi penyusutan aset SAAT INI: total akumulasi, nilai
     * buku, & apakah sudah lunas disusutkan — dipakai di kartu ringkasan
     * & tabel daftar aset.
     */
    public function ringkasan(object $aset): array
    {
        $jadwal = $this->jadwal($aset);
        $akumulasi = $jadwal ? end($jadwal)['akumulasi'] : 0.0;
        $nilaiSusut = max(0, (float) $aset->nilai_perolehan - (float) $aset->nilai_residu);
        return [
            'akumulasi_penyusutan' => $akumulasi,
            'nilai_buku'           => round((float) $aset->nilai_perolehan - $akumulasi, 2),
            'bulan_berjalan'       => count($jadwal),
            'selesai_disusutkan'   => $akumulasi >= $nilaiSusut - 0.5,
        ];
    }

    /**
     * Baris jurnal (Dr Biaya Penyusutan / Cr Akumulasi Penyusutan) untuk
     * SATU aset, siap dipakai langsung di DashboardController::buildJurnal.
     * Ref per bulan: "PYST-{id}-{Ym}" — supaya tiap bulan bisa ditelusuri
     * terpisah lewat fitur audit trail (bentukanRef/akunTrace) yang sudah ada.
     */
    public function jurnalLines(object $aset): array
    {
        $lines = [];
        foreach ($this->jadwal($aset) as $j) {
            $lines[] = [
                'tgl'   => $j['tgl'],
                'ref'   => 'PYST-' . $aset->id . '-' . str_replace('-', '', $j['periode']),
                'ket'   => 'Penyusutan ' . $aset->nama . ($aset->cabang ? ' (' . $aset->cabang . ')' : '') . ' — ' . $j['periode'],
                'nilai' => $j['nilai'],
            ];
        }
        return $lines;
    }
}
