<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Cabang
        Schema::create('cabang', function (Blueprint $table) {
            $table->id();
            $table->string('nama')->unique();
            $table->string('alamat')->nullable();
            $table->timestamps();
        });

        // Chart of Accounts
        Schema::create('coa', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 10)->unique();
            $table->string('nama');
            $table->enum('kat', ['Aset', 'Liabilitas', 'Modal', 'Pendapatan', 'Beban']);
            $table->enum('normal', ['D', 'K']);
            $table->boolean('is_default')->default(false);
            $table->timestamps();
        });

        // Barang
        Schema::create('barang', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 50)->unique();
            $table->string('nama');
            $table->enum('ppn', ['Kena PPN', 'Non-PPN'])->default('Kena PPN');
            $table->decimal('modal', 15, 2)->default(0);
            $table->timestamps();
        });

        // Jasa
        Schema::create('jasa', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 50)->unique();
            $table->string('nama');
            $table->enum('ppn', ['Kena PPN', 'Non-PPN'])->default('Non-PPN');
            $table->decimal('harga', 15, 2)->default(0);
            $table->timestamps();
        });

        // Pelanggan
        Schema::create('pelanggan', function (Blueprint $table) {
            $table->id();
            $table->string('kode', 50)->unique();
            $table->string('nama');
            $table->string('telp', 30)->nullable();
            $table->string('alamat')->nullable();
            $table->integer('poin')->default(0);
            $table->timestamps();
        });

        // Transaksi Penjualan
        Schema::create('trx_jual', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('kode_barang');
            $table->decimal('qty', 10, 2);
            $table->decimal('harga', 15, 2);
            $table->enum('bayar', ['Tunai', 'Kredit'])->default('Tunai');
            $table->timestamps();
        });

        // Transaksi Pembelian
        Schema::create('trx_beli', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('kode_barang');
            $table->decimal('qty', 10, 2);
            $table->decimal('harga', 15, 2);
            $table->enum('bayar', ['Tunai', 'Kredit'])->default('Tunai');
            $table->timestamps();
        });

        // Transaksi Jasa
        Schema::create('trx_jasa', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('kode_jasa');
            $table->decimal('qty', 10, 2)->default(1);
            $table->decimal('harga', 15, 2);
            $table->enum('bayar', ['Tunai', 'Kredit'])->default('Tunai');
            $table->timestamps();
        });

        // Transaksi Sewa
        Schema::create('trx_sewa', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('nama_penyewa');
            $table->string('item');
            $table->date('tgl_mulai');
            $table->date('tgl_selesai');
            $table->decimal('biaya', 15, 2);
            $table->enum('ppn', ['Kena PPN', 'Non-PPN'])->default('Non-PPN');
            $table->enum('bayar', ['Tunai', 'Kredit'])->default('Tunai');
            $table->timestamps();
        });

        // Mutasi Barang
        Schema::create('trx_mutasi', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('dari_cabang');
            $table->string('ke_cabang');
            $table->string('kode_barang');
            $table->decimal('qty', 10, 2);
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Retur Barang
        Schema::create('trx_retur', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->enum('jenis', ['Jual', 'Beli']);
            $table->string('kode_barang');
            $table->decimal('qty', 10, 2);
            $table->decimal('harga', 15, 2);
            $table->enum('bayar', ['Tunai', 'Kredit'])->default('Tunai');
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Kasbon (Karyawan)
        Schema::create('trx_kasbon', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('nama_karyawan');
            $table->enum('jenis', ['Diberikan', 'Dibayar']);
            $table->decimal('nominal', 15, 2);
            $table->timestamps();
        });

        // Cashbon Pelanggan
        Schema::create('trx_cashbon', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('nama_pelanggan');
            $table->enum('jenis', ['Diberikan', 'Dibayar']);
            $table->decimal('nominal', 15, 2);
            $table->timestamps();
        });

        // Pengeluaran / Biaya
        Schema::create('trx_biaya', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('kode_akun', 10);
            $table->decimal('nominal', 15, 2);
            $table->enum('bayar', ['Kas', 'Bank'])->default('Kas');
            $table->text('keterangan')->nullable();
            $table->timestamps();
        });

        // Barang Kadaluarsa
        Schema::create('barang_kadaluarsa', function (Blueprint $table) {
            $table->id();
            $table->date('tgl');
            $table->string('cabang');
            $table->string('kode_barang');
            $table->string('batch')->nullable();
            $table->decimal('qty', 10, 2);
            $table->date('tgl_exp');
            $table->timestamps();
        });

        // Setting Aplikasi
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->text('value')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        $tables = [
            'settings', 'barang_kadaluarsa', 'trx_biaya', 'trx_cashbon',
            'trx_kasbon', 'trx_retur', 'trx_mutasi', 'trx_sewa',
            'trx_jasa', 'trx_beli', 'trx_jual', 'pelanggan',
            'jasa', 'barang', 'coa', 'cabang',
        ];
        foreach ($tables as $t) {
            Schema::dropIfExists($t);
        }
    }
};
