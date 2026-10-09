{{-- ═══════════════════════════════════════════════════════════
     RIBBON — partials/ribbon.blade.php
     Header horizontal gaya "ribbon" (menggantikan sidebar kiri):
     baris atas = brand + cabang + aksi cepat,
     baris bawah = tab menu utama (horizontal, TIDAK sliding —
     pada layar sempit tab akan turun ke bawah/wrap, bukan digeser).
     ═══════════════════════════════════════════════════════════ --}}
<header class="rb" id="sb">

  {{-- Baris atas: logo, cabang, status koneksi, aksi cepat --}}
  <div class="rb-top">
    <div class="rb-brand">
      <div class="rb-logo">TS</div>
      <div class="rb-brand-text">
        <div class="name">Toko Sumini</div>
        <div class="sub" id="pgDesc">Ringkasan kondisi keuangan toko</div>
      </div>
    </div>

    <div class="rb-top-right">
      <div style="font-size:12px;color:var(--rb-ink2);" id="todayLabel"></div>

      <div class="conn-status" id="connStatus">
        <span class="conn-dot"></span>
        <span class="conn-txt">Menghubungkan…</span>
      </div>

      <div class="rb-cabang-pill">
        <span class="ic">🏬</span>
        <select id="gCabang" title="Filter Cabang">
          <option value="">Semua Cabang</option>
          {{-- Opsi diisi dinamis oleh state.js → fillCabangDropdown() --}}
        </select>
      </div>

      <div style="display:flex;align-items:center;gap:6px;">
        <span style="font-size:11px;color:var(--rb-ink2);">PPN</span>
        <span class="tarif-badge" id="tarifBadge">11%</span>
      </div>

      <button id="btnEditTarif" class="rb-icon-btn" title="Pengaturan">⚙️</button>
      <button id="btnExportAll" class="rb-icon-btn" title="Export Semua Data (Excel)">📤</button>

      {{-- Hamburger — di layar sempit, tekan untuk buka/tutup daftar menu (turun ke bawah, bukan geser) --}}
      <button class="ham" id="ham" title="Menu">☰</button>
    </div>
  </div>

  {{-- Baris bawah: tab menu utama, horizontal, wrap di layar sempit --}}
  <nav class="rb-tabs" id="rbTabs">
    <button class="nb" data-tab="dashboard"><span class="ni">📊</span> Dashboard</button>
    <button class="nb" data-tab="analisis"><span class="ni">🔍</span> Analisis Data</button>
    <button class="nb" data-tab="master"><span class="ni">🗂️</span> Data Master</button>
    <button class="nb" data-tab="transaksi"><span class="ni">💳</span> Transaksi</button>
    <button class="nb" data-tab="jurnal"><span class="ni">📓</span> Jurnal &amp; Buku Besar</button>
    <button class="nb" data-tab="laporan"><span class="ni">📑</span> Laporan Keuangan</button>
    <button class="nb" data-tab="sid"><span class="ni">🔗</span> Integrasi SID</button>
  </nav>

  {{-- Judul halaman aktif (dipakai nav.js, ditampilkan tipis di bawah tab) --}}
  <div class="rb-pagetitle" id="pgTitle">Dashboard</div>

</header>
