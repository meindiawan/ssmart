<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Index untuk mempercepat laporan/stok/HPP saat data sudah banyak.
 * Aman dijalankan berulang: index yang sudah ada / kolom yang tidak ada dilewati.
 */
return new class extends Migration {
    private function daftar(): array
    {
        return [
            ['trx_jual',  ['tgl'],                     'ix_perf_jual_tgl'],
            ['trx_jual',  ['cabang', 'tgl'],           'ix_perf_jual_cab_tgl'],
            ['trx_jual',  ['kode_barang', 'cabang'],   'ix_perf_jual_kode_cab'],
            ['trx_jual',  ['no_nota'],                 'ix_perf_jual_nota'],
            ['trx_beli',  ['tgl'],                     'ix_perf_beli_tgl'],
            ['trx_beli',  ['cabang', 'tgl'],           'ix_perf_beli_cab_tgl'],
            ['trx_beli',  ['kode_barang', 'cabang'],   'ix_perf_beli_kode_cab'],
            ['trx_beli',  ['no_nota'],                 'ix_perf_beli_nota'],
            ['trx_retur', ['kode_barang'],             'ix_perf_retur_kode'],
            ['barang_masuk',  ['kode_barang'],         'ix_perf_bmasuk_kode'],
            ['barang_keluar', ['kode_barang'],         'ix_perf_bkeluar_kode'],
            ['trx_mutasi',    ['kode_barang'],         'ix_perf_mutasi_kode'],
            ['mutasi_kirim_detail', ['kode_barang'],   'ix_perf_mkd_kode'],
            ['stok_opname_detail',  ['kode_barang'],   'ix_perf_sod_kode'],
            ['hpp_kartu', ['tgl'],                     'ix_perf_hpp_tgl'],
            ['hpp_kartu', ['tipe', 'tgl'],             'ix_perf_hpp_tipe_tgl'],
            ['hpp_kartu', ['ref_tabel', 'ref_id'],     'ix_perf_hpp_ref'],
            ['stok',      ['cabang'],                  'ix_perf_stok_cab'],
            ['trx_biaya', ['cabang', 'tgl'],           'ix_perf_biaya_cab_tgl'],
        ];
    }

    public function up(): void
    {
        foreach ($this->daftar() as [$tabel, $kolom, $nama]) {
            try {
                if (!Schema::hasTable($tabel) || !Schema::hasColumns($tabel, $kolom)) continue;
                $ada = collect(Schema::getIndexes($tabel))->pluck('name')->map('strtolower')->all();
                if (in_array(strtolower($nama), $ada, true)) continue;
                Schema::table($tabel, fn(Blueprint $t) => $t->index($kolom, $nama));
            } catch (\Throwable $e) {
                // jangan gagalkan migrasi hanya karena 1 index
            }
        }
    }

    public function down(): void
    {
        foreach ($this->daftar() as [$tabel, , $nama]) {
            try { Schema::table($tabel, fn(Blueprint $t) => $t->dropIndex($nama)); } catch (\Throwable $e) {}
        }
    }
};
