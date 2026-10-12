<?php

use Illuminate\Contracts\Http\Kernel;
use Illuminate\Http\Request;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = __DIR__.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';

// public/ dipindah ke root (index.php, css/, js/ sejajar dengan app/, vendor/, dll),
// jadi public_path() harus diarahkan ke sini juga, bukan ke folder public/ yang sudah kosong.
// Ini supaya asset('css/app.css'), public_path('js/...'), dan filemtime(public_path(...))
// di resources/views/layouts/main.blade.php tetap nemu filenya.
$app->usePublicPath(__DIR__);

$kernel = $app->make(Kernel::class);

$response = $kernel->handle(
    $request = Request::capture()
)->send();

$kernel->terminate($request, $response);
