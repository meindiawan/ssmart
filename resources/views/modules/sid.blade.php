{{-- ══ TAB: INTEGRASI SID KASIR ══════════════════════════════════════════════
     sid.js → renderSid(), renderSidSync(), renderSidBarang(), renderSidPengaturan()
     Sub-tab: Status | Sync Penjualan | Sync Barang & Stok | Pengaturan
════════════════════════════════════════════════════════════════════════════════ --}}
<div id="tab-sid" style="display:none;">

  <div class="subnav" id="snSid">
    <button class="on" data-s="status">📡 Status Koneksi</button>
    <button data-s="syncjual">🛒 Sync Penjualan</button>
    <button data-s="syncbarang">📦 Sync Barang & Stok</button>
    <button data-s="pengaturan">⚙️ Pengaturan</button>
  </div>

  <div id="sid-status">
    <div class="loading-state"><div class="loading-spinner"></div><p>Mengecek koneksi SID…</p></div>
  </div>
  <div id="sid-syncjual"   style="display:none;"></div>
  <div id="sid-syncbarang" style="display:none;"></div>
  <div id="sid-pengaturan" style="display:none;"></div>

</div>
