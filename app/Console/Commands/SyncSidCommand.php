<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Http\Controllers\Api\SidSyncController;
use Illuminate\Http\Request;

class SyncSidCommand extends Command
{
    protected $signature   = 'sid:sync {--tanggal= : Tanggal dd/mm/yyyy, default hari ini}';
    protected $description = 'Sync penjualan dari SID kasir ke Toko Sumini';

    public function handle(): void
    {
        $tanggal = $this->option('tanggal') ?: date('d/m/Y');
        $this->info("Sync SID penjualan tanggal: {$tanggal}");

        $ctrl = new SidSyncController();
        $res  = $ctrl->syncPenjualan(new Request(['tanggal' => $tanggal]))->getData(true);

        $this->info("✓ Berhasil : {$res['berhasil']}");
        $this->info("  Dilewati : {$res['dilewati']}");
        if ($res['gagal'] > 0) {
            $this->error("✗ Gagal    : {$res['gagal']}");
            foreach ($res['pesan'] as $p) $this->error("  → {$p}");
        }
    }
}
