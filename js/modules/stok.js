/* =============================================================
   stok.js — Stok Barang, Barang Masuk, Barang Keluar, Opname
   ============================================================= */

/* ── STOK (SALDO) ─────────────────────────────────────────── */
window._stokSearch = '';
window._stokFilter = '';
window._stokSort   = 'nama';
// Filter periode (Dari – Sampai tanggal). Kosong semua = tampilan Saldo Stok biasa.
window._stokPer    = window._stokPer || { dari: '', sampai: '', hanyaGerak: true, hal: 1, res: null };

async function renderStok() {
    const el = document.getElementById('stok-saldo');
    if (window._stokPer.dari || window._stokPer.sampai) { await renderStokPeriode(el); return; }
    el.innerHTML = loadingHTML;
    try {
        const cab    = getCabang();
        const search = window._stokSearch;
        const minim  = window._stokFilter === 'minim' ? '&minim=1' : '';
        const sort   = window._stokSort && window._stokSort !== 'nama' ? `&sort=${window._stokSort}` : '';
        const [list, sum] = await Promise.all([
            apiGet(`/stok?${cab?'cabang='+encodeURIComponent(cab):''}${search?'&search='+encodeURIComponent(search):''}${minim}${sort}`),
            apiGet(`/stok/summary${cab?'?cabang='+encodeURIComponent(cab):''}`)
        ]);

        el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:16px;">
            <div class="kpi"><div class="kpi-label">Total Item</div><div class="kpi-val">${sum.total_item}</div></div>
            <div class="kpi"><div class="kpi-label">Nilai Stok</div><div class="kpi-val" style="font-size:16px;">${R(sum.nilai_stok)}</div></div>
            <div class="kpi red"><div class="kpi-label">Stok Rendah</div><div class="kpi-val neg">${sum.stok_rendah}</div></div>
            <div class="kpi red"><div class="kpi-label">Stok Kosong</div><div class="kpi-val neg">${sum.stok_kosong}</div></div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Saldo Stok Barang</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn btn-g btn-sm" onclick="exportExcel('tblStok','stok-barang')">📊 Export</button>
                </div>
            </div>
            <div class="box-bd">
                ${stokPeriodeBar()}
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px;">
                    <input class="finput" id="srchStokSaldo" placeholder="🔍 Cari kode atau nama barang…" value="${esc(search)}"
                        style="flex:1;min-width:200px;max-width:360px;"
                        oninput="smartSearch('srchStokSaldo', this.value, v => { window._stokSearch = v; }, renderStok)">
                    <select class="fselect" style="width:160px;" onchange="filterStok(this.value)">
                        <option value="">Semua Stok</option>
                        <option value="minim" ${window._stokFilter==='minim'?'selected':''}>⚠️ Stok Rendah Saja</option>
                    </select>
                    <select class="fselect" style="width:190px;" onchange="sortStok(this.value)" title="Urutkan Kartu Stok">
                        <option value="nama" ${window._stokSort==='nama'?'selected':''}>↕️ Urutkan: Nama (A-Z)</option>
                        <option value="qty_asc" ${window._stokSort==='qty_asc'?'selected':''}>↕️ Urutkan: Qty Paling Sedikit</option>
                        <option value="qty_desc" ${window._stokSort==='qty_desc'?'selected':''}>↕️ Urutkan: Qty Paling Banyak</option>
                        <option value="nilai_desc" ${window._stokSort==='nilai_desc'?'selected':''}>↕️ Urutkan: Nilai Stok Tertinggi</option>
                        <option value="nilai_asc" ${window._stokSort==='nilai_asc'?'selected':''}>↕️ Urutkan: Nilai Stok Terendah</option>
                    </select>
                    ${search||window._stokFilter||window._stokSort!=='nama' ? `<button class="btn btn-g btn-sm" onclick="resetStok()">✕ Reset</button>` : ''}
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblStok">
                    <thead><tr>
                        <th>Kode</th><th>Nama Barang</th><th>Kategori</th>
                        <th class="r">Stok</th><th>Satuan</th>
                        <th class="r">Stok Min</th><th class="r">Nilai Stok</th><th>Status</th>
                    </tr></thead>
                    <tbody>${list.map(s => {
                        const rendah  = s.stok_min > 0 && s.qty <= s.stok_min;
                        const kosong  = s.qty <= 0;
                        return `<tr class="${kosong?'row-danger':rendah?'row-warn':''}">
                            <td style="font-family:var(--F-m);font-size:11px;">${esc(s.kode_barang)}</td>
                            <td><strong>${esc(s.nama)}</strong></td>
                            <td style="font-size:11px;color:var(--ink3);">${esc(s.kategori||'–')}</td>
                            <td class="r"><strong style="font-size:15px;color:${kosong?'var(--neg)':rendah?'var(--warn)':'inherit'}">${fmtQty(s.qty)}</strong></td>
                            <td style="font-size:12px;">${esc(s.satuan1||'PCS')}</td>
                            <td class="r" style="font-size:12px;color:var(--ink3);">${s.stok_min>0?fmtQty(s.stok_min):'–'}</td>
                            <td class="r" style="font-size:12px;">${R(s.nilai_stok||0)}</td>
                            <td>${kosong
                                ? '<span class="badge badge-out">Kosong</span>'
                                : rendah
                                    ? '<span class="badge badge-warn">Rendah</span>'
                                    : '<span class="badge badge-in">Normal</span>'
                            }</td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>`
                : `<div class="empty"><div class="ico">📊</div><strong>${search?'Tidak ada hasil pencarian.':'Belum ada data stok. Tambahkan Barang Masuk terlebih dahulu.'}</strong></div>`}
            </div>
        </div>`;
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.renderStok = renderStok;

window.filterStok = val => { window._stokFilter = val; renderStok(); };
window.sortStok   = val => { window._stokSort = val || 'nama'; renderStok(); };
window.resetStok  = ()  => { window._stokSearch = ''; window._stokFilter = ''; window._stokSort = 'nama'; renderStok(); };
function fmtQty(n) { return Number(n) % 1 === 0 ? parseInt(n).toLocaleString('id') : Number(n).toFixed(2).replace('.',','); }

/* ── FILTER PERIODE: stok Dari Tanggal – Sampai Tanggal ───────────────────
   Per barang: Stok Awal, Masuk, Keluar, Stok Akhir selama periode.
   Klik 1 baris barang → rincian pergerakannya (tiap nota) di periode itu.
   Endpoint: GET /api/stok/periode
   ============================================================= */
function stokPeriodeBar() {
    const f = window._stokPer;
    const aktif = f.dari || f.sampai;
    return `
    <div style="display:flex;gap:8px;align-items:flex-end;flex-wrap:wrap;margin-bottom:12px;padding:10px 12px;border:1px dashed var(--line,#ddd);border-radius:10px;${aktif ? 'background:rgba(46,125,90,.06);' : ''}">
        <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
            <span style="font-size:12px;color:var(--ink3);">📅 Periode:</span>
            <button class="btn btn-sm btn-g" onclick="stokPerPreset('hari')">Hari ini</button>
            <button class="btn btn-sm btn-g" onclick="stokPerPreset('7')">7 hari</button>
            <button class="btn btn-sm btn-g" onclick="stokPerPreset('bulan')">Bulan ini</button>
            <button class="btn btn-sm btn-g" onclick="stokPerPreset('lalu')">Bulan lalu</button>
        </div>
        <div class="fgroup" style="margin:0;">
            <label class="flabel">Dari Tanggal</label>
            <input class="finput" type="date" id="stokPerDari" value="${esc(f.dari)}" onchange="stokPerSet('dari', this.value)">
        </div>
        <div class="fgroup" style="margin:0;">
            <label class="flabel">Sampai Tanggal</label>
            <input class="finput" type="date" id="stokPerSampai" value="${esc(f.sampai)}" onchange="stokPerSet('sampai', this.value)">
        </div>
        <label style="font-size:12px;color:var(--ink3);display:flex;align-items:center;gap:6px;padding-bottom:8px;">
            <input type="checkbox" ${f.hanyaGerak ? 'checked' : ''} onchange="stokPerSet('hanyaGerak', this.checked)"> Hanya yang ada pergerakan
        </label>
        ${aktif ? `<button class="btn btn-g btn-sm" style="margin-bottom:2px;" onclick="stokPerReset()">✕ Hapus Filter Tanggal</button>` : ''}
    </div>`;
}

function _stokTglISO(d) {
    const z = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}`;
}
window.stokPerPreset = (p) => {
    const f = window._stokPer, now = new Date();
    if (p === 'hari')       { f.dari = f.sampai = _stokTglISO(now); }
    else if (p === '7')     { const d = new Date(now); d.setDate(d.getDate() - 6); f.dari = _stokTglISO(d); f.sampai = _stokTglISO(now); }
    else if (p === 'bulan') { f.dari = _stokTglISO(new Date(now.getFullYear(), now.getMonth(), 1)); f.sampai = _stokTglISO(now); }
    else if (p === 'lalu')  { f.dari = _stokTglISO(new Date(now.getFullYear(), now.getMonth() - 1, 1)); f.sampai = _stokTglISO(new Date(now.getFullYear(), now.getMonth(), 0)); }
    f.hal = 1; renderStok();
};
window.stokPerSet = (k, v) => { window._stokPer[k] = v; window._stokPer.hal = 1; renderStok(); };
window.stokPerReset = () => { Object.assign(window._stokPer, { dari: '', sampai: '', hal: 1, res: null }); renderStok(); };
window.stokPerHal = (h) => { window._stokPer.hal = h; tampilStokPeriode(); };

const STOK_PER_HAL = 200;

async function renderStokPeriode(el) {
    el.innerHTML = loadingHTML;
    const f = window._stokPer;
    try {
        const cab = getCabang();
        f.res = await apiGet('/stok/periode' + buildQuery({
            dari: f.dari, sampai: f.sampai, cabang: cab, search: window._stokSearch || '',
            hanya_bergerak: f.hanyaGerak ? 1 : 0,
        }));
        tampilStokPeriode(el);
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
        // tetap tampilkan bar supaya user bisa memperbaiki tanggalnya
        el.innerHTML += `<div class="box"><div class="box-bd">${stokPeriodeBar()}</div></div>`;
    }
}

function tampilStokPeriode(elArg) {
    const el = elArg || document.getElementById('stok-saldo');
    const f = window._stokPer, res = f.res;
    if (!res) return;
    const search = window._stokSearch || '';
    const sort = window._stokSort || 'nama';

    let rows = res.data.slice();
    const byNama = (a, b) => String(a.nama).localeCompare(String(b.nama));
    if (sort === 'qty_asc')          rows.sort((a, b) => a.akhir - b.akhir || byNama(a, b));
    else if (sort === 'qty_desc')    rows.sort((a, b) => b.akhir - a.akhir || byNama(a, b));
    else if (sort === 'masuk_desc')  rows.sort((a, b) => b.masuk - a.masuk || byNama(a, b));
    else if (sort === 'keluar_desc') rows.sort((a, b) => b.keluar - a.keluar || byNama(a, b));
    else rows.sort(byNama);

    const jmlHal = Math.max(1, Math.ceil(rows.length / STOK_PER_HAL));
    if (f.hal > jmlHal) f.hal = jmlHal;
    const mulai  = (f.hal - 1) * STOK_PER_HAL;
    const tampil = rows.slice(mulai, mulai + STOK_PER_HAL);
    const s = res.summary;
    const sortOpt = (v, t) => `<option value="${v}" ${sort === v ? 'selected' : ''}>↕️ Urutkan: ${t}</option>`;

    el.innerHTML = `
    <div class="kpi-grid" style="margin-bottom:16px;">
        <div class="kpi"><div class="kpi-label">Barang Ditampilkan</div><div class="kpi-val">${s.total_barang.toLocaleString('id-ID')}</div></div>
        <div class="kpi"><div class="kpi-label">Total Masuk</div><div class="kpi-val">${fmtQty(s.total_masuk)}</div></div>
        <div class="kpi red"><div class="kpi-label">Total Keluar</div><div class="kpi-val neg">${fmtQty(s.total_keluar)}</div></div>
        <div class="kpi"><div class="kpi-label">Stok Akhir (total qty)</div><div class="kpi-val">${fmtQty(s.total_akhir)}</div></div>
    </div>
    <div class="box">
        <div class="box-hd">
            <h3>Stok ${res.dari === '2000-01-01' ? 'Awal Data' : fmtTgl(res.dari)} s.d. ${fmtTgl(res.sampai)}${res.cabang ? ' · ' + esc(res.cabang) : ' · Semua Cabang'}</h3>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
                <button class="btn btn-g btn-sm" onclick="exportStokPeriode()">📊 Export Excel (semua baris)</button>
            </div>
        </div>
        <div class="box-bd">
            ${stokPeriodeBar()}
            <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:4px;">
                <input class="finput" id="srchStokSaldo" placeholder="🔍 Cari kode atau nama barang…" value="${esc(search)}"
                    style="flex:1;min-width:200px;max-width:360px;"
                    oninput="smartSearch('srchStokSaldo', this.value, v => { window._stokSearch = v; }, renderStok)">
                <select class="fselect" style="width:210px;" onchange="sortStok(this.value)">
                    ${sortOpt('nama', 'Nama (A-Z)')}
                    ${sortOpt('masuk_desc', 'Masuk Terbanyak')}
                    ${sortOpt('keluar_desc', 'Keluar Terbanyak')}
                    ${sortOpt('qty_asc', 'Stok Akhir Terendah')}
                    ${sortOpt('qty_desc', 'Stok Akhir Tertinggi')}
                </select>
                ${search ? `<button class="btn btn-g btn-sm" onclick="window._stokSearch='';renderStok()">✕ Hapus Pencarian</button>` : ''}
            </div>
            <div style="font-size:11px;color:var(--ink3);margin-top:6px;">Stok Awal = stok akhir hari sebelum "Dari Tanggal". Klik baris barang untuk melihat rincian nota masuk/keluarnya.</div>
        </div>
        <div class="box-bd pad0 tscroll">
            ${rows.length ? `
            <table id="tblStokPeriode">
                <thead><tr>
                    <th>Kode</th><th>Nama Barang</th><th>Kategori</th><th>Satuan</th>
                    <th class="r">Stok Awal</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Stok Akhir</th><th class="r">Nilai Akhir</th>
                </tr></thead>
                <tbody>${tampil.map(r => `<tr style="cursor:pointer;" onclick="lihatRincianStokPeriode('${esc(r.kode)}')" title="Klik untuk lihat rincian pergerakan">
                    <td style="font-family:var(--F-m);font-size:11px;">${esc(r.kode)}</td>
                    <td><strong>${esc(r.nama)}</strong></td>
                    <td style="font-size:11px;color:var(--ink3);">${esc(r.kategori || '–')}</td>
                    <td style="font-size:12px;">${esc(r.satuan || 'PCS')}</td>
                    <td class="r ${r.awal < 0 ? 'laba-neg' : ''}">${fmtQty(r.awal)}</td>
                    <td class="r laba-pos">${r.masuk ? '+' + fmtQty(r.masuk) : '–'}</td>
                    <td class="r laba-neg">${r.keluar ? '−' + fmtQty(r.keluar) : '–'}</td>
                    <td class="r ${r.akhir < 0 ? 'laba-neg' : ''}"><strong>${fmtQty(r.akhir)}</strong></td>
                    <td class="r" style="font-size:12px;">${r.nilai_akhir ? R(r.nilai_akhir) : '–'}</td>
                </tr>`).join('')}</tbody>
            </table>
            <div style="display:flex;gap:10px;align-items:center;justify-content:center;padding:12px;">
                <button class="btn btn-g btn-sm" ${f.hal <= 1 ? 'disabled' : ''} onclick="stokPerHal(${f.hal - 1})">‹ Sebelumnya</button>
                <span class="meta">Halaman ${f.hal} / ${jmlHal} · baris ${mulai + 1}–${mulai + tampil.length} dari ${rows.length.toLocaleString('id-ID')}</span>
                <button class="btn btn-g btn-sm" ${f.hal >= jmlHal ? 'disabled' : ''} onclick="stokPerHal(${f.hal + 1})">Berikutnya ›</button>
            </div>`
            : `<div class="empty"><div class="ico">📭</div><strong>${search ? 'Tidak ada barang yang cocok dengan pencarian.' : 'Tidak ada pergerakan stok di periode ini.'}</strong></div>`}
        </div>
    </div>`;
}

/** Rincian nota masuk/keluar 1 barang selama periode terpilih (dari Kartu Stok). */
window.lihatRincianStokPeriode = async (kode) => {
    const f = window._stokPer, res = f.res;
    openM(`<div class="mhd"><h3>📋 Rincian Stok — ${esc(kode)}</h3><button class="mclose" onclick="closeM()">×</button></div>
        <div class="mbd">${loadingHTML}</div>
        <div class="mft"><button class="btn btn-g" onclick="closeM()">Tutup</button></div>`);
    try {
        const k = await apiGet('/stok/kartu' + buildQuery({ kode_barang: kode, cabang: getCabang(), tanggal: res.sampai }));
        const dari = res.dari;
        const riw = (k.riwayat || []).filter(r => r.tgl >= dari).reverse(); // urut lama → baru
        const masuk  = riw.reduce((t, r) => t + (r.delta > 0 ? r.delta : 0), 0);
        const keluar = riw.reduce((t, r) => t + (r.delta < 0 ? -r.delta : 0), 0);
        document.querySelector('#mbox .mbd').innerHTML = `
            <div style="margin-bottom:10px;"><strong>${esc(k.nama_barang)}</strong>
                <span style="color:var(--ink3);font-size:12px;">(${esc(k.satuan)}) · ${fmtTgl(dari)} s.d. ${fmtTgl(res.sampai)}${k.cabang ? ' · ' + esc(k.cabang) : ' · Semua Cabang'}</span></div>
            <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;font-size:13px;">
                <div>Masuk: <strong class="laba-pos">${fmtQtyRaw(masuk)}</strong></div>
                <div>Keluar: <strong class="laba-neg">${fmtQtyRaw(keluar)}</strong></div>
                <div>Stok per ${fmtTgl(res.sampai)}: <strong>${fmtQtyRaw(k.saldo_per_tanggal)}</strong></div>
            </div>
            <div class="tscroll" style="max-height:380px;">
            ${riw.length ? `<table style="width:100%;">
                <thead><tr><th>Tanggal</th><th>Sumber</th><th>Cabang</th><th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo</th><th>Keterangan</th></tr></thead>
                <tbody>${riw.map(r => `<tr>
                    <td style="font-size:12px;">${fmtTgl(r.tgl)}</td>
                    <td style="font-size:12px;"><span class="badge badge-noppn">${esc(r.ref)}</span> ${esc(r.sumber)}</td>
                    <td style="font-size:12px;">${esc(r.cabang)}</td>
                    <td class="r laba-pos">${r.delta > 0 ? fmtQtyRaw(r.delta) : ''}</td>
                    <td class="r laba-neg">${r.delta < 0 ? fmtQtyRaw(-r.delta) : ''}</td>
                    <td class="r" style="font-weight:600;">${fmtQtyRaw(r.saldo_setelah)}</td>
                    <td style="font-size:12px;color:var(--ink2);">${esc(r.ket)}</td>
                </tr>`).join('')}</tbody>
            </table>` : '<div class="empty"><div class="ico">📭</div><strong>Tidak ada pergerakan di periode ini.</strong></div>'}
            </div>`;
    } catch (err) {
        document.querySelector('#mbox .mbd').innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

window.exportStokPeriode = () => {
    const res = window._stokPer.res;
    if (!res || !res.data.length) { toast('Belum ada data untuk diexport', 'err'); return; }
    const aoa = [['Kode', 'Nama Barang', 'Kategori', 'Satuan', 'Stok Awal', 'Masuk', 'Keluar', 'Stok Akhir', 'Nilai Akhir (Rp)']];
    res.data.forEach(r => aoa.push([r.kode, r.nama, r.kategori || '', r.satuan, r.awal, r.masuk, r.keluar, r.akhir, r.nilai_akhir]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 14 }, { wch: 9 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 11 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stok Periode');
    XLSX.writeFile(wb, `stok-periode-${res.dari}_sd_${res.sampai}${res.cabang ? '-' + res.cabang : ''}.xlsx`);
};

/* ── BARANG MASUK ─────────────────────────────────────────── */
window._bmBulan = today().slice(0,7);

async function renderBarangMasuk() {
    const el = document.getElementById('stok-masuk');
    el.innerHTML = loadingHTML;
    try {
        const cab  = getCabang();
        const search = window._bmSearch || '';
        const list = await apiGet(`/stok/masuk?bulan=${window._bmBulan}${cab?'&cabang='+encodeURIComponent(cab):''}${search?'&search='+encodeURIComponent(search):''}`);
        const totalQty = list.reduce((s,r) => s+(+r.qty), 0);
        const totalVal = list.reduce((s,r) => s+(+r.qty * +r.harga_beli), 0);

        el.innerHTML = `
        <div class="box">
            <div class="box-hd"><h3>📥 Catat Barang Masuk</h3></div>
            <div class="box-bd">
                <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
                    <span>Setiap barang masuk otomatis <strong>menambah saldo stok</strong>. Hapus data = stok dikurangi kembali.</span>
                </div>
                <form id="fBM">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">No. Dokumen</label>
                            <input class="finput" id="bmDoc" placeholder="PO-001 / faktur / opsional"></div>
                        <div class="fgroup"><label class="flabel">Tanggal *</label>
                            <input class="finput" type="date" id="bmTgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang *</label>
                            <select class="fselect" id="bmCab" required>${cabangOpts(cab)}</select></div>
                        <div class="fgroup"><label class="flabel">Barang *</label>
                            <input class="finput" id="bmKode" list="dl_bm" required placeholder="Ketik kode/nama…"
                                oninput="autoSatuanBM(this.value)">
                            ${barangDatalist('dl_bm')}</div>
                        <div class="fgroup"><label class="flabel">Qty *</label>
                            <input class="finput" type="number" id="bmQty" min="0.01" step="0.01" required placeholder="0"></div>
                        <div class="fgroup"><label class="flabel">Satuan</label>
                            <select class="fselect" id="bmSat"><option value="">PCS</option></select>
                            <span class="fhint" id="bmSatHint"></span></div>
                        <div class="fgroup"><label class="flabel">Harga per Satuan di Atas (Rp)</label>
                            <input class="finput" type="number" id="bmHarga" min="0" placeholder="0"></div>
                        <div class="fgroup"><label class="flabel">Supplier</label>
                            <input class="finput" id="bmSup" list="dlSupBM" placeholder="Opsional — pilih dari Master Supplier">
                            <datalist id="dlSupBM">${(STATE.supplier||[]).map(s=>`<option value="${esc(s.nama)}">`).join('')}</datalist>
                            <span class="fhint">Kalau diisi, harus sesuai nama di Data Master &gt; Supplier</span></div>
                        <div class="fgroup"><label class="flabel">Keterangan</label>
                            <input class="finput" id="bmKet" placeholder="Opsional"></div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Barang Masuk</button>
                </form>
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Barang Masuk</h3>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input class="finput" id="srchBM" placeholder="🔍 Cari kode, nama, atau no. dokumen…" value="${esc(search)}"
                        style="width:220px;"
                        oninput="smartSearch('srchBM', this.value, v => { window._bmSearch = v; }, renderBarangMasuk)">
                    <input class="finput" type="month" id="bmBulan" value="${window._bmBulan}"
                        onchange="window._bmBulan=this.value;renderBarangMasuk()" style="width:150px;">
                    <button class="btn btn-g btn-sm" onclick="exportExcel('tblBM','barang-masuk')">📊 Export</button>
                </div>
            </div>
            <div class="box-bd">
                <div style="display:flex;gap:16px;font-size:13px;color:var(--ink3);margin-bottom:8px;">
                    <span>Total qty masuk: <strong>${fmtQty(totalQty)}</strong></span>
                    <span>Total nilai: <strong>${R(totalVal)}</strong></span>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblBM">
                    <thead><tr><th>Tgl</th><th>No. Dok</th><th>Barang</th><th>Cabang</th><th class="r">Qty</th><th class="r">Harga Beli</th><th>Supplier</th><th></th></tr></thead>
                    <tbody>${list.map(r=>`<tr>
                        <td>${fmtTgl(r.tgl)}</td>
                        <td style="font-size:11px;font-family:var(--F-m);cursor:pointer;" onclick="bukaBentukanRef('BM-${r.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(r.no_dok||('BM-'+r.id))}</td>
                        <td><strong class="link-barang" onclick="lihatKartuHpp('${esc(r.kode_barang)}')" title="Klik untuk lihat riwayat masuk/keluar & HPP rata-rata barang ini">${esc(r.nama_barang)}</strong><div style="font-size:10px;color:var(--ink3);">${esc(r.kode_barang)}</div></td>
                        <td style="font-size:12px;">${esc(r.cabang)}</td>
                        <td class="r">${r.qty_asal ? `${Number(r.qty_asal).toLocaleString('id-ID')} ${esc(r.satuan||'')}<br><span style="font-size:10px;color:var(--ink3);">= ${fmtQty(r.qty)} ${esc(r.satuan1||'PCS')}</span>` : `<strong style="color:var(--pos);">+${fmtQty(r.qty)}</strong> ${esc(r.satuan1||'PCS')}`}</td>
                        <td class="r">${r.harga_beli>0?R(r.harga_beli):'–'}${r.harga_asal ? `<br><span style="font-size:10px;color:var(--ink3);">${R(r.harga_asal)}/${esc(r.satuan||'')}</span>` : ''}</td>
                        <td style="font-size:12px;">${esc(r.supplier||'–')}</td>
                        <td><button class="row-del" onclick="hapusBM(${r.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : `<div class="empty"><div class="ico">📥</div><strong>Belum ada barang masuk bulan ini.</strong></div>`}
            </div>
        </div>`;

        // Isi pilihan satuan (PCS/DUS dst) sesuai barang, sama seperti form Penjualan/Pembelian/Retur
        const bmSat = document.getElementById('bmSat');
        const bmSatHint = document.getElementById('bmSatHint');
        const updateSatuanBM = (b) => {
            const opts = [{ val: b?.satuan1 || 'PCS', label: b?.satuan1 || 'PCS', isi: 1 }];
            if (b?.satuan2 && b.isi > 1) opts.push({ val: b.satuan2, label: `${b.satuan2} (isi ${b.isi} ${b.satuan1 || 'PCS'})`, isi: Number(b.isi) });
            bmSat.innerHTML = opts.map(o => `<option value="${esc(o.val)}" data-isi="${o.isi}">${esc(o.label)}</option>`).join('');
            bmSatHint.textContent = opts.length > 1 ? 'Pilih satuan sesuai dokumen — dikonversi otomatis ke satuan dasar.' : '';
        };
        bmSat.onchange = () => {
            const opt = bmSat.selectedOptions[0];
            const isi = Number(opt?.dataset.isi || 1);
            bmSatHint.textContent = isi > 1 ? `1 ${opt.value} = ${isi} ${getBarang(document.getElementById('bmKode').value.trim())?.satuan1 || 'PCS'} — harga di atas dianggap harga per ${opt.value}.` : '';
        };
        updateSatuanBM(getBarang(document.getElementById('bmKode').value.trim()));

        document.getElementById('fBM').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/stok/masuk', {
                    no_dok    : document.getElementById('bmDoc').value.trim()||null,
                    tgl       : document.getElementById('bmTgl').value,
                    cabang    : document.getElementById('bmCab').value,
                    kode_barang: document.getElementById('bmKode').value.trim(),
                    satuan    : bmSat.value || null,
                    qty       : Number(document.getElementById('bmQty').value),
                    harga_beli: Number(document.getElementById('bmHarga').value)||0,
                    supplier  : document.getElementById('bmSup').value.trim()||null,
                    keterangan: document.getElementById('bmKet').value.trim()||null,
                });
                toast('Barang masuk disimpan, stok diperbarui');
                await renderBarangMasuk();
            } catch(err) { toast(err.message,'err'); }
        };
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.renderBarangMasuk = renderBarangMasuk;

window.autoSatuanBM = kode => {
    const b = STATE.barang?.find(x => x.kode === kode.trim());
    const sel = document.getElementById('bmSat');
    const hint = document.getElementById('bmSatHint');
    if (!sel) return;
    const opts = [{ val: b?.satuan1 || 'PCS', label: b?.satuan1 || 'PCS', isi: 1 }];
    if (b?.satuan2 && b.isi > 1) opts.push({ val: b.satuan2, label: `${b.satuan2} (isi ${b.isi} ${b.satuan1 || 'PCS'})`, isi: Number(b.isi) });
    sel.innerHTML = opts.map(o => `<option value="${esc(o.val)}" data-isi="${o.isi}">${esc(o.label)}</option>`).join('');
    if (hint) hint.textContent = opts.length > 1 ? 'Pilih satuan sesuai dokumen — dikonversi otomatis ke satuan dasar.' : '';
};
window.hapusBM = async id => {
    if (!(await confirmDialog('Hapus data ini? Stok akan dikurangi kembali.'))) return;
    try {
        await apiDel('/stok/masuk/'+id);
        toast('Dihapus, stok disesuaikan','y');
        await renderBarangMasuk();
    } catch(err) { toast(err.message,'err'); }
};

/* ── BARANG KELUAR ────────────────────────────────────────── */
window._bkBulan = today().slice(0,7);

async function renderBarangKeluar() {
    const el = document.getElementById('stok-keluar');
    el.innerHTML = loadingHTML;
    try {
        const cab  = getCabang();
        const search = window._bkSearch || '';
        const list = await apiGet(`/stok/keluar?bulan=${window._bkBulan}${cab?'&cabang='+encodeURIComponent(cab):''}${search?'&search='+encodeURIComponent(search):''}`);
        const totalQty = list.reduce((s,r) => s+(+r.qty), 0);
        const jenisOpts = ['Penjualan','Retur Beli','Rusak','Sample','Lainnya'];

        el.innerHTML = `
        <div class="box">
            <div class="box-hd"><h3>📤 Catat Barang Keluar</h3></div>
            <div class="box-bd">
                <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
                    <span>Setiap barang keluar otomatis <strong>mengurangi saldo stok</strong>. Sistem akan mencegah pengeluaran melebihi stok tersedia.</span>
                </div>
                <form id="fBK">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">No. Dokumen</label>
                            <input class="finput" id="bkDoc" placeholder="INV-001 / opsional"></div>
                        <div class="fgroup"><label class="flabel">Tanggal *</label>
                            <input class="finput" type="date" id="bkTgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang *</label>
                            <select class="fselect" id="bkCab" required>${cabangOpts(cab)}</select></div>
                        <div class="fgroup"><label class="flabel">Barang *</label>
                            <input class="finput" id="bkKode" list="dl_bk" required placeholder="Ketik kode/nama…"
                                oninput="cekStokBK(this.value)">
                            ${barangDatalist('dl_bk')}</div>
                        <div class="fgroup"><label class="flabel">Qty *</label>
                            <input class="finput" type="number" id="bkQty" min="0.01" step="0.01" required placeholder="0"></div>
                        <div class="fgroup"><label class="flabel">Satuan</label>
                            <select class="fselect" id="bkSat"><option value="">PCS</option></select>
                            <span class="fhint" id="bkSatHint"></span></div>
                        <div class="fgroup"><label class="flabel">Harga per Satuan di Atas (Rp)</label>
                            <input class="finput" type="number" id="bkHarga" min="0" placeholder="0"></div>
                        <div class="fgroup"><label class="flabel">Jenis Keluar</label>
                            <select class="fselect" id="bkJenis">
                                ${jenisOpts.map(j=>`<option>${j}</option>`).join('')}
                            </select></div>
                        <div class="fgroup"><label class="flabel">Keterangan</label>
                            <input class="finput" id="bkKet" placeholder="Opsional"></div>
                    </div>
                    <div id="bkStokInfo" style="font-size:12px;color:var(--ink3);margin-bottom:8px;"></div>
                    <button class="btn btn-p" type="submit">+ Simpan Barang Keluar</button>
                </form>
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Barang Keluar</h3>
                <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                    <input class="finput" id="srchBK" placeholder="🔍 Cari kode atau nama barang…" value="${esc(search)}"
                        style="width:220px;"
                        oninput="smartSearch('srchBK', this.value, v => { window._bkSearch = v; }, renderBarangKeluar)">
                    <input class="finput" type="month" id="bkBulan" value="${window._bkBulan}"
                        onchange="window._bkBulan=this.value;renderBarangKeluar()" style="width:150px;">
                    <button class="btn btn-g btn-sm" onclick="exportExcel('tblBK','barang-keluar')">📊 Export</button>
                </div>
            </div>
            <div class="box-bd">
                <div style="font-size:13px;color:var(--ink3);margin-bottom:8px;">
                    Total qty keluar bulan ini: <strong>${fmtQty(totalQty)}</strong>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblBK">
                    <thead><tr><th>Tgl</th><th>No. Dok</th><th>Barang</th><th>Cabang</th><th>Jenis</th><th class="r">Qty</th><th class="r">Harga Jual</th><th></th></tr></thead>
                    <tbody>${list.map(r=>`<tr>
                        <td>${fmtTgl(r.tgl)}</td>
                        <td style="font-size:11px;font-family:var(--F-m);cursor:pointer;" onclick="bukaBentukanRef('BK-${r.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(r.no_dok||('BK-'+r.id))}</td>
                        <td><strong class="link-barang" onclick="lihatKartuHpp('${esc(r.kode_barang)}')" title="Klik untuk lihat riwayat masuk/keluar & HPP rata-rata barang ini">${esc(r.nama_barang)}</strong><div style="font-size:10px;color:var(--ink3);">${esc(r.kode_barang)}</div></td>
                        <td style="font-size:12px;">${esc(r.cabang)}</td>
                        <td><span class="badge ${r.jenis==='Penjualan'?'badge-in':r.jenis==='Rusak'?'badge-out':'badge-info'}">${r.jenis}</span></td>
                        <td class="r">${r.qty_asal ? `${Number(r.qty_asal).toLocaleString('id-ID')} ${esc(r.satuan||'')}<br><span style="font-size:10px;color:var(--ink3);">= ${fmtQty(r.qty)} ${esc(r.satuan1||'PCS')}</span>` : `<strong style="color:var(--neg);">-${fmtQty(r.qty)}</strong> ${esc(r.satuan1||'PCS')}`}</td>
                        <td class="r">${r.harga_jual>0?R(r.harga_jual):'–'}${r.harga_asal ? `<br><span style="font-size:10px;color:var(--ink3);">${R(r.harga_asal)}/${esc(r.satuan||'')}</span>` : ''}</td>
                        <td><button class="row-del" onclick="hapusBK(${r.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : `<div class="empty"><div class="ico">📤</div><strong>Belum ada barang keluar bulan ini.</strong></div>`}
            </div>
        </div>`;

        const bkSat = document.getElementById('bkSat');
        const bkSatHint = document.getElementById('bkSatHint');
        bkSat.onchange = () => {
            const opt = bkSat.selectedOptions[0];
            const isi = Number(opt?.dataset.isi || 1);
            bkSatHint.textContent = isi > 1 ? `1 ${opt.value} = ${isi} ${getBarang(document.getElementById('bkKode').value.trim())?.satuan1 || 'PCS'} — harga di atas dianggap harga per ${opt.value}.` : '';
        };

        document.getElementById('fBK').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/stok/keluar', {
                    no_dok     : document.getElementById('bkDoc').value.trim()||null,
                    tgl        : document.getElementById('bkTgl').value,
                    cabang     : document.getElementById('bkCab').value,
                    kode_barang: document.getElementById('bkKode').value.trim(),
                    satuan     : bkSat.value || null,
                    qty        : Number(document.getElementById('bkQty').value),
                    harga_jual : Number(document.getElementById('bkHarga').value)||0,
                    jenis      : document.getElementById('bkJenis').value,
                    keterangan : document.getElementById('bkKet').value.trim()||null,
                });
                toast('Barang keluar disimpan, stok diperbarui');
                await renderBarangKeluar();
            } catch(err) { toast(err.message,'err'); }
        };
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.renderBarangKeluar = renderBarangKeluar;

window.cekStokBK = async kode => {
    const info = document.getElementById('bkStokInfo');
    const sel = document.getElementById('bkSat');
    const hint = document.getElementById('bkSatHint');
    if (!info) return;
    const cab = document.getElementById('bkCab')?.value;
    const b = getBarang(kode.trim());
    if (sel && b) {
        const opts = [{ val: b.satuan1 || 'PCS', label: b.satuan1 || 'PCS', isi: 1 }];
        if (b.satuan2 && b.isi > 1) opts.push({ val: b.satuan2, label: `${b.satuan2} (isi ${b.isi} ${b.satuan1 || 'PCS'})`, isi: Number(b.isi) });
        sel.innerHTML = opts.map(o => `<option value="${esc(o.val)}" data-isi="${o.isi}">${esc(o.label)}</option>`).join('');
        if (hint) hint.textContent = opts.length > 1 ? 'Pilih satuan sesuai dokumen — dikonversi otomatis ke satuan dasar.' : '';
    }
    if (!kode || !cab) return;
    try {
        const list = await apiGet(`/stok?cabang=${encodeURIComponent(cab)}&search=${encodeURIComponent(kode)}`);
        const s = list.find(x => x.kode_barang === kode.trim());
        if (s) {
            const warna = s.qty <= 0 ? 'var(--neg)' : s.qty <= s.stok_min ? 'var(--warn)' : 'var(--pos)';
            info.innerHTML = `Stok tersedia di ${esc(cab)}: <strong style="color:${warna};">${fmtQty(s.qty)} ${esc(s.satuan1||'PCS')}</strong>`;
        } else {
            info.innerHTML = `<span style="color:var(--neg);">⚠️ Barang tidak ditemukan di stok ${esc(cab)}</span>`;
        }
    } catch(e) {}
};
window.hapusBK = async id => {
    if (!(await confirmDialog('Hapus data ini? Stok akan dikembalikan.'))) return;
    try {
        await apiDel('/stok/keluar/'+id);
        toast('Dihapus, stok dikembalikan','y');
        await renderBarangKeluar();
    } catch(err) { toast(err.message,'err'); }
};

/* ── STOK OPNAME ──────────────────────────────────────────── */
window._soAktif = null; // id opname yang sedang diedit detailnya

async function renderOpname() {
    const el = document.getElementById('stok-opname');
    if (window._soAktif) { await renderOpnameDetail(el, window._soAktif); return; }
    el.innerHTML = loadingHTML;
    try {
        const cab  = getCabang();
        const list = await apiGet(`/stok/opname${cab?'?cabang='+encodeURIComponent(cab):''}`);

        const rp = n => (n<0?'-':'') + 'Rp ' + Math.abs(Math.round(n||0)).toLocaleString('id-ID');
        el.innerHTML = `
        <div class="note note-b"><span class="note-ico">ℹ️</span>
            <span>Stok Opname dilakukan <strong>per barang</strong> pada <strong>tanggal yang Anda pilih</strong>. Qty sistem dihitung sesuai tanggal tsb, lalu selisih fisik langsung menyesuaikan stok dan <strong>membentuk jurnal otomatis</strong> (Persediaan ↔ Penyesuaian Stok).</span>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Stok Opname Barang</h3></div>
            <div class="box-bd">
                <form id="fSO">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Tanggal Opname *</label>
                            <input class="finput" type="date" id="soTgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang *</label>
                            <select class="fselect" id="soCab" required>${cabangOpts(cab)}</select></div>
                        <div class="fgroup"><label class="flabel">Barang *</label>
                            <input class="finput" id="soBarang" list="dl_so" placeholder="Ketik kode atau nama barang…" autocomplete="off" required>
                            ${barangDatalist('dl_so')}</div>
                        <div class="fgroup"><label class="flabel">Stok Sistem (per tanggal)</label>
                            <input class="finput" id="soSistem" value="–" readonly></div>
                        <div class="fgroup"><label class="flabel">Stok Fisik *</label>
                            <input class="finput" type="number" id="soFisik" min="0" step="0.01" required></div>
                        <div class="fgroup"><label class="flabel">Selisih</label>
                            <input class="finput" id="soSelisih" value="–" readonly></div>
                        <div class="fgroup" id="soHargaWrap" style="display:none;"><label class="flabel">HPP / Harga per Satuan (Rp) — untuk qty tambahan</label>
                            <input class="finput" type="number" id="soHarga" min="0" step="any" placeholder="Kosong = ikut HPP rata-rata · 0 = HPP Rp 0 · angka = HPP manual"></div>
                        <div class="fgroup"><label class="flabel">Keterangan</label>
                            <input class="finput" id="soKet" placeholder="Opsional"></div>
                    </div>
                    <div id="soInfo" style="font-size:12px;margin:4px 0 10px;color:var(--ink3);"></div>
                    <button class="btn btn-p" type="submit">✅ Simpan Opname & Buat Jurnal</button>
                </form>
            </div>
        </div>
        <div class="box" id="soMinusBox" style="display:none;">
            <div class="box-hd"><h3>⚠️ Barang Stok Minus</h3><div class="meta" id="soMinusMeta"></div></div>
            <div class="box-bd pad0 tscroll" id="soMinusList"></div>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Daftar Stok Opname</h3><div class="meta">${list.length} opname</div></div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table>
                    <thead><tr><th>No. SO</th><th>Tanggal</th><th>Cabang</th><th>Barang</th><th class="r">Sistem</th><th class="r">Fisik</th><th class="r">Selisih</th><th class="r">Nilai Jurnal</th><th>Status</th><th>Keterangan</th><th></th></tr></thead>
                    <tbody>${list.map(so=>{
                        const satu = so.detail_count === 1 && so.nama_barang;
                        return `<tr>
                        <td style="font-family:var(--F-m);font-size:12px;">${esc(so.no_so)}</td>
                        <td>${fmtTgl(so.tgl)}</td>
                        <td>${esc(so.cabang)}</td>
                        <td>${satu ? `<strong>${esc(so.nama_barang)}</strong><div style="font-size:10px;color:var(--ink3);">${esc(so.kode_barang)}</div>` : `${so.detail_count||0} item`}</td>
                        <td class="r">${satu ? fmtQty(so.qty_sistem) : '–'}</td>
                        <td class="r">${satu ? fmtQty(so.qty_fisik) : '–'}</td>
                        <td class="r">${satu ? `<span class="${so.selisih>0?'pos':so.selisih<0?'neg':''}">${so.selisih>0?'+':''}${fmtQty(so.selisih)}</span>` : '–'}</td>
                        <td class="r">${satu && so.status==='Selesai' ? (so.nilai ? `<span class="${so.nilai>0?'pos':'neg'}">${rp(so.nilai)}</span>` : '<span title="Belum ada HPP dari pembelian, jurnal bernilai 0">Rp 0</span>') : '–'}</td>
                        <td><span class="badge ${so.status==='Selesai'?'badge-in':'badge-warn'}">${so.status}</span></td>
                        <td style="font-size:12px;">${esc(so.keterangan||'–')}</td>
                        <td style="display:flex;gap:4px;">
                            ${satu ? '' : `<button class="btn btn-g btn-sm" onclick="bukaOpnameDetail(${so.id})">${so.status==='Draft'?'✏️ Input Fisik':'👁 Lihat'}</button>`}
                            <button class="row-del" title="Hapus opname (stok & jurnal dikembalikan)" onclick="hapusOpname(${so.id}, '${so.status}')">✕</button>
                        </td>
                    </tr>`;}).join('')}</tbody>
                </table>`
                : `<div class="empty"><div class="ico">🔍</div><strong>Belum ada stok opname.</strong></div>`}
            </div>
        </div>`;

        // Kode dari input datalist ("KODE – Nama" atau kode/nama saja)
        const kodeDipilih = () => {
            const v = document.getElementById('soBarang').value.trim();
            const kode = (v.split(' – ')[0] || v).trim();
            const b = (STATE.barang||[]).find(x => x.kode === kode || x.nama === v);
            return b ? b.kode : null;
        };
        let soSistemVal = null;
        const hitungSelisih = () => {
            const f = parseFloat(document.getElementById('soFisik').value);
            const out = document.getElementById('soSelisih');
            const wrap = document.getElementById('soHargaWrap'), info = document.getElementById('soInfo');
            if (soSistemVal === null || isNaN(f)) { out.value = '–'; wrap.style.display = 'none'; info.textContent = ''; return; }
            const d = Math.round((f - soSistemVal) * 100) / 100;
            out.value = (d>0?'+':'') + fmtQty(d);
            wrap.style.display = d > 0 ? '' : 'none';
            let t = '';
            if (soSistemVal < 0) t += '⚠️ Stok sistem pada tanggal ini MINUS. ';
            if (d > 0) t += 'Qty tambahan akan dijurnal sebagai selisih opname (bukan pembelian). Isi HPP bila ingin dijadikan HPP penjualan berikutnya.';
            else if (d < 0) t += 'Stok berkurang: dijurnal sebagai kerugian/penyesuaian stok sebesar HPP rata-rata (bisa Rp 0 bila belum ada HPP).';
            info.textContent = t;
        };
        const muatSistem = async () => {
            const kode = kodeDipilih(), tgl = document.getElementById('soTgl').value, cabang = document.getElementById('soCab').value;
            const out = document.getElementById('soSistem');
            soSistemVal = null;
            if (!kode || !tgl || !cabang) { out.value = '–'; hitungSelisih(); return; }
            try {
                const r = await apiGet('/stok/opname/sistem' + buildQuery({ kode_barang: kode, cabang, tanggal: tgl }));
                soSistemVal = Number(r.qty_sistem) || 0;
                out.value = fmtQty(soSistemVal);
            } catch(err) { out.value = '–'; }
            hitungSelisih();
        };
        ['soTgl','soCab'].forEach(i => document.getElementById(i).addEventListener('change', muatSistem));
        document.getElementById('soBarang').addEventListener('change', muatSistem);
        document.getElementById('soFisik').addEventListener('input', hitungSelisih);

        // Daftar barang minus (klik untuk mengisi form)
        const muatMinus = async () => {
            try {
                const cabang = document.getElementById('soCab').value;
                const m = await apiGet('/stok/opname/minus' + buildQuery({ cabang }));
                const box = document.getElementById('soMinusBox');
                if (!m.length) { box.style.display = 'none'; return; }
                box.style.display = '';
                document.getElementById('soMinusMeta').textContent = m.length + ' barang minus' + (cabang ? ' · ' + cabang : '');
                document.getElementById('soMinusList').innerHTML = `<table><thead><tr><th>Kode</th><th>Barang</th><th>Cabang</th><th class="r">Stok</th><th></th></tr></thead><tbody>${m.map(x=>`<tr>
                    <td style="font-family:var(--F-m);font-size:11px;">${esc(x.kode)}</td><td>${esc(x.nama)}</td><td>${esc(x.cabang)}</td>
                    <td class="r"><span class="neg">${fmtQty(x.qty)}</span></td>
                    <td><button type="button" class="btn btn-g btn-sm" data-kode="${esc(x.kode)}" data-cab="${esc(x.cabang)}">Opname</button></td></tr>`).join('')}</tbody></table>`;
                document.querySelectorAll('#soMinusList button').forEach(b => b.onclick = () => {
                    document.getElementById('soCab').value = b.dataset.cab;
                    document.getElementById('soBarang').value = b.dataset.kode;
                    muatSistem(); window.scrollTo({ top: 0, behavior: 'smooth' });
                    document.getElementById('soFisik').focus();
                });
            } catch(e) {}
        };
        document.getElementById('soCab').addEventListener('change', muatMinus);
        muatMinus();

        document.getElementById('fSO').onsubmit = async e => {
            e.preventDefault();
            const kode = kodeDipilih();
            if (!kode) { toast('Barang tidak ditemukan — pilih dari daftar saran','err'); return; }
            try {
                const res = await apiPost('/stok/opname/barang', {
                    tgl        : document.getElementById('soTgl').value,
                    cabang     : document.getElementById('soCab').value,
                    kode_barang: kode,
                    qty_fisik  : parseFloat(document.getElementById('soFisik').value),
                    harga      : document.getElementById('soHarga').value === '' ? null : parseFloat(document.getElementById('soHarga').value),
                    keterangan : document.getElementById('soKet').value.trim()||null,
                });
                toast(`Opname ${res.no_so} tersimpan. Selisih ${res.selisih>0?'+':''}${fmtQty(res.selisih)}` +
                      (res.jurnal ? ` · jurnal opname ${rp(Math.abs(res.nilai))} terbentuk` : ' · tidak ada selisih, tanpa jurnal'));
                await renderOpname();
            } catch(err) { toast(err.message,'err'); }
        };
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.renderOpname = renderOpname;

window.bukaOpnameDetail = id => { window._soAktif = id; renderOpname(); };
window.hapusOpname = async (id, status) => {
    if (!(await confirmDialog(status==='Selesai' ? 'Hapus opname ini? Stok dikembalikan ke posisi sebelum opname dan jurnalnya ikut terhapus.' : 'Hapus draft opname ini?'))) return;
    try {
        await apiDel('/stok/opname/'+id);
        toast('Opname dihapus','y');
        await renderOpname();
    } catch(err) { toast(err.message,'err'); }
};

async function renderOpnameDetail(el, id) {
    el.innerHTML = loadingHTML;
    try {
        const { opname, detail } = await apiGet(`/stok/opname/${id}/detail`);
        const selesai = opname.status === 'Selesai';
        const selisihPos = detail.filter(d => d.selisih > 0).length;
        const selisihNeg = detail.filter(d => d.selisih < 0).length;

        el.innerHTML = `
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:16px;">
            <button class="btn btn-g btn-sm" onclick="window._soAktif=null;renderOpname()">← Kembali</button>
            <h3 style="margin:0;">Stok Opname: ${esc(opname.no_so)}</h3>
            <span class="badge ${selesai?'badge-in':'badge-warn'}">${opname.status}</span>
        </div>
        <div class="kpi-grid" style="margin-bottom:16px;">
            <div class="kpi"><div class="kpi-label">Total Item</div><div class="kpi-val">${detail.length}</div></div>
            <div class="kpi"><div class="kpi-label">Selisih +</div><div class="kpi-val pos">${selisihPos}</div></div>
            <div class="kpi red"><div class="kpi-label">Selisih −</div><div class="kpi-val neg">${selisihNeg}</div></div>
            <div class="kpi"><div class="kpi-label">Cabang</div><div class="kpi-val" style="font-size:14px;">${esc(opname.cabang)}</div></div>
        </div>
        ${!selesai ? `
        <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
            <span>Isi kolom <strong>Qty Fisik</strong> sesuai hasil hitung fisik. Klik <strong>Simpan & Selesaikan</strong> untuk menyesuaikan stok sistem.</span>
        </div>` : ''}
        <div class="box">
            <div class="box-hd">
                <h3>Detail Opname</h3>
                <div style="display:flex;gap:8px;">
                    ${!selesai ? `<button class="btn btn-p" onclick="simpanOpname(${id})">✅ Simpan & Selesaikan Opname</button>` : ''}
                    <button class="btn btn-g btn-sm" onclick="exportExcel('tblSODetail','opname-${opname.no_so}')">📊 Export</button>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                <table id="tblSODetail">
                    <thead><tr>
                        <th>Kode</th><th>Nama Barang</th><th>Kategori</th><th>Satuan</th>
                        <th class="r">Stok Sistem</th>
                        <th class="r">${selesai?'Stok Fisik':'Stok Fisik (Edit)'}</th>
                        <th class="r">Selisih</th>
                    </tr></thead>
                    <tbody>${detail.map(d => {
                        const sel = selesai ? d.selisih : 0; // selisih dihitung live saat edit
                        return `<tr class="${d.selisih<0?'row-danger':d.selisih>0?'row-ok':''}">
                            <td style="font-size:11px;font-family:var(--F-m);">${esc(d.kode_barang)}</td>
                            <td>${esc(d.nama)}</td>
                            <td style="font-size:11px;">${esc(d.kategori||'–')}</td>
                            <td style="font-size:12px;">${esc(d.satuan1||'PCS')}</td>
                            <td class="r">${fmtQty(d.qty_sistem)}</td>
                            <td class="r">${selesai
                                ? `<strong>${fmtQty(d.qty_fisik)}</strong>`
                                : `<input type="number" class="finput so-fisik" data-id="${d.id}" data-sistem="${d.qty_sistem}"
                                    value="${fmtQtyRaw(d.qty_fisik)}" min="0" step="0.01"
                                    oninput="updateSelisihRow(this)"
                                    style="width:90px;text-align:right;padding:4px 6px;">`
                            }</td>
                            <td class="r" id="sel-${d.id}"><span class="${d.selisih>0?'pos':d.selisih<0?'neg':''}">${d.selisih>0?'+':''}${fmtQty(d.selisih)}</span></td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
        </div>`;
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}

window.updateSelisihRow = inp => {
    const sistem  = parseFloat(inp.dataset.sistem) || 0;
    const fisik   = parseFloat(inp.value) || 0;
    const selisih = fisik - sistem;
    const cell    = document.getElementById('sel-' + inp.dataset.id);
    if (cell) {
        cell.innerHTML = `<span class="${selisih>0?'pos':selisih<0?'neg':''}">${selisih>0?'+':''}${fmtQty(selisih)}</span>`;
    }
};

window.simpanOpname = async id => {
    const inputs = document.querySelectorAll('.so-fisik');
    const items  = Array.from(inputs).map(inp => ({
        id       : parseInt(inp.dataset.id),
        qty_fisik: parseFloat(inp.value) || 0,
    }));
    if (!items.length) { toast('Tidak ada item untuk disimpan','err'); return; }
    if (!(await confirmDialog(`Selesaikan opname? Stok sistem akan disesuaikan ke qty fisik untuk ${items.length} item.`, { okText: 'Selesaikan', danger: false }))) return;
    try {
        await apiPost(`/stok/opname/${id}/detail`, { items });
        await apiPost(`/stok/opname/${id}/selesai`, {});
        toast('Stok opname selesai! Stok sistem telah disesuaikan.');
        window._soAktif = null;
        await renderOpname();
    } catch(err) { toast(err.message,'err'); }
};

function fmtQtyRaw(n) { return Number(n) % 1 === 0 ? parseInt(n) : Number(n).toFixed(2); }

/* ── KARTU STOK (STOK PER TANGGAL, PER ITEM) ─────────────────
   Cari 1 barang → pilih tanggal (& opsional cabang) → lihat
   saldo stok barang itu PADA TANGGAL TERSEBUT, lengkap dengan
   riwayat pergerakan kronologis (Pembelian, Penjualan, Retur,
   Mutasi, Barang Masuk/Keluar, Opname) & saldo berjalan.
   ============================================================= */
window._kartuStok = window._kartuStok || { kode: '', cabang: '', tanggal: today() };

async function renderKartuStok() {
    const el = document.getElementById('stok-kartu');
    const f  = window._kartuStok;

    const formHTML = `
    <div class="box">
        <div class="box-hd"><h3>📅 Kartu Stok — Cek Stok Per Tanggal</h3></div>
        <div class="box-bd">
            <div class="fgrid">
                <div class="fgroup" style="grid-column:span 2;">
                    <label class="flabel">🔍 Cari Barang (kode atau nama)</label>
                    <input class="finput" id="ksKode" list="dl_kartustok" value="${esc(f.kode)}" placeholder="Ketik kode atau nama barang…">
                    ${barangDatalist('dl_kartustok')}
                </div>
                <div class="fgroup">
                    <label class="flabel">Cabang</label>
                    <select class="fselect" id="ksCabang">
                        <option value="">Semua Cabang</option>
                        ${cabangOpts(f.cabang)}
                    </select>
                </div>
                <div class="fgroup">
                    <label class="flabel">Tanggal</label>
                    <input class="finput" type="date" id="ksTanggal" value="${f.tanggal}">
                </div>
            </div>
            <button class="btn btn-p" onclick="cariKartuStok()">Tampilkan Kartu Stok</button>
        </div>
    </div>
    <div id="ksHasil"></div>`;

    el.innerHTML = formHTML;

    if (f.kode) await muatKartuStok();
}

window.cariKartuStok = async () => {
    const kodeInput = document.getElementById('ksKode').value.trim();
    // Input datalist bisa berisi "KODE – Nama Barang" atau cuma kode — ambil kodenya saja
    const kode = (kodeInput.split(' – ')[0] || kodeInput).trim();
    const barang = STATE.barang.find(b => b.kode === kode || b.nama === kodeInput);
    if (!barang) { toast('Barang tidak ditemukan — pilih dari daftar saran', 'err'); return; }

    window._kartuStok = {
        kode: barang.kode,
        cabang: document.getElementById('ksCabang').value,
        tanggal: document.getElementById('ksTanggal').value || today(),
    };
    await muatKartuStok();
};

async function muatKartuStok() {
    const hasil = document.getElementById('ksHasil');
    if (!hasil) return;
    hasil.innerHTML = loadingHTML;
    const f = window._kartuStok;
    try {
        const res = await apiGet('/stok/kartu' + buildQuery({ kode_barang: f.kode, cabang: f.cabang, tanggal: f.tanggal }));

        hasil.innerHTML = `
        <div class="box" style="margin-top:14px;">
            <div class="box-bd" style="display:flex;gap:24px;flex-wrap:wrap;align-items:center;">
                <div>
                    <div class="meta">${esc(res.nama_barang)} (${esc(res.kode_barang)})${res.cabang ? ' · ' + esc(res.cabang) : ' · Semua Cabang'}</div>
                    <div style="font-family:var(--F-m);font-size:26px;font-weight:700;margin-top:4px;">
                        ${fmtQtyRaw(res.saldo_per_tanggal)} <span style="font-size:14px;font-weight:400;color:var(--ink3);">${esc(res.satuan)}</span>
                    </div>
                    <div style="font-size:12px;color:var(--ink3);">Saldo stok per ${fmtTgl(res.tanggal)}</div>
                </div>
                <div>
                    <div class="meta">Nilai Stok (Rp) per ${fmtTgl(res.tanggal)}</div>
                    <div style="font-family:var(--F-m);font-size:20px;font-weight:700;margin-top:4px;color:var(--pos);">
                        ${R(res.nilai_per_tanggal)}
                    </div>
                    <div style="font-size:12px;color:var(--ink3);">HPP rata-rata: ${res.saldo_per_tanggal ? R(res.nilai_per_tanggal / res.saldo_per_tanggal) : R(0)} / ${esc(res.satuan)}</div>
                </div>
                <div style="margin-left:auto;text-align:right;">
                    <div class="meta">Saldo Real-time Sekarang</div>
                    <div style="font-family:var(--F-m);font-size:18px;font-weight:600;">${fmtQtyRaw(res.saldo_sekarang)} ${esc(res.satuan)}</div>
                    <div style="font-size:12px;color:var(--ink3);margin-top:2px;">Nilai: ${R(res.nilai_sekarang)}</div>
                </div>
            </div>
        </div>

        <div class="box" style="margin-top:14px;">
            <div class="box-hd">
                <h3>Riwayat Pergerakan s.d. ${fmtTgl(res.tanggal)}</h3>
                <div style="display:flex;gap:8px;">
                    <div class="meta">${res.riwayat.length} pergerakan</div>
                    <button class="btn btn-g btn-sm" onclick="exportExcel('tblKartuStok','kartu-stok-${esc(res.kode_barang)}')">📊 Export</button>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${res.riwayat.length ? `
                <table id="tblKartuStok">
                    <thead><tr>
                        <th>Tanggal</th><th>Sumber</th><th>Cabang</th>
                        <th class="r">Masuk</th><th class="r">Keluar</th>
                        <th class="r">Saldo Setelah</th>
                        <th class="r">HPP/Satuan</th><th class="r">Nilai (Rp)</th><th class="r">Total Stok (Rp)</th>
                        <th>Keterangan</th>
                    </tr></thead>
                    <tbody>
                        <tr style="background:var(--bg2,#f7f7f9);">
                            <td colspan="5" style="font-size:12px;font-style:italic;">Saldo awal (sebelum riwayat tercatat)</td>
                            <td class="r" style="font-weight:600;">${fmtQtyRaw(res.saldo_awal)}</td>
                            <td></td><td></td>
                            <td class="r" style="font-weight:600;">${R(res.nilai_awal)}</td>
                            <td></td>
                        </tr>
                        ${res.riwayat.map(r => `<tr>
                            <td style="font-size:12px;">${fmtTgl(r.tgl)}</td>
                            <td style="font-size:12px;"><span class="badge badge-noppn" style="cursor:pointer;" onclick="bukaBentukanRef('${esc(r.ref)}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(r.ref)}</span> ${esc(r.sumber)}</td>
                            <td style="font-size:12px;">${esc(r.cabang)}</td>
                            <td class="r laba-pos">${r.delta > 0 ? fmtQtyRaw(r.delta) : ''}</td>
                            <td class="r laba-neg">${r.delta < 0 ? fmtQtyRaw(Math.abs(r.delta)) : ''}</td>
                            <td class="r" style="font-weight:600;">${fmtQtyRaw(r.saldo_setelah)}</td>
                            <td class="r" style="font-size:12px;color:var(--ink3);">${r.hpp_satuan!=null ? R(r.hpp_satuan) : '–'}</td>
                            <td class="r ${r.nilai>0?'laba-pos':r.nilai<0?'laba-neg':''}" style="font-size:12px;">${r.nilai ? R(Math.abs(r.nilai)) : '–'}</td>
                            <td class="r" style="font-weight:600;">${R(r.saldo_nilai)}</td>
                            <td style="font-size:12px;color:var(--ink2);">${esc(r.ket)}</td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr style="font-weight:700;border-top:2px solid var(--brd);background:rgba(26,92,56,.05);">
                            <td colspan="8" style="padding:8px 6px;">Total Nilai Stok per ${fmtTgl(res.tanggal)}</td>
                            <td class="r" style="padding:8px 6px;">${R(res.nilai_per_tanggal)}</td>
                            <td></td>
                        </tr>
                    </tfoot>
                </table>`
                : '<div class="empty"><div class="ico">📭</div><strong>Belum ada pergerakan tercatat</strong> sampai tanggal ini.</div>'}
            </div>
        </div>`;
    } catch (err) {
        hasil.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}


/* ── STOK SEMUA BARANG PER TANGGAL ───────────────────────────
   Satu tabel berisi SEMUA barang + stoknya pada tanggal yang
   dipilih (per cabang & total) + nilai stok (HPP dari pembelian).
   Endpoint: GET /api/stok/per-tanggal
   ============================================================= */
window._stokPT = window._stokPT || { tanggal: today(), cabang: '', cari: '', sembunyiNol: false, hal: 1, res: null };
const STOK_PT_PER_HAL = 100;

async function renderStokPerTanggal() {
    const el = document.getElementById('stok-pertanggal');
    const f  = window._stokPT;
    el.innerHTML = `
    <div class="box">
        <div class="box-hd"><h3>🗓️ Stok Semua Barang — Per Tanggal</h3></div>
        <div class="box-bd">
            <div class="fgrid">
                <div class="fgroup">
                    <label class="flabel">Tanggal</label>
                    <input class="finput" type="date" id="sptTanggal" value="${esc(f.tanggal)}">
                </div>
                <div class="fgroup">
                    <label class="flabel">Cabang</label>
                    <select class="fselect" id="sptCabang">
                        <option value="">Semua Cabang</option>
                        ${cabangOpts(f.cabang)}
                    </select>
                </div>
                <div class="fgroup" style="grid-column:span 2;">
                    <label class="flabel">🔍 Cari (kode atau nama)</label>
                    <input class="finput" id="sptCari" value="${esc(f.cari)}" placeholder="Kosongkan = semua barang" onkeydown="if(event.key==='Enter')muatStokPerTanggal()">
                </div>
            </div>
            <label style="display:inline-flex;gap:6px;align-items:center;margin-right:14px;font-size:13px;">
                <input type="checkbox" id="sptNol" ${f.sembunyiNol ? 'checked' : ''}> Sembunyikan barang stok 0
            </label>
            <button class="btn btn-p" onclick="muatStokPerTanggal()">Tampilkan Stok</button>
        </div>
    </div>
    <div id="sptHasil"></div>`;
    if (f.res) tampilStokPerTanggal(); else await muatStokPerTanggal();
}

window.muatStokPerTanggal = async () => {
    const hasil = document.getElementById('sptHasil');
    if (!hasil) return;
    const f = window._stokPT;
    f.tanggal     = document.getElementById('sptTanggal').value || today();
    f.cabang      = document.getElementById('sptCabang').value;
    f.cari        = document.getElementById('sptCari').value.trim();
    f.sembunyiNol = document.getElementById('sptNol').checked;
    f.hal = 1;
    hasil.innerHTML = loadingHTML;
    try {
        f.res = await apiGet('/stok/per-tanggal' + buildQuery({
            tanggal: f.tanggal, cabang: f.cabang, search: f.cari, sembunyi_nol: f.sembunyiNol ? 1 : 0,
        }));
        tampilStokPerTanggal();
    } catch (err) {
        hasil.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};

window.halStokPerTanggal = (h) => { window._stokPT.hal = h; tampilStokPerTanggal(); };

function tampilStokPerTanggal() {
    const hasil = document.getElementById('sptHasil');
    const f = window._stokPT, res = f.res;
    if (!hasil || !res) return;

    const rows   = res.data || [];
    const cabs   = res.cabang ? [] : (res.cabang_list || []);   // kolom per cabang hanya saat "Semua Cabang"
    const jmlHal = Math.max(1, Math.ceil(rows.length / STOK_PT_PER_HAL));
    if (f.hal > jmlHal) f.hal = jmlHal;
    const mulai  = (f.hal - 1) * STOK_PT_PER_HAL;
    const tampil = rows.slice(mulai, mulai + STOK_PT_PER_HAL);
    const s = res.summary;

    hasil.innerHTML = `
    <div class="box" style="margin-top:14px;">
        <div class="box-bd" style="display:flex;gap:28px;flex-wrap:wrap;align-items:center;">
            <div><div class="meta">Stok per ${fmtTgl(res.tanggal)}${res.cabang ? ' · ' + esc(res.cabang) : ' · Semua Cabang'}</div>
                 <div style="font-family:var(--F-m);font-size:22px;font-weight:700;">${fmtQtyRaw(s.total_qty)} <span style="font-size:12px;font-weight:400;color:var(--ink3);">total qty</span></div></div>
            <div><div class="meta">Nilai Stok (HPP pembelian)</div>
                 <div style="font-family:var(--F-m);font-size:22px;font-weight:700;color:var(--pos);">${R(s.total_nilai)}</div></div>
            <div><div class="meta">Barang</div>
                 <div style="font-size:14px;font-weight:600;">${s.total_barang.toLocaleString('id-ID')} ditampilkan · ${s.barang_ada_stok.toLocaleString('id-ID')} ada stok${s.barang_minus ? ` · <span class="laba-neg">${s.barang_minus} minus</span>` : ''}</div></div>
            <div style="margin-left:auto;"><button class="btn btn-g btn-sm" onclick="exportStokPerTanggal()">📊 Export Excel (semua baris)</button></div>
        </div>
    </div>
    <div class="box" style="margin-top:14px;">
        <div class="box-hd"><h3>Daftar Stok</h3>
            <div class="meta">Baris ${rows.length ? mulai + 1 : 0}–${mulai + tampil.length} dari ${rows.length.toLocaleString('id-ID')}</div></div>
        <div class="box-bd pad0 tscroll">
            ${rows.length ? `
            <table id="tblStokPerTanggal">
                <thead><tr>
                    <th>Kode</th><th>Nama Barang</th><th>Satuan</th>
                    ${cabs.map(c => `<th class="r">${esc(c)}</th>`).join('')}
                    <th class="r">Total Stok</th><th class="r">HPP/Satuan</th><th class="r">Nilai (Rp)</th>
                </tr></thead>
                <tbody>
                    ${tampil.map(r => `<tr>
                        <td style="font-size:12px;">${esc(r.kode)}</td>
                        <td>${esc(r.nama)}</td>
                        <td style="font-size:12px;">${esc(r.satuan)}</td>
                        ${cabs.map(c => { const v = r.per_cabang[c]; return `<td class="r ${v < 0 ? 'laba-neg' : ''}">${v ? fmtQtyRaw(v) : '–'}</td>`; }).join('')}
                        <td class="r ${r.qty < 0 ? 'laba-neg' : ''}" style="font-weight:700;">${fmtQtyRaw(r.qty)}</td>
                        <td class="r" style="font-size:12px;color:var(--ink3);">${r.hpp ? R(r.hpp) : '–'}</td>
                        <td class="r">${r.nilai ? R(r.nilai) : '–'}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
            <div style="display:flex;gap:10px;align-items:center;justify-content:center;padding:12px;">
                <button class="btn btn-g btn-sm" ${f.hal <= 1 ? 'disabled' : ''} onclick="halStokPerTanggal(${f.hal - 1})">‹ Sebelumnya</button>
                <span class="meta">Halaman ${f.hal} / ${jmlHal}</span>
                <button class="btn btn-g btn-sm" ${f.hal >= jmlHal ? 'disabled' : ''} onclick="halStokPerTanggal(${f.hal + 1})">Berikutnya ›</button>
            </div>`
            : '<div class="empty"><div class="ico">📭</div><strong>Tidak ada barang</strong> yang cocok.</div>'}
        </div>
    </div>`;
}

window.exportStokPerTanggal = () => {
    const res = window._stokPT.res;
    if (!res || !res.data.length) { toast('Belum ada data untuk diexport', 'err'); return; }
    const cabs = res.cabang ? [] : (res.cabang_list || []);
    const aoa = [['Kode', 'Nama Barang', 'Satuan', ...cabs, 'Total Stok', 'HPP/Satuan', 'Nilai (Rp)']];
    res.data.forEach(r => aoa.push([r.kode, r.nama, r.satuan, ...cabs.map(c => r.per_cabang[c] || 0), r.qty, r.hpp, r.nilai]));
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 16 }, { wch: 40 }, { wch: 9 }, ...cabs.map(() => ({ wch: 10 })), { wch: 12 }, { wch: 13 }, { wch: 15 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Stok');
    XLSX.writeFile(wb, `stok-semua-barang-${res.tanggal}${res.cabang ? '-' + res.cabang : ''}.xlsx`);
};
