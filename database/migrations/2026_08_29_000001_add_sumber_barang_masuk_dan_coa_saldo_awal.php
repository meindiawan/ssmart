<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

// ═══════════════════════════════════════════════════════════════════════
// Migrasi ini untuk kasus: barang yang HPP-nya diimpor dari laporan kasir
// lama (kolom "HPP" di Template Import Penjualan, sudah TERMASUK PPN
// Masukan) TAPI riwayat Pembelian-nya sendiri TIDAK PERNAH tercatat di
// sistem ini (barang.modal / trx_beli tidak ada) — jadi begitu barang itu
// "keluar" lewat trx_jual, HppService (HppService::gatherEvents) tetap
// otomatis mengurangi PPN Masukan dari HPP (dibagi 1+tarif) supaya Laba
// Rugi benar — TAPI akun Persediaan (1105) jadi terus-menerus dikredit
// tanpa pernah didebet duluan (karena tidak ada baris "masuk" apa pun),
// sehingga saldonya minus di Neraca. Itu bukan salah hitung HPP — itu
// karena belum ada baris pengakuan bahwa stok itu memang sudah ada
// (diakui) sebagai modal saat migrasi ke sistem baru ini.
//
// Solusinya: baris "Barang Masuk" baru dengan sumber = 'Saldo Awal' —
// dibedakan dari Barang Masuk biasa (restock tunai, sumber = default
// 'Pembelian Tunai') lewat kolom `sumber` ini, supaya akun lawannya beda:
//   - 'Pembelian Tunai' → Kredit 1101 (Kas)     — uang riil keluar sekarang
//   - 'Saldo Awal'       → Kredit 3103 (Modal)  — pengakuan stok migrasi,
//                                                  BUKAN transaksi kas baru
//
// PENTING: kolom `ppn_masukan` menampung porsi PPN dari nilai DPP shortfall
// itu (= DPP × tarif_ppn), diakui SENDIRI sbg aset 1106 (PPN Masukan) —
// TERPISAH dari Persediaan (1105) — supaya kelihatan jelas di Neraca dan
// bisa dikompensasikan thd PPN Keluaran kalau memang belum pernah diklaim
// di sistem lama. Baik Persediaan maupun PPN Masukan sama-sama diimbangi
// ke Modal (3103) — jadi jumlahnya TIDAK menyentuh Laba Rugi sama sekali,
// murni pengakuan di Neraca. Kalau kamu SUDAH pernah klaim PPN Masukan ini
// di SPT Masa PPN periode lampau (sebelum pakai sistem ini), jangan pakai
// baris 1106 ini utk klaim ulang — cukup diamkan sbg catatan/aset buku,
// atau hapus manual baris ppn_masukan-nya. Lihat HppService::
// generateSaldoAwalPersediaan() & DashboardController::buildJurnal().
// ═══════════════════════════════════════════════════════════════════════
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('barang_masuk', function (Blueprint $table) {
            $table->string('sumber', 30)->default('Pembelian Tunai')->after('harga_beli');
            $table->decimal('ppn_masukan', 15, 2)->default(0)->after('sumber');
        });

        DB::table('coa')->updateOrInsert(
            ['kode' => '3103'],
            [
                'nama'       => 'Saldo Awal Persediaan (Migrasi)',
                'kat'        => 'Modal',
                'normal'     => 'K',
                'is_default' => true,
                'created_at' => now(),
                'updated_at' => now(),
            ]
        );
    }

    public function down(): void
    {
        Schema::table('barang_masuk', function (Blueprint $table) {
            $table->dropColumn(['sumber', 'ppn_masukan']);
        });
        DB::table('coa')->where('kode', '3103')->delete();
    }
};
