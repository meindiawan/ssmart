<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\DashboardController;
use App\Http\Controllers\Api\MasterController;
use App\Http\Controllers\Api\TransaksiController;
use App\Http\Controllers\Api\KaryawanController;
use App\Http\Controllers\Api\StokController;
use App\Http\Controllers\Api\SupplierController;
use App\Http\Controllers\Api\KontakController;
use App\Http\Controllers\Api\PosController;
use App\Http\Controllers\Api\MutasiKirimController;
use App\Http\Controllers\Api\AsetController;
use App\Http\Controllers\Api\SaldoAwalController;
use App\Http\Controllers\Api\PoinController;
use App\Http\Controllers\Api\JurnalManualController;

/*
|--------------------------------------------------------------------------
| API Routes — Toko Sumini
| Base URL: http://localhost:8000/api
|--------------------------------------------------------------------------
*/

// ── DASHBOARD ────────────────────────────────────────────────────────────────
Route::get('/dashboard', [DashboardController::class, 'index']);

// ── LAPORAN ──────────────────────────────────────────────────────────────────
Route::prefix('laporan')->group(function () {
    Route::get('/jurnal',       [DashboardController::class, 'jurnalUmum']);
    Route::get('/buku-besar',   [DashboardController::class, 'bukuBesar']);
    Route::get('/neraca-saldo', [DashboardController::class, 'neracaSaldo']);
    Route::get('/laba-rugi',    [DashboardController::class, 'labaRugi']);
    Route::get('/laba-rugi-lengkap', [\App\Http\Controllers\Api\LabaRugiLengkapController::class, 'lengkap']);
    Route::get('/neraca',       [DashboardController::class, 'neraca']);
    Route::get('/rekap-ppn',    [DashboardController::class, 'rekapPpn']);
    Route::get('/saldo-akun',   [DashboardController::class, 'saldoAkun']);
    Route::get('/rekap-pph-final', [DashboardController::class, 'rekapPphFinal']);
    // Audit trail / drill-down — dipakai supaya setiap angka di laporan bisa
    // diklik dan ditelusuri sampai transaksi aslinya (lihat laporan.js).
    Route::get('/akun-trace',       [DashboardController::class, 'akunTrace']);
    Route::get('/bentukan-ref',     [DashboardController::class, 'bentukanRef']);
    Route::get('/rekap-ppn-detail', [DashboardController::class, 'rekapPpnDetail']);
});

// ── JURNAL MANUAL & MEMORIAL ────────────────────────────────────────────────
// Jurnal yang diinput langsung (bukan otomatis dari transaksi); dibaca oleh
// DashboardController::buildJurnal() sehingga ikut Jurnal Umum & semua laporan.
Route::prefix('jurnal-manual')->group(function () {
    Route::get('/',        [JurnalManualController::class, 'index']);
    Route::post('/',       [JurnalManualController::class, 'store']);
    Route::put('/{id}',    [JurnalManualController::class, 'update']);
    Route::delete('/{id}', [JurnalManualController::class, 'destroy']);
});

// ── ANALISIS ─────────────────────────────────────────────────────────────────
Route::prefix('analisis')->group(function () {
    Route::get('/cabang',  [DashboardController::class, 'analisisCabang']);
    Route::get('/tren',    [DashboardController::class, 'analisisTren']);
    Route::get('/margin',  [DashboardController::class, 'analisisMargin']);
    Route::get('/kasir',   [DashboardController::class, 'analisisKasir']);
});

// ── MASTER DATA ──────────────────────────────────────────────────────────────
Route::prefix('master')->group(function () {
    // Cabang
    Route::get('/cabang',           [MasterController::class, 'getCabang']);
    Route::post('/cabang',          [MasterController::class, 'storeCabang']);
    Route::put('/cabang/{id}',      [MasterController::class, 'updateCabang']);
    Route::delete('/cabang/{id}',   [MasterController::class, 'destroyCabang']);

    // COA
    Route::get('/coa',              [MasterController::class, 'getCoa']);
    Route::post('/coa',             [MasterController::class, 'storeCoa']);
    Route::post('/coa/import',      [MasterController::class, 'importCoa']);
    Route::put('/coa/{id}',         [MasterController::class, 'updateCoa']);
    Route::delete('/coa/{id}',      [MasterController::class, 'destroyCoa']);

    // Barang
    Route::get('/barang',           [MasterController::class, 'getBarang']);
    Route::get('/barang/all',       [MasterController::class, 'getAllBarang']);
    Route::get('/barang/harga-cabang', [MasterController::class, 'hargaCabang']);
    Route::post('/barang',          [MasterController::class, 'storeBarang']);
    Route::delete('/barang-semua',  [MasterController::class, 'destroyAllBarang']);
    Route::put('/barang/{id}',      [MasterController::class, 'updateBarang']);
    Route::delete('/barang/{id}',   [MasterController::class, 'destroyBarang']);
    Route::post('/barang/import',   [MasterController::class, 'importBarang']);
    Route::post('/barang/isi-modal-otomatis', [MasterController::class, 'isiModalOtomatis']);
    // Import AMAN khusus Satuan 2/3 & Isi (dari file "Isi Satuan Massal") — tidak
    // pernah menimpa Harga Modal/Harga Jual/Harga Grosir/Harga Cabang, beda dengan
    // Import Barang biasa yang menimpa semua kolom.
    Route::post('/barang/isi-satuan-massal', [MasterController::class, 'importSatuanMassal']);
    Route::get('/barang/{id}/stok', [MasterController::class, 'getStokBarang']);
    Route::put('/barang/{id}/stok', [MasterController::class, 'setStokBarang']);
    Route::get('/barang/{kode}/kartu-hpp', [MasterController::class, 'kartuHpp']);

    // Jasa
    Route::get('/jasa',             [MasterController::class, 'getJasa']);
    Route::post('/jasa',            [MasterController::class, 'storeJasa']);
    Route::post('/jasa/import',     [MasterController::class, 'importJasa']);
    Route::put('/jasa/{id}',        [MasterController::class, 'updateJasa']);
    Route::delete('/jasa/{id}',     [MasterController::class, 'destroyJasa']);

    // Pelanggan
    Route::get('/pelanggan',        [MasterController::class, 'getPelanggan']);
    Route::post('/pelanggan',       [MasterController::class, 'storePelanggan']);
    Route::put('/pelanggan/{id}',   [MasterController::class, 'updatePelanggan']);
    Route::delete('/pelanggan/{id}',[MasterController::class, 'destroyPelanggan']);
    Route::post('/pelanggan/import',[MasterController::class, 'importPelanggan']);

    // Kadaluarsa
    Route::get('/kadaluarsa',       [MasterController::class, 'getKadaluarsa']);
    Route::post('/kadaluarsa',      [MasterController::class, 'storeKadaluarsa']);
    Route::delete('/kadaluarsa/{id}',[MasterController::class, 'destroyKadaluarsa']);

    // Settings
    Route::get('/settings',         [MasterController::class, 'getSettings']);
    Route::put('/settings',         [MasterController::class, 'updateSettings']);
    Route::post('/saldo-awal/generate', [MasterController::class, 'generateSaldoAwal']);
});

// ── SALDO AWAL (migrasi ke sistem baru) ───────────────────────────────────────
Route::prefix('saldo-awal')->group(function () {
    // Saldo Awal Akun (Kas, Piutang, Hutang, Modal, dst)
    Route::get('/akun',         [SaldoAwalController::class, 'akunIndex']);
    Route::post('/akun',        [SaldoAwalController::class, 'akunSave']);
    Route::delete('/akun/{id}', [SaldoAwalController::class, 'akunDestroy']);

    // Saldo Awal Inventory (manual, per barang per cabang)
    Route::get('/inventory',          [SaldoAwalController::class, 'inventoryIndex']);
    Route::post('/inventory/import',  [SaldoAwalController::class, 'inventoryImport']);
    Route::delete('/inventory/{id}',  [SaldoAwalController::class, 'inventoryDestroy']);
});

// ── SUPPLIER ─────────────────────────────────────────────────────────────────
Route::prefix('supplier')->group(function () {
    Route::get('/',           [SupplierController::class, 'index']);
    Route::post('/',          [SupplierController::class, 'store']);
    Route::post('/import',    [SupplierController::class, 'import']);
    Route::put('/{id}',       [SupplierController::class, 'update']);
    Route::delete('/{id}',    [SupplierController::class, 'destroy']);
});

// ── KONTAK ───────────────────────────────────────────────────────────────────
Route::prefix('kontak')->group(function () {
    Route::get('/',                  [KontakController::class, 'index']);
    Route::get('/nota-beli',         [KontakController::class, 'notaBeli']);
    Route::get('/nota-jual',         [KontakController::class, 'notaJual']);
    Route::get('/{tipe}/{nama}',     [KontakController::class, 'riwayat']);
    Route::post('/catatan',          [KontakController::class, 'storeCatatan']);
    Route::delete('/catatan/{id}',   [KontakController::class, 'destroyCatatan']);
});

// ── POIN MEMBER (rekap poin lama per cabang, katalog hadiah, tukar poin) ─────
Route::prefix('poin')->group(function () {
    Route::get('/',              [PoinController::class, 'index']);
    Route::post('/import',       [PoinController::class, 'import']);

    // Katalog hadiah — harus di atas wildcard /{nama}
    Route::get('/hadiah',        [PoinController::class, 'hadiahIndex']);
    Route::post('/hadiah',       [PoinController::class, 'hadiahStore']);
    Route::put('/hadiah/{id}',   [PoinController::class, 'hadiahUpdate']);
    Route::delete('/hadiah/{id}',[PoinController::class, 'hadiahDestroy']);

    // Penukaran poin — harus di atas wildcard /{nama}
    Route::post('/tukar',        [PoinController::class, 'tukarStore']);
    Route::delete('/tukar/{id}', [PoinController::class, 'tukarDestroy']);

    // Detail 1 identitas — wildcard paling bawah
    Route::get('/{nama}',        [PoinController::class, 'detail']);
});

// ── TRANSAKSI ────────────────────────────────────────────────────────────────
Route::prefix('transaksi')->group(function () {
    // Reservasi nomor nota (dipanggil grid Penjualan/Pembelian SEBELUM baris
    // barang disimpan, supaya 1x klik "Simpan" = 1 no_nota yang pasti unik)
    Route::get('/nomor-baru', [TransaksiController::class, 'nomorBaru']);
    Route::get('/cek-nomor',  [TransaksiController::class, 'cekNomor']);

    // Perbaikan otomatis: cari no_nota yang kepakai dobel oleh transaksi
    // beda tanggal/cabang (data lama/hasil import), lalu dipisah otomatis.
    Route::post('/perbaiki-nomor-dobel', [TransaksiController::class, 'perbaikiNomorDobel']);

    // Penjualan
    Route::get('/jual',             [TransaksiController::class, 'getJual']);
    Route::post('/jual',            [TransaksiController::class, 'storeJual']);
    Route::delete('/jual/{id}',     [TransaksiController::class, 'destroyJual']);
    Route::post('/jual/import',     [TransaksiController::class, 'importJual']);
    Route::post('/reset-jual-beli', [TransaksiController::class, 'resetJualBeli']);

    // Pembelian
    Route::get('/beli',             [TransaksiController::class, 'getBeli']);
    Route::post('/beli',            [TransaksiController::class, 'storeBeli']);
    Route::delete('/beli/{id}',     [TransaksiController::class, 'destroyBeli']);
    Route::post('/beli/import',     [TransaksiController::class, 'importBeli']);
    Route::post('/beli/set-supplier', [TransaksiController::class, 'setSupplierBeli']);
    Route::post('/beli/ubah-nota',    [TransaksiController::class, 'ubahNoNotaBeli']);

    // Proteksi import dobel: dicek SEKALI (kirim semua baris, sebelum
    // dipecah per-chunk) sebelum proses import dimulai, lalu dicatat SEKALI
    // lagi setelah semua chunk selesai — lihat TransaksiController::cekDuplikatImport / catatImportSelesai.
    Route::post('/import/cek-duplikat', [TransaksiController::class, 'cekDuplikatImport']);
    Route::post('/import/catat',        [TransaksiController::class, 'catatImportSelesai']);

    // Sinkronisasi / Compare Data: upload ulang file import, dibandingkan
    // dengan data yang sudah tersimpan — kelihatan baris mana yang tidak
    // masuk sama sekali / masuk tapi tidak ikut Jurnal (lihat SKILL note di
    // TransaksiController::cekSinkronisasi()).
    Route::post('/jual/sinkronisasi/cek', [TransaksiController::class, 'cekSinkronisasiJual']);
    Route::post('/beli/sinkronisasi/cek', [TransaksiController::class, 'cekSinkronisasiBeli']);

    // Barang Tidak Terdeteksi: cari kode_barang di trx_jual/trx_beli yang
    // TIDAK ada padanannya di Master Barang saat ini (baik yang sudah
    // ditandai tidak_dikenal maupun barang master yang dihapus belakangan)
    // — baris seperti ini "hilang" dari Jurnal & Laba Rugi karena
    // DashboardController::buildJurnal() pakai INNER JOIN ke tabel barang.
    // Beda dengan /jual/sinkronisasi/cek di atas: TIDAK perlu upload ulang
    // file, langsung scan database yang sudah tersimpan.
    Route::get('/barang-tidak-terdeteksi',           [TransaksiController::class, 'barangTidakTerdeteksi']);
    Route::post('/barang-tidak-terdeteksi/masukkan', [TransaksiController::class, 'masukkanBarangTidakTerdeteksi']);
    Route::post('/barang-tidak-terdeteksi/cocokkan', [TransaksiController::class, 'cocokkanBarangTidakTerdeteksi']);

    // Perbaikan retroaktif: konversi qty/harga transaksi lama yang tersimpan
    // MENTAH (belum terkonversi ke satuan dasar) sekarang Master Barang-nya
    // sudah punya Satuan2/3 & Isi. Preview dulu sebelum diterapkan.
    Route::get('/perbaikan-konversi/preview',  [TransaksiController::class, 'previewPerbaikanKonversi']);
    Route::post('/perbaikan-konversi/terapkan',[TransaksiController::class, 'terapkanPerbaikanKonversi']);

    // Jasa
    Route::get('/jasa',             [TransaksiController::class, 'getJasa']);
    Route::post('/jasa',            [TransaksiController::class, 'storeJasa']);
    Route::delete('/jasa/{id}',     [TransaksiController::class, 'destroyJasa']);

    // Sewa
    Route::get('/sewa',             [TransaksiController::class, 'getSewa']);
    Route::post('/sewa',            [TransaksiController::class, 'storeSewa']);
    Route::delete('/sewa/{id}',     [TransaksiController::class, 'destroySewa']);

    // Retur
    Route::get('/retur',            [TransaksiController::class, 'getRetur']);
    Route::post('/retur',           [TransaksiController::class, 'storeRetur']);
    Route::delete('/retur/{id}',    [TransaksiController::class, 'destroyRetur']);

    // Kasbon
    Route::get('/kasbon',           [TransaksiController::class, 'getKasbon']);
    Route::post('/kasbon',          [TransaksiController::class, 'storeKasbon']);
    Route::delete('/kasbon/{id}',   [TransaksiController::class, 'destroyKasbon']);

    // Cashbon Pelanggan
    Route::get('/cashbon',          [TransaksiController::class, 'getCashbon']);
    Route::post('/cashbon',         [TransaksiController::class, 'storeCashbon']);
    Route::delete('/cashbon/{id}',  [TransaksiController::class, 'destroyCashbon']);

    // Biaya / Pengeluaran
    Route::get('/biaya/summary',    [TransaksiController::class, 'getBiayaSummary']); // harus di atas /biaya biar tidak ketangkap wildcard lain
    Route::get('/biaya',            [TransaksiController::class, 'getBiaya']);
    Route::post('/biaya',           [TransaksiController::class, 'storeBiaya']);
    Route::post('/biaya/import',    [TransaksiController::class, 'importBiaya']);
    Route::delete('/biaya/{id}',    [TransaksiController::class, 'destroyBiaya']);
});

// ── POS (KASIR) ──────────────────────────────────────────────────────────────
// Menu kasir baru: input banyak barang sekaligus dalam 1 transaksi (nota),
// tetap menulis ke trx_jual/trx_beli yang sama seperti modul Transaksi biasa
// sehingga otomatis masuk jurnal & laporan yang sudah ada.
Route::prefix('pos')->group(function () {
    Route::get('/nota',            [PosController::class, 'riwayatNota']);
    Route::get('/nota/{noNota}',   [PosController::class, 'getNota']);
    Route::post('/jual',           [PosController::class, 'storeJual']);
    Route::post('/beli',           [PosController::class, 'storeBeli']);
    Route::put('/jual/{noNota}',   [PosController::class, 'updateJual']);
    Route::put('/beli/{noNota}',   [PosController::class, 'updateBeli']);
    Route::delete('/nota/{noNota}',[PosController::class, 'destroyNota']);
    // Shift kasir: login (kas awal) & tutup (kas akhir)
    Route::get('/shift/aktif',     [PosController::class, 'shiftAktif']);
    Route::post('/shift/buka',     [PosController::class, 'bukaShift']);
    Route::post('/shift/{id}/tutup', [PosController::class, 'tutupShift']);
});

// ── MUTASI BARANG (PAKET, MULTI-BARANG) ───────────────────────────────────────
// Perpindahan stok antar cabang berbasis "paket" (1 kode mutasi bisa berisi
// banyak barang sekaligus), dengan alur kirim → cek fisik → ACC cabang tujuan,
// pencatatan otomatis kalau ada selisih (kurang/lebih), dan cetak struk/faktur.
Route::prefix('mutasi-kirim')->group(function () {
    Route::get('/',                       [MutasiKirimController::class, 'index']);
    Route::get('/selisih',                [MutasiKirimController::class, 'selisihList']); // harus di atas /{noRef}
    Route::post('/selisih/{id}/selesaikan', [MutasiKirimController::class, 'resolveSelisih']);
    Route::get('/{noRef}',                [MutasiKirimController::class, 'show']);
    Route::post('/',                      [MutasiKirimController::class, 'store']);
    Route::put('/{noRef}',                [MutasiKirimController::class, 'update']);
    Route::post('/{noRef}/batal',         [MutasiKirimController::class, 'cancel']);
    Route::post('/{noRef}/konfirmasi',    [MutasiKirimController::class, 'confirm']);
    Route::delete('/{noRef}',             [MutasiKirimController::class, 'destroy']);
});

// ── ASET TETAP ───────────────────────────────────────────────────────────────
Route::prefix('aset')->group(function () {
    Route::get('/summary',            [AsetController::class, 'summary']); // harus di atas /{id}
    Route::get('/',                   [AsetController::class, 'index']);
    Route::post('/',                  [AsetController::class, 'store']);
    Route::put('/{id}',               [AsetController::class, 'update']);
    Route::delete('/{id}',            [AsetController::class, 'destroy']);
    Route::post('/{id}/nonaktifkan',  [AsetController::class, 'nonaktifkan']);
    Route::post('/{id}/aktifkan',     [AsetController::class, 'aktifkan']);
    Route::get('/{id}/jadwal',        [AsetController::class, 'jadwalPenyusutan']);
});

// ── KARYAWAN ─────────────────────────────────────────────────────────────────
Route::prefix('karyawan')->group(function () {
    // Absensi — harus di atas /{id} agar tidak tertangkap sebagai wildcard
    Route::get('/absensi/rekap',   [KaryawanController::class, 'rekapBulanan']);
    Route::get('/absensi',         [KaryawanController::class, 'getAbsensi']);
    Route::post('/absensi/bulk',   [KaryawanController::class, 'bulkAbsensi']);
    Route::post('/absensi',        [KaryawanController::class, 'storeAbsensi']);
    Route::delete('/absensi/{id}', [KaryawanController::class, 'destroyAbsensi']);

    // Gaji — harus di atas /{id}
    Route::get('/gaji',            [KaryawanController::class, 'getGaji']);
    Route::post('/gaji',           [KaryawanController::class, 'storeGaji']);
    Route::delete('/gaji/{id}',    [KaryawanController::class, 'destroyGaji']);

    // Sisa kasbon per karyawan — dipakai form Bayar Gaji
    Route::get('/{id}/kasbon-saldo', [KaryawanController::class, 'kasbonSaldo']);

    // Master — wildcard /{id} paling bawah
    Route::get('/',                [KaryawanController::class, 'index']);
    Route::post('/',               [KaryawanController::class, 'store']);
    Route::post('/import-bulk',    [KaryawanController::class, 'importBulk']);
    Route::put('/{id}',            [KaryawanController::class, 'update']);
    Route::delete('/{id}',         [KaryawanController::class, 'destroy']);
});

// ── STOK ─────────────────────────────────────────────────────────────────────
Route::prefix('stok')->group(function () {
    // Ringkasan & saldo stok
    Route::get('/summary',              [StokController::class, 'summary']);
    Route::get('/semua',                [StokController::class, 'getStokSemua']);
    Route::get('/kartu',                [StokController::class, 'kartuStok']);
    Route::get('/per-tanggal',          [StokController::class, 'stokPerTanggal']);
    Route::get('/periode',              [StokController::class, 'stokPeriode']);
    Route::get('/',                     [StokController::class, 'getStok']);

    // Barang masuk
    Route::get('/masuk',                [StokController::class, 'getBarangMasuk']);
    Route::post('/masuk',               [StokController::class, 'storeBarangMasuk']);
    Route::delete('/masuk/{id}',        [StokController::class, 'destroyBarangMasuk']);

    // Barang keluar
    Route::get('/keluar',               [StokController::class, 'getBarangKeluar']);
    Route::post('/keluar',              [StokController::class, 'storeBarangKeluar']);
    Route::delete('/keluar/{id}',       [StokController::class, 'destroyBarangKeluar']);

    // Stok opname — spesifik di atas /{id}
    Route::get('/opname',               [StokController::class, 'getOpname']);
    Route::post('/opname',              [StokController::class, 'storeOpname']);
    Route::post('/opname/barang',       [StokController::class, 'storeOpnameBarang']);
    Route::get('/opname/minus',         [StokController::class, 'opnameMinus']);
    Route::get('/opname/sistem',        [StokController::class, 'opnameSistem']);
    Route::get('/opname/{id}/detail',   [StokController::class, 'getOpnameDetail']);
    Route::post('/opname/{id}/detail',  [StokController::class, 'updateOpnameDetail']);
    Route::post('/opname/{id}/selesai', [StokController::class, 'selesaiOpname']);
    Route::delete('/opname/{id}',       [StokController::class, 'destroyOpname']);
});

// ── INTEGRASI SID KASIR ──────────────────────────────────────────────────────
use App\Http\Controllers\Api\SidSyncController;

Route::prefix('sid')->group(function () {
    Route::get('/status',          [SidSyncController::class, 'status']);
    Route::post('/sync/penjualan', [SidSyncController::class, 'syncPenjualan']);
    Route::post('/perbaiki-hpp',   [SidSyncController::class, 'perbaikiHppLama']);
    Route::post('/sync/range',     [SidSyncController::class, 'syncRange']);
    Route::post('/sync/barang',    [SidSyncController::class, 'syncBarang']);
    Route::post('/sync/stok',      [SidSyncController::class, 'syncStok']);
    Route::get('/operator',        [SidSyncController::class, 'getOperatorSid']);
    Route::get('/cabang-map',      [SidSyncController::class, 'getCabangMap']);
    Route::post('/cabang-map',     [SidSyncController::class, 'saveCabangMap']);
});
