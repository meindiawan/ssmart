{{-- ═══════════════════════════════════════════════════════════
     MODULE: TRANSAKSI — modules/transaksi.blade.php
     Dirender oleh: public/js/modules/transaksi.js
     ─────────────────────────────────────────────────────────
     Sub-modul, JS function, & endpoint API:
       tx-jual    → renderJualBeli('jual','tx-jual')    → /api/transaksi/jual
       tx-beli    → renderJualBeli('beli','tx-beli')    → /api/transaksi/beli
       tx-jasa    → renderTrxJasa()                     → /api/transaksi/jasa
       tx-sewa    → renderSewa()                        → /api/transaksi/sewa
       tx-mutasi  → renderMutasi()  (di mutasi.js)       → /api/mutasi-kirim
       tx-retur   → renderRetur()                       → /api/transaksi/retur
       tx-kasbon  → renderKasbon()                      → /api/transaksi/kasbon
       tx-cashbon → renderCashbon()                     → /api/transaksi/cashbon
       tx-biaya   → renderBiaya()                       → /api/transaksi/biaya
     ─────────────────────────────────────────────────────────
     Setiap sub-modul punya:
       - Form input + validasi kode barang/jasa dari STATE
       - Tabel riwayat dengan pagination
       - Tombol hapus (DELETE ke API)
       - Tombol Export Excel & Print
     Jurnal akuntansi dibuat OTOMATIS oleh DashboardController::buildJurnal()
     berdasarkan data yang tersimpan di tabel-tabel transaksi ini.
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-transaksi">

  {{-- Sub-navigasi — nav.js → wireSnav('snTrx','tx') --}}
  <div class="subnav" id="snTrx">
    <button class="on" data-s="jual">🛒 Penjualan</button>
    <button data-s="beli">📦 Pembelian</button>
    <button data-s="jasa">🛠️ Jasa</button>
    <button data-s="sewa">🗝️ Sewa</button>
    <button data-s="mutasi">🚚 Mutasi Barang</button>
    <button data-s="retur">↩️ Barang Retur</button>
    <button data-s="kasbon">💵 Kasbon</button>
    <button data-s="cashbon">🏷️ Cashbon Pelanggan</button>
    <button data-s="biaya">💸 Pengeluaran</button>
  </div>

  {{-- ── Penjualan Barang ────────────────────────────────────────
       transaksi.js → renderJualBeli('jual', 'tx-jual')
       Jurnal yang dibuat otomatis:
         Kas/Piutang          Dr  (total harga)
         Penjualan Kena PPN   Cr  (DPP)
         PPN Keluaran         Cr  (PPN jika kena PPN)
         HPP                  Dr  (qty × harga modal)
         Persediaan Barang    Cr  (qty × harga modal)
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-jual">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data penjualan…</p></div>
  </div>

  {{-- ── Pembelian Barang ────────────────────────────────────────
       transaksi.js → renderJualBeli('beli', 'tx-beli')
       Jurnal:
         Persediaan Barang    Dr  (DPP)
         PPN Masukan          Dr  (PPN jika kena PPN)
         Kas/Hutang Usaha     Cr  (total)
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-beli" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data pembelian…</p></div>
  </div>

  {{-- ── Penjualan Jasa/Layanan ──────────────────────────────────
       transaksi.js → renderTrxJasa()
       Jurnal:
         Kas/Piutang          Dr  (total)
         Pendapatan Jasa      Cr  (DPP)
         PPN Keluaran         Cr  (PPN jika kena PPN)
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-jasa" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data jasa…</p></div>
  </div>

  {{-- ── Transaksi Sewa ──────────────────────────────────────────
       transaksi.js → renderSewa()
       Jurnal:
         Kas/Piutang          Dr  (biaya sewa)
         Pendapatan Sewa      Cr  (DPP)
         PPN Keluaran         Cr  (PPN jika kena PPN)
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-sewa" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data sewa…</p></div>
  </div>

  {{-- ── Mutasi Barang Antar Cabang (paket multi-barang) ─────────
       mutasi.js → renderMutasi()
       1 kode mutasi bisa berisi banyak barang sekaligus. Alur:
       Dikirim (stok asal berkurang) → cabang tujuan cek fisik →
       Konfirmasi/ACC (stok tujuan bertambah sesuai qty yang benar2
       diterima) → Selesai / Selesai (Ada Selisih) kalau ketahuan
       kurang/lebih. Tidak membuat jurnal keuangan (bukan jual/beli).
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-mutasi" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data mutasi…</p></div>
  </div>

  {{-- ── Retur Barang ────────────────────────────────────────────
       transaksi.js → renderRetur()
       Retur Jual → jurnal kebalikan penjualan:
         Retur Penjualan      Dr
         PPN Keluaran         Dr  (jika kena PPN)
         Kas                  Cr
         Persediaan           Dr  (kembalikan stok)
         HPP                  Cr
       Retur Beli → jurnal kebalikan pembelian:
         Kas/Hutang           Dr
         Persediaan           Cr
         PPN Masukan          Cr  (jika kena PPN)
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-retur" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data retur…</p></div>
  </div>

  {{-- ── Kasbon Karyawan ─────────────────────────────────────────
       transaksi.js → renderKasbon()
       Kasbon Diberikan:
         Piutang Kasbon       Dr
         Kas                  Cr
       Kasbon Dibayar/Dilunasi:
         Kas                  Dr
         Piutang Kasbon       Cr
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-kasbon" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data kasbon…</p></div>
  </div>

  {{-- ── Cashbon Pelanggan ───────────────────────────────────────
       transaksi.js → renderCashbon()
       Sama dengan kasbon tapi untuk pelanggan, akun berbeda:
         Diberikan: Piutang Cashbon Pelanggan Dr / Kas Cr
         Dibayar:   Kas Dr / Piutang Cashbon Pelanggan Cr
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-cashbon" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data cashbon…</p></div>
  </div>

  {{-- ── Pengeluaran / Biaya Operasional ───────────────────────
       transaksi.js → renderBiaya()
       Jurnal sesuai akun beban yang dipilih:
         [Akun Beban]         Dr  (nominal)
         Kas / Bank           Cr  (sesuai pilihan)
       Contoh: Biaya Gaji Dr / Bank Cr
  ─────────────────────────────────────────────────────────────── --}}
  <div id="tx-biaya" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data pengeluaran…</p></div>
  </div>

</section>
