{{-- ═══════════════════════════════════════════════════════════
     MODULE: LAPORAN KEUANGAN — modules/laporan.blade.php
     Dirender oleh: public/js/modules/laporan.js
     ─────────────────────────────────────────────────────────
     Semua laporan dihitung OTOMATIS dari jurnal double-entry.
     Tidak ada input manual di sini — semua berasal dari transaksi.

     Sub-modul:
       lp-saldo    → renderNeracaSaldo()  → GET /api/laporan/neraca-saldo
       lp-labarugi → renderLabaRugi()     → GET /api/laporan/laba-rugi
       lp-neraca   → renderNeraca()       → GET /api/laporan/neraca
       lp-ppn      → renderRekapPPN()     → GET /api/laporan/rekap-ppn
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-laporan">

  {{-- Sub-navigasi — nav.js → wireSnav('snLap','lp') --}}
  <div class="subnav" id="snLap">
    <button class="on" data-s="saldo">⚖️ Neraca Saldo</button>
    <button data-s="labarugi">📈 Laba Rugi</button>
    <button data-s="lrx">📑 Laba Rugi Lengkap</button>
    <button data-s="neraca">🏦 Neraca</button>
    <button data-s="ppn">🧾 Rekap PPN</button>
  </div>

  {{-- ── Neraca Saldo ────────────────────────────────────────────
       laporan.js → renderNeracaSaldo()
       Merangkum total Debit & Kredit setiap akun.
       Verifikasi: Total D harus = Total K (jurnal seimbang)
       Format: Kode | Nama Akun | Debit | Kredit
  ─────────────────────────────────────────────────────────────── --}}
  <div id="lp-saldo">
    <div class="loading-state"><div class="loading-spinner"></div><p>Menyusun neraca saldo…</p></div>
  </div>

  {{-- ── Laporan Laba Rugi ───────────────────────────────────────
       laporan.js → renderLabaRugi()
       Struktur:
         Pendapatan         (akun kat=Pendapatan, normal K)
           Penjualan Kena PPN
           Penjualan Non-PPN
           Pendapatan Jasa
           Pendapatan Sewa
           (-) Retur Penjualan
         ─────────────────
         Total Pendapatan (DPP)
         (-) HPP            (akun 5101)
         ─────────────────
         Laba Kotor
         (-) Biaya Operasional  (akun kat=Beban, kecuali 5101)
         ─────────────────
         LABA BERSIH
  ─────────────────────────────────────────────────────────────── --}}
  <div id="lp-labarugi" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Menghitung laba rugi…</p></div>
  </div>

  {{-- ── Laba Rugi Lengkap (per cabang / shift / kasir / tanggal + PDF) ──
       laba-rugi-lengkap.js → renderLabaRugiLengkap()
       GET /api/laporan/laba-rugi-lengkap
       PENTING: id di dalam panel ini jangan diawali "lp-" (nav.js menyembunyikan id^="lp-").
  ─────────────────────────────────────────────────────────────── --}}
  <div id="lp-lrx" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Menyusun laporan…</p></div>
  </div>

  {{-- ── Neraca (Balance Sheet) ─────────────────────────────────
       laporan.js → renderNeraca()
       Struktur:
         ASET                        = akun kat=Aset (saldo normal D)
         LIABILITAS                  = akun kat=Liabilitas (saldo normal K)
         MODAL + Laba Berjalan       = akun kat=Modal + hasil L/R
         ─────────────────────────
         Verifikasi: Total Aset = Total Liabilitas + Modal
  ─────────────────────────────────────────────────────────────── --}}
  <div id="lp-neraca" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Menyusun neraca…</p></div>
  </div>

  {{-- ── Rekap PPN ───────────────────────────────────────────────
       laporan.js → renderRekapPPN()
       Per bulan:
         DPP Penjualan + PPN Keluaran (dari trx_jual barang Kena PPN)
         DPP Pembelian + PPN Masukan  (dari trx_beli barang Kena PPN)
         Kurang/(Lebih) Bayar = PPN Keluaran - PPN Masukan
       Tarif dari settings (default 11%)
       Berguna untuk pelaporan SPT Masa PPN / Coretax DJP
  ─────────────────────────────────────────────────────────────── --}}
  <div id="lp-ppn" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Menghitung rekap PPN…</p></div>
  </div>

</section>
