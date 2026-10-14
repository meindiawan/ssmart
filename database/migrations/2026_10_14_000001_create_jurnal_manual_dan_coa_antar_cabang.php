<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * 1) JURNAL MANUAL & JURNAL MEMORIAL
 *    jurnal_manual         = header (no. jurnal, tanggal, cabang, jenis)
 *    jurnal_manual_detail  = baris debit/kredit per akun
 *    jenis: 'Umum'     → jurnal manual biasa (prefix JU-)
 *           'Memorial' → jurnal memorial: penyesuaian / koreksi / pembalik /
 *                        transaksi non-kas lain (prefix JM-)
 *    Dibaca oleh DashboardController::buildJurnal() sehingga otomatis masuk
 *    Jurnal Umum, Buku Besar, Neraca Saldo, Laba Rugi & Neraca.
 *
 * 2) AKUN ANTAR CABANG (untuk jurnal Mutasi Barang)
 *    1109 Piutang Antar Cabang  → di cabang PENGIRIM (pusat): tagihan atas
 *                                  barang yang dikirim ke cabang lain.
 *    2104 Hutang Antar Cabang   → di cabang PENERIMA: kewajiban ke pengirim
 *                                  (mis. hutang barang cabang ke pusat).
 *    Keduanya saling meniadakan di laporan gabungan semua cabang.
 * ═══════════════════════════════════════════════════════════════════════
 */
return new class extends Migration
{
    public function up(): void
    {
        $akun = [
            ['1109', 'Piutang Antar Cabang (Mutasi Barang)', 'Aset', 'D'],
            ['2104', 'Hutang Antar Cabang (Mutasi Barang)', 'Liabilitas', 'K'],
        ];
        foreach ($akun as [$kode, $nama, $kat, $normal]) {
            if (DB::table('coa')->where('kode', $kode)->exists()) continue;
            DB::table('coa')->insert([
                'kode' => $kode, 'nama' => $nama, 'kat' => $kat, 'normal' => $normal,
                'is_default' => true, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        if (!Schema::hasTable('jurnal_manual')) {
            Schema::create('jurnal_manual', function (Blueprint $table) {
                $table->id();
                $table->string('no_jurnal', 40)->unique();
                $table->string('jenis', 20)->default('Umum');      // Umum | Memorial
                $table->string('kategori', 40)->nullable();        // Penyesuaian, Koreksi, Pembalik, dst.
                $table->date('tgl');
                $table->string('cabang');
                $table->string('keterangan', 255);
                $table->string('dibuat_oleh', 100)->nullable();
                $table->timestamps();
                $table->index(['tgl', 'cabang']);
            });
        }

        if (!Schema::hasTable('jurnal_manual_detail')) {
            Schema::create('jurnal_manual_detail', function (Blueprint $table) {
                $table->id();
                $table->foreignId('jurnal_manual_id')->constrained('jurnal_manual')->cascadeOnDelete();
                $table->string('kode_akun', 10);
                $table->decimal('debit', 15, 2)->default(0);
                $table->decimal('kredit', 15, 2)->default(0);
                $table->string('keterangan', 255)->nullable();
                $table->timestamps();
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('jurnal_manual_detail');
        Schema::dropIfExists('jurnal_manual');
        DB::table('coa')->whereIn('kode', ['1109', '2104'])->where('is_default', true)->delete();
    }
};
