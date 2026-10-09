{{-- ═══════════════════════════════════════════════════════════
     SIDEBAR — partials/sidebar.blade.php
     Navigasi utama + pemilih cabang + footer settings
     ═══════════════════════════════════════════════════════════ --}}
<aside class="sb" id="sb">

  {{-- Logo & Pemilih Cabang --}}
  <div class="sb-brand">
    <div class="sb-logo">
      <div class="sb-logo-mark">TS</div>
      <div class="sb-logo-text">
        <div class="name">Toko Sumini</div>
        <div class="sub">Akuntansi Multi-Cabang</div>
      </div>
    </div>
    {{-- Dropdown filter cabang — diisi JS setelah loadMasterData() --}}
    <div class="sb-cabang-pill">
      <span class="ic">🏬</span>
      <select id="gCabang" title="Filter Cabang">
        <option value="">Semua Cabang</option>
        {{-- Opsi diisi dinamis oleh state.js → fillCabangDropdown() --}}
      </select>
    </div>
  </div>

  {{-- Navigasi Menu --}}
  <nav class="sb-nav">

    <div class="sb-section">Kasir</div>

    <button class="nb nb-pos" data-tab="pos">
      <span class="ni">🧾</span> Kasir POS
    </button>

    <div class="sb-section">Menu Utama</div>

    {{-- Setiap tombol punya data-tab yang dipakai nav.js untuk routing --}}
    <button class="nb" data-tab="dashboard">
      <span class="ni">📊</span> Dashboard
    </button>
    <button class="nb" data-tab="analisis">
      <span class="ni">🔍</span> Analisis Data
    </button>
    <button class="nb" data-tab="master">
      <span class="ni">🗂️</span> Data Master
    </button>
    <button class="nb" data-tab="transaksi">
      <span class="ni">💳</span> Transaksi
    </button>
    <button class="nb" data-tab="stok">
      <span class="ni">📦</span> Stok
    </button>
    <button class="nb" data-tab="kontak">
      <span class="ni">📇</span> Kontak
    </button>
    <button class="nb" data-tab="poin">
      <span class="ni">🎁</span> Poin Member
    </button>
    <button class="nb" data-tab="aset">
      <span class="ni">🏢</span> Aset Tetap
    </button>

    <div class="sb-section">Pembukuan</div>

    <button class="nb" data-tab="jurnal">
      <span class="ni">📓</span> Jurnal & Buku Besar
    </button>
    <button class="nb" data-tab="laporan">
      <span class="ni">📑</span> Laporan Keuangan
    </button>
    <button class="nb" data-tab="sid">
      <span class="ni">🔗</span> Integrasi SID
    </button>
    <button class="nb" data-tab="sinkron">
      <span class="ni">🔄</span> Sinkronisasi Data
    </button>

  </nav>

  {{-- Footer Sidebar: tarif PPN + aksi cepat --}}
  <div class="sb-footer">
    <div style="display:flex;align-items:center;gap:8px;">
      <span>Tarif PPN</span>
      {{-- Nilai diisi JS setelah loadSettings() --}}
      <span class="tarif-badge" id="tarifBadge">11%</span>
    </div>
    <div class="sb-footer-actions">
      <button id="btnEditTarif">⚙️ Pengaturan</button>
      <button id="btnExportAll">📤 Export Semua Data (Excel)</button>
      <form method="POST" action="{{ route('logout') }}" style="display:contents;">
        @csrf
        <button type="submit" title="Keluar dari aplikasi">🚪 Keluar ({{ session('login_nama', 'Admin') }})</button>
      </form>
    </div>
  </div>

</aside>
