{{-- ═══════════════════════════════════════════════════════════
     MODULE: DASHBOARD — modules/dashboard.blade.php
     Dirender oleh: public/js/modules/dashboard.js → renderDashboard()
     Data dari API: GET /api/dashboard?cabang=...
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-dashboard">

  {{-- Kontainer ini diisi penuh oleh dashboard.js → renderDashboard() --}}
  {{-- Yang dirender JS:
       1. dash-hero         → KPI Kas, Penjualan, Laba, Piutang
       2. Grafik 6 bulan    → drawLineCanvas('c6bln', ...)
       3. Top 3 barang      → rank-item cards
       4. Chart per cabang  → drawBarCanvas('cCabang', ...)
       5. Komposisi L/R     → progress bars
       6. Aktivitas terbaru → tabel 10 transaksi terakhir
  --}}
  <div id="dashWrap">
    <div class="loading-state">
      <div class="loading-spinner"></div>
      <p>Memuat dashboard…</p>
    </div>
  </div>

</section>
