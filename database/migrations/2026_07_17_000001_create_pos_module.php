<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // ── Penjualan: tambahan kolom khusus POS ──────────────────────────
        // no_nota  → mengelompokkan banyak baris trx_jual jadi 1 struk/nota,
        //            supaya kasir bisa input banyak barang sekaligus tapi
        //            tetap disimpan per-baris seperti struktur yang sudah ada
        //            (kompatibel 100% dengan jurnal otomatis & laporan lama).
        // diskon      → potongan per-baris (Rp), dipakai jurnal seperti trx_beli.
        // pelanggan   → kode pelanggan (opsional, dipakai sistem poin).
        // tipe_harga  → 'Ecer' / 'Grosir', hanya untuk catatan/laporan POS.
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->string('no_nota', 30)->nullable()->after('id')->index();
            $table->decimal('diskon', 15, 2)->default(0)->after('harga');
            $table->string('pelanggan', 100)->nullable()->after('bayar');
            $table->string('tipe_harga', 10)->nullable()->after('pelanggan');
        });

        // ── Pembelian: no_nota saja (diskon & supplier sudah ada) ─────────
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->string('no_nota', 30)->nullable()->after('id')->index();
        });

        // ── Header Nota POS ────────────────────────────────────────────────
        // Menyimpan ringkasan 1 transaksi kasir (banyak barang) supaya bisa
        // dicetak ulang sebagai struk & direkap di Riwayat Transaksi POS,
        // tanpa mengubah cara kerja modul Transaksi/Jurnal yang sudah ada.
        Schema::create('pos_nota', function (Blueprint $table) {
            $table->id();
            $table->string('no_nota', 30)->unique();
            $table->enum('jenis', ['Jual', 'Beli']);
            $table->date('tgl');
            $table->string('cabang');
            $table->string('pelanggan', 100)->nullable();
            $table->string('supplier', 100)->nullable();
            $table->string('tipe_harga', 10)->nullable();
            $table->enum('bayar', ['Tunai', 'Kredit'])->default('Tunai');
            $table->integer('jumlah_item')->default(0);
            $table->decimal('subtotal', 15, 2)->default(0);
            $table->decimal('diskon', 15, 2)->default(0);
            $table->decimal('total', 15, 2)->default(0);
            $table->integer('poin_didapat')->default(0);
            $table->integer('poin_dipakai')->default(0);
            $table->string('kasir', 100)->nullable();
            $table->text('catatan')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pos_nota');
        Schema::table('trx_beli', function (Blueprint $table) {
            $table->dropColumn('no_nota');
        });
        Schema::table('trx_jual', function (Blueprint $table) {
            $table->dropColumn(['no_nota', 'diskon', 'pelanggan', 'tipe_harga']);
        });
    }
};
