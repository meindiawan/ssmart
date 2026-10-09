<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Header pengiriman mutasi: satu pengiriman bisa berisi banyak barang
        // sekaligus (mis. Toko A kirim 5 jenis barang ke Toko B dalam satu
        // nota jalan). Status menandai sejauh mana barang sudah dikonfirmasi
        // diterima di cabang tujuan (bisa beda dari yang dikirim kalau ada
        // barang kurang/hilang di jalan).
        Schema::create('mutasi_kirim', function (Blueprint $table) {
            $table->id();
            $table->string('no_ref', 40)->unique();
            $table->date('tgl');
            $table->string('dari_cabang');
            $table->string('ke_cabang');
            $table->enum('status', ['Dikirim', 'Diterima Sebagian', 'Selesai'])->default('Dikirim');
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Detail per barang dalam satu pengiriman. qty_kirim = jumlah yang
        // dicatat keluar dari cabang asal (stok asal berkurang saat baris ini
        // dibuat). qty_diterima = akumulasi jumlah yang sudah dikonfirmasi
        // masuk di cabang tujuan (stok tujuan bertambah setiap kali nilai ini
        // naik). Selisih qty_kirim - qty_diterima = sisa barang yang belum
        // sampai / belum dicocokkan di cabang tujuan.
        Schema::create('mutasi_kirim_detail', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mutasi_kirim_id')->constrained('mutasi_kirim')->cascadeOnDelete();
            $table->string('kode_barang');
            $table->decimal('qty_kirim', 10, 2);
            $table->decimal('qty_diterima', 10, 2)->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mutasi_kirim_detail');
        Schema::dropIfExists('mutasi_kirim');
    }
};
