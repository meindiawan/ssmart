<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\AuthController;
use App\Http\Middleware\CekLogin;

/*
|--------------------------------------------------------------------------
| Web Routes — Toko Sumini
|--------------------------------------------------------------------------
*/

// ── LOGIN (terbuka) ──────────────────────────────────────────────────────────
Route::get('/login',  [AuthController::class, 'form'])->name('login');
Route::post('/login', [AuthController::class, 'login'])->name('login.post');

// ── APLIKASI (wajib login) ───────────────────────────────────────────────────
Route::middleware(CekLogin::class)->group(function () {
    Route::get('/', function () {
        return view('pages.app');
    })->name('home');

    Route::get('/dashboard', function () {
        return view('pages.app');
    })->name('dashboard');

    Route::post('/logout', [AuthController::class, 'logout'])->name('logout');
});
