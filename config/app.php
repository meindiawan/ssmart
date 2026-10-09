<?php

use Illuminate\Support\Facades\Facade;
use Illuminate\Support\ServiceProvider;

return [

    'name'     => env('APP_NAME', 'Toko Sumini'),
    'env'      => env('APP_ENV', 'production'),
    'debug'    => (bool) env('APP_DEBUG', false),
    'url'      => env('APP_URL', 'http://localhost'),
    'asset_url'=> env('ASSET_URL'),
    'timezone' => 'Asia/Jakarta',
    'locale'   => 'id',
    'fallback_locale' => 'en',
    'faker_locale'    => 'id_ID',
    'key'      => env('APP_KEY'),
    'cipher'   => 'AES-256-CBC',

    'maintenance' => ['driver' => 'file'],

    'providers' => ServiceProvider::defaultProviders()->merge([
        App\Providers\AppServiceProvider::class,
        App\Providers\RouteServiceProvider::class,  // ← tambahkan ini
    ])->toArray(),

    'aliases' => Facade::defaultAliases()->merge([
        // 'Example' => App\Facades\Example::class,
    ])->toArray(),

];
