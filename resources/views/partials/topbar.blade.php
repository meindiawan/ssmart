{{-- ═══════════════════════════════════════════════════════════
     TOPBAR — partials/topbar.blade.php
     Header: breadcrumb, tanggal, status koneksi server
     ═══════════════════════════════════════════════════════════ --}}
<header class="topbar">

  <div class="topbar-left">
    {{-- Hamburger mobile --}}
    <button class="ham" id="ham" title="Menu">☰</button>

    {{-- Breadcrumb — teks diupdate nav.js saat ganti tab --}}
    <div>
      <div class="topbar-breadcrumb">
        <span class="bc-app">Toko Sumini</span>
        <span class="bc-sep">›</span>
        <span class="bc-page" id="pgTitle">Dashboard</span>
      </div>
      <div class="topbar-desc" id="pgDesc">Ringkasan kondisi keuangan toko</div>
    </div>
  </div>

  <div class="topbar-right">
    {{-- Tanggal hari ini — diisi JS --}}
    <div style="font-size:12px;color:var(--ink3);" id="todayLabel"></div>

    {{-- Buka tab baru di dalam aplikasi (menggandakan halaman yang sedang aktif) --}}
    <button type="button" class="btn-tabbaru" id="btnTabBaru" title="Tab baru (menggandakan halaman ini). Juga: Ctrl+klik / klik tengah pada menu, atau Ctrl+Alt+T">＋ Tab Baru</button>

    {{-- Indikator koneksi ke API Laravel --}}
    <div class="conn-status" id="connStatus">
      <span class="conn-dot"></span>
      <span class="conn-txt">Menghubungkan…</span>
    </div>
  </div>

</header>
