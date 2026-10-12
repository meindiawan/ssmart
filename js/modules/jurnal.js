/* =============================================================
   jurnal.js — Jurnal Umum & Buku Besar
   Data dari: GET /api/laporan/jurnal
              GET /api/laporan/buku-besar?kode_akun=&cabang=
   Jurnal dibuat OTOMATIS oleh DashboardController::buildJurnal()
   ============================================================= */

/* ── JURNAL UMUM ──────────────────────────────────────────── */
async function renderJurnalUmum() {
    const el = document.getElementById('jr-umum');
    el.innerHTML = loadingHTML;

    try {
        const cab = getCabang();
        const res  = await apiGet('/laporan/jurnal' + buildQuery({ cabang: cab }));
        const list = res.data || [];
        // Simpan di window supaya bisa dipakai lihatDetailJurnal() saat baris diklik
        // & dipakai ulang saat ganti mode pengelompokan (tanpa fetch API lagi)
        window._jurnalList = list;
        window._jurnalRes  = res;
        if (!window._jurnalGroupMode) window._jurnalGroupMode = 'flat';
        window._jurnalPage = 1; // data baru (mis. ganti cabang) → mulai dari halaman 1

        el.innerHTML = `
        ${exportBar('tblJurnal','jurnal-umum','jr-umum','Jurnal Umum')}

        <div class="note note-b">
            <span class="note-ico">ℹ️</span>
            <span>Jurnal dibuat <strong>otomatis dari semua transaksi</strong> — prinsip double-entry bookkeeping.
            Klik salah satu baris untuk melihat bentukan lengkap (pasangan debit-kredit) dari transaksi tersebut.<br>
            Referensi: <code>PJ</code>=Penjualan, <code>PB</code>=Pembelian, <code>JS</code>=Jasa,
            <code>SW</code>=Sewa, <code>RT</code>=Retur, <code>KB</code>=Kasbon, <code>CB</code>=Cashbon Pelanggan,
            <code>BX</code>=Biaya, <code>BM</code>=Barang Masuk, <code>BK</code>=Barang Keluar, <code>SO</code>=Selisih Stok Opname.</span>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>Jurnal Umum</h3>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <input class="finput" id="srchJurnal" placeholder="🔍 Cari referensi, akun, atau keterangan…" value="${esc(window._jurnalSearch || '')}"
                        style="width:240px;"
                        oninput="smartSearch('srchJurnal', this.value, v => { window._jurnalSearch = v; window._jurnalPage = 1; }, () => jurnalRedrawArea())">
                    <div class="meta" id="jrMetaCount">${list.length} entri · ${cab || 'Semua cabang'}</div>
                    <div class="seg-toggle" id="jrGroupToggle">
                        <button class="${window._jurnalGroupMode === 'flat' ? 'on' : ''}" onclick="jurnalSetGroupMode('flat')">☰ Semua</button>
                        <button class="${window._jurnalGroupMode === 'tanggal' ? 'on' : ''}" onclick="jurnalSetGroupMode('tanggal')">📅 Per Tanggal</button>
                        <button class="${window._jurnalGroupMode === 'ref' ? 'on' : ''}" onclick="jurnalSetGroupMode('ref')">🧾 Per Transaksi</button>
                    </div>
                </div>
            </div>
            <div class="box-bd pad0 tscroll" id="jrUmumArea">${jurnalBuildAreaHTML(list, res)}</div>
        </div>`;

    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/** Ganti mode tampilan (flat / per tanggal / per transaksi) tanpa fetch ulang ke API */
window.jurnalSetGroupMode = (mode) => {
    window._jurnalGroupMode = mode;
    window._jurnalPage = 1; // ganti mode → balik ke halaman 1
    document.querySelectorAll('#jrGroupToggle button').forEach((b, i) => {
        b.classList.toggle('on', ['flat', 'tanggal', 'ref'][i] === mode);
    });
    jurnalRedrawArea();
};

/** Pindah halaman (dipakai tombol pagination di bawah tabel) tanpa fetch ulang ke API */
window.jurnalGoToPage = (p) => {
    window._jurnalPage = p;
    jurnalRedrawArea();
    document.getElementById('jrUmumArea')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

function jurnalRedrawArea() {
    const area = document.getElementById('jrUmumArea');
    if (!area) return;
    const full = window._jurnalList || [];
    // Pencarian di sisi klien — data jurnal sudah lengkap di memori (dari 1x
    // fetch awal), jadi tidak perlu panggil API lagi tiap ketik = instan &
    // tidak ada flicker/kehilangan fokus sama sekali.
    const filtered = window.clientSearch(full, window._jurnalSearch, ['ref', 'akun', 'nama_akun', 'ket']);
    area.innerHTML = jurnalBuildAreaHTML(filtered, window._jurnalRes || {});
    const metaEl = document.getElementById('jrMetaCount');
    if (metaEl) {
        const cab = getCabang();
        metaEl.textContent = `${filtered.length} entri${filtered.length !== full.length ? ` (dari ${full.length})` : ''} · ${cab || 'Semua cabang'}`;
    }
}

// Jumlah baris (mode flat) / jumlah grup (mode tanggal & referensi) yang
// ditampilkan per halaman. Minimal 30 sesuai permintaan, supaya tidak jadi
// satu tabel raksasa — user tinggal klik "Next" untuk lihat data berikutnya.
const JURNAL_PAGE_SIZE = 30;

/** Bangun isi area tabel jurnal sesuai mode pengelompokan yang aktif, dipaging */
function jurnalBuildAreaHTML(list, res) {
    const searching = !!(window._jurnalSearch && window._jurnalSearch.trim());
    if (!list.length) {
        return searching
            ? `<div class="empty"><div class="ico">🔍</div><strong>Tidak ada jurnal yang cocok dengan "${esc(window._jurnalSearch)}".</strong></div>`
            : '<div class="empty"><div class="ico">📓</div><strong>Belum ada jurnal.</strong><br>Tambahkan transaksi terlebih dahulu.</div>';
    }

    // Total Debit/Kredit yang ditampilkan di footer: kalau sedang mencari
    // (hasil cuma sebagian), hitung ulang dari baris yang cocok saja —
    // supaya angkanya tetap benar & tidak menyesatkan (bukan total semua
    // jurnal, tapi total dari hasil pencarian ini).
    const totD = searching ? list.reduce((s, x) => s + Number(x.D || 0), 0) : res.total_D;
    const totK = searching ? list.reduce((s, x) => s + Number(x.K || 0), 0) : res.total_K;
    const footer = searching
        ? `<div style="padding:12px 16px;"><div class="note note-b" style="margin:0;"><span>🔍</span> Menampilkan hasil pencarian "${esc(window._jurnalSearch)}" — Debit ${R(totD)} · Kredit ${R(totK)}</div></div>`
        : `
        <div style="padding:12px 16px;">
            ${res.seimbang
                ? `<div class="note note-g" style="margin:0;"><span>✓</span> Jurnal seimbang — Total Debit = Total Kredit = ${R(res.total_D)}</div>`
                : `<div class="note note-y" style="margin:0;"><span>⚠️</span> Debit (${R(res.total_D)}) ≠ Kredit (${R(res.total_K)}). Selisih: ${R(Math.abs(res.total_D - res.total_K))}. Periksa data transaksi.</div>`
            }
        </div>`;

    // Halaman aktif, dijaga tetap dalam rentang valid (mis. setelah ganti
    // mode/cabang jumlah datanya berubah).
    const mode = window._jurnalGroupMode || 'flat';
    const clampPage = (totalItems) => {
        const lastPage = Math.max(1, Math.ceil(totalItems / JURNAL_PAGE_SIZE));
        let page = window._jurnalPage || 1;
        if (page > lastPage) page = lastPage;
        if (page < 1) page = 1;
        window._jurnalPage = page;
        return { page, lastPage };
    };

    if (mode === 'flat') {
        const { page, lastPage } = clampPage(list.length);
        const startIdx = (page - 1) * JURNAL_PAGE_SIZE;
        const pageRows = list.slice(startIdx, startIdx + JURNAL_PAGE_SIZE);
        const meta = {
            from: list.length ? startIdx + 1 : 0,
            to: Math.min(startIdx + JURNAL_PAGE_SIZE, list.length),
            total: list.length,
            current_page: page,
            last_page: lastPage,
        };
        return `<table id="tblJurnal">
            <thead><tr>
                <th>Tanggal</th><th>Referensi</th><th>Kode Akun</th><th>Nama Akun</th>
                <th>Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th>
            </tr></thead>
            <tbody>${pageRows.map(x => jurnalRowHTML(x)).join('')}</tbody>
            <tfoot><tr><td colspan="5">Total (seluruh ${list.length.toLocaleString('id-ID')} entri)</td><td>${R(totD)}</td><td>${R(totK)}</td></tr></tfoot>
        </table>
        <div style="padding:10px 16px;">${paginationHTML(meta, 'jurnalGoToPage')}</div>
        ${footer}`;
    }

    // ── Kelompokkan per Tanggal ATAU per Referensi (transaksi) ────────
    const groups = [];
    const idxOf = {};
    list.forEach(x => {
        const key = mode === 'tanggal' ? x.tgl : x.ref;
        if (idxOf[key] === undefined) { idxOf[key] = groups.length; groups.push({ key, rows: [] }); }
        groups[idxOf[key]].rows.push(x);
    });

    // Tabel flat disembunyikan tetap ada di DOM khusus utk "Export Excel"
    // (XLSX.utils.table_to_sheet butuh elemen <table> asli, bukan grup) —
    // sengaja berisi SEMUA data (bukan cuma halaman aktif) supaya hasil
    // export tetap lengkap.
    const hiddenFlatTable = `<table id="tblJurnal" style="display:none;">
        <thead><tr>
            <th>Tanggal</th><th>Referensi</th><th>Kode Akun</th><th>Nama Akun</th>
            <th>Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th>
        </tr></thead>
        <tbody>${list.map(x => jurnalRowHTML(x)).join('')}</tbody>
        <tfoot><tr><td colspan="5">Total</td><td>${R(totD)}</td><td>${R(totK)}</td></tr></tfoot>
    </table>`;

    const { page, lastPage } = clampPage(groups.length);
    const startIdx = (page - 1) * JURNAL_PAGE_SIZE;
    const pageGroups = groups.slice(startIdx, startIdx + JURNAL_PAGE_SIZE);
    const meta = {
        from: groups.length ? startIdx + 1 : 0,
        to: Math.min(startIdx + JURNAL_PAGE_SIZE, groups.length),
        total: groups.length,
        current_page: page,
        last_page: lastPage,
    };

    return `${hiddenFlatTable}<div class="jr-groups">
        ${pageGroups.map((g, gi) => {
            const sumD = g.rows.reduce((s, x) => s + Number(x.D || 0), 0);
            const sumK = g.rows.reduce((s, x) => s + Number(x.K || 0), 0);
            const label = mode === 'tanggal'
                ? fmtTgl(g.key)
                : `<span class="badge badge-noppn">${esc(g.key)}</span> <span style="font-weight:400;color:var(--ink2);">${esc(g.rows[0].ket || '')}</span>`;
            return `<details class="jr-group" ${gi < 15 ? 'open' : ''}>
                <summary>
                    <span class="jr-group-arrow">▸</span>
                    <span class="jr-group-label">${label}</span>
                    <span class="jr-group-meta">${g.rows.length} baris</span>
                    <span class="jr-group-amt">D ${R(sumD)} · K ${R(sumK)}</span>
                </summary>
                <table>
                    <thead><tr>
                        <th>Tanggal</th><th>Referensi</th><th>Kode Akun</th><th>Nama Akun</th>
                        <th>Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th>
                    </tr></thead>
                    <tbody>${g.rows.map(x => jurnalRowHTML(x)).join('')}</tbody>
                </table>
            </details>`;
        }).join('')}
    </div>
    <div style="padding:10px 16px;">${paginationHTML(meta, 'jurnalGoToPage')}</div>
    ${footer}`;
}

/** 1 baris jurnal (dipakai baik di tampilan flat maupun di dalam grup) */
function jurnalRowHTML(x) {
    return `<tr class="row-click" onclick="lihatDetailJurnal('${esc(x.ref)}')" title="Klik untuk melihat bentukan lengkap jurnal ini">
        <td>${fmtTgl(x.tgl)}</td>
        <td style="font-family:var(--F-m);font-size:12px;white-space:nowrap;">
            <span class="badge badge-noppn">${esc(x.ref)}</span>
        </td>
        <td style="font-family:var(--F-m);font-size:12px;color:var(--ink3);">${esc(x.akun)}</td>
        <td style="font-size:13px;">${esc(x.nama_akun || x.akun)}</td>
        <td style="font-size:12px;color:var(--ink2);">${esc(x.ket)}</td>
        <td class="r laba-pos">${x.D ? R(x.D) : ''}</td>
        <td class="r laba-neg">${x.K ? R(x.K) : ''}</td>
    </tr>`;
}

/* ── BUKU BESAR ───────────────────────────────────────────── */
async function renderBukuBesar() {
    const el = document.getElementById('jr-besar');

    // Buat dropdown pilih akun dari STATE.coa
    const coaOpts = STATE.coa
        .map(c => `<option value="${esc(c.kode)}">${c.kode} – ${esc(c.nama)}</option>`)
        .join('');

    el.innerHTML = `
    <div class="box">
        <div class="box-hd">
            <h3>Buku Besar per Akun</h3>
            <select class="fselect" id="bbAkun" style="max-width:300px;" title="Pilih akun">
                ${coaOpts}
            </select>
        </div>
        <div style="padding:10px 18px 0;" class="no-print">
            <button class="btn btn-g btn-sm" onclick="exportExcel('tblBB','buku-besar')">📊 Export Excel</button>
            <button class="btn btn-g btn-sm" onclick="printSection('jr-besar','Buku Besar')">🖨️ Print</button>
        </div>
        <div class="box-bd pad0 tscroll" id="bbArea">
            <div class="loading-state"><div class="loading-spinner"></div><p>Memuat buku besar…</p></div>
        </div>
    </div>`;

    // Fungsi load data buku besar berdasarkan akun & cabang
    async function loadBukuBesar() {
        const kode  = document.getElementById('bbAkun').value;
        const cab   = getCabang();
        const bbEl  = document.getElementById('bbArea');
        bbEl.innerHTML = loadingHTML;

        try {
            const res  = await apiGet('/laporan/buku-besar' + buildQuery({ kode_akun: kode, cabang: cab }));
            const list = res.data || [];
            const akun = res.akun || {};

            bbEl.innerHTML = list.length
                ? `<table id="tblBB">
                    <thead><tr>
                        <th>Tanggal</th>
                        <th>Referensi</th>
                        <th>Keterangan</th>
                        <th class="r">Debit</th>
                        <th class="r">Kredit</th>
                        <th class="r">Saldo</th>
                    </tr></thead>
                    <tbody>
                        ${list.map(x => `<tr>
                            <td>${fmtTgl(x.tgl)}</td>
                            <td style="font-family:var(--F-m);font-size:12px;">
                                <span class="badge badge-noppn">${esc(x.ref)}</span>
                            </td>
                            <td style="font-size:12px;">${esc(x.ket)}</td>
                            <td class="r laba-pos">${x.D ? R(x.D) : ''}</td>
                            <td class="r laba-neg">${x.K ? R(x.K) : ''}</td>
                            <td class="r" style="font-weight:600;font-family:var(--F-m);">${R(x.saldo)}</td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="5">Saldo Akhir — ${esc(akun.nama || kode)}</td>
                            <td>${R(res.saldo_akhir)}</td>
                        </tr>
                    </tfoot>
                </table>`
                : '<div class="empty"><div class="ico">📒</div><strong>Belum ada mutasi pada akun ini.</strong></div>';

        } catch (err) {
            bbEl.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
        }
    }

    // Event listener: load ulang saat akun berubah
    document.getElementById('bbAkun').addEventListener('change', loadBukuBesar);
    // Load awal dengan akun pertama
    await loadBukuBesar();
}

/* ── DETAIL BENTUKAN JURNAL PER REFERENSI ─────────────────── */
// Dipanggil saat baris Jurnal Umum diklik — menampilkan semua baris
// debit/kredit yang berasal dari transaksi (referensi) yang sama, supaya
// terlihat jelas "bentukan" jurnalnya (bukan cuma satu baris akun saja).
window.lihatDetailJurnal = (ref) => {
    const all  = window._jurnalList || [];
    const rows = all.filter(x => x.ref === ref);
    if (!rows.length) return;

    const totD = rows.reduce((s, x) => s + Number(x.D || 0), 0);
    const totK = rows.reduce((s, x) => s + Number(x.K || 0), 0);
    const seimbang = Math.abs(totD - totK) < 2;

    openM(`
    <div class="mhd"><h3>📓 Bentukan Jurnal — ${esc(ref)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div style="font-size:12px;color:var(--ink3);margin-bottom:10px;">${fmtTgl(rows[0].tgl)} · ${esc(rows[0].cab || '')}</div>
        <table style="width:100%;">
            <thead><tr>
                <th style="text-align:left;">Akun</th>
                <th style="text-align:left;">Keterangan</th>
                <th class="r">Debit</th>
                <th class="r">Kredit</th>
            </tr></thead>
            <tbody>
                ${rows.map(x => `<tr>
                    <td style="font-size:13px;padding:4px 6px;"><span style="font-family:var(--F-m);color:var(--ink3);font-size:11px;">${esc(x.akun)}</span><br>${esc(x.nama_akun || x.akun)}</td>
                    <td style="font-size:12px;color:var(--ink2);padding:4px 6px;">${esc(x.ket)}</td>
                    <td class="r laba-pos" style="padding:4px 6px;">${x.D ? R(x.D) : ''}</td>
                    <td class="r laba-neg" style="padding:4px 6px;">${x.K ? R(x.K) : ''}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                <tr style="font-weight:600;border-top:1px solid var(--line);">
                    <td colspan="2" style="padding:6px;">Total</td>
                    <td class="r" style="padding:6px;">${R(totD)}</td>
                    <td class="r" style="padding:6px;">${R(totK)}</td>
                </tr>
            </tfoot>
        </table>
        <div class="note ${seimbang ? 'note-g' : 'note-y'}" style="margin-top:10px;">
            <span>${seimbang ? '✓' : '⚠️'}</span>
            <span>${seimbang ? 'Baris ini seimbang (Debit = Kredit).' : `Selisih Debit-Kredit: ${R(Math.abs(totD - totK))} — periksa data transaksi ${esc(ref)}.`}</span>
        </div>
    </div>
    <div class="mft"><button class="btn btn-g" onclick="closeM()">Tutup</button></div>`);
};
