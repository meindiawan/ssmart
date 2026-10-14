/* =============================================================
   nav.js — Navigasi Tab Utama & Sub-navigasi
   Mengontrol perpindahan antar panel (dashboard, transaksi, dll)
   dan sub-panel (jual/beli/jasa, dll).
   ============================================================= */

/* ── METADATA TIAP TAB ────────────────────────────────────── */
const TAB_META = {
    dashboard  : { title: 'Dashboard',          desc: 'Ringkasan kondisi keuangan toko' },
    pos        : { title: 'Kasir POS',          desc: 'Kasir penjualan & pembelian cepat — multi barang, diskon, poin, cetak struk' },
    analisis   : { title: 'Analisis Data',       desc: 'Barang terlaris, tren, perbandingan cabang' },
    master     : { title: 'Data Master',         desc: 'Kelola cabang, akun, barang & jasa' },
    transaksi  : { title: 'Transaksi',           desc: 'Input penjualan, pembelian, kasbon, dan pengeluaran' },
    stok       : { title: 'Stok',                desc: 'Saldo stok, barang masuk/keluar, opname, dan kartu stok per tanggal' },
    kontak     : { title: 'Kontak',              desc: 'Buku alamat karyawan, pelanggan & supplier — riwayat hutang piutang' },
    poin       : { title: 'Poin Member',         desc: 'Rekap poin member lama per cabang — cari, gabungkan nama sama, tukar hadiah' },
    aset       : { title: 'Aset Tetap',          desc: 'Kendaraan, peralatan & perabotan toko — penyusutan garis lurus otomatis ke Jurnal' },
    jurnal     : { title: 'Jurnal & Buku Besar', desc: 'Jurnal otomatis dari semua transaksi + jurnal manual & memorial' },
    laporan    : { title: 'Laporan Keuangan',    desc: 'Neraca saldo, laba rugi, neraca, dan rekap PPN' },
    sid        : { title: 'Integrasi SID Kasir', desc: 'Sinkronisasi otomatis data penjualan dari aplikasi SID' },
    sinkron    : { title: 'Sinkronisasi Data',   desc: 'Bandingkan file Excel import dengan data tersimpan — cek transaksi yang tidak masuk / tidak ikut Jurnal' },
};

/** Tab yang sedang aktif */
let activeTab = 'dashboard';

/** Sub-tab yang terakhir aktif per prefix */
const activeSubTab = {
    an: 'baranglaku',
    ms: 'cabang',
    tx: 'jual',
    stok: 'saldo',
    jr: 'umum',
    lp: 'saldo',
    sid: 'status',
    sk: 'jual',
};

/* ── PINDAH TAB UTAMA ─────────────────────────────────────── */

/**
 * Aktifkan panel tab dan render kontennya
 * @param {string} tab - Nama tab: dashboard|analisis|master|transaksi|jurnal|laporan
 */
async function setTab(tab) {
    activeTab = tab;

    // Toggle class .on di sidebar nav
    document.querySelectorAll('.nb').forEach(b =>
        b.classList.toggle('on', b.dataset.tab === tab)
    );

    // Tampilkan panel yang sesuai
    document.querySelectorAll('.panel').forEach(p =>
        p.classList.toggle('on', p.id === 'tab-' + tab)
    );

    // Update breadcrumb
    document.getElementById('pgTitle').textContent = TAB_META[tab]?.title || tab;
    document.getElementById('pgDesc').textContent  = TAB_META[tab]?.desc  || '';

    // Tutup sidebar mobile
    document.getElementById('sb').classList.remove('open');

    // Render konten tab
    await renderTabContent(tab);
}

/**
 * Pilih render function berdasarkan tab aktif
 */
async function renderTabContent(tab) {
    switch (tab) {
        case 'dashboard': await renderDashboard();                             break;
        case 'pos':       await renderPos();                                   break;
        case 'analisis':  await renderSubTabContent('an', activeSubTab.an);   break;
        case 'master':    await renderSubTabContent('ms', activeSubTab.ms);   break;
        case 'transaksi': await renderSubTabContent('tx', activeSubTab.tx);   break;
        case 'stok':      await renderSubTabContent('stok', activeSubTab.stok); break;
        case 'kontak':    await renderKontak();                                break;
        case 'poin':      await renderPoin();                                  break;
        case 'aset':      await renderAset();                                  break;
        case 'jurnal':    await renderSubTabContent('jr', activeSubTab.jr);   break;
        case 'laporan':   await renderSubTabContent('lp', activeSubTab.lp);   break;
        case 'sid':       await renderSubTabContent('sid', activeSubTab.sid || 'status'); break;
        case 'sinkron':   await renderSubTabContent('sk', activeSubTab.sk || 'jual');     break;
    }
}

/* ── PINDAH SUB-TAB ───────────────────────────────────────── */

/**
 * Aktifkan sub-tab dalam panel
 * @param {string} prefix - Prefix: an|ms|tx|jr|lp
 * @param {string} sub    - Nama sub-tab, misal 'jual', 'cabang'
 */
async function setSubTab(prefix, sub) {
    activeSubTab[prefix] = sub;

    // Toggle class .on di subnav button
    const navId = { an: 'snAnalisis', ms: 'snMaster', tx: 'snTrx', stok: 'snStok', jr: 'snJurnal', lp: 'snLap', sid: 'snSid', sk: 'snSinkron' }[prefix];
    document.querySelectorAll(`#${navId} button`).forEach(b =>
        b.classList.toggle('on', b.dataset.s === sub)
    );

    // Tampilkan div sub-tab yang sesuai, sembunyikan lainnya
    document.querySelectorAll(`[id^="${prefix}-"]`).forEach(el => {
        el.style.display = el.id === `${prefix}-${sub}` ? '' : 'none';
    });

    await renderSubTabContent(prefix, sub);
}

/**
 * Render konten sub-tab berdasarkan prefix + nama
 */
async function renderSubTabContent(prefix, sub) {
    const key = prefix + '-' + sub;
    switch (key) {
        // Analisis
        case 'an-baranglaku': await renderAnalisisBarangLaku(); break;
        case 'an-cabangcomp': await renderAnalisisCabang();     break;
        case 'an-tren':       await renderAnalisisTren();       break;
        case 'an-margin':     await renderAnalisisMargin();     break;
        case 'an-kasir':      await renderAnalisisKasir();      break;
        // Master
        case 'ms-cabang':       await renderCabang();             break;
        case 'ms-coa':          await renderCOA();                break;
        case 'ms-barang':       await renderBarang();             break;
        case 'ms-jasa':         await renderJasaMaster();         break;
        case 'ms-pelanggan':    await renderPelanggan();          break;
        case 'ms-supplier':     await renderSupplier();           break;
        case 'ms-karyawan':     await renderKaryawan('data');     break;
        case 'ms-kadaluarsa':   await renderKadaluarsa();         break;
        case 'ms-saldoawal':    await renderSaldoAwal();          break;
        // Stok
        case 'stok-saldo':   await renderStok();               break;
        case 'stok-masuk':   await renderBarangMasuk();        break;
        case 'stok-keluar':  await renderBarangKeluar();       break;
        case 'stok-opname':  await renderOpname();             break;
        case 'stok-kartu':   await renderKartuStok();          break;
        case 'stok-pertanggal': await renderStokPerTanggal();   break;
        // Transaksi
        case 'tx-jual':       await renderJualBeli('jual', 'tx-jual');   break;
        case 'tx-beli':       await renderJualBeli('beli', 'tx-beli');   break;
        case 'tx-jasa':       await renderTrxJasa();            break;
        case 'tx-sewa':       await renderSewa();               break;
        case 'tx-mutasi':     await renderMutasi();             break;
        case 'tx-retur':      await renderRetur();              break;
        case 'tx-kasbon':     await renderKasbon();             break;
        case 'tx-cashbon':    await renderCashbon();            break;
        case 'tx-biaya':      await renderBiaya();              break;
        // Jurnal
        case 'jr-umum':       await renderJurnalUmum();         break;
        case 'jr-memorial':   await renderJurnalMemorial();     break;
        case 'jr-besar':      await renderBukuBesar();          break;
        // Laporan
        case 'lp-saldo':      await renderNeracaSaldo();        break;
        case 'lp-labarugi':   await renderLabaRugi();           break;
        case 'lp-lrx':        await renderLabaRugiLengkap();    break;
        case 'lp-neraca':     await renderNeraca();             break;
        case 'lp-ppn':        await renderRekapPPN();           break;
        // SID Integrasi
        case 'sid-status':      await renderSidStatus();        break;
        case 'sid-syncjual':    await renderSidSyncJual();      break;
        case 'sid-syncbarang':  await renderSidSyncBarang();    break;
        case 'sid-pengaturan':  await renderSidPengaturan();    break;
        // Sinkronisasi Data
        case 'sk-jual':          await renderSinkronisasi('jual'); break;
        case 'sk-beli':          await renderSinkronisasi('beli'); break;
        case 'sk-tidakdikenal':  await renderBarangTidakTerdeteksi();  break;
    }
}

/* ── EVENT LISTENERS ──────────────────────────────────────── */

// Klik tombol nav di sidebar
document.querySelector('.sb-nav').addEventListener('click', e => {
    const btn = e.target.closest('.nb');
    if (btn?.dataset.tab) setTab(btn.dataset.tab);
});

// Klik subnav — helper untuk semua subnav
function wireSnav(navId, prefix) {
    document.getElementById(navId)?.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (btn?.dataset.s) setSubTab(prefix, btn.dataset.s);
    });
}

wireSnav('snAnalisis', 'an');
wireSnav('snMaster',   'ms');
wireSnav('snTrx',      'tx');
wireSnav('snStok',     'stok');
wireSnav('snJurnal',   'jr');
wireSnav('snLap',      'lp');
wireSnav('snSid',      'sid');
wireSnav('snSinkron',  'sk');

// Hamburger mobile
document.getElementById('ham').addEventListener('click', () =>
    document.getElementById('sb').classList.toggle('open')
);

// Re-render saat filter cabang berubah
document.getElementById('gCabang').addEventListener('change', () =>
    renderTabContent(activeTab)
);
