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
            <code>BX</code>=Biaya, <code>BM</code>=Barang Masuk, <code>BK</code>=Barang Keluar, <code>SO</code>=Selisih Stok Opname,
            <code>MTK/MT</code>=Mutasi Barang antar cabang, <code>JU</code>=Jurnal Manual, <code>JM</code>=Jurnal Memorial.</span>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>Jurnal Umum</h3>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <button class="btn btn-p btn-sm" onclick="bukaFormJurnalManual({jenis:'Umum'})" title="Tambah jurnal manual (debit/kredit bebas)">➕ Jurnal Manual</button>
                    <button class="btn btn-g btn-sm" onclick="bukaFormJurnalManual({jenis:'Memorial'})" title="Jurnal memorial: penyesuaian, koreksi, pembalik, pelunasan antar cabang">📌 Jurnal Memorial</button>
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


/* =============================================================
   JURNAL MANUAL & JURNAL MEMORIAL
   API: GET/POST /jurnal-manual, PUT/DELETE /jurnal-manual/{id}
   Disimpan di tabel jurnal_manual → dibaca DashboardController::buildJurnal()
   sehingga otomatis masuk Jurnal Umum, Buku Besar & semua laporan.
   ============================================================= */
const JM_KATEGORI = ['Penyesuaian', 'Koreksi', 'Pembalik', 'Pelunasan Antar Cabang', 'Non-Kas Lainnya'];

// Contoh cepat (hanya mengisi akun, nominal tetap diisi sendiri)
const JM_TEMPLATE = {
    'bayar_hutang': { label: 'Cabang bayar hutang barang ke Pusat (di buku Cabang)', kategori: 'Pelunasan Antar Cabang',
        ket: 'Pelunasan hutang barang ke Pusat', lines: [['2104', 'D'], ['1101', 'K']] },
    'terima_piutang': { label: 'Pusat terima pelunasan dari Cabang (di buku Pusat)', kategori: 'Pelunasan Antar Cabang',
        ket: 'Penerimaan pelunasan barang dari Cabang', lines: [['1101', 'D'], ['1109', 'K']] },
    'koreksi_akun': { label: 'Koreksi salah akun (pindah saldo antar akun)', kategori: 'Koreksi',
        ket: 'Koreksi salah akun', lines: [['', 'D'], ['', 'K']] },
};

function jmBlankLine() { return { kode_akun: '', debit: '', kredit: '', keterangan: '' }; }

/** Buka form jurnal manual. opts: {jenis, data} — data = jurnal yang diedit/disalin */
window.bukaFormJurnalManual = (opts = {}) => {
    const d = opts.data || null;
    window._jm = {
        id: opts.salin ? null : (d ? d.id : null),
        jenis: d ? d.jenis : (opts.jenis || 'Umum'),
        kategori: d ? (d.kategori || '') : '',
        tgl: d ? String(d.tgl).slice(0, 10) : today(),
        cabang: d ? d.cabang : (getCabang() || ''),
        keterangan: d ? d.keterangan : '',
        lines: d && d.detail && d.detail.length
            ? d.detail.map(l => ({ kode_akun: l.kode_akun, debit: Number(l.debit) || '', kredit: Number(l.kredit) || '', keterangan: l.keterangan || '' }))
            : [jmBlankLine(), jmBlankLine()],
    };
    if (opts.override) Object.assign(window._jm, opts.override);
    jmRenderForm();
};

function jmAkunOpts(sel) {
    return `<option value="">– pilih akun –</option>` + (STATE.coa || []).map(c =>
        `<option value="${esc(c.kode)}" ${String(c.kode) === String(sel) ? 'selected' : ''}>${esc(c.kode)} – ${esc(c.nama)}</option>`).join('');
}

function jmRenderForm() {
    const f = window._jm;
    const memorial = f.jenis === 'Memorial';
    openM(`
    <div class="mhd"><h3>${f.id ? '✏️ Edit' : '➕'} ${memorial ? 'Jurnal Memorial' : 'Jurnal Manual'}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgrid">
            <div class="fgroup">
                <label class="flabel">Jenis</label>
                <select class="fselect" id="jmJenis" onchange="jmSetField('jenis', this.value); jmRenderForm();">
                    <option value="Umum" ${!memorial ? 'selected' : ''}>Jurnal Manual (Umum)</option>
                    <option value="Memorial" ${memorial ? 'selected' : ''}>Jurnal Memorial</option>
                </select>
            </div>
            ${memorial ? `<div class="fgroup">
                <label class="flabel">Kategori Memorial</label>
                <select class="fselect" onchange="jmSetField('kategori', this.value)">
                    <option value="">– pilih –</option>
                    ${JM_KATEGORI.map(k => `<option ${f.kategori === k ? 'selected' : ''}>${esc(k)}</option>`).join('')}
                </select>
            </div>` : ''}
            <div class="fgroup">
                <label class="flabel">Tanggal</label>
                <input class="finput" type="date" value="${esc(f.tgl)}" onchange="jmSetField('tgl', this.value)">
            </div>
            <div class="fgroup">
                <label class="flabel">Cabang <span style="color:var(--red);">*wajib</span></label>
                <select class="fselect" onchange="jmSetField('cabang', this.value)">${cabangOpts(f.cabang)}</select>
            </div>
        </div>
        <div class="fgroup">
            <label class="flabel">Keterangan <span style="color:var(--red);">*wajib</span></label>
            <input class="finput" value="${esc(f.keterangan)}" placeholder="mis. Koreksi salah input biaya listrik" oninput="jmSetField('keterangan', this.value)">
        </div>
        ${memorial && !f.id ? `<div class="fgroup">
            <label class="flabel">Contoh cepat (opsional)</label>
            <select class="fselect" onchange="jmPakaiTemplate(this.value); this.value='';">
                <option value="">– pilih contoh untuk mengisi akun otomatis –</option>
                ${Object.entries(JM_TEMPLATE).map(([k, t]) => `<option value="${k}">${esc(t.label)}</option>`).join('')}
            </select>
        </div>` : ''}

        <table style="width:100%;margin-top:6px;">
            <thead><tr>
                <th style="text-align:left;">Akun</th><th style="text-align:left;">Catatan baris</th>
                <th class="r" style="width:120px;">Debit</th><th class="r" style="width:120px;">Kredit</th><th style="width:30px;"></th>
            </tr></thead>
            <tbody id="jmBody"></tbody>
            <tfoot><tr style="font-weight:700;">
                <td colspan="2" style="padding:6px;">Total</td>
                <td class="r" id="jmTotD" style="padding:6px;">Rp 0</td>
                <td class="r" id="jmTotK" style="padding:6px;">Rp 0</td><td></td>
            </tr></tfoot>
        </table>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;gap:8px;flex-wrap:wrap;">
            <button class="btn btn-g btn-sm" onclick="jmTambahBaris()">+ Tambah Baris</button>
            <div id="jmStatus"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnSimpanJm" onclick="jmSimpan()">💾 Simpan Jurnal</button>
    </div>`);
    jmRenderBody();
}

function jmRenderBody() {
    const f = window._jm;
    document.getElementById('jmBody').innerHTML = f.lines.map((l, i) => `<tr>
        <td><select class="fselect" style="font-size:12px;min-width:200px;" onchange="jmSetLine(${i},'kode_akun',this.value)">${jmAkunOpts(l.kode_akun)}</select></td>
        <td><input class="finput" style="font-size:12px;" value="${esc(l.keterangan)}" oninput="jmSetLine(${i},'keterangan',this.value)"></td>
        <td><input class="finput r" type="number" min="0" step="1" id="jmD${i}" value="${l.debit === '' ? '' : l.debit}" oninput="jmSetLine(${i},'debit',this.value)"></td>
        <td><input class="finput r" type="number" min="0" step="1" id="jmK${i}" value="${l.kredit === '' ? '' : l.kredit}" oninput="jmSetLine(${i},'kredit',this.value)"></td>
        <td><button type="button" class="row-del" onclick="jmHapusBaris(${i})" title="Hapus baris">✕</button></td>
    </tr>`).join('');
    jmHitung();
}

function jmHitung() {
    const f = window._jm;
    const D = f.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const K = f.lines.reduce((s, l) => s + (Number(l.kredit) || 0), 0);
    const ok = D > 0 && Math.abs(D - K) < 0.5;
    document.getElementById('jmTotD').textContent = R(D);
    document.getElementById('jmTotK').textContent = R(K);
    document.getElementById('jmStatus').innerHTML = ok
        ? `<span class="badge badge-info">✓ Seimbang</span>`
        : `<span class="badge badge-warn">⚠ Selisih ${R(Math.abs(D - K))}</span>`;
}

window.jmSetField = (k, v) => { window._jm[k] = v; };
window.jmSetLine = (i, k, v) => {
    const l = window._jm.lines[i];
    l[k] = v;
    // Debit & Kredit saling menghapus dalam 1 baris
    if (k === 'debit' && Number(v) > 0) { l.kredit = ''; const e = document.getElementById('jmK' + i); if (e) e.value = ''; }
    if (k === 'kredit' && Number(v) > 0) { l.debit = ''; const e = document.getElementById('jmD' + i); if (e) e.value = ''; }
    jmHitung();
};
window.jmTambahBaris = () => { window._jm.lines.push(jmBlankLine()); jmRenderBody(); };
window.jmHapusBaris = (i) => {
    const f = window._jm;
    f.lines.splice(i, 1);
    while (f.lines.length < 2) f.lines.push(jmBlankLine());
    jmRenderBody();
};
window.jmPakaiTemplate = (key) => {
    const t = JM_TEMPLATE[key]; if (!t) return;
    const f = window._jm;
    f.kategori = t.kategori;
    if (!f.keterangan) f.keterangan = t.ket;
    f.lines = t.lines.map(([akun]) => ({ kode_akun: akun, debit: '', kredit: '', keterangan: '' }));
    jmRenderForm();
    toast('Akun terisi — isi nominal Debit/Kredit di baris yang sesuai', 'y');
};

window.jmSimpan = async () => {
    const f = window._jm;
    if (!f.cabang) { toast('Cabang wajib dipilih', 'err'); return; }
    if (!f.keterangan.trim()) { toast('Keterangan wajib diisi', 'err'); return; }
    const detail = f.lines
        .filter(l => (Number(l.debit) || 0) > 0 || (Number(l.kredit) || 0) > 0)
        .map(l => ({ kode_akun: l.kode_akun, debit: Number(l.debit) || 0, kredit: Number(l.kredit) || 0, keterangan: l.keterangan || null }));
    if (detail.some(l => !l.kode_akun)) { toast('Ada baris bernominal yang akunnya belum dipilih', 'err'); return; }
    const D = detail.reduce((s, l) => s + l.debit, 0), K = detail.reduce((s, l) => s + l.kredit, 0);
    if (detail.length < 2) { toast('Minimal 2 baris terisi', 'err'); return; }
    if (Math.abs(D - K) >= 0.5) { toast(`Jurnal belum seimbang (selisih ${R(Math.abs(D - K))})`, 'err'); return; }

    const body = { jenis: f.jenis, kategori: f.jenis === 'Memorial' ? (f.kategori || null) : null,
        tgl: f.tgl, cabang: f.cabang, keterangan: f.keterangan.trim(), detail };
    const btn = document.getElementById('btnSimpanJm');
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }
    try {
        const res = f.id ? await apiPut('/jurnal-manual/' + f.id, body) : await apiPost('/jurnal-manual', body);
        closeM();
        toast(`Jurnal ${res.no_jurnal} tersimpan`);
        await jmSegarkan();
    } catch (err) {
        toast(err.message, 'err');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Jurnal'; }
    }
};

/** Segarkan tab Jurnal Umum / Jurnal Memorial yang sedang terbuka */
async function jmSegarkan() {
    const umum = document.getElementById('jr-umum');
    const mem = document.getElementById('jr-memorial');
    if (umum && umum.style.display !== 'none') await renderJurnalUmum();
    if (mem && mem.style.display !== 'none') await renderJurnalMemorial();
}

/* ── Daftar Jurnal Manual & Memorial ─────────────────────── */
window._jmFilter = window._jmFilter || { jenis: '', search: '' };

async function renderJurnalMemorial() {
    const el = document.getElementById('jr-memorial');
    el.innerHTML = loadingHTML;
    try {
        const f = window._jmFilter;
        const res = await apiGet('/jurnal-manual' + buildQuery({ cabang: getCabang(), jenis: f.jenis, search: f.search }));
        const list = res.data || [];
        window._jmList = list;

        el.innerHTML = `
        <div class="note note-b">
            <span class="note-ico">📌</span>
            <span><strong>Jurnal Manual</strong> = jurnal yang Anda input sendiri (debit/kredit bebas).
            <strong>Jurnal Memorial</strong> = jurnal non-kas: penyesuaian, koreksi salah catat, jurnal pembalik, pelunasan hutang/piutang antar cabang.
            Semua otomatis masuk <em>Jurnal Umum, Buku Besar, Laba Rugi &amp; Neraca</em>. Total Debit wajib sama dengan Kredit.</span>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Jurnal Manual &amp; Memorial</h3>
                <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
                    <input class="finput" id="srchJM" style="width:220px;" placeholder="🔍 Cari no. jurnal / keterangan…" value="${esc(f.search)}"
                        oninput="smartSearch('srchJM', this.value, v => { window._jmFilter.search = v; }, () => renderJurnalMemorial())">
                    <select class="fselect" style="width:150px;" onchange="window._jmFilter.jenis=this.value; renderJurnalMemorial();">
                        <option value="">Semua jenis</option>
                        <option value="Umum" ${f.jenis === 'Umum' ? 'selected' : ''}>Jurnal Manual</option>
                        <option value="Memorial" ${f.jenis === 'Memorial' ? 'selected' : ''}>Jurnal Memorial</option>
                    </select>
                    <button class="btn btn-p btn-sm" onclick="bukaFormJurnalManual({jenis:'Umum'})">➕ Jurnal Manual</button>
                    <button class="btn btn-g btn-sm" onclick="bukaFormJurnalManual({jenis:'Memorial'})">📌 Jurnal Memorial</button>
                </div>
            </div>
            <div class="box-bd pad0">
                ${list.length ? list.map((h, i) => `
                <details class="jr-group">
                    <summary>
                        <span class="jr-group-arrow">▸</span>
                        <span class="jr-group-label"><span class="badge badge-noppn">${esc(h.no_jurnal)}</span>
                            <span style="font-weight:400;color:var(--ink2);">${esc(h.keterangan)}</span></span>
                        <span class="jr-group-meta">${fmtTgl(h.tgl)} · ${esc(h.cabang)}${h.kategori ? ' · ' + esc(h.kategori) : ''}</span>
                        <span class="jr-group-amt">${R(h.total)}</span>
                    </summary>
                    <table>
                        <thead><tr><th>Akun</th><th>Catatan</th><th class="r">Debit</th><th class="r">Kredit</th></tr></thead>
                        <tbody>${(h.detail || []).map(l => `<tr>
                            <td style="font-size:13px;"><span style="font-family:var(--F-m);color:var(--ink3);font-size:11px;">${esc(l.kode_akun)}</span> ${esc(l.nama_akun || '')}</td>
                            <td style="font-size:12px;color:var(--ink2);">${esc(l.keterangan || '')}</td>
                            <td class="r laba-pos">${Number(l.debit) ? R(l.debit) : ''}</td>
                            <td class="r laba-neg">${Number(l.kredit) ? R(l.kredit) : ''}</td>
                        </tr>`).join('')}</tbody>
                    </table>
                    <div style="padding:8px 16px;display:flex;gap:8px;justify-content:flex-end;">
                        <button class="btn btn-g btn-sm" onclick="jmEdit(${i})">✏️ Edit</button>
                        <button class="btn btn-g btn-sm" onclick="jmPembalik(${i})" title="Buat jurnal baru dengan debit/kredit ditukar">↩️ Buat Pembalik</button>
                        <button class="row-del" style="width:auto;padding:5px 12px;" onclick="jmHapus(${h.id}, '${esc(h.no_jurnal)}')">🗑️ Hapus</button>
                    </div>
                </details>`).join('')
                : '<div class="empty"><div class="ico">📌</div><strong>Belum ada jurnal manual / memorial.</strong><br>Klik "➕ Jurnal Manual" atau "📌 Jurnal Memorial" di atas.</div>'}
            </div>
        </div>`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

window.jmEdit = (i) => bukaFormJurnalManual({ data: window._jmList[i] });

window.jmPembalik = (i) => {
    const h = window._jmList[i];
    const balik = { ...h, detail: (h.detail || []).map(l => ({ ...l, debit: l.kredit, kredit: l.debit })) };
    bukaFormJurnalManual({
        data: balik, salin: true,
        override: { jenis: 'Memorial', kategori: 'Pembalik', tgl: today(), keterangan: 'Pembalik ' + h.no_jurnal + ' – ' + h.keterangan },
    });
};

window.jmHapus = async (id, no) => {
    const ya = await confirmDialog(`Hapus jurnal ${no}? Efeknya di Jurnal Umum, Buku Besar & laporan ikut hilang.`, { okText: 'Hapus', danger: true });
    if (!ya) return;
    try {
        await apiDel('/jurnal-manual/' + id);
        toast('Jurnal dihapus');
        await jmSegarkan();
    } catch (err) { toast(err.message, 'err'); }
};
