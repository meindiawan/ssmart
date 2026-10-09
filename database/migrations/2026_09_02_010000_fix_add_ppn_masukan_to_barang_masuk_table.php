<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Migrasi perbaikan: migrasi 2026_08_29_000001 sudah tercatat "sudah jalan"
// di tabel `migrations`, tapi kolom `ppn_masukan` ternyata belum benar-benar
// ada di database (kemungkinan migrasi itu dijalankan sebelum baris
// ppn_masukan ditambahkan ke filenya). Migrasi ini menambahkan kolom yang
// hilang itu saja, dengan pengecekan hasColumn supaya aman dijalankan
// walau kolom `sumber` sudah ada duluan.
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasColumn('barang_masuk', 'sumber')) {
            Schema::table('barang_masuk', function (Blueprint $table) {
                $table->string('sumber', 30)->default('Pembelian Tunai')->after('harga_beli');
            });
        }

        if (!Schema::hasColumn('barang_masuk', 'ppn_masukan')) {
            Schema::table('barang_masuk', function (Blueprint $table) {
                $table->decimal('ppn_masukan', 15, 2)->default(0)->after('sumber');
            });
        }
    }

    public function down(): void
    {
        Schema::table('barang_masuk', function (Blueprint $table) {
            if (Schema::hasColumn('barang_masuk', 'ppn_masukan')) {
                $table->dropColumn('ppn_masukan');
            }
        });
    }
};
