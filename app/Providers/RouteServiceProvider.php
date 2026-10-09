<?php

namespace App\Providers;

use App\Http\Middleware\CekLogin;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Support\Providers\RouteServiceProvider as ServiceProvider;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;

class RouteServiceProvider extends ServiceProvider
{
    public function boot(): void
    {
        $this->routes(function () {
            // Semua endpoint /api wajib login. Session-nya sama dengan halaman web,
            // jadi cookie harus dienkripsi/dibaca dengan cara yang sama (EncryptCookies).
            Route::middleware([
                    'api',
                    EncryptCookies::class,
                    AddQueuedCookiesToResponse::class,
                    StartSession::class,
                    CekLogin::class,
                ])
                ->prefix('api')
                ->group(base_path('routes/api.php'));

            Route::middleware('web')
                ->group(base_path('routes/web.php'));
        });
    }
}
