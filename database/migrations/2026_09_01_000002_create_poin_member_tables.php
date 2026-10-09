<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // ── POIN MEMBER (rekap dari sistem lama, per cabang) ────────────────
        // Beda dengan kolom `pelanggan.poin` yang dipakai Kasir POS (poin baru,
        // real-time, 1 nama = 1 baris, dipotong langsung ke Rupiah saat checkout).
        // Tabel ini menyimpan snapshot poin member LAMA yang tercatat terpisah
        // per cabang (7 file rekap kasir lama) — 1 nama yang sama bisa punya
        // banyak baris (satu per cabang tempat dia belanja). Poin "total" 1
        // orang dihitung dengan MENJUMLAHKAN semua baris yang nama-nya identik
        // (dicocokkan case-insensitive + trim spasi) — lihat PoinController::index().
        Schema::create('poin_member', function (Blueprint $table) {
            $table->id();
            $table->string('cabang', 100);
            $table->string('nama', 191);
            $table->string('alamat')->nullable();
            $table->string('telp', 50)->nullable();
            $table->string('id_member', 50)->nullable();
            $table->integer('poin')->default(0);
            $table->timestamps();
            $table->index('nama');
            // 1 nama hanya boleh 1 baris per cabang — import ulang (re-upload
            // file rekap) akan REPLACE seluruh baris cabang itu, bukan menumpuk.
            $table->unique(['cabang', 'nama']);
        });

        // ── KATALOG HADIAH ───────────────────────────────────────────────────
        // Barang yang bisa ditukar dengan poin. Ada 2 kolom biaya poin karena
        // member Silver & Gold punya nilai tukar berbeda (lihat poster toko).
        Schema::create('poin_hadiah', function (Blueprint $table) {
            $table->id();
            $table->string('nama', 150);
            $table->string('kategori', 100)->nullable();
            $table->integer('poin_silver')->default(0);
            $table->integer('poin_gold')->nullable(); // null = sama dengan poin_silver
            $table->string('emoji', 10)->nullable();  // ikon tampilan, mis. 🍚 🍳 📱
            $table->integer('urutan')->default(0);
            $table->boolean('aktif')->default(true);
            $table->timestamps();
        });

        // ── RIWAYAT PENUKARAN POIN ───────────────────────────────────────────
        // Ledger terpisah (tidak mengurangi langsung baris poin_member) — sama
        // seperti pola `kontak_catatan`: poin tersedia = total didapat (SUM
        // poin_member per nama) DIKURANGI total pernah ditukar (SUM tabel ini
        // per nama). Ini menghindari harus memilih baris cabang mana yang
        // "dipotong" saat 1 orang poinnya tersebar di banyak cabang.
        Schema::create('poin_tukar', function (Blueprint $table) {
            $table->id();
            $table->string('nama_member', 191);
            $table->enum('tier', ['Silver', 'Gold'])->default('Silver');
            $table->foreignId('hadiah_id')->nullable()->constrained('poin_hadiah')->nullOnDelete();
            $table->string('nama_hadiah', 150); // snapshot nama hadiah saat ditukar
            $table->integer('poin_dipakai');
            $table->date('tgl');
            $table->string('cabang', 100)->nullable(); // cabang tempat penukaran (opsional)
            $table->text('keterangan')->nullable();
            $table->timestamps();
            $table->index('nama_member');
        });

        // ── SEED KATALOG HADIAH DEFAULT ──────────────────────────────────────
        // Diambil dari poster "Tukar Poin" toko — Mamy bisa ubah/tambah/hapus
        // lewat menu Kelola Hadiah, ini cuma titik awal biar tidak kosong.
        $now = now();
        DB::table('poin_hadiah')->insert([
            ['nama' => 'Gula Pasir / Sembako Paket 1', 'kategori' => 'Sembako', 'poin_silver' => 53,    'poin_gold' => 92,    'emoji' => '🍚', 'urutan' => 1, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Sabun Cuci / Perlengkapan Rumah Paket', 'kategori' => 'Perlengkapan Rumah', 'poin_silver' => 92,  'poin_gold' => 159,   'emoji' => '🧼', 'urutan' => 2, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Minyak Goreng SunCo', 'kategori' => 'Sembako', 'poin_silver' => 137,   'poin_gold' => 236,   'emoji' => '🛢️', 'urutan' => 3, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Wajan / Panci', 'kategori' => 'Peralatan Dapur', 'poin_silver' => 297,   'poin_gold' => 513,   'emoji' => '🍳', 'urutan' => 4, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Setrika', 'kategori' => 'Elektronik', 'poin_silver' => 594,   'poin_gold' => 1026,  'emoji' => '👕', 'urutan' => 5, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Rice Cooker / Kipas Angin', 'kategori' => 'Elektronik', 'poin_silver' => 890,   'poin_gold' => 1538,  'emoji' => '🍚', 'urutan' => 6, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Handphone', 'kategori' => 'Elektronik', 'poin_silver' => 4451,  'poin_gold' => 7692,  'emoji' => '📱', 'urutan' => 7, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Kulkas / Freezer', 'kategori' => 'Elektronik', 'poin_silver' => 7418,  'poin_gold' => 12821, 'emoji' => '🧊', 'urutan' => 8, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
            ['nama' => 'Sepeda Motor Listrik', 'kategori' => 'Kendaraan', 'poin_silver' => 11870, 'poin_gold' => 20513, 'emoji' => '🛵', 'urutan' => 9, 'aktif' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('poin_tukar');
        Schema::dropIfExists('poin_hadiah');
        Schema::dropIfExists('poin_member');
    }
};
