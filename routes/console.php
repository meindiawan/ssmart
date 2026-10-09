<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

use Illuminate\Support\Facades\Schedule;

// Sync SID otomatis setiap 5 menit
Schedule::command('sid:sync')->everyFiveMinutes()->withoutOverlapping();
