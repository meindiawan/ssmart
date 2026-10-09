{{-- ═══════════════════════════════════════════════════════════
     MODULE: ASET TETAP — modules/aset.blade.php
     Dirender oleh: public/js/modules/aset.js → renderAset()
     ─────────────────────────────────────────────────────────
     Daftar aset tetap (kendaraan, peralatan toko, elektronik, dll)
     dengan penyusutan otomatis metode garis lurus. Perolehan &
     penyusutan bulanan masuk Jurnal otomatis (akun 1201 Aset Tetap,
     1202 Akumulasi Penyusutan, 6106 Biaya Penyusutan) — lihat
     App\Services\AsetPenyusutanService & DashboardController::buildJurnal.

     Endpoint API:
       GET    /api/aset/summary          → total nilai perolehan/akumulasi/buku
       GET    /api/aset                  → daftar aset + nilai buku berjalan
       POST   /api/aset                  → tambah aset
       PUT    /api/aset/{id}             → edit aset
       DELETE /api/aset/{id}             → hapus aset
       POST   /api/aset/{id}/nonaktifkan → tandai Dijual/Dihapus (stop penyusutan)
       POST   /api/aset/{id}/aktifkan    → aktifkan kembali
       GET    /api/aset/{id}/jadwal      → jadwal penyusutan bulanan (drill-down)
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-aset">
  <div id="aset-body">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data aset…</p></div>
  </div>
</section>
