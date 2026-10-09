{{-- ═══════════════════════════════════════════════════════════
     MODULE: JURNAL & BUKU BESAR — modules/jurnal.blade.php
     Dirender oleh: public/js/modules/jurnal.js
     ─────────────────────────────────────────────────────────
     Jurnal dibuat OTOMATIS oleh:
       DashboardController::buildJurnal(?string $cabang)
     yang memproses SEMUA tabel transaksi menjadi jurnal double-entry.

     Sub-modul:
       jr-umum  → renderJurnalUmum()  → GET /api/laporan/jurnal
       jr-besar → renderBukuBesar()   → GET /api/laporan/buku-besar?kode_akun=
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-jurnal">

  {{-- Sub-navigasi — nav.js → wireSnav('snJurnal','jr') --}}
  <div class="subnav" id="snJurnal">
    <button class="on" data-s="umum">📝 Jurnal Umum</button>
    <button data-s="besar">📒 Buku Besar</button>
  </div>

  {{-- ── Jurnal Umum ────────────────────────────────────────────
       jurnal.js → renderJurnalUmum()
       Menampilkan SEMUA entri jurnal dari semua transaksi.
       Kolom: Tanggal | Referensi | Akun | Keterangan | Debit | Kredit
       Footer: Total Debit = Total Kredit (verifikasi balance)
       ─────────────────────────────────────────────────────────
       Referensi:
         PJ-{id}  = Penjualan
         PB-{id}  = Pembelian
         JS-{id}  = Jasa
         SW-{id}  = Sewa
         RT-{id}  = Retur
         KB-{id}     = Kasbon Karyawan
         CB-{id}     = Cashbon Pelanggan
         BX-{id}     = Biaya/Pengeluaran
         BM-{id}     = Barang Masuk (modul Stok)
         BK-{id}     = Barang Keluar (modul Stok)
         SO-{id}-{d} = Selisih Stok Opname

       Klik satu baris jurnal untuk melihat semua pasangan debit/kredit
       dari referensi yang sama (lihatDetailJurnal() di jurnal.js).
  ─────────────────────────────────────────────────────────────── --}}
  <div id="jr-umum">
    <div class="loading-state"><div class="loading-spinner"></div><p>Membuat jurnal dari transaksi…</p></div>
  </div>

  {{-- ── Buku Besar per Akun ─────────────────────────────────────
       jurnal.js → renderBukuBesar()
       Pengguna memilih akun dari dropdown (semua akun COA)
       Menampilkan semua mutasi pada akun tersebut beserta saldo berjalan
       Kolom: Tanggal | Referensi | Keterangan | Debit | Kredit | Saldo
  ─────────────────────────────────────────────────────────────── --}}
  <div id="jr-besar" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat buku besar…</p></div>
  </div>

</section>
