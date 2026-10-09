<?php

/*
|--------------------------------------------------------------------------
| Login Aplikasi — Toko Sumini
|--------------------------------------------------------------------------
| Password TIDAK disimpan polos, tapi sebagai hash bcrypt.
| Untuk ganti password, jalankan di folder project:
|     php -r "echo password_hash('PASSWORD_BARU', PASSWORD_BCRYPT);"
| lalu tempel hasilnya ke 'password_hash' di bawah (atau ke .env sebagai
| LOGIN_PASSWORD_HASH — ingat tanda $ di .env harus diapit tanda kutip tunggal).
*/
return [
    'username'      => env('LOGIN_USERNAME', 'admin'),
    'password_hash' => env('LOGIN_PASSWORD_HASH', '$2y$10$o0T.1/5poctyYucDsrW.3OIaV.FxnoBj8H8ItZsm9Da6xDuIDKhuO'),
    'nama_tampil'   => 'Administrator',
];
