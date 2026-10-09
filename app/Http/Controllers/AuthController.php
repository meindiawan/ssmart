<?php

namespace App\Http\Controllers;

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AuthController extends Controller
{
    private const MAKS_GAGAL   = 5;   // salah berapa kali sebelum dikunci sementara
    private const KUNCI_DETIK  = 60;  // lama dikunci

    public function form(Request $request)
    {
        if ($request->session()->get('login_ok') === true) {
            return redirect()->route('home');
        }
        return view('auth.login');
    }

    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => 'required|string|max:50',
            'password' => 'required|string|max:100',
        ], [
            'username.required' => 'Username wajib diisi.',
            'password.required' => 'Password wajib diisi.',
        ]);

        // Pembatasan percobaan (per IP) — pakai cache "file" supaya tidak butuh tabel cache di database
        $kunci = 'login-gagal:' . $request->ip();
        $cache = Cache::store('file');
        $gagal = (int) $cache->get($kunci, 0);
        if ($gagal >= self::MAKS_GAGAL) {
            return back()->withInput($request->only('username'))
                ->withErrors(['login' => 'Terlalu banyak percobaan salah. Coba lagi dalam 1 menit.']);
        }

        $userOk = hash_equals(strtolower((string) config('login.username')), strtolower(trim($data['username'])));
        $passOk = password_verify($data['password'], (string) config('login.password_hash'));

        if (!($userOk && $passOk)) {
            $cache->put($kunci, $gagal + 1, self::KUNCI_DETIK);
            return back()->withInput($request->only('username'))
                ->withErrors(['login' => 'Username atau password salah.']);
        }

        $cache->forget($kunci);
        $request->session()->regenerate();
        $request->session()->put('login_ok', true);
        $request->session()->put('login_nama', config('login.nama_tampil'));

        return redirect()->intended(route('home'));
    }

    public function logout(Request $request)
    {
        $request->session()->flush();
        $request->session()->invalidate();
        $request->session()->regenerateToken();
        return redirect()->route('login')->with('info', 'Anda sudah keluar.');
    }
}
