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


/* ── TAB HALAMAN (multi-tab DI DALAM aplikasi) ───────────────
   Seperti tab browser, tapi di dalam web ini: deretan tab di bawah topbar.
   Tiap tab menyimpan halaman (menu + sub-menu + cabang) dan posisi scroll.
   Cara membuka tab baru: tombol "＋ Tab Baru" (menggandakan halaman aktif),
   ikon ↗ di menu samping, atau Ctrl/Cmd/Shift + klik / klik tengah pada
   menu & sub-menu. Klik menu biasa = pindah halaman di tab yang aktif.
   Daftar tab disimpan di browser (localStorage) sehingga tetap ada setelah refresh. */
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

function syncHash() {
    try { history.replaceState(null, '', buildHash(activeTab)); } catch (e) { /* abaikan */ }
    pageTabCapture();
}

/* ── DAFTAR TAB HALAMAN ───────────────────────────────────── */
const PT_KEY = 'ts_page_tabs_v1';
const pageTabs = { list: [{ tab: 'dashboard', sub: '', cabang: '', scroll: 0 }], active: 0 };
let _ptBusy = false;

function ptSave() {
    try { localStorage.setItem(PT_KEY, JSON.stringify({ list: pageTabs.list, active: pageTabs.active })); } catch (e) { /* abaikan */ }
}
function ptLoad() {
    try {
        const d = JSON.parse(localStorage.getItem(PT_KEY) || 'null');
        if (d && Array.isArray(d.list)) {
            const ok = d.list.filter(t => t && TAB_META[t.tab]).slice(0, 12);
            if (ok.length) { pageTabs.list = ok; pageTabs.active = Math.min(Math.max(0, d.active | 0), ok.length - 1); }
        }
    } catch (e) { /* abaikan */ }
}

/** Simpan posisi halaman saat ini ke tab yang aktif */
function pageTabCapture() {
    if (_ptBusy) return;
    const t = pageTabs.list[pageTabs.active];
    if (!t) return;
    const pf = TAB_PREFIX[activeTab];
    t.tab = activeTab;
    t.sub = pf ? activeSubTab[pf] : '';
    t.cabang = document.getElementById('gCabang')?.value || '';
    renderPageTabs();
    ptSave();
}

function ptLabel(t) {
    const pf = TAB_PREFIX[t.tab];
    let lbl = TAB_META[t.tab]?.title || t.tab;
    if (pf && t.sub) {
        const b = document.querySelector(`#${SUBNAV_ID[pf]} button[data-s="${t.sub}"]`);
        if (b) lbl += ' › ' + b.textContent.trim();
    }
    return lbl;
}

function renderPageTabs() {
    const el = document.getElementById('pageTabs');
    if (!el) return;
    const multi = pageTabs.list.length > 1;
    el.innerHTML = pageTabs.list.map((t, i) => {
        const lbl = ptLabel(t) + (t.cabang ? ' · ' + t.cabang : '');
        const safe = lbl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
        return `<div class="ptab${i === pageTabs.active ? ' on' : ''}" data-i="${i}" title="${safe}" role="tab">
            <span class="ptab-lbl">${safe}</span>${multi ? '<span class="ptab-x" data-x="1" title="Tutup tab">×</span>' : ''}</div>`;
    }).join('') + '<button type="button" class="ptab-add" id="ptAdd" title="Tab baru (menggandakan halaman ini)">＋</button>'
      + '<button type="button" class="ptab-add ptab-reload" id="ptReload" title="Muat ulang data tab ini (ambil data terbaru)">↻</button>';
}

/* ── CACHE ISI TAB ────────────────────────────────────────────
   Supaya pindah tab TIDAK memuat ulang data: saat meninggalkan sebuah tab,
   isi halamannya (node DOM, lengkap dengan event-nya) disimpan ke memori;
   saat kembali, node itu dipasang lagi — instan, tanpa fetch ke server.
   Variabel global sementara halaman (window._xxx) ikut disimpan/dipulihkan.
   Data di tab yang di-cache TIDAK otomatis ter-update kalau ada perubahan
   di tab lain → tombol ↻ di deretan tab memuat ulang tab yang aktif. */
const ptCache = new WeakMap();
const PT_TANPA_CACHE = new Set(['pos']);   // Kasir POS punya state sendiri → selalu render ulang
const ptKey = t => [t.tab, t.sub || '', t.cabang || ''].join('|');

function ptContainer(t) {
    const pf = TAB_PREFIX[t.tab];
    return document.getElementById(pf ? `${pf}-${t.sub}` : `tab-${t.tab}`);
}
function ptGlobals() {
    const v = {};
    Object.keys(window).forEach(k => { if (k[0] === '_' && k[1] !== '_') v[k] = window[k]; });
    return v;
}
/** Pindahkan isi halaman tab t keluar dari DOM ke cache */
function ptSimpanIsi(t) {
    if (!t || PT_TANPA_CACHE.has(t.tab)) return;
    const el = ptContainer(t);
    if (!el || !el.firstChild) return;
    // masih memuat (spinner) / error → jangan di-cache, biar dimuat ulang saat dibuka lagi
    if (el.querySelector('.loading-state')) { ptCache.delete(t); return; }
    const frag = document.createDocumentFragment();
    while (el.firstChild) frag.appendChild(el.firstChild);
    ptCache.set(t, { key: ptKey(t), frag, vars: ptGlobals(), at: Date.now() });
}
/** Pasang kembali isi dari cache; return true kalau berhasil */
function ptPulihkanIsi(t) {
    const c = ptCache.get(t);
    ptCache.delete(t);
    if (!c || c.key !== ptKey(t)) return false;
    const el = ptContainer(t);
    if (!el) return false;
    el.innerHTML = '';
    el.appendChild(c.frag);
    Object.assign(window, c.vars);
    return true;
}

/** Tampilkan tab ke-i: pulihkan menu, sub-menu, cabang, scroll — isi dari cache kalau ada */
async function aktifkanPageTab(i, awal) {
    if (!awal) {
        pageTabCapture();
        const cur = pageTabs.list[pageTabs.active];
        const cc = document.querySelector('.content');
        if (cur && cc) cur.scroll = cc.scrollTop;
        ptSimpanIsi(cur);
    }
    const c = document.querySelector('.content');
    pageTabs.active = i;
    const t = pageTabs.list[i];
    _ptBusy = true;
    try {
        const sel = document.getElementById('gCabang');
        if (sel) sel.value = [...sel.options].some(o => o.value === t.cabang) ? t.cabang : '';
        const pf = TAB_PREFIX[t.tab];
        if (pf) {
            const sub = t.sub && document.querySelector(`#${SUBNAV_ID[pf]} button[data-s="${CSS.escape(t.sub)}"]`) ? t.sub : activeSubTab[pf];
            applySubTabUI(pf, sub);
            t.sub = sub;
        }
        activeTab = t.tab;
    } finally { _ptBusy = false; }
    const dariCache = ptPulihkanIsi(t);
    await setTab(t.tab, { skipRender: dariCache });
    if (c) c.scrollTop = t.scroll || 0;
}

/** Muat ulang isi tab yang sedang aktif (ambil data terbaru dari server) */
async function muatUlangPageTab() {
    ptCache.delete(pageTabs.list[pageTabs.active]);
    await renderTabContent(activeTab);
}

/** Buka halaman (tab, sub) di TAB BARU di dalam aplikasi */
async function bukaDiTabBaru(tab, sub) {
    if (pageTabs.list.length >= 12) { if (typeof toast === 'function') toast('Maksimal 12 tab terbuka. Tutup salah satu dulu.', 'y'); return; }
    pageTabCapture();
    const c = document.querySelector('.content');
    if (c) pageTabs.list[pageTabs.active].scroll = c.scrollTop;
    ptSimpanIsi(pageTabs.list[pageTabs.active]);
    const pf = TAB_PREFIX[tab];
    pageTabs.list.push({
        tab: tab || activeTab,
        sub: sub || (pf ? activeSubTab[pf] : ''),
        cabang: document.getElementById('gCabang')?.value || '',
        scroll: 0,
    });
    await aktifkanPageTab(pageTabs.list.length - 1, true);
}

async function tutupPageTab(i) {
    if (pageTabs.list.length <= 1) return;
    pageTabCapture();
    const wasActive = i === pageTabs.active;
    pageTabs.list.splice(i, 1);
    if (i < pageTabs.active) pageTabs.active--;
    if (wasActive) {
        pageTabs.active = Math.min(i, pageTabs.list.length - 1);
        await aktifkanPageTab(pageTabs.active, true);
    } else { renderPageTabs(); ptSave(); }
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

/** Dipanggil sekali saat start: pulihkan tab yang tersimpan; hash URL (kalau ada) menimpa tab aktif */
async function bukaDariHash() {
    ptLoad();
    const h = parseHash();
    if (h) {
        const t = pageTabs.list[pageTabs.active];
        t.tab = h.tab; t.sub = h.sub || ''; t.cabang = h.cabang || t.cabang || '';
    }
    await aktifkanPageTab(pageTabs.active, true);
}

/* ── PINDAH TAB UTAMA ─────────────────────────────────────── */

/**
 * Aktifkan panel tab dan render kontennya
 * @param {string} tab - Nama tab: dashboard|analisis|master|transaksi|jurnal|laporan
 */
async function setTab(tab, opts = {}) {
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

    // Render konten tab (dilewati kalau isinya dipulihkan dari cache tab halaman)
    if (!opts.skipRender) await renderTabContent(tab);
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

// Deretan tab halaman: klik = pindah, × = tutup, ＋ = tab baru, klik tengah = tutup
(() => {
    const bar = document.getElementById('pageTabs');
    if (!bar) return;
    bar.addEventListener('click', e => {
        if (e.target.closest('#ptAdd')) { bukaDiTabBaru(activeTab); return; }
        if (e.target.closest('#ptReload')) { muatUlangPageTab(); return; }
        const t = e.target.closest('.ptab');
        if (!t) return;
        const i = +t.dataset.i;
        if (e.target.closest('[data-x]')) { tutupPageTab(i); return; }
        if (i !== pageTabs.active) aktifkanPageTab(i);
    });
    bar.addEventListener('auxclick', e => {
        if (e.button !== 1) return;
        const t = e.target.closest('.ptab');
        if (t) { e.preventDefault(); tutupPageTab(+t.dataset.i); }
    });
    bar.addEventListener('mousedown', e => { if (e.button === 1) e.preventDefault(); });
    // Ctrl+Alt+T = tab baru, Ctrl+Alt+W = tutup tab aktif
    document.addEventListener('keydown', e => {
        if (!(e.ctrlKey && e.altKey)) return;
        const k = e.key.toLowerCase();
        if (k === 't') { e.preventDefault(); bukaDiTabBaru(activeTab); }
        if (k === 'w') { e.preventDefault(); tutupPageTab(pageTabs.active); }
    });
})();

// Hamburger mobile
document.getElementById('ham').addEventListener('click', () =>
    document.getElementById('sb').classList.toggle('open')
);

// Re-render saat filter cabang berubah
document.getElementById('gCabang').addEventListener('change', () => {
    syncHash();
    renderTabContent(activeTab);
});
