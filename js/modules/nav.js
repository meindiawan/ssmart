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


/* ── BUKA DI TAB BARU (deep-link lewat hash URL) ──────────────
   Format:  #<tab>            mis. #laporan
            #<tab>/<sub>      mis. #transaksi/beli
            ...?cabang=Nama   (opsional) filter cabang ikut terbawa
   Setiap perpindahan tab/sub-tab memperbarui hash (tanpa menambah
   riwayat browser), jadi URL di address bar selalu menunjuk ke halaman
   yang sedang dibuka — bisa di-copy, di-bookmark, atau dibuka di tab baru.
   Cara membuka di tab baru: klik ikon ↗ di menu samping, Ctrl/Cmd/Shift+klik
   (atau klik tengah) pada menu/sub-menu, atau tombol "Tab Baru" di topbar. */
const TAB_PREFIX = { analisis: 'an', master: 'ms', transaksi: 'tx', stok: 'stok', jurnal: 'jr', laporan: 'lp', sid: 'sid', sinkron: 'sk' };
const SUBNAV_ID  = { an: 'snAnalisis', ms: 'snMaster', tx: 'snTrx', stok: 'snStok', jr: 'snJurnal', lp: 'snLap', sid: 'snSid', sk: 'snSinkron' };

function buildHash(tab, sub) {
    let h = '#' + encodeURIComponent(tab);
    const pf = TAB_PREFIX[tab];
    const s  = sub || (pf ? activeSubTab[pf] : '');
    if (pf && s) h += '/' + encodeURIComponent(s);
    const cab = document.getElementById('gCabang')?.value;
    if (cab) h += '?cabang=' + encodeURIComponent(cab);
    return h;
}

function buildTabUrl(tab, sub) {
    return location.origin + location.pathname + location.search + buildHash(tab, sub);
}

function syncHash() {
    try { history.replaceState(null, '', buildHash(activeTab)); } catch (e) { /* abaikan */ }
}

function bukaDiTabBaru(tab, sub) {
    const w = window.open(buildTabUrl(tab, sub), '_blank', 'noopener');
    if (!w && typeof toast === 'function') toast('Pop-up diblokir browser. Izinkan pop-up untuk situs ini.', 'y');
}

/** Baca hash URL → { tab, sub, cabang } atau null kalau tidak valid */
function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    if (!raw) return null;
    const [path, qs] = raw.split('?');
    const [tabRaw, subRaw] = path.split('/');
    const tab = decodeURIComponent(tabRaw || '');
    if (!TAB_META[tab]) return null;
    const cabang = qs ? (new URLSearchParams(qs).get('cabang') || '') : '';
    return { tab, sub: subRaw ? decodeURIComponent(subRaw) : '', cabang };
}

/** Tampilkan sub-tab di UI (tombol subnav + div) TANPA render ulang kontennya */
function applySubTabUI(prefix, sub) {
    activeSubTab[prefix] = sub;
    document.querySelectorAll(`#${SUBNAV_ID[prefix]} button`).forEach(b =>
        b.classList.toggle('on', b.dataset.s === sub)
    );
    document.querySelectorAll(`[id^="${prefix}-"]`).forEach(el => {
        el.style.display = el.id === `${prefix}-${sub}` ? '' : 'none';
    });
}

/** Dipanggil sekali saat start: buka tab/sub sesuai hash (default dashboard) */
async function bukaDariHash() {
    const h = parseHash();
    if (!h) { await setTab('dashboard'); return; }
    const sel = document.getElementById('gCabang');
    if (sel && h.cabang && [...sel.options].some(o => o.value === h.cabang)) sel.value = h.cabang;
    const pf = TAB_PREFIX[h.tab];
    if (pf && h.sub && document.querySelector(`#${SUBNAV_ID[pf]} button[data-s="${CSS.escape(h.sub)}"]`)) {
        applySubTabUI(pf, h.sub);
    }
    await setTab(h.tab);
}

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

    // URL ikut menunjuk ke halaman ini (supaya bisa dibuka di tab baru)
    syncHash();

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
    applySubTabUI(prefix, sub);
    syncHash();
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

// Klik tombol nav di sidebar (ikon ↗ / Ctrl / Cmd / Shift = buka di tab baru)
const _bukaBaru = e => e.ctrlKey || e.metaKey || e.shiftKey;
document.querySelector('.sb-nav').addEventListener('click', e => {
    const btn = e.target.closest('.nb');
    if (!btn?.dataset.tab) return;
    if (e.target.closest('.nb-new') || _bukaBaru(e)) {
        e.preventDefault();
        bukaDiTabBaru(btn.dataset.tab);
        return;
    }
    setTab(btn.dataset.tab);
});
// Klik tengah (roda mouse) pada menu samping = buka di tab baru
document.querySelector('.sb-nav').addEventListener('auxclick', e => {
    if (e.button !== 1) return;
    const btn = e.target.closest('.nb');
    if (!btn?.dataset.tab) return;
    e.preventDefault();
    bukaDiTabBaru(btn.dataset.tab);
});
// Cegah autoscroll bawaan browser saat klik tengah
document.querySelector('.sb-nav').addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });

// Ikon ↗ kecil di tiap menu samping (muncul saat di-hover)
document.querySelectorAll('.sb-nav .nb').forEach(b => {
    const ic = document.createElement('span');
    ic.className = 'nb-new';
    ic.title = 'Buka di tab baru';
    ic.setAttribute('role', 'link');
    ic.textContent = '↗';
    b.appendChild(ic);
});

// Klik subnav — helper untuk semua subnav
function wireSnav(navId, prefix) {
    const nav = document.getElementById(navId);
    if (!nav) return;
    nav.addEventListener('click', e => {
        const btn = e.target.closest('button');
        if (!btn?.dataset.s) return;
        if (_bukaBaru(e)) {
            e.preventDefault();
            bukaDiTabBaru(activeTab, btn.dataset.s);
            return;
        }
        setSubTab(prefix, btn.dataset.s);
    });
    nav.addEventListener('auxclick', e => {
        if (e.button !== 1) return;
        const btn = e.target.closest('button');
        if (!btn?.dataset.s) return;
        e.preventDefault();
        bukaDiTabBaru(activeTab, btn.dataset.s);
    });
    nav.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
}

wireSnav('snAnalisis', 'an');
wireSnav('snMaster',   'ms');
wireSnav('snTrx',      'tx');
wireSnav('snStok',     'stok');
wireSnav('snJurnal',   'jr');
wireSnav('snLap',      'lp');
wireSnav('snSid',      'sid');
wireSnav('snSinkron',  'sk');

// Tombol "Tab Baru" di topbar = duplikat halaman yang sedang dibuka
document.getElementById('btnTabBaru')?.addEventListener('click', () => bukaDiTabBaru(activeTab));

// Hamburger mobile
document.getElementById('ham').addEventListener('click', () =>
    document.getElementById('sb').classList.toggle('open')
);

// Re-render saat filter cabang berubah
document.getElementById('gCabang').addEventListener('change', () => {
    syncHash();
    renderTabContent(activeTab);
});
