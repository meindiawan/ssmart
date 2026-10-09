<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Saldo Awal Akun — saldo pembukaan akun-akun Neraca (Kas, Bank,
        // Piutang, Hutang, Modal, dst — SELAIN Persediaan 1105 yang sudah
        // punya mekanisme sendiri lewat barang_masuk sumber='Saldo Awal').
        // Diinput manual per akun per cabang saat migrasi ke sistem baru,
        // lihat App\Http\Controllers\Api\SaldoAwalController.
        Schema::create('saldo_awal_akun', function (Blueprint $table) {
            $table->id();
            $table->string('kode_akun', 10);
            $table->string('cabang', 100);
            $table->date('tgl');
            $table->decimal('nominal', 15, 2)->default(0);
            $table->text('keterangan')->nullable();
            $table->timestamps();
            $table->unique(['kode_akun', 'cabang']);
        });

        // Akun penyeimbang (plug account) — setiap baris Saldo Awal Akun
        // otomatis diimbangi ke akun ini di DashboardController::buildJurnal(),
        // supaya Neraca tetap seimbang walau baris diinput satu-satu/tidak
        // lengkap sekaligus (mis. baru sempat isi Kas & Hutang, belum Modal).
        // Beda dari 3103 (Saldo Awal Persediaan) yang khusus utk migrasi stok.
        if (!DB::table('coa')->where('kode', '3102')->exists()) {
            DB::table('coa')->insert([
                'kode' => '3102', 'nama' => 'Modal Awal (Saldo Awal Akun)',
                'kat' => 'Modal', 'normal' => 'K', 'is_default' => true, 'is_kas' => false,
                'created_at' => now(), 'updated_at' => now(),
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('saldo_awal_akun');
        DB::table('coa')->where('kode', '3102')->where('is_default', true)->delete();
    }
};
