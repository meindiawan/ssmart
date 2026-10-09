<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Sebelumnya Satuan 3 tidak punya faktor konversi sama sekali (cuma "nama alias",
// qty selalu dianggap satuan dasar apa adanya). Ini menambahkan `isi3` supaya
// Satuan 3 juga bisa jadi kemasan besar bertingkat, mis. PCS -> DUS (isi) -> KARTON (isi3),
// sama seperti `isi` dipakai untuk konversi Satuan 2.
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->integer('isi3')->nullable()->default(1)->after('isi');
        });
    }

    public function down(): void
    {
        Schema::table('barang', function (Blueprint $table) {
            $table->dropColumn('isi3');
        });
    }
};
