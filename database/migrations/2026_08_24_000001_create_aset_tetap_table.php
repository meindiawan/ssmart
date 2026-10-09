<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Aset Tetap — mobil/motor toko, komputer kasir, rak, dll. Penyusutan
        // (garis lurus) & jurnalnya DIHITUNG OTOMATIS setiap buildJurnal()
        // dipanggil (lihat DashboardController::buildJurnal) — sama seperti
        // semua transaksi lain di sistem ini, TIDAK disimpan sebagai baris
        // jurnal statis, supaya kalau data aset diedit/dihapus, jurnal &
        // laporan otomatis ikut menyesuaikan.
        Schema::create('aset_tetap', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 20)->unique();        // AT-0001, AT-0002, ...
            $table->string('nama');
            $table->string('kategori', 50)->default('Lainnya'); // Kendaraan, Peralatan Toko, Elektronik, Perabotan, Bangunan, Lainnya
            $table->string('cabang')->nullable();          // null = aset milik pusat/bersama, tidak terikat 1 cabang
            $table->date('tgl_perolehan');
            $table->decimal('nilai_perolehan', 15, 2);      // harga beli + biaya lain sampai siap pakai
            $table->decimal('nilai_residu', 15, 2)->default(0); // estimasi nilai sisa di akhir umur manfaat
            $table->unsignedInteger('umur_manfaat_bulan');  // umur manfaat dalam BULAN
            $table->enum('bayar', ['Tunai', 'Kredit'])->default('Tunai');
            $table->string('kode_kas', 10)->nullable();     // akun Kas/Bank yang didebit-kreditkan saat Tunai
            $table->enum('status', ['Aktif', 'Dijual', 'Dihapus'])->default('Aktif');
            $table->date('tgl_stop')->nullable();           // tanggal berhenti disusutkan (saat Dijual/Dihapus)
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('aset_tetap');
    }
};
