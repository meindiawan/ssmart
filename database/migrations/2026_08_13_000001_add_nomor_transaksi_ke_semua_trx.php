<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Sebelum ini cuma trx_biaya (no_bukti) yang punya nomor transaksi otomatis.
     * Penjualan & Pembelian (trx_jual/trx_beli) punya kolom no_nota, tapi HANYA
     * terisi kalau kasir input >1 barang sekaligus lewat grid (lihat
     * transaksi.js trxGridSimpan) — transaksi 1 barang tetap no_nota = NULL.
     * Jasa/Sewa/Retur/Kasbon/Cashbon malah belum punya kolom nomor sama sekali.
     *
     * Migration ini: (1) menambah kolom no_transaksi (unik) ke 5 tabel yang
     * belum punya, (2) mengisi nomor untuk data lama yang sudah ada supaya
     * tetap unik & konsisten, (3) mengisi no_nota untuk baris trx_jual/trx_beli
     * lama yang masih NULL. Logika generate-otomatisnya sendiri ada di
     * TransaksiController (dipakai saat transaksi baru disimpan).
     */
    public function up(): void
    {
        foreach ($this->tabelBaru() as $t) {
            Schema::table($t['table'], function (Blueprint $table) {
                $table->string('no_transaksi', 30)->nullable()->unique()->after('id');
            });
        }

        // Backfill data lama (5 tabel baru) — urut berdasarkan id supaya nomor
        // urut mengikuti urutan input aslinya.
        foreach ($this->tabelBaru() as $t) {
            $counter = [];
            $rows = DB::table($t['table'])->orderBy('id')->get(['id', 'tgl']);
            foreach ($rows as $r) {
                $no = $this->generate($t['prefix'], $r->tgl, $counter);
                DB::table($t['table'])->where('id', $r->id)->update(['no_transaksi' => $no]);
            }
        }

        // Backfill no_nota lama yang masih NULL di trx_jual & trx_beli — setiap
        // baris lama dianggap 1 transaksi sendiri (belum ada grid multi-barang
        // waktu itu), jadi tiap baris dapat nomor TXJ-/TXB- masing-masing.
        foreach ([['trx_jual', 'TXJ'], ['trx_beli', 'TXB']] as [$table, $prefix]) {
            $counter = [];
            $rows = DB::table($table)->whereNull('no_nota')->orderBy('id')->get(['id', 'tgl']);
            foreach ($rows as $r) {
                $no = $this->generate($prefix, $r->tgl, $counter);
                DB::table($table)->where('id', $r->id)->update(['no_nota' => $no]);
            }
        }
    }

    public function down(): void
    {
        foreach ($this->tabelBaru() as $t) {
            Schema::table($t['table'], function (Blueprint $table) {
                $table->dropColumn('no_transaksi');
            });
        }
        // no_nota trx_jual/trx_beli sengaja TIDAK dikosongkan lagi saat rollback
        // (kolomnya memang sudah ada sebelum migration ini, cuma nilainya diisi).
    }

    private function tabelBaru(): array
    {
        return [
            ['table' => 'trx_jasa',    'prefix' => 'JS'],
            ['table' => 'trx_sewa',    'prefix' => 'SW'],
            ['table' => 'trx_retur',   'prefix' => 'RT'],
            ['table' => 'trx_kasbon',  'prefix' => 'KB'],
            ['table' => 'trx_cashbon', 'prefix' => 'CB'],
        ];
    }

    private function generate(string $prefix, ?string $tgl, array &$counter): string
    {
        $key = $prefix . '-' . date('Ymd', $tgl ? strtotime($tgl) : time());
        $counter[$key] = ($counter[$key] ?? 0) + 1;
        return $key . '-' . str_pad($counter[$key], 4, '0', STR_PAD_LEFT);
    }
};
