{{-- ═══════════════════════════════════════════════════════════
     MODULE: KONTAK — modules/kontak.blade.php
     Dirender oleh: public/js/modules/kontak.js → renderKontak()
     ─────────────────────────────────────────────────────────
     Buku alamat terpadu — semua nama Karyawan, Pelanggan,
     Supplier (dan kontak bebas "Lainnya") dikumpulkan di sini.
     Klik satu kontak untuk membuka riwayat lengkap: kasbon/
     cashbon/pembelian kredit sesuai tipenya, DITAMBAH catatan
     bebas (kurang bayar, piutang/hutang di luar sistem, dsb).

     Endpoint API:
       GET    /api/kontak                 → daftar + saldo
       GET    /api/kontak/{tipe}/{nama}    → riwayat satu kontak
       POST   /api/kontak/catatan          → tambah catatan
       DELETE /api/kontak/catatan/{id}     → hapus catatan
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-kontak">
  <div id="kontak-list">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data kontak…</p></div>
  </div>
</section>
