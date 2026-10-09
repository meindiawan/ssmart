<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Seeder;

// Jalankan terpisah dari DatabaseSeeder utama supaya tidak ikut ke-generate
// ulang tiap kali seed data dummy dijalankan:
//   php artisan db:seed --class=AdminSeeder
class AdminSeeder extends Seeder
{
    public function run(): void
    {
        User::updateOrCreate(
            ['username' => 'admin'],
            [
                'name'     => 'Administrator',
                'email'    => 'admin@tokosumini.com',
                'role'     => 'admin',
                // GANTI lewat menu ubah password setelah login pertama kali!
                'password' => 'admin123',
            ]
        );
    }
}
