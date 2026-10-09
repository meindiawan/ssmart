<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

// Akun baru dipakai oleh DashboardController::buildJurnal() untuk mencatat
// Mutasi Barang antar cabang (trx_mutasi lama & mutasi_kirim/detail yang
// sekarang aktif dipakai) — SEBELUMNYA mutasi mengubah qty & lokasi stok
// tapi TIDAK PERNAH tersentuh jurnal sama sekali, sehingga Neraca per
// cabang (nilai Persediaan) tidak nyambung dengan qty fisik hasil mutasi.
//
// 1108 dipakai sebagai "parkir sementara" nilai barang yang statusnya
// SUDAH dikirim dari cabang asal tapi BELUM di-ACC cabang tujuan (paket
// mutasi_kirim berstatus "Dikirim") — supaya nilai persediaan itu tetap
// tercatat sebagai aset perusahaan (cuma pindah pos akun), bukan hilang
// dari neraca selama di jalan. Begitu cabang tujuan meng-ACC, nilainya
// dipindah dari 1108 ke 1105 di cabang tujuan.
return new class extends Migration
{
    public function up(): void
    {
        if (!DB::table('coa')->where('kode', '1108')->exists()) {
            DB::table('coa')->insert([
                'kode'       => '1108',
                'nama'       => 'Persediaan Dalam Pengiriman (Mutasi Antar Cabang)',
                'kat'        => 'Aset',
                'normal'     => 'D',
                'is_default' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        DB::table('coa')->where('kode', '1108')->where('is_default', true)->delete();
    }
};
