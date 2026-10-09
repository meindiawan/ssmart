<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * ═══════════════════════════════════════════════════════════════════════
 * UPGRADE MUTASI BARANG — dari "1 baris = 1 barang" (trx_mutasi lama)
 * menjadi mutasi berbasis PAKET (mutasi_kirim + mutasi_kirim_detail, tabel
 * yang sudah dibuat sebelumnya tapi belum pernah dipakai) dengan alur kerja
 * kirim → cek fisik di cabang tujuan → ACC, lengkap dengan pencatatan
 * selisih (kurang/lebih) dan tindak lanjutnya.
 * ─────────────────────────────────────────────────────────────────────
 * mutasi_kirim (header 1 paket, bisa berisi banyak barang):
 *   + dikirim_oleh, diterima_oleh   → siapa yang input & yang ACC
 *   + waktu_terima                  → kapan di-ACC cabang tujuan
 *   + catatan_terima                → catatan cabang tujuan saat ACC
 *   + ada_selisih                   → flag cepat utk filter riwayat
 *   + dibatalkan_oleh/waktu_batal/alasan_batal → jejak pembatalan
 *   status diperluas: Dikirim → Selesai / Selesai (Ada Selisih) / Dibatalkan
 *
 * mutasi_kirim_detail (1 baris per barang dalam paket):
 *   + nama_barang, satuan  → snapshot (tetap valid walau master berubah)
 *   + keterangan           → catatan per-barang (opsional)
 *   + selisih              → qty_diterima - qty_kirim (diisi saat ACC)
 *
 * mutasi_kirim_selisih (baru): jejak setiap ketidakcocokan qty kirim vs
 * qty diterima, plus tindakan yang diambil toko untuk memperbaikinya
 * (mis. sesuaikan stok, klaim ke pengirim, barang menyusul, dll).
 * ═══════════════════════════════════════════════════════════════════════
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mutasi_kirim', function (Blueprint $table) {
            $table->string('dikirim_oleh', 100)->nullable()->after('keterangan');
            $table->string('diterima_oleh', 100)->nullable()->after('dikirim_oleh');
            $table->timestamp('waktu_terima')->nullable()->after('diterima_oleh');
            $table->text('catatan_terima')->nullable()->after('waktu_terima');
            $table->boolean('ada_selisih')->default(false)->after('catatan_terima');
            $table->string('dibatalkan_oleh', 100)->nullable()->after('ada_selisih');
            $table->timestamp('waktu_batal')->nullable()->after('dibatalkan_oleh');
            $table->string('alasan_batal', 255)->nullable()->after('waktu_batal');
        });

        // Perluas daftar status yang valid. Pakai raw statement (bukan
        // ->change(), yang butuh doctrine/dbal) — aman karena koneksi
        // produksi aplikasi ini MySQL (lihat DATE_FORMAT() di controller lain).
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE mutasi_kirim MODIFY status ENUM('Dikirim','Selesai','Selesai (Ada Selisih)','Dibatalkan') NOT NULL DEFAULT 'Dikirim'");
        }

        Schema::table('mutasi_kirim_detail', function (Blueprint $table) {
            $table->string('nama_barang', 200)->nullable()->after('kode_barang');
            $table->string('satuan', 20)->nullable()->after('qty_kirim');
            $table->string('keterangan', 255)->nullable()->after('qty_diterima');
            $table->decimal('selisih', 10, 2)->default(0)->after('keterangan');
        });

        // Jejak selisih (kurang/lebih) per barang per paket mutasi, + tindak
        // lanjut yang diambil toko (dari sisi manapun yang menyesuaikan).
        Schema::create('mutasi_kirim_selisih', function (Blueprint $table) {
            $table->id();
            $table->foreignId('mutasi_kirim_id')->constrained('mutasi_kirim')->cascadeOnDelete();
            $table->foreignId('mutasi_kirim_detail_id')->constrained('mutasi_kirim_detail')->cascadeOnDelete();
            $table->string('kode_barang');
            $table->string('nama_barang', 200)->nullable();
            $table->enum('jenis', ['Kurang', 'Lebih']);
            $table->decimal('qty_selisih', 10, 2); // selalu nilai positif (besarnya selisih)
            $table->enum('status', ['Belum Ditindaklanjuti', 'Sudah Ditindaklanjuti'])->default('Belum Ditindaklanjuti');
            $table->string('tindakan', 255)->nullable();   // ringkasan aksi, mis. "Sesuaikan stok tujuan"
            $table->text('catatan')->nullable();
            $table->string('diselesaikan_oleh', 100)->nullable();
            $table->timestamp('waktu_selesai')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mutasi_kirim_selisih');

        Schema::table('mutasi_kirim_detail', function (Blueprint $table) {
            $table->dropColumn(['nama_barang', 'satuan', 'keterangan', 'selisih']);
        });

        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE mutasi_kirim MODIFY status ENUM('Dikirim','Diterima Sebagian','Selesai') NOT NULL DEFAULT 'Dikirim'");
        }

        Schema::table('mutasi_kirim', function (Blueprint $table) {
            $table->dropColumn([
                'dikirim_oleh', 'diterima_oleh', 'waktu_terima', 'catatan_terima',
                'ada_selisih', 'dibatalkan_oleh', 'waktu_batal', 'alasan_batal',
            ]);
        });
    }
};
