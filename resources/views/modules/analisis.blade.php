{{-- ═══════════════════════════════════════════════════════════
     MODULE: ANALISIS DATA — modules/analisis.blade.php
     Dirender oleh: public/js/modules/analisis.js
     Sub-modul:
       - an-baranglaku → renderAnalisisBarangLaku()   → GET /api/laporan + /api/transaksi/jual
       - an-cabangcomp → renderAnalisisCabang()       → GET /api/analisis/cabang
       - an-tren       → renderAnalisisTren()         → GET /api/analisis/tren
       - an-margin     → renderAnalisisMargin()       → GET /api/analisis/margin
       - an-kasir      → renderAnalisisKasir()        → GET /api/analisis/kasir
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-analisis">

  {{-- Sub-navigasi tab Analisis — dikontrol nav.js → wireSnav('snAnalisis','an') --}}
  <div class="subnav" id="snAnalisis">
    <button class="on" data-s="baranglaku">🏆 Barang Terlaris</button>
    <button data-s="cabangcomp">🏬 Perbandingan Cabang</button>
    <button data-s="tren">📈 Tren Penjualan</button>
    <button data-s="margin">💰 Margin & HPP</button>
    <button data-s="kasir">👤 Kasir & Shift</button>
  </div>

  {{-- ── Barang Terlaris ─────────────────────────────────────────
       analisis.js → renderAnalisisBarangLaku()
       Konten: insight cards, bar chart omzet, tabel detail
  ─────────────────────────────────────────────────────────────── --}}
  <div id="an-baranglaku">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data barang…</p></div>
  </div>

  {{-- ── Perbandingan Cabang ─────────────────────────────────────
       analisis.js → renderAnalisisCabang()
       Konten: bar chart kontribusi, tabel detail per cabang
  ─────────────────────────────────────────────────────────────── --}}
  <div id="an-cabangcomp" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data cabang…</p></div>
  </div>

  {{-- ── Tren Penjualan 12 Bulan ─────────────────────────────────
       analisis.js → renderAnalisisTren()
       Konten: line chart jual & laba, tabel bulanan
  ─────────────────────────────────────────────────────────────── --}}
  <div id="an-tren" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat tren…</p></div>
  </div>

  {{-- ── Analisis Margin & HPP ───────────────────────────────────
       analisis.js → renderAnalisisMargin()
       Konten: insight cards, tabel margin per barang, visual bar %
  ─────────────────────────────────────────────────────────────── --}}
  <div id="an-margin" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat analisis margin…</p></div>
  </div>

  {{-- ── Kasir & Shift ──────────────────────────────────────────
       analisis.js → renderAnalisisKasir()
       Konten: penjualan & laba per shift → kasir → cabang, total per cabang, total semua
  ─────────────────────────────────────────────────────────────── --}}
  <div id="an-kasir" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat laporan kasir…</p></div>
  </div>

</section>
