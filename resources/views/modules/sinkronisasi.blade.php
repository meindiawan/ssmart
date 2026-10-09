{{-- ══ TAB: SINKRONISASI DATA ═══════════════════════════════════════════════
     sinkronisasi.js → renderSinkronisasi('jual'|'beli')
     Sub-tab: Cek Penjualan | Cek Pembelian
     Bandingkan file Excel yang diimpor dengan data yang sudah tersimpan di
     trx_jual/trx_beli — untuk menemukan baris yang tidak masuk sama sekali,
     atau masuk ke Riwayat tapi tidak ikut dihitung di Jurnal. Tidak menulis
     apa pun ke database, murni pembanding/laporan.
════════════════════════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-sinkron">

  <div class="subnav" id="snSinkron">
    <button class="on" data-s="jual">🛒 Cek Penjualan</button>
    <button data-s="beli">📦 Cek Pembelian</button>
    <button data-s="tidakdikenal">🧩 Barang Tidak Terdeteksi</button>
  </div>

  <div id="sk-jual"></div>
  <div id="sk-beli" style="display:none;"></div>
  <div id="sk-tidakdikenal" style="display:none;"></div>

</section>
