{{-- ═══════════════════════════════════════════════════════════
     MODULE: POIN MEMBER — modules/poin.blade.php
     Dirender oleh: public/js/modules/poin.js → renderPoin()
     ─────────────────────────────────────────────────────────
     Rekap poin member LAMA dari 7 file rekap kasir per cabang
     (Pusat, Bae, Pasar, Ugm, Padurenan/Durenan, Putri 1, Putri 2).
     Nama yang identik di beberapa cabang otomatis DIJUMLAHKAN jadi
     satu total di daftar; klik baris untuk lihat rincian per cabang
     + riwayat tukar poin. Ada katalog hadiah (Silver/Gold) & tombol
     Tukar Poin.

     Endpoint API:
       GET    /api/poin                 → daftar rekap + ringkasan
       GET    /api/poin/{nama}          → detail 1 identitas
       POST   /api/poin/import          → import/replace dari Excel
       GET    /api/poin/hadiah          → katalog hadiah
       POST   /api/poin/hadiah          → tambah hadiah
       PUT    /api/poin/hadiah/{id}     → ubah hadiah
       DELETE /api/poin/hadiah/{id}     → hapus hadiah
       POST   /api/poin/tukar           → tukar poin
       DELETE /api/poin/tukar/{id}      → batalkan penukaran
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-poin">
  <div id="poin-list">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data poin member…</p></div>
  </div>
</section>
