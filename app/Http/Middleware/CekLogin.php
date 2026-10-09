<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;

/**
 * Menjaga halaman aplikasi & seluruh endpoint /api: hanya yang sudah login
 * (session 'login_ok') yang boleh lewat.
 *  - Halaman web  → diarahkan ke /login
 *  - Request API  → balasan JSON 401 (api.js lalu mengarahkan ke /login)
 */
class CekLogin
{
    public function handle(Request $request, Closure $next)
    {
        if ($request->session()->get('login_ok') === true) {
            return $next($request);
        }

        if ($request->is('api/*') || $request->expectsJson()) {
            return response()->json(['message' => 'Sesi login berakhir. Silakan login lagi.'], 401);
        }

        return redirect()->route('login');
    }
}
