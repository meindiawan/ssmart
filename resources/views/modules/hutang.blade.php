{{-- ═══════════════════════════════════════════════════════════
     MODULE: HUTANG PEMBELIAN — modules/hutang.blade.php
     Dirender oleh: public/js/modules/hutang.js → renderHutang()
     ─────────────────────────────────────────────────────────
     Daftar nota pembelian Kredit + status Belum / Sebagian / Lunas.
     Admin bisa membayar per NOTA (sebagian/cicil atau lunas), atau
     melunasi banyak nota sekaligus. Setiap pembayaran otomatis masuk
     Jurnal: Dr Hutang Usaha (2101) / Cr Kas-Bank.

     Endpoint API:
       GET    /api/hutang                → daftar nota + ringkasan
       GET    /api/hutang/detail         → barang & riwayat bayar 1 nota
       POST   /api/hutang/bayar          → bayar 1 nota
       POST   /api/hutang/bayar-banyak   → lunasi banyak nota
       DELETE /api/hutang/bayar/{id}     → batalkan pembayaran
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-hutang">
  <div id="hutang-list">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat hutang pembelian…</p></div>
  </div>
</section>
