{{-- ═══════════════════════════════════════════════════════════
     MODULE: STOK — modules/stok.blade.php
     Dirender oleh: public/js/modules/stok.js
     ─────────────────────────────────────────────────────────
     Sub-modul, JS function, & endpoint API:
       stok-saldo   → renderStok()          → /api/stok
       stok-masuk   → renderBarangMasuk()   → /api/stok/masuk
       stok-keluar  → renderBarangKeluar()  → /api/stok/keluar
       stok-opname  → renderOpname()        → /api/stok/opname
       stok-kartu   → renderKartuStok()     → /api/stok/kartu
       stok-pertanggal → renderStokPerTanggal() → /api/stok/per-tanggal
     ─────────────────────────────────────────────────────────
     Kartu Stok = riwayat pergerakan 1 barang secara kronologis
     dengan saldo berjalan, sehingga saldo stok di TANGGAL
     TERTENTU (bukan cuma hari ini) bisa dilihat — dilengkapi
     pencarian barang (kode/nama).
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-stok">

  {{-- Sub-navigasi — nav.js → wireSnav('snStok','stok') --}}
  <div class="subnav" id="snStok">
    <button class="on" data-s="saldo">📊 Saldo Stok</button>
    <button data-s="masuk">⬇️ Barang Masuk</button>
    <button data-s="keluar">⬆️ Barang Keluar</button>
    <button data-s="opname">🧮 Stok Opname</button>
    <button data-s="kartu">📅 Kartu Stok (Per Tanggal)</button>
    <button data-s="pertanggal">🗓️ Stok Semua Barang (Per Tanggal)</button>
  </div>

  <div id="stok-saldo">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat saldo stok…</p></div>
  </div>

  <div id="stok-masuk" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat barang masuk…</p></div>
  </div>

  <div id="stok-keluar" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat barang keluar…</p></div>
  </div>

  <div id="stok-opname" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat stok opname…</p></div>
  </div>

  {{-- ── Kartu Stok (Per Tanggal) ─────────────────────────────────
       stok.js → renderKartuStok()
       Pilih barang (search) + tanggal → tampil saldo pada tanggal
       itu + riwayat pergerakan kronologis dengan saldo berjalan.
  ─────────────────────────────────────────────────────────────── --}}
  <div id="stok-kartu" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat kartu stok…</p></div>
  </div>

  {{-- ── Stok Semua Barang Per Tanggal ────────────────────────────
       stok.js → renderStokPerTanggal() → /api/stok/per-tanggal
  ─────────────────────────────────────────────────────────────── --}}
  <div id="stok-pertanggal" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat stok per tanggal…</p></div>
  </div>

</section>
