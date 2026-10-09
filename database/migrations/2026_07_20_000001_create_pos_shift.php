<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Shift Kasir POS ────────────────────────────────────────────────
        // Sesi kerja 1 kasir di 1 cabang: dari "login shift" (isi kas awal)
        // sampai "tutup shift" (isi kas akhir). Selama shift masih 'buka',
        // layar Riwayat Kasir POS hanya menampilkan nota² yang dibuat pada
        // shift tsb — persis kelakuan aplikasi kasir desktop ("hanya
        // menampilkan transaksi pada shift yang sedang berjalan").
        Schema::create('pos_shift', function (Blueprint $table) {
            $table->id();
            $table->string('no_referensi', 40)->unique();
            $table->string('cabang');
            $table->string('kasir', 100);
            $table->unsignedInteger('nomor_shift')->default(1);
            $table->decimal('kas_awal', 15, 2)->default(0);
            $table->decimal('kas_akhir', 15, 2)->nullable();
            $table->enum('status', ['buka', 'tutup'])->default('buka');
            $table->dateTime('waktu_mulai');
            $table->dateTime('waktu_selesai')->nullable();
            $table->text('catatan')->nullable();
            $table->timestamps();

            $table->index(['cabang', 'status']);
        });

        // ── Tautkan tiap nota POS ke shift saat nota itu dibuat ──────────────
        Schema::table('pos_nota', function (Blueprint $table) {
            $table->unsignedBigInteger('shift_id')->nullable()->after('cabang')->index();
        });
    }

    public function down(): void
    {
        Schema::table('pos_nota', function (Blueprint $table) {
            $table->dropColumn('shift_id');
        });
        Schema::dropIfExists('pos_shift');
    }
};
