/* =============================================================
   deeplink.js — "Buka di Tab Baru" untuk semua tautan klik
   (aplikasi ini satu halaman, jadi tiap rincian/nota/akun/kartu HPP
   dibuka lewat fungsi JS & modal. File ini membuat semuanya bisa
   dibuka di TAB BROWSER BARU, dengan cara:
     • Ctrl+klik / Cmd+klik / klik-tengah (roda mouse) pada baris/tautan
     • Klik-kanan ▸ "↗ Buka di tab baru"
     • Tombol "↗ Tab Baru" di kepala jendela rincian (modal)
   Berlaku juga untuk menu sidebar & sub-menu (Ctrl+klik).
   Tab baru memuat halaman yang sama (sesi login sama), pindah ke menu
   asalnya, lalu otomatis membuka rincian yang sama.
   Dimuat SEBELUM app.js. Tidak mengubah perilaku klik biasa.
   ============================================================= */
(() => {
    // Hanya fungsi di daftar ini yang boleh dibuka lewat tautan (keamanan).
    const WL = ['lihatKartuHpp', 'lapLihatAkun', 'bukaBentukanRef', 'bukaRiwayatNota', 'bukaRiwayatKontak',
                'bukaJadwalAset', 'bukaDetailPoin', 'bukaDetailNotaJual', 'bukaDetailNotaBeli', 'openMutasiDetail',
                'lapLihatPembelian', 'lapLihatHppKartu'];
    const PREFIX = { analisis: 'an', master: 'ms', transaksi: 'tx', stok: 'stok', jurnal: 'jr', laporan: 'lp', sid: 'sid', sinkron: 'sk' };
    const TAB_OF = Object.fromEntries(Object.entries(PREFIX).map(([t, p]) => [p, t]));
    const NAVID  = { an: 'snAnalisis', ms: 'snMaster', tx: 'snTrx', stok: 'snStok', jr: 'snJurnal', lp: 'snLap', sid: 'snSid', sk: 'snSinkron' };
    const ID_PREFIX = Object.fromEntries(Object.entries(NAVID).map(([p, id]) => [id, p]));

    const gCab = () => { try { return getCabang(); } catch (_) { return ''; } };
    const subNow = (tab) => { try { const p = PREFIX[tab]; return p ? activeSubTab[p] : undefined; } catch (_) { return undefined; } };

    const urlDari = (spec) => location.origin + location.pathname + '?dl=' + encodeURIComponent(JSON.stringify(spec));
    const bukaTab = (spec) => window.open(urlDari(spec), '_blank', 'noopener');

    /* ── Baca "fn(args…)" dari atribut onclick ─────────────────── */
    function parseOnclick(el) {
        const raw = el.getAttribute && el.getAttribute('onclick');
        if (!raw) return null;
        const m = raw.match(/^\s*(?:event\.stopPropagation\(\)\s*;\s*)?([A-Za-z_$][\w$]*)\s*\(([\s\S]*)\)\s*;?\s*$/);
        if (!m) return null;
        let args;
        try { args = new Function('return [' + m[2] + ']')(); } catch (_) { return null; }
        return { fn: m[1], args };
    }

    /** Spec tautan dari elemen yang diklik (atau induknya), atau null. */
    function specDari(target) {
        for (let el = target; el && el !== document.body; el = el.parentElement) {
            const nav = el.classList && el.classList.contains('nb') && el.dataset && el.dataset.tab;
            if (nav) return { tab: nav };
            const p = parseOnclick(el);
            if (!p) continue;
            let { fn, args } = p;
            if (fn === 'setTab' && typeof args[0] === 'string') return { tab: args[0] };
            if (fn === 'setSubTab' && TAB_OF[args[0]]) return { tab: TAB_OF[args[0]], sub: args[1] };
            if (fn === 'lihatDetailJurnal') fn = 'bukaBentukanRef';
            if (WL.includes(fn)) {
                const tab = (typeof activeTab !== 'undefined') ? activeTab : 'dashboard';
                return { fn, args, tab, sub: subNow(tab), cab: gCab() };
            }
        }
        // tombol sub-menu tanpa onclick (pakai data-s di dalam #snXxx)
        const sb = target.closest && target.closest('button[data-s]');
        const host = sb && sb.parentElement && sb.parentElement.id;
        if (host && ID_PREFIX[host]) return { tab: TAB_OF[ID_PREFIX[host]], sub: sb.dataset.s };
        return null;
    }

    /* ── Ctrl/Cmd+klik, klik-tengah, klik-kanan ───────────────── */
    document.addEventListener('click', (e) => {
        if (!(e.ctrlKey || e.metaKey)) return;
        const s = specDari(e.target); if (!s) return;
        e.preventDefault(); e.stopImmediatePropagation(); bukaTab(s);
    }, true);
    document.addEventListener('mousedown', (e) => { if (e.button === 1 && specDari(e.target)) e.preventDefault(); }, true);
    document.addEventListener('auxclick', (e) => {
        if (e.button !== 1) return;
        const s = specDari(e.target); if (!s) return;
        e.preventDefault(); e.stopImmediatePropagation(); bukaTab(s);
    }, true);

    let menu = null;
    const tutupMenu = () => { if (menu) { menu.remove(); menu = null; } };
    document.addEventListener('contextmenu', (e) => {
        const s = specDari(e.target);
        tutupMenu();
        if (!s) return;
        e.preventDefault();
        menu = document.createElement('div');
        menu.style.cssText = 'position:fixed;z-index:99999;background:#fff;border:1px solid #cfd6d2;border-radius:8px;box-shadow:0 6px 20px rgba(0,0,0,.18);padding:4px;font:13px system-ui,sans-serif;';
        menu.style.left = Math.min(e.clientX, innerWidth - 190) + 'px';
        menu.style.top  = Math.min(e.clientY, innerHeight - 50) + 'px';
        menu.innerHTML = '<div style="padding:7px 14px;cursor:pointer;border-radius:6px;white-space:nowrap;">↗ Buka di tab baru</div>';
        const item = menu.firstChild;
        item.onmouseenter = () => item.style.background = '#eef3ef';
        item.onmouseleave = () => item.style.background = '';
        item.onclick = () => { tutupMenu(); bukaTab(s); };
        document.body.appendChild(menu);
    }, true);
    document.addEventListener('click', tutupMenu);
    document.addEventListener('scroll', tutupMenu, true);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') tutupMenu(); });

    /* ── Catat pemanggilan fungsi rincian → tombol "↗ Tab Baru" di modal ── */
    WL.forEach((n) => {
        const asli = window[n];
        if (typeof asli !== 'function') return;
        window[n] = function (...a) {
            const tab = (typeof activeTab !== 'undefined') ? activeTab : 'dashboard';
            window._dlCur = { t: Date.now(), spec: { fn: n, args: a, tab, sub: subNow(tab), cab: gCab() } };
            return asli.apply(this, a);
        };
    });
    const openMAsli = window.openM;
    if (typeof openMAsli === 'function') {
        window.openM = function (html) {
            const r = openMAsli.apply(this, arguments);
            const cur = window._dlCur;
            if (cur && Date.now() - cur.t < 3000) {
                window._dlCur = null;
                const h = document.querySelector('#mbox .mhd');
                if (h && !h.querySelector('.dl-newtab')) {
                    const b = document.createElement('button');
                    b.type = 'button'; b.className = 'btn btn-g btn-sm dl-newtab';
                    b.textContent = '↗ Tab Baru'; b.title = 'Buka rincian ini di tab browser baru';
                    b.style.cssText = 'margin-left:auto;margin-right:8px;';
                    b.onclick = () => bukaTab(cur.spec);
                    h.insertBefore(b, h.querySelector('.mclose'));
                }
            }
            return r;
        };
    }

    /* ── Jalankan tautan saat halaman dimuat (di tab baru) ───────── */
    const aman = (v, d = 0) => d < 4 && (v === null || ['string', 'number', 'boolean'].includes(typeof v)
        ? (typeof v !== 'string' || v.length <= 500)
        : (Array.isArray(v) ? v.length <= 12 && v.every(x => aman(x, d + 1))
           : (typeof v === 'object' && Object.keys(v).length <= 12 && Object.values(v).every(x => aman(x, d + 1)))));

    /** @returns {Promise<boolean>} true kalau tautan dijalankan (menggantikan render dashboard awal) */
    window.jalankanDeepLink = async () => {
        let spec;
        try { spec = JSON.parse(new URLSearchParams(location.search).get('dl') || 'null'); } catch (_) { return false; }
        if (!spec || typeof spec !== 'object') return false;
        const tab = (typeof TAB_META !== 'undefined' && TAB_META[spec.tab]) ? spec.tab : 'dashboard';

        const sel = document.getElementById('gCabang');
        if (sel && typeof spec.cab === 'string' && [...sel.options].some(o => o.value === spec.cab)) sel.value = spec.cab;

        await setTab(tab);
        const prefix = PREFIX[tab];
        if (prefix && typeof spec.sub === 'string' && /^[\w-]{1,30}$/.test(spec.sub)) await setSubTab(prefix, spec.sub);

        if (spec.fn && WL.includes(spec.fn) && Array.isArray(spec.args) && spec.args.length <= 8 && aman(spec.args)
            && typeof window[spec.fn] === 'function') {
            try { await window[spec.fn](...spec.args); } catch (_) { /* biarkan halaman tetap terbuka */ }
        }
        return true;
    };
})();
