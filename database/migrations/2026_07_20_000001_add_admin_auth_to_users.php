<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Beberapa instalasi project ini ternyata TIDAK punya tabel `users` sama
// sekali (migration bawaan Laravel untuk tabel itu tidak pernah dibuat).
// Migration ini menyesuaikan: kalau tabel belum ada -> buat dari nol
// (lengkap dengan username & role). Kalau sudah ada -> tinggal tambah
// kolom yang belum ada saja, supaya aman dijalankan di kedua kondisi
// (mis. project yang sudah lebih dulu punya tabel users vs yang belum).
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('users')) {
            Schema::create('users', function (Blueprint $table) {
                $table->id();
                $table->string('name');
                $table->string('username', 50)->unique()->nullable();
                $table->string('role', 20)->default('customer'); // customer | admin | driver
                $table->string('email')->unique()->nullable();
                $table->timestamp('email_verified_at')->nullable();
                $table->string('password');
                $table->rememberToken();
                $table->timestamps();
            });

            return;
        }

        Schema::table('users', function (Blueprint $table) {
            if (!Schema::hasColumn('users', 'username')) {
                $table->string('username', 50)->unique()->nullable()->after('name');
            }
            if (!Schema::hasColumn('users', 'role')) {
                $table->string('role', 20)->default('customer')->after('username');
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('users')) {
            Schema::table('users', function (Blueprint $table) {
                if (Schema::hasColumn('users', 'username')) {
                    $table->dropColumn('username');
                }
                if (Schema::hasColumn('users', 'role')) {
                    $table->dropColumn('role');
                }
            });
        }
    }
};
