<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="csrf-token" content="{{ csrf_token() }}">
<title>@yield('title', 'Akuntansi Toko Sumini')</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
<script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
<link rel="stylesheet" href="{{ asset('css/app.css') }}?v={{ filemtime(public_path('css/app.css')) }}">
</head>
<body>

{{-- ═══ SPLASH SCREEN ═══ --}}
<div id="splash">
  <div class="splash-mark">TS</div>
  <div class="splash-title">Toko Sumini</div>
  <div class="splash-sub">Sistem Akuntansi Multi-Cabang</div>
  <div class="splash-bar"><div class="splash-bar-fill"></div></div>
  <div class="splash-hint" id="splashHint">Menghubungkan ke server…</div>
</div>

{{-- ═══ TOAST NOTIFIKASI ═══ --}}
<div id="toastArea"></div>

{{-- ═══ MODAL POPUP ═══ --}}
<div class="moverlay" id="moverlay">
  <div class="mbox" id="mbox"></div>
</div>

{{-- ═══ KE ATAS / KE BAWAH — muncul otomatis kalau halaman panjang ═══ --}}
<div class="scroll-nav" id="scrollNav">
  <button type="button" class="scroll-nav-btn" id="btnScrollUp" title="Ke atas" onclick="pageScrollTo('top')">↑</button>
  <button type="button" class="scroll-nav-btn" id="btnScrollDown" title="Ke bawah" onclick="pageScrollTo('bottom')">↓</button>
</div>

{{-- ═══ APLIKASI UTAMA ═══ --}}
<div id="app" style="display:none;">

  {{-- SIDEBAR --}}
  @include('partials.sidebar')

  {{-- MAIN CONTENT --}}
  <div class="main">

    {{-- TOPBAR --}}
    @include('partials.topbar')

    {{-- KONTEN HALAMAN --}}
    <div class="content">
      <div class="pw">

        {{-- ══ TAB: DASHBOARD ══════════════════════════════════════════ --}}
        @include('modules.dashboard')

        {{-- ══ TAB: KASIR POS ══════════════════════════════════════════ --}}
        @include('modules.pos')

        {{-- ══ TAB: ANALISIS DATA ═══════════════════════════════════════ --}}
        @include('modules.analisis')

        {{-- ══ TAB: DATA MASTER ════════════════════════════════════════ --}}
        @include('modules.master')

        {{-- ══ TAB: TRANSAKSI ══════════════════════════════════════════ --}}
        @include('modules.transaksi')

        {{-- ══ TAB: STOK ═══════════════════════════════════════════════ --}}
        @include('modules.stok')

        {{-- ══ TAB: KONTAK ═════════════════════════════════════════════ --}}
        @include('modules.kontak')

        {{-- ══ TAB: POIN MEMBER ════════════════════════════════════════ --}}
        @include('modules.poin')

        {{-- ══ TAB: ASET TETAP ═════════════════════════════════════════ --}}
        @include('modules.aset')

        {{-- ══ TAB: JURNAL & BUKU BESAR ════════════════════════════════ --}}
        @include('modules.jurnal')

        {{-- ══ TAB: LAPORAN KEUANGAN ═══════════════════════════════════ --}}
        @include('modules.laporan')

        {{-- ══ TAB: INTEGRASI SID KASIR ═══════════════════════════════ --}}
        @include('modules.sid')

        {{-- ══ TAB: SINKRONISASI DATA ══════════════════════════════════ --}}
        @include('modules.sinkronisasi')

      </div>{{-- /.pw --}}
    </div>{{-- /.content --}}

  </div>{{-- /.main --}}
</div>{{-- /#app --}}

{{-- ═══ INJECT KONFIGURASI LARAVEL KE JAVASCRIPT ═══ --}}
<script>
window.APP_CONFIG = {
    apiBase    : '{{ url("/api") }}',
    csrfToken  : '{{ csrf_token() }}',
    appName    : '{{ config("app.name", "Toko Sumini") }}',
    appEnv     : '{{ config("app.env") }}',
    appDebug   : {{ config('app.debug') ? 'true' : 'false' }},
};
</script>

{{-- ═══ JAVASCRIPT MODULES (urutan penting!) ═══ --}}
<script src="{{ asset('js/modules/helpers.js') }}?v={{ filemtime(public_path('js/modules/helpers.js')) }}"></script>       {{-- Fungsi umum: format, escape, toast, modal --}}
<script src="{{ asset('js/modules/api.js') }}?v={{ filemtime(public_path('js/modules/api.js')) }}"></script>           {{-- HTTP fetch wrapper ke Laravel API --}}
<script src="{{ asset('js/modules/state.js') }}?v={{ filemtime(public_path('js/modules/state.js')) }}"></script>         {{-- State global: cabang, barang, coa, jasa --}}
<script src="{{ asset('js/modules/charts.js') }}?v={{ filemtime(public_path('js/modules/charts.js')) }}"></script>        {{-- Canvas chart: bar & line --}}
<script src="{{ asset('js/modules/nav.js') }}?v={{ filemtime(public_path('js/modules/nav.js')) }}"></script>           {{-- Navigasi tab & subnav --}}
<script src="{{ asset('js/modules/export.js') }}?v={{ filemtime(public_path('js/modules/export.js')) }}"></script>        {{-- Export Excel & Print --}}
<script src="{{ asset('js/modules/dashboard.js') }}?v={{ filemtime(public_path('js/modules/dashboard.js')) }}"></script>     {{-- Render dashboard + KPI --}}
<script src="{{ asset('js/modules/analisis.js') }}?v={{ filemtime(public_path('js/modules/analisis.js')) }}"></script>      {{-- Barang terlaris, tren, margin, cabang --}}
<script src="{{ asset('js/modules/master.js') }}?v={{ filemtime(public_path('js/modules/master.js')) }}"></script>        {{-- CRUD cabang, COA, barang, jasa, pelanggan, kadaluarsa --}}
<script src="{{ asset('js/modules/import-master.js') }}?v={{ filemtime(public_path('js/modules/import-master.js')) }}"></script> {{-- Import Excel: Supplier, Pelanggan, Jasa, COA --}}
<script src="{{ asset('js/modules/saldoawal.js') }}?v={{ filemtime(public_path('js/modules/saldoawal.js')) }}"></script>    {{-- Saldo Awal: Akun (matriks per cabang) & Inventory (input manual + import + deteksi otomatis) --}}
<script src="{{ asset('js/modules/slipgaji.js') }}?v={{ filemtime(public_path('js/modules/slipgaji.js')) }}"></script>      {{-- Cetak slip gaji karyawan format 80mm --}}
<script src="{{ asset('js/modules/stok.js') }}?v={{ filemtime(public_path('js/modules/stok.js')) }}"></script>           {{-- Stok barang, barang masuk/keluar, opname --}}
<script src="{{ asset('js/modules/sid.js') }}?v={{ filemtime(public_path('js/modules/sid.js')) }}"></script>            {{-- Integrasi SID Kasir --}}
<script src="{{ asset('js/modules/transaksi.js') }}?v={{ filemtime(public_path('js/modules/transaksi.js')) }}"></script>     {{-- Input & tampil semua transaksi --}}
<script src="{{ asset('js/modules/mutasi.js') }}?v={{ filemtime(public_path('js/modules/mutasi.js')) }}"></script>        {{-- Mutasi Barang: paket multi-barang, kirim→konfirmasi, cetak struk/faktur --}}
<script src="{{ asset('js/modules/pos.js') }}?v={{ filemtime(public_path('js/modules/pos.js')) }}"></script>          {{-- Kasir POS: jual/beli multi-barang, diskon, poin, struk --}}
<script src="{{ asset('js/modules/kontak.js') }}?v={{ filemtime(public_path('js/modules/kontak.js')) }}"></script>       {{-- Buku alamat: karyawan/pelanggan/supplier + riwayat hutang piutang --}}
<script src="{{ asset('js/modules/poin.js') }}?v={{ filemtime(public_path('js/modules/poin.js')) }}"></script>         {{-- Rekap Poin Member lama per cabang + katalog hadiah + tukar poin --}}
<script src="{{ asset('js/modules/aset.js') }}?v={{ filemtime(public_path('js/modules/aset.js')) }}"></script>         {{-- Aset Tetap: CRUD + penyusutan garis lurus otomatis --}}
<script src="{{ asset('js/modules/jurnal.js') }}?v={{ filemtime(public_path('js/modules/jurnal.js')) }}"></script>        {{-- Jurnal umum & buku besar --}}
<script src="{{ asset('js/modules/laporan.js') }}?v={{ filemtime(public_path('js/modules/laporan.js')) }}"></script>       {{-- Neraca saldo, L/R, neraca, rekap PPN --}}
<script src="{{ asset('js/modules/laba-rugi-lengkap.js') }}?v={{ filemtime(public_path('js/modules/laba-rugi-lengkap.js')) }}"></script> {{-- Laba Rugi Lengkap: per cabang, shift, kasir, tanggal + download PDF/Excel --}}
<script src="{{ asset('js/modules/sinkronisasi.js') }}?v={{ filemtime(public_path('js/modules/sinkronisasi.js')) }}"></script> {{-- Sinkronisasi Data: cek/compare hasil import vs data tersimpan --}}
<script src="{{ asset('js/modules/app.js') }}?v={{ filemtime(public_path('js/modules/app.js')) }}"></script>           {{-- Bootstrap: init, load master data, splash --}}

</body>
</html>
