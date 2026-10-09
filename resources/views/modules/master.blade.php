{{-- ═══════════════════════════════════════════════════════════
     MODULE: DATA MASTER — modules/master.blade.php
     Dirender oleh: public/js/modules/master.js
     Sub-modul & JS function yang menangani:
       ms-cabang     → renderCabang()       → GET/POST/DELETE /api/master/cabang
       ms-coa        → renderCOA()          → GET/POST/DELETE /api/master/coa
       ms-barang     → renderBarang()       → GET/POST/PUT/DELETE /api/master/barang
       ms-jasa       → renderJasaMaster()   → GET/POST/DELETE /api/master/jasa
       ms-pelanggan  → renderPelanggan()    → GET/POST/DELETE /api/master/pelanggan
       ms-supplier   → renderSupplier()     → GET/POST/PUT/DELETE /api/supplier
       ms-karyawan   → renderKaryawan()     → GET/POST/PUT/DELETE /api/karyawan
       ms-kadaluarsa → renderKadaluarsa()   → GET/POST/DELETE /api/master/kadaluarsa
       ms-saldoawal  → renderSaldoAwal()    → GET/POST/DELETE /api/saldo-awal/akun, /api/saldo-awal/inventory
     ═══════════════════════════════════════════════════════════ --}}
<section class="panel" id="tab-master">

  {{-- Sub-navigasi tab Master — nav.js → wireSnav('snMaster','ms') --}}
  <div class="subnav" id="snMaster">
    <button class="on" data-s="cabang">🏬 Cabang</button>
    <button data-s="coa">📋 Akun (COA)</button>
    <button data-s="barang">📦 Barang</button>
    <button data-s="jasa">🛠️ Jasa</button>
    <button data-s="pelanggan">🧑‍🤝‍🧑 Pelanggan</button>
    <button data-s="supplier">🚚 Supplier</button>
    <button data-s="karyawan">👤 Karyawan</button>
    <button data-s="kadaluarsa">⏳ Barang Kadaluarsa</button>
    <button data-s="saldoawal">🧮 Saldo Awal</button>
  </div>

  {{-- ── Manajemen Cabang ────────────────────────────────────────
       master.js → renderCabang()
       Form tambah cabang + tabel daftar cabang + tombol hapus
       Cabang yang ditambah langsung muncul di dropdown filter atas
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-cabang">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data cabang…</p></div>
  </div>

  {{-- ── Chart of Accounts (COA) ────────────────────────────────
       master.js → renderCOA()
       Form tambah akun custom + tabel COA dikelompok per kategori
       22 akun default tidak bisa dihapus (is_default = true)
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-coa" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data akun…</p></div>
  </div>

  {{-- ── Master Barang ───────────────────────────────────────────
       master.js → renderBarang(page)
       Form tambah barang + tabel paginated (30/halaman)
       Field: kode, nama, status PPN (Kena PPN / Non-PPN), harga modal
       Harga modal dipakai engine jurnal untuk hitung HPP otomatis
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-barang" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data barang…</p></div>
  </div>

  {{-- ── Master Jasa / Layanan ──────────────────────────────────
       master.js → renderJasaMaster()
       Form tambah jasa + tabel
       Field: kode, nama, PPN, harga standar
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-jasa" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data jasa…</p></div>
  </div>

  {{-- ── Master Pelanggan ───────────────────────────────────────
       master.js → renderPelanggan()
       Form tambah pelanggan + tabel
       Field: kode, nama, telepon, alamat, poin loyalitas
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-pelanggan" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data pelanggan…</p></div>
  </div>

  {{-- ── Master Supplier ────────────────────────────────────────
       master.js → renderSupplier()
       Form tambah supplier + tabel dengan aksi edit/hapus
       Field: nama, kontak person, telepon, alamat, keterangan
       Dipakai sebagai dropdown wajib saat input Transaksi > Pembelian
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-supplier" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data supplier…</p></div>
  </div>

  {{-- ── Pantauan Barang Kadaluarsa ─────────────────────────────
       master.js → renderKadaluarsa()
       Form catat tanggal exp + tabel dengan badge status:
         - Aman (hijau)    : > 30 hari
         - Mendekati (kuning): ≤ 30 hari
         - Kadaluarsa (merah): sudah lewat
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-kadaluarsa" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data kadaluarsa…</p></div>
  </div>

  {{-- ── Manajemen Karyawan ──────────────────────────────────────
       master.js → renderKaryawan()
       Sub-tab: Data Karyawan | Absensi | Penggajian
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-karyawan" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat data karyawan…</p></div>
  </div>

  {{-- ── Saldo Awal (migrasi ke sistem baru) ────────────────────
       saldoawal.js → renderSaldoAwal()
       Sub-tab: Saldo Awal Akun (matriks Akun × Cabang) |
                Saldo Awal Inventory (grid manual + import Excel +
                deteksi otomatis barang laku tanpa riwayat beli)
  ─────────────────────────────────────────────────────────────── --}}
  <div id="ms-saldoawal" style="display:none;">
    <div class="loading-state"><div class="loading-spinner"></div><p>Memuat Saldo Awal…</p></div>
  </div>

</section>
