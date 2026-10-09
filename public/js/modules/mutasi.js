/* =============================================================
   mutasi.js — Mutasi Barang Antar Cabang (PAKET multi-barang)
   ─────────────────────────────────────────────────────────
   Beda dari sub-modul Transaksi lain: 1 kode mutasi bisa berisi
   BANYAK barang sekaligus (seperti 1 nota Kasir POS), dan punya
   alur 2 sisi:
     1. Cabang asal input paket → status "Dikirim", stok asal
        langsung berkurang, kode mutasi bisa dicetak (struk/faktur).
     2. Cabang tujuan mengecek fisik barang yang datang, lalu
        "Konfirmasi Penerimaan" dengan qty yang benar-benar
        diterima per barang → stok tujuan bertambah, dan kalau ada
        beda dengan qty yang dikirim, otomatis tercatat sebagai
        selisih (kurang/lebih) yang bisa ditindaklanjuti terpisah.
   Endpoint: /api/mutasi-kirim/*  (MutasiKirimController)
   Dipanggil dari nav.js: case 'tx-mutasi' → renderMutasi()
   ============================================================= */

window._mutasiState = window._mutasiState || {
    view    : 'list',                 // 'list' | 'form'
    filter  : { status: '', arah: '', search: '', dari: '', sampai: '', page: 1 },
    cart    : [],                     // {kode, nama, satuan, qty, keterangan, qtyInput?, satuanInput?}
    editingNoRef: null,               // no_ref yang sedang diedit, null = mutasi baru
    formHeader  : null,               // prefill saat edit: {tgl,dari_cabang,ke_cabang,dikirim_oleh,keterangan}
    addPick     : null,               // barang yang sedang dipilih di panel "tambah barang" (form)
};

/* ── FORMAT KECIL KHUSUS MODUL INI (berdiri sendiri, tak bergantung urutan load pos.js) ── */
function mtTglPanjang(d) {
    if (!d) return '-';
    const dt = new Date(d);
    const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${String(dt.getDate()).padStart(2,'0')} ${bln[dt.getMonth()]} ${dt.getFullYear()}`;
}
function mtNum(n) { return Number(n || 0).toLocaleString('id-ID', { maximumFractionDigits: 2 }); }

/** Metadata tampilan per status paket mutasi */
function mtStatusMeta(status) {
    switch (status) {
        case 'Dikirim':                return { badge: 'badge-warn',    banner: 'warn',    icon: '🕐', label: 'Menunggu Konfirmasi' };
        case 'Selesai':                 return { badge: 'badge-in',      banner: 'ok',      icon: '✅', label: 'Selesai' };
        case 'Selesai (Ada Selisih)':   return { badge: 'badge-selisih', banner: 'selisih', icon: '⚠️', label: 'Selesai (Ada Selisih)' };
        case 'Dibatalkan':              return { badge: 'badge-void',    banner: 'void',    icon: '🚫', label: 'Dibatalkan' };
        default:                        return { badge: 'badge-info',    banner: 'warn',    icon: 'ℹ️', label: status || '-' };
    }
}

/**
 * Export SEMUA data Riwayat Mutasi ke Excel (bukan cuma yang tampil di
 * halaman aktif) — mengikuti filter cabang/status/arah/tanggal yang lagi aktif.
 */
async function exportMutasiSemua() {
    const S   = window._mutasiState;
    const cab = getCabang();
    const btn = event?.currentTarget;
    const btnTextAsal = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyiapkan...'; }
    try {
        const q = buildQuery({
            cabang : cab || undefined,
            arah   : S.filter.arah || undefined,
            status : S.filter.status || undefined,
            search : S.filter.search || undefined,
            dari   : S.filter.dari || undefined,
            sampai : S.filter.sampai || undefined,
            page: 1, per_page: 0,
        });
        const res  = await apiGet('/mutasi-kirim' + q);
        const list = res.data || [];
        if (!list.length) { toast('Tidak ada data untuk diexport pada filter saat ini', 'y'); return; }

        const rows = list.map(m => ({
            'No. Mutasi': m.no_ref,
            'Tanggal'   : m.tgl,
            'Dari Cabang': m.dari_cabang,
            'Ke Cabang'  : m.ke_cabang,
            'Jumlah Item': m.jumlah_item,
            'Total Qty'  : m.total_qty,
            'Status'     : m.status,
            'Keterangan' : m.keterangan || '',
        }));
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);
        ws['!cols'] = Object.keys(rows[0]).map(h => {
            let maxW = h.length;
            for (const r of rows) { const len = String(r[h] ?? '').length; if (len > maxW) maxW = len; }
            return { wch: Math.min(maxW + 2, 40) };
        });
        XLSX.utils.book_append_sheet(wb, ws, 'Mutasi');
        XLSX.writeFile(wb, `riwayat-mutasi-semua-${today()}.xlsx`);
        toast(`${list.length.toLocaleString('id-ID')} baris berhasil diexport`);
    } catch (e) {
        toast('Gagal export semua data: ' + e.message, 'err');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = btnTextAsal; }
    }
}
window.exportMutasiSemua = exportMutasiSemua;

/* ═══════════════════════════════════════════════════════════
   ENTRY POINT — dipanggil nav.js tiap kali sub-tab "Mutasi Barang"
   dibuka / difilter cabang di topbar.
   ═══════════════════════════════════════════════════════════ */
async function renderMutasi() {
    const S = window._mutasiState;
    if (S.view === 'form') return renderMutasiForm();
    return renderMutasiList(S.filter.page || 1);
}

/* ═══════════════════════════════════════════════════════════
   RIWAYAT MUTASI (LIST)
   ═══════════════════════════════════════════════════════════ */
async function renderMutasiList(page = 1) {
    const el = document.getElementById('tx-mutasi');
    if (!el) return;
    el.innerHTML = loadingHTML;
    const S = window._mutasiState;
    S.filter.page = page;
    const cab = getCabang();

    try {
        const q = buildQuery({
            cabang : cab || undefined,
            arah   : S.filter.arah || undefined,
            status : S.filter.status || undefined,
            search : S.filter.search || undefined,
            dari   : S.filter.dari || undefined,
            sampai : S.filter.sampai || undefined,
            page, per_page: 20,
        });
        const res = await apiGet('/mutasi-kirim' + q);
        const list = res.data || [];
        const meta = res.meta || {};
        const sum  = res.summary || { menunggu: 0, selesai: 0, selisih: 0, batal: 0 };

        el.innerHTML = `
        <div class="note note-b"><span class="note-ico">ℹ️</span>
            <span>Mutasi barang mencatat perpindahan stok antar cabang dalam bentuk <strong>paket</strong> (banyak barang dalam 1 kode). <strong>Tidak membuat jurnal keuangan</strong> karena bukan transaksi jual/beli.</span>
        </div>

        <div class="kpi-grid">
            <div class="kpi blue kpi-click ${S.filter.status==='' ? 'active':''}" onclick="mtSetStatusFilter('')">
                <div class="kpi-label">Semua Paket</div>
                <div class="kpi-val">${sum.menunggu + sum.selesai + sum.selisih + sum.batal}</div>
                <div class="kpi-sub">Klik untuk hapus filter status</div>
            </div>
            <div class="kpi kpi-click ${S.filter.status==='Dikirim' ? 'active':''}" onclick="mtSetStatusFilter('Dikirim')">
                <div class="kpi-label">🕐 Menunggu Konfirmasi</div>
                <div class="kpi-val">${sum.menunggu}</div>
                <div class="kpi-sub">Sudah dikirim, belum di-ACC tujuan</div>
            </div>
            <div class="kpi green kpi-click ${S.filter.status==='Selesai' ? 'active':''}" onclick="mtSetStatusFilter('Selesai')">
                <div class="kpi-label">✅ Selesai</div>
                <div class="kpi-val">${sum.selesai}</div>
                <div class="kpi-sub">Diterima lengkap & sesuai</div>
            </div>
            <div class="kpi kpi-click ${S.filter.status==='Selesai (Ada Selisih)' ? 'active':''}" style="border-left-color:#B0530F;" onclick="mtSetStatusFilter('Selesai (Ada Selisih)')">
                <div class="kpi-label">⚠️ Ada Selisih</div>
                <div class="kpi-val">${sum.selisih}</div>
                <div class="kpi-sub">Qty diterima ≠ qty dikirim</div>
            </div>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>🚚 Riwayat Mutasi Barang</h3>
                <button class="btn btn-p btn-sm" onclick="mtNewForm()">+ Mutasi Baru</button>
            </div>
            <div class="box-bd pad-sm">
                ${exportBar('tblMutasi', 'riwayat-mutasi-barang', 'tx-mutasi', 'Riwayat Mutasi Barang')}
                <div class="export-bar no-print" style="margin-top:-8px;">
                    <button class="btn btn-blue btn-sm" onclick="exportMutasiSemua()" title="Export SEMUA data (bukan cuma yang tampil di halaman ini) sesuai filter yang lagi aktif">📥 Export Semua Mutasi</button>
                </div>
                <div class="mt-toolbar">
                    <div class="fgroup grow"><label class="flabel">Cari</label><input class="finput" id="srchMutasi" placeholder="No. mutasi, cabang, catatan…" value="${esc(S.filter.search)}" oninput="smartSearch('srchMutasi', this.value, v => { window._mutasiState.filter.search = v; }, () => renderMutasiList(1))"></div>
                    ${cab ? `<div class="fgroup"><label class="flabel">Arah (relatif ${esc(cab)})</label>
                        <select class="fselect" onchange="mtSetArah(this.value)">
                            <option value="" ${!S.filter.arah?'selected':''}>Semua</option>
                            <option value="keluar" ${S.filter.arah==='keluar'?'selected':''}>📤 Keluar dari sini</option>
                            <option value="masuk" ${S.filter.arah==='masuk'?'selected':''}>📥 Masuk ke sini</option>
                        </select></div>` : ''}
                    <div class="fgroup"><label class="flabel">Dari Tanggal</label><input class="finput" type="date" value="${S.filter.dari}" onchange="mtSetTgl('dari',this.value)"></div>
                    <div class="fgroup"><label class="flabel">Sampai Tanggal</label><input class="finput" type="date" value="${S.filter.sampai}" onchange="mtSetTgl('sampai',this.value)"></div>
                    ${(S.filter.search||S.filter.dari||S.filter.sampai||S.filter.status||S.filter.arah) ? `<button class="btn btn-g btn-sm" onclick="mtResetFilter()">✕ Reset Filter</button>` : ''}
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblMutasi">
                    <thead><tr>
                        <th>No. Mutasi</th><th>Tanggal</th><th>Dari → Ke</th>
                        <th class="r">Barang</th><th class="r">Total Qty</th><th>Status</th><th></th>
                    </tr></thead>
                    <tbody>${list.map(m => {
                        const meta = mtStatusMeta(m.status);
                        return `<tr class="mt-row" style="cursor:pointer;" onclick="openMutasiDetail('${esc(m.no_ref)}')">
                            <td><strong>${esc(m.no_ref)}</strong>${m.keterangan ? `<div style="font-size:11px;color:var(--ink3);">${esc(m.keterangan)}</div>` : ''}</td>
                            <td>${fmtTgl(m.tgl)}</td>
                            <td><span class="mt-flow"><span class="badge badge-out">${esc(m.dari_cabang)}</span><span class="arrow">→</span><span class="badge badge-in">${esc(m.ke_cabang)}</span></span></td>
                            <td class="r">${m.jumlah_item}</td>
                            <td class="r">${mtNum(m.total_qty)}</td>
                            <td><span class="badge ${meta.badge}">${meta.icon} ${esc(meta.label)}</span></td>
                            <td>
                                <button class="btn btn-g btn-xs" onclick="event.stopPropagation(); openMutasiDetail('${esc(m.no_ref)}')">Lihat →</button>
                                <button class="btn btn-d btn-xs" title="Hapus dari riwayat" onclick="event.stopPropagation(); mtHapusRiwayat('${esc(m.no_ref)}', '${esc(m.status)}')">🗑️</button>
                            </td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>
                ${paginationHTML(meta, 'renderMutasiList')}`
                : '<div class="empty"><div class="ico">🚚</div><strong>Belum ada mutasi barang.</strong><p style="margin-top:4px;">Klik "+ Mutasi Baru" untuk mengirim barang ke cabang lain.</p></div>'}
            </div>
        </div>`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── FILTER HANDLERS ─────────────────────────────────────── */
window.mtSetStatusFilter = (status) => { window._mutasiState.filter.status = status; renderMutasiList(1); };
window.mtSetArah = (arah) => { window._mutasiState.filter.arah = arah; renderMutasiList(1); };
window.mtSetTgl = (field, val) => { window._mutasiState.filter[field] = val; renderMutasiList(1); };
window.mtResetFilter = () => {
    window._mutasiState.filter = { status: '', arah: '', search: '', dari: '', sampai: '', page: 1 };
    renderMutasiList(1);
};

/* ═══════════════════════════════════════════════════════════
   FORM: MUTASI BARU / EDIT (paket multi-barang, seperti keranjang POS)
   ═══════════════════════════════════════════════════════════ */
window.mtNewForm = () => {
    const S = window._mutasiState;
    S.view = 'form';
    S.editingNoRef = null;
    S.cart = [];
    S.addPick = null;
    S.formHeader = { tgl: today(), dari_cabang: getCabang() || '', ke_cabang: '', dikirim_oleh: '', keterangan: '' };
    renderMutasiForm();
};

window.mtCancelForm = () => {
    window._mutasiState.view = 'list';
    renderMutasiList(window._mutasiState.filter.page || 1);
};

function renderMutasiForm() {
    const el = document.getElementById('tx-mutasi');
    if (!el) return;
    const S = window._mutasiState;
    const h = S.formHeader || { tgl: today(), dari_cabang: '', ke_cabang: '', dikirim_oleh: '', keterangan: '' };
    const isEdit = !!S.editingNoRef;

    const totalQty = S.cart.reduce((a, c) => a + Number(c.qty || 0), 0);

    el.innerHTML = `
    <div class="box">
        <div class="box-hd">
            <h3>${isEdit ? `✏️ Edit Mutasi — ${esc(S.editingNoRef)}` : '🚚 Mutasi Barang Baru'}</h3>
            <button class="btn btn-g btn-sm" onclick="mtCancelForm()">← Kembali ke Riwayat</button>
        </div>
        <div class="box-bd">
            ${isEdit ? `<div class="note note-y" style="margin-bottom:16px;"><span class="note-ico">⚠️</span><span>Mengedit akan mengembalikan stok cabang asal lalu menerapkan ulang sesuai isi baru. Hanya bisa dilakukan selama status masih <strong>Menunggu Konfirmasi</strong>.</span></div>` : ''}
            <div class="fgrid col2">
                <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="mt_tgl" value="${h.tgl}" required></div>
                <div class="fgroup"><label class="flabel">Dikirim Oleh (opsional)</label><input class="finput" id="mt_oleh" placeholder="Nama staf pengirim" value="${esc(h.dikirim_oleh || '')}"></div>
                <div class="fgroup"><label class="flabel">Dari Cabang</label><select class="fselect" id="mt_dari">${cabangOpts(h.dari_cabang)}</select></div>
                <div class="fgroup"><label class="flabel">Ke Cabang</label><select class="fselect" id="mt_ke">${cabangOpts(h.ke_cabang)}</select></div>
                <div class="fgroup" style="grid-column:1/-1;"><label class="flabel">Catatan (opsional)</label><input class="finput" id="mt_ket" placeholder="Mis. pengiriman rutin mingguan, permintaan cabang, dsb." value="${esc(h.keterangan || '')}"></div>
            </div>
        </div>
    </div>

    <div class="box">
        <div class="box-hd"><h3>📦 Daftar Barang dalam Paket Ini</h3><div class="meta">${S.cart.length} barang · ${mtNum(totalQty)} qty</div></div>
        <div class="box-bd pad-sm">
            <div class="mt-toolbar">
                <div class="fgroup grow mt-search-wrap">
                    <label class="flabel">Cari Barang</label>
                    <input class="finput" id="mt_add_search" autocomplete="off" placeholder="Ketik kode / nama barang, lalu Enter atau klik 2× untuk menambahkan…"
                        oninput="mtSearchBarang(this.value)"
                        onfocus="mtSearchBarang(this.value)"
                        onblur="setTimeout(()=>{const r=document.getElementById('mt_add_results'); if(r) r.style.display='none';},180)"
                        onkeydown="if(event.key==='Enter'){event.preventDefault();mtEnterPick();} if(event.key==='Escape'){this.blur();}">
                    <div id="mt_add_results" class="mt-search-results" style="display:none;"></div>
                </div>
                <div class="fgroup" style="width:130px;">
                    <label class="flabel">Satuan</label>
                    <select class="fselect" id="mt_add_satuan" disabled onchange="mtSyncQtyInputNote()"></select>
                </div>
                <div class="fgroup" style="width:110px;"><label class="flabel">Qty</label><input class="finput" type="number" id="mt_add_qty" value="1" min="0.01" step="0.01" onkeydown="if(event.key==='Enter'){event.preventDefault();mtEnterPick();}"></div>
                <div class="fgroup grow"><label class="flabel">Keterangan Barang (opsional)</label><input class="finput" id="mt_add_ket" placeholder="Mis. no. batch, kondisi barang" onkeydown="if(event.key==='Enter'){event.preventDefault();mtEnterPick();}"></div>
            </div>
            <div class="note note-b" style="margin-top:2px;"><span class="note-ico">💡</span><span>Ketik nama/kode barang, lalu tekan <strong>Enter</strong> (memakai barang teratas di hasil pencarian) atau <strong>klik dua kali</strong> pada barang di daftar — tidak perlu tombol tambah. Atur <strong>Satuan</strong> dulu sebelum Enter/klik 2× kalau barangnya punya satuan besar (mis. DUS).</span></div>
        </div>
        <div class="box-bd pad0 tscroll">
            ${S.cart.length ? `
            <table class="mt-cart-table">
                <thead><tr><th>#</th><th>Barang</th><th>Satuan</th><th class="r">Qty</th><th>Keterangan</th><th></th></tr></thead>
                <tbody>${S.cart.map((c, i) => `<tr>
                    <td>${i + 1}</td>
                    <td><strong>${esc(c.nama)}</strong><div style="font-size:11px;color:var(--ink3);">${esc(c.kode)}</div></td>
                    <td>${esc(c.satuan)}</td>
                    <td class="r">
                        <input class="qty-inline" type="number" min="0.01" step="0.01" value="${c.qty}" onchange="mtCartQtyUbah(${i}, this.value)">
                        ${c.satuanInput && c.satuanInput !== c.satuan ? `<div style="font-size:10.5px;color:var(--ink3);margin-top:2px;">input: ${mtNum(c.qtyInput)} ${esc(c.satuanInput)}</div>` : ''}
                    </td>
                    <td><input class="ket-inline" value="${esc(c.keterangan || '')}" onchange="mtCartKetUbah(${i}, this.value)"></td>
                    <td><button class="row-del" onclick="mtCartHapus(${i})">✕</button></td>
                </tr>`).join('')}</tbody>
            </table>`
            : '<div class="empty"><div class="ico">📭</div><strong>Belum ada barang ditambahkan.</strong></div>'}
        </div>
    </div>

    <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button class="btn btn-g" onclick="mtCancelForm()">Batal</button>
        <button class="btn btn-p btn-lg" onclick="mtSimpan()">💾 ${isEdit ? 'Simpan Perubahan' : 'Simpan & Kirim Mutasi'}</button>
    </div>`;
}

/* ── PENCARIAN & PILIH BARANG (klik 2× utk langsung tambah) ─── */
function mtSatuanList(barang) {
    if (!barang) return [];
    const list = [{ value: barang.satuan1 || 'PCS', label: (barang.satuan1 || 'PCS') + ' (satuan dasar)' }];
    if (barang.satuan2) list.push({ value: barang.satuan2, label: `${barang.satuan2} (isi ${barang.isi || 1} ${barang.satuan1 || 'PCS'})` });
    if (barang.satuan3) {
        const isi3 = Number(barang.isi3) || 1;
        list.push({ value: barang.satuan3, label: isi3 > 1 ? `${barang.satuan3} (isi ${isi3} ${barang.satuan1 || 'PCS'})` : barang.satuan3 });
    }
    return list;
}
/** Konversi qty yang diinput (dalam satuan pilihan) ke qty satuan dasar — sama seperti backend konversiSatuan() */
function mtQtyKeBase(barang, satuanPilih, qtyInput) {
    if (!barang) return qtyInput;
    const isi  = Number(barang.isi || 1);
    const isi3 = Number(barang.isi3 || 1);
    const isSatuan2 = barang.satuan2 && satuanPilih && String(barang.satuan2).toLowerCase() === String(satuanPilih).toLowerCase();
    const isSatuan3 = barang.satuan3 && satuanPilih && String(barang.satuan3).toLowerCase() === String(satuanPilih).toLowerCase();
    if (isSatuan2 && isi > 0) return Math.round(qtyInput * isi * 100) / 100;
    if (isSatuan3 && isi3 > 0) return Math.round(qtyInput * isi3 * 100) / 100;
    return qtyInput; // satuan dasar, atau satuan3 tanpa isi3 (belum diisi > 1)
}

window.mtSearchBarang = (term) => {
    const box = document.getElementById('mt_add_results');
    if (!box) return;
    term = (term || '').trim().toLowerCase();
    window._mutasiState._lastHits = [];
    if (!term) { box.style.display = 'none'; box.innerHTML = ''; return; }

    const hits = STATE.barang.filter(b =>
        (b.kode && b.kode.toLowerCase().includes(term)) || (b.nama && b.nama.toLowerCase().includes(term))
    ).slice(0, 8);
    window._mutasiState._lastHits = hits;

    if (!hits.length) {
        box.innerHTML = `<div class="mt-search-empty">Tidak ada barang cocok "${esc(term)}"</div>`;
        box.style.display = 'block';
        return;
    }
    box.innerHTML = hits.map(b => `
        <div class="mt-search-item" onmousedown="event.preventDefault();" onclick="mtPickBarang('${esc(b.kode)}', false)" ondblclick="mtPickBarang('${esc(b.kode)}', true)">
            <div><strong>${esc(b.nama)}</strong><div style="font-size:11px;color:var(--ink3);">${esc(b.kode)}</div></div>
            <span class="badge badge-info">${esc(b.satuan1 || 'PCS')}${b.satuan2 ? ' / ' + esc(b.satuan2) : ''}</span>
        </div>`).join('');
    box.style.display = 'block';
};

/** Dipanggil saat Enter ditekan di kotak cari / qty / keterangan.
 *  Kalau barang sudah dipilih (via klik 1× sebelumnya) → langsung tambah,
 *  satuan yang sudah dipilih di dropdown tetap dipakai. Kalau belum dipilih
 *  sama sekali → pilih hasil pencarian teratas dulu (ini juga yang mengisi
 *  dropdown Satuan) baru langsung ditambahkan — supaya Enter selalu lewat
 *  jalur yang sama dengan klik 2×, dan tidak pernah "melompati" satuan. */
window.mtEnterPick = () => {
    const S = window._mutasiState;
    if (S.addPick) { mtCartTambah(); return; }
    const hits = S._lastHits || [];
    if (hits.length) { mtPickBarang(hits[0].kode, true); return; }

    // Fallback: teks di kotak cari persis kode barang (barcode scanner dll)
    const searchInput = document.getElementById('mt_add_search');
    const exact = getBarang((searchInput?.value || '').trim());
    if (exact) { mtPickBarang(exact.kode, true); return; }

    toast('Ketik kode/nama barang dulu, lalu pilih dari hasil pencarian', 'err');
};


window.mtPickBarang = (kode, autoAdd) => {
    const barang = getBarang(kode);
    if (!barang) return;
    window._mutasiState.addPick = barang;

    const search = document.getElementById('mt_add_search');
    const satSel = document.getElementById('mt_add_satuan');
    const box = document.getElementById('mt_add_results');
    if (search) search.value = `${barang.kode} – ${barang.nama}`;
    if (box) box.style.display = 'none';
    if (satSel) {
        satSel.disabled = false;
        satSel.innerHTML = mtSatuanList(barang).map(s => `<option value="${esc(s.value)}">${esc(s.label)}</option>`).join('');
    }

    if (autoAdd) {
        mtCartTambah();
    } else {
        document.getElementById('mt_add_qty')?.focus();
        document.getElementById('mt_add_qty')?.select();
    }
};
window.mtSyncQtyInputNote = () => {}; // hook cadangan kalau nanti mau live-preview konversi

/* ── KERANJANG BARANG ─────────────────────────────────────── */
window.mtCartTambah = () => {
    const S = window._mutasiState;
    const searchInput = document.getElementById('mt_add_search');
    const qtyInput = Number(document.getElementById('mt_add_qty').value);
    const ket = document.getElementById('mt_add_ket').value.trim();
    const satuanPilih = document.getElementById('mt_add_satuan')?.value || null;

    // Kalau belum pernah klik hasil pencarian, coba anggap teksnya kode persis
    // (memudahkan yang terbiasa mengetik cepat lalu tekan Enter).
    let barang = S.addPick;
    if (!barang) barang = getBarang((searchInput.value || '').trim());

    if (!barang) { toast('Pilih barang dari hasil pencarian dulu (klik atau klik 2× untuk langsung tambah)', 'err'); return; }
    if (!qtyInput || qtyInput <= 0) { toast('Qty harus lebih dari 0', 'err'); return; }

    const satuan = satuanPilih || barang.satuan1 || 'PCS';
    const qtyBase = mtQtyKeBase(barang, satuan, qtyInput);
    const satuanDasar = barang.satuan1 || 'PCS';

    const existing = S.cart.find(c => c.kode === barang.kode);
    if (existing) {
        existing.qty = Number(existing.qty) + qtyBase;
        delete existing.qtyInput; delete existing.satuanInput; // gabungan qty campuran satuan, tampilkan base saja
        if (ket) existing.keterangan = ket;
        toast(`Qty ${barang.nama} digabung (sudah ada di daftar)`, 'y');
    } else {
        const entry = { kode: barang.kode, nama: barang.nama, satuan: satuanDasar, qty: qtyBase, keterangan: ket };
        if (satuan !== satuanDasar) { entry.qtyInput = qtyInput; entry.satuanInput = satuan; }
        S.cart.push(entry);
    }

    S.addPick = null;
    searchInput.value = '';
    document.getElementById('mt_add_qty').value = 1;
    document.getElementById('mt_add_ket').value = '';
    renderMutasiForm();
    document.getElementById('mt_add_search')?.focus();
};
window.mtCartQtyUbah = (i, val) => {
    const q = Number(val);
    if (!q || q <= 0) { toast('Qty harus lebih dari 0', 'err'); renderMutasiForm(); return; }
    window._mutasiState.cart[i].qty = q;
    // Qty diubah manual → catatan "input satuan lain" jadi tidak akurat lagi, buang saja.
    delete window._mutasiState.cart[i].qtyInput;
    delete window._mutasiState.cart[i].satuanInput;
};
window.mtCartKetUbah = (i, val) => { window._mutasiState.cart[i].keterangan = val; };
window.mtCartHapus = (i) => { window._mutasiState.cart.splice(i, 1); renderMutasiForm(); };

/* ── SIMPAN (POST baru / PUT edit) ────────────────────────── */
window.mtSimpan = async () => {
    const S = window._mutasiState;
    const dari = document.getElementById('mt_dari').value;
    const ke   = document.getElementById('mt_ke').value;
    const tgl  = document.getElementById('mt_tgl').value;

    if (!dari || !ke) { toast('Pilih cabang asal dan tujuan', 'err'); return; }
    if (dari === ke)  { toast('Cabang asal dan tujuan tidak boleh sama', 'err'); return; }
    if (!S.cart.length) { toast('Tambahkan minimal 1 barang', 'err'); return; }

    const payload = {
        tgl, dari_cabang: dari, ke_cabang: ke,
        dikirim_oleh: document.getElementById('mt_oleh').value.trim() || null,
        keterangan  : document.getElementById('mt_ket').value.trim() || null,
        items: S.cart.map(c => ({ kode_barang: c.kode, qty: Number(c.qty), keterangan: c.keterangan || null })),
    };

    try {
        const res = S.editingNoRef
            ? await apiPut(`/mutasi-kirim/${S.editingNoRef}`, payload)
            : await apiPost('/mutasi-kirim', payload);

        toast(S.editingNoRef ? 'Perubahan mutasi disimpan' : 'Mutasi dikirim, stok cabang asal telah dikurangi', 'ok');
        S.view = 'list';
        S.cart = [];
        const savedNoRef = res.mutasi.no_ref;
        S.editingNoRef = null;
        await renderMutasiList(1);
        mtOfferPrint(savedNoRef);
    } catch (err) {
        toast(err.message, 'err');
    }
};

/** Tawarkan cetak struk/faktur setelah simpan */
function mtOfferPrint(noRef) {
    openM(`
    <div class="mhd"><h3>✅ Mutasi Tersimpan — ${esc(noRef)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <p style="margin-bottom:14px;line-height:1.6;">Paket mutasi telah dibuat dan stok cabang asal sudah dikurangi. Kode ini akan dipakai cabang tujuan untuk mencocokkan barang yang datang.</p>
        <div class="mt-print-choice">
            <button class="btn btn-blue" onclick="mtCetakStruk('${esc(noRef)}')">🖨️ Cetak Struk (Surat Jalan)</button>
            <button class="btn btn-gold" onclick="mtCetakFaktur('${esc(noRef)}')">📄 Cetak Faktur (A4)</button>
        </div>
    </div>
    <div class="mft"><button class="btn btn-p" onclick="closeM()">Selesai</button></div>`);
}

/* ═══════════════════════════════════════════════════════════
   DETAIL MODAL — riwayat diklik → lihat isi, edit, batalkan,
   konfirmasi penerimaan, tindak lanjuti selisih, cetak ulang.
   ═══════════════════════════════════════════════════════════ */
window._mtDetailCache = null; // simpan hasil fetch terakhir supaya sub-form tak perlu fetch ulang

window.openMutasiDetail = async (noRef) => {
    try {
        const data = await apiGet(`/mutasi-kirim/${noRef}`);
        window._mtDetailCache = data;
        openM(mtDetailHTML(data));
    } catch (err) { toast(err.message, 'err'); }
};

function mtDetailHTML(data) {
    const m = data.mutasi, items = data.items || [], selisih = data.selisih || [];
    const meta = mtStatusMeta(m.status);
    const isPending = m.status === 'Dikirim';
    const isVoid = m.status === 'Dibatalkan';
    const totalKirim = items.reduce((a, i) => a + Number(i.qty_kirim || 0), 0);

    let bannerText = '';
    if (m.status === 'Dikirim') bannerText = `Menunggu ${esc(m.ke_cabang)} mengecek fisik barang & konfirmasi penerimaan.`;
    else if (m.status === 'Selesai') bannerText = `Diterima lengkap & sesuai oleh ${esc(m.ke_cabang)}${m.diterima_oleh ? ' — dikonfirmasi oleh ' + esc(m.diterima_oleh) : ''}.`;
    else if (m.status === 'Selesai (Ada Selisih)') bannerText = `Diterima oleh ${esc(m.ke_cabang)}, tapi ada selisih qty pada ${selisih.length} barang — lihat bagian "Riwayat Selisih" di bawah.`;
    else if (m.status === 'Dibatalkan') bannerText = `Dibatalkan${m.dibatalkan_oleh ? ' oleh ' + esc(m.dibatalkan_oleh) : ''}${m.alasan_batal ? ': ' + esc(m.alasan_batal) : ''}.`;

    return `
    <div class="mhd"><h3>${meta.icon} Mutasi ${esc(m.no_ref)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="mt-status-banner ${meta.banner}">${meta.icon} <span>${bannerText}</span></div>

        <div class="mt-detail-grid" style="margin:16px 0;">
            <div><div class="dl">Tanggal</div><div class="dv">${mtTglPanjang(m.tgl)}</div></div>
            <div><div class="dl">Rute</div><div class="dv mt-flow"><span class="badge badge-out">${esc(m.dari_cabang)}</span><span class="arrow">→</span><span class="badge badge-in">${esc(m.ke_cabang)}</span></div></div>
            <div><div class="dl">Dikirim Oleh</div><div class="dv">${esc(m.dikirim_oleh || '–')}</div></div>
            ${m.diterima_oleh ? `<div><div class="dl">Diterima / Diperiksa Oleh</div><div class="dv">${esc(m.diterima_oleh)}</div></div>` : ''}
            ${m.waktu_terima ? `<div><div class="dl">Waktu Konfirmasi</div><div class="dv">${new Date(m.waktu_terima).toLocaleString('id-ID')}</div></div>` : ''}
        </div>
        ${m.keterangan ? `<p style="font-size:13px;color:var(--ink2);margin-bottom:10px;"><strong>Catatan:</strong> ${esc(m.keterangan)}</p>` : ''}
        ${m.catatan_terima ? `<p style="font-size:13px;color:var(--ink2);margin-bottom:10px;"><strong>Catatan Penerima:</strong> ${esc(m.catatan_terima)}</p>` : ''}

        <div class="tscroll">
        <table>
            <thead><tr><th>Barang</th><th class="r">Qty Kirim</th>${!isPending && !isVoid ? '<th class="r">Qty Diterima</th><th class="r">Selisih</th>' : ''}<th>Keterangan</th></tr></thead>
            <tbody>${items.map(it => {
                const namaBarang = it.nama_barang_live || it.nama_barang || it.kode_barang;
                let selCell = '';
                if (!isPending && !isVoid) {
                    const sel = Number(it.selisih || 0);
                    const selTxt = sel === 0 ? '<span style="color:var(--ink3);">Sesuai</span>' : `<span class="mt-qty-diff ${sel < 0 ? 'neg' : 'pos'}">${sel > 0 ? '+' : ''}${mtNum(sel)}</span>`;
                    selCell = `<td class="r">${mtNum(it.qty_diterima)} ${esc(it.satuan||'')}</td><td class="r">${selTxt}</td>`;
                }
                return `<tr>
                    <td><strong>${esc(namaBarang)}</strong><div style="font-size:11px;color:var(--ink3);">${esc(it.kode_barang)}</div></td>
                    <td class="r">${mtNum(it.qty_kirim)} ${esc(it.satuan||'')}</td>
                    ${selCell}
                    <td>${esc(it.keterangan || '–')}</td>
                </tr>`;
            }).join('')}</tbody>
            <tfoot><tr style="font-weight:700;"><td>Total (${items.length} barang)</td><td class="r">${mtNum(totalKirim)}</td>${!isPending && !isVoid ? '<td></td><td></td>' : ''}<td></td></tr></tfoot>
        </table>
        </div>

        ${selisih.length ? `
        <div style="margin-top:20px;">
            <h4 style="font-size:14px;margin-bottom:10px;">⚠️ Riwayat Selisih</h4>
            ${selisih.map(s => mtSelisihRowHTML(s)).join('')}
        </div>` : ''}

        <div class="mt-print-choice" style="margin-top:20px;">
            <button class="btn btn-blue btn-sm" onclick="mtCetakStruk('${esc(m.no_ref)}')">🖨️ Cetak Struk</button>
            <button class="btn btn-gold btn-sm" onclick="mtCetakFaktur('${esc(m.no_ref)}')">📄 Cetak Faktur</button>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-d btn-sm" onclick="mtHapusRiwayat('${esc(m.no_ref)}', '${esc(m.status)}')">🗑️ Hapus dari Riwayat</button>
        <div style="flex:1;"></div>
        ${isPending ? `
            <button class="btn btn-d" onclick="mtOpenBatalForm('${esc(m.no_ref)}')">🚫 Batalkan</button>
            <button class="btn btn-g" onclick="mtEditFromDetail('${esc(m.no_ref)}')">✏️ Edit</button>
            <button class="btn btn-p" onclick="mtOpenKonfirmasiForm('${esc(m.no_ref)}')">✅ Konfirmasi Penerimaan</button>
        ` : `<button class="btn btn-g" onclick="closeM()">Tutup</button>`}
    </div>`;
}

function mtSelisihRowHTML(s) {
    const done = s.status === 'Sudah Ditindaklanjuti';
    return `<div class="mt-selisih-row ${done ? 'done' : ''}">
        <div>
            <strong>${esc(s.nama_barang || s.kode_barang)}</strong>
            <span class="badge ${s.jenis === 'Kurang' ? 'badge-out' : 'badge-in'}" style="margin-left:6px;">${s.jenis === 'Kurang' ? '▼ Kurang' : '▲ Lebih'} ${mtNum(s.qty_selisih)}</span>
            ${done ? `<div style="font-size:12px;color:var(--ink3);margin-top:4px;">Ditindaklanjuti: ${esc(s.tindakan || '-')}${s.diselesaikan_oleh ? ' oleh ' + esc(s.diselesaikan_oleh) : ''}</div>` : ''}
        </div>
        ${done
            ? `<span class="badge badge-in">✓ Sudah Ditindaklanjuti</span>`
            : `<button class="btn btn-gold btn-xs" onclick="mtOpenResolveForm(${s.id})">🔧 Tindak Lanjuti</button>`}
    </div>`;
}

/* ── EDIT dari detail ─────────────────────────────────────── */
window.mtEditFromDetail = (noRef) => {
    const data = window._mtDetailCache;
    if (!data || data.mutasi.no_ref !== noRef) return;
    const S = window._mutasiState;
    S.view = 'form';
    S.editingNoRef = noRef;
    S.addPick = null;
    S.formHeader = {
        tgl: data.mutasi.tgl, dari_cabang: data.mutasi.dari_cabang, ke_cabang: data.mutasi.ke_cabang,
        dikirim_oleh: data.mutasi.dikirim_oleh, keterangan: data.mutasi.keterangan,
    };
    S.cart = data.items.map(it => ({
        kode: it.kode_barang, nama: it.nama_barang_live || it.nama_barang, satuan: it.satuan || 'PCS',
        qty: Number(it.qty_kirim), keterangan: it.keterangan || '',
    }));
    closeM();
    renderMutasiForm();
};

/* ── BATALKAN ──────────────────────────────────────────────── */
window.mtOpenBatalForm = (noRef) => {
    openM(`
    <div class="mhd"><h3>🗑️ Batalkan Mutasi ${esc(noRef)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-y"><span class="note-ico">⚠️</span><span>Stok cabang asal akan dikembalikan seperti sebelum mutasi ini dikirim.</span></div>
        <div class="fgroup" style="margin-top:12px;"><label class="flabel">Oleh (opsional)</label><input class="finput" id="mt_batal_oleh" placeholder="Nama yang membatalkan"></div>
        <div class="fgroup" style="margin-top:12px;"><label class="flabel">Alasan (opsional)</label><textarea class="finput" id="mt_batal_alasan" rows="3" placeholder="Mis. salah input, batal dikirim, dsb."></textarea></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="openMutasiDetail('${esc(noRef)}')">← Kembali</button>
        <button class="btn btn-d" onclick="mtSubmitBatal('${esc(noRef)}')">🗑️ Ya, Batalkan</button>
    </div>`);
};
window.mtSubmitBatal = async (noRef) => {
    try {
        await apiPost(`/mutasi-kirim/${noRef}/batal`, {
            oleh  : document.getElementById('mt_batal_oleh').value.trim() || null,
            alasan: document.getElementById('mt_batal_alasan').value.trim() || null,
        });
        toast('Mutasi dibatalkan, stok cabang asal dikembalikan', 'y');
        closeM();
        renderMutasiList(window._mutasiState.filter.page || 1);
    } catch (err) { toast(err.message, 'err'); }
};

/* ── HAPUS PERMANEN DARI RIWAYAT ───────────────────────────── */
window.mtHapusRiwayat = async (noRef, status) => {
    let pesan = `Hapus mutasi ${noRef} dari riwayat? Tindakan ini permanen dan tidak bisa dibatalkan.`;
    if (status === 'Dikirim') {
        pesan += `\n\nStok di cabang asal akan dikembalikan seperti sebelum mutasi ini dikirim.`;
    } else if (status === 'Selesai' || status === 'Selesai (Ada Selisih)') {
        pesan += `\n\nStok di cabang asal (dikembalikan) DAN stok di cabang tujuan (dikurangi lagi) akan disesuaikan supaya saldo tetap akurat.`;
    }
    const ok = await confirmDialog(pesan, { title: 'Hapus dari Riwayat', okText: 'Ya, Hapus Permanen' });
    if (!ok) return;
    try {
        await apiDel(`/mutasi-kirim/${noRef}`);
        toast('Mutasi dihapus dari riwayat', 'y');
        renderMutasiList(window._mutasiState.filter.page || 1);
    } catch (err) { toast(err.message, 'err'); }
};

/* ── KONFIRMASI PENERIMAAN (ACC cabang tujuan) ────────────── */
window.mtOpenKonfirmasiForm = (noRef) => {
    const data = window._mtDetailCache;
    if (!data || data.mutasi.no_ref !== noRef) return;
    const items = data.items;

    openM(`
    <div class="mhd"><h3>✅ Konfirmasi Penerimaan — ${esc(noRef)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b"><span class="note-ico">ℹ️</span><span>Cocokkan qty di kolom "Qty Diterima" dengan barang fisik yang benar-benar sampai. Kalau ada beda, sistem otomatis mencatatnya sebagai selisih (kurang/lebih) yang bisa ditindaklanjuti nanti.</span></div>
        <div class="tscroll" style="margin-top:12px;">
        <table>
            <thead><tr><th>Barang</th><th class="r">Qty Dikirim</th><th class="r">Qty Diterima (fisik)</th></tr></thead>
            <tbody>${items.map(it => `<tr>
                <td><strong>${esc(it.nama_barang_live || it.nama_barang)}</strong><div style="font-size:11px;color:var(--ink3);">${esc(it.kode_barang)}</div></td>
                <td class="r">${mtNum(it.qty_kirim)} ${esc(it.satuan||'')}</td>
                <td class="r"><input class="qty-inline" type="number" min="0" step="0.01" id="kf_qty_${it.id}" value="${it.qty_kirim}"></td>
            </tr>`).join('')}</tbody>
        </table>
        </div>
        <div class="fgrid col2" style="margin-top:14px;">
            <div class="fgroup"><label class="flabel">Diterima / Diperiksa Oleh</label><input class="finput" id="kf_oleh" placeholder="Nama staf penerima"></div>
            <div class="fgroup"><label class="flabel">Catatan (opsional)</label><input class="finput" id="kf_catatan" placeholder="Mis. kondisi barang saat diterima"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="openMutasiDetail('${esc(noRef)}')">← Kembali</button>
        <button class="btn btn-p" onclick="mtSubmitKonfirmasi('${esc(noRef)}')">✅ Konfirmasi & Perbarui Stok</button>
    </div>`);
};

window.mtSubmitKonfirmasi = async (noRef) => {
    const data = window._mtDetailCache;
    const items = data.items.map(it => ({
        id: it.id,
        qty_diterima: Number(document.getElementById(`kf_qty_${it.id}`).value || 0),
    }));
    try {
        const res = await apiPost(`/mutasi-kirim/${noRef}/konfirmasi`, {
            diterima_oleh : document.getElementById('kf_oleh').value.trim() || null,
            catatan_terima: document.getElementById('kf_catatan').value.trim() || null,
            items,
        });
        window._mtDetailCache = res;
        const adaSelisih = res.mutasi.status === 'Selesai (Ada Selisih)';
        toast(adaSelisih ? 'Dikonfirmasi — ada selisih qty, cek riwayat selisih' : 'Dikonfirmasi lengkap & sesuai — stok tujuan diperbarui', adaSelisih ? 'y' : 'ok');
        openM(mtDetailHTML(res));
        renderMutasiList(window._mutasiState.filter.page || 1);
    } catch (err) { toast(err.message, 'err'); }
};

/* ── TINDAK LANJUTI SELISIH ───────────────────────────────── */
window.mtOpenResolveForm = (selisihId) => {
    const data = window._mtDetailCache;
    const s = (data.selisih || []).find(x => x.id === selisihId);
    if (!s) return;
    const m = data.mutasi;

    openM(`
    <div class="mhd"><h3>🔧 Tindak Lanjuti Selisih</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="mt-status-banner selisih">${s.jenis === 'Kurang' ? '▼' : '▲'} <span><strong>${esc(s.nama_barang || s.kode_barang)}</strong> — ${s.jenis} ${mtNum(s.qty_selisih)} dari mutasi ${esc(m.no_ref)}</span></div>

        <div class="fgroup" style="margin-top:14px;">
            <label class="flabel">Tindakan yang Diambil</label>
            <input class="finput" id="rs_tindakan" list="dl_tindakan_selisih" required placeholder="Mis. Sesuaikan stok, klaim ke pengirim, barang menyusul…">
            <datalist id="dl_tindakan_selisih">
                <option value="Sesuaikan stok tujuan">
                <option value="Sesuaikan stok asal (catat sebagai kerugian)">
                <option value="Klaim ke cabang pengirim">
                <option value="Barang menyusul, tunggu kiriman berikutnya">
                <option value="Selisih dianggap wajar / diabaikan">
            </datalist>
        </div>
        <div class="fgroup" style="margin-top:12px;"><label class="flabel">Catatan (opsional)</label><textarea class="finput" id="rs_catatan" rows="2"></textarea></div>
        <div class="fgroup" style="margin-top:12px;"><label class="flabel">Diselesaikan Oleh (opsional)</label><input class="finput" id="rs_oleh" placeholder="Nama"></div>

        <label style="display:flex;align-items:center;gap:8px;margin-top:14px;font-size:13px;font-weight:600;">
            <input type="checkbox" id="rs_sesuaikan" onchange="document.getElementById('rs_sesuaikan_panel').style.display=this.checked?'grid':'none'">
            Sesuaikan saldo stok sekarang juga
        </label>
        <div id="rs_sesuaikan_panel" class="fgrid col2" style="display:none;margin-top:10px;">
            <div class="fgroup"><label class="flabel">Cabang yang Disesuaikan</label>
                <select class="fselect" id="rs_cabang">
                    <option value="${esc(m.dari_cabang)}">${esc(m.dari_cabang)} (asal)</option>
                    <option value="${esc(m.ke_cabang)}" selected>${esc(m.ke_cabang)} (tujuan)</option>
                </select>
            </div>
            <div class="fgroup"><label class="flabel">Arah</label>
                <select class="fselect" id="rs_arah">
                    <option value="tambah">+ Tambah stok</option>
                    <option value="kurang">− Kurangi stok</option>
                </select>
            </div>
            <div class="fgroup" style="grid-column:1/-1;"><label class="flabel">Qty Penyesuaian</label><input class="finput" type="number" min="0.01" step="0.01" id="rs_qty" value="${s.qty_selisih}"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="openMutasiDetail('${esc(m.no_ref)}')">← Kembali</button>
        <button class="btn btn-p" onclick="mtSubmitResolve(${s.id}, '${esc(m.no_ref)}')">💾 Simpan Tindak Lanjut</button>
    </div>`);
};

window.mtSubmitResolve = async (selisihId, noRef) => {
    const tindakan = document.getElementById('rs_tindakan').value.trim();
    if (!tindakan) { toast('Isi tindakan yang diambil', 'err'); return; }
    const sesuaikan = document.getElementById('rs_sesuaikan').checked;

    const payload = {
        tindakan,
        catatan: document.getElementById('rs_catatan').value.trim() || null,
        diselesaikan_oleh: document.getElementById('rs_oleh').value.trim() || null,
        sesuaikan_stok: sesuaikan,
    };
    if (sesuaikan) {
        payload.cabang_sesuai = document.getElementById('rs_cabang').value;
        payload.arah = document.getElementById('rs_arah').value;
        payload.qty_sesuai = Number(document.getElementById('rs_qty').value);
    }

    try {
        await apiPost(`/mutasi-kirim/selisih/${selisihId}/selesaikan`, payload);
        toast('Selisih ditandai sudah ditindaklanjuti', 'ok');
        await window.openMutasiDetail(noRef);
    } catch (err) { toast(err.message, 'err'); }
};

/* ═══════════════════════════════════════════════════════════
   CETAK STRUK (80mm, surat jalan ringkas) & FAKTUR (A4, formal)
   ═══════════════════════════════════════════════════════════ */
async function mtFetchForPrint(noRef) {
    if (window._mtDetailCache && window._mtDetailCache.mutasi.no_ref === noRef) return window._mtDetailCache;
    return apiGet(`/mutasi-kirim/${noRef}`);
}

window.mtCetakStruk = async (noRef) => {
    let data;
    try { data = await mtFetchForPrint(noRef); } catch (err) { toast(err.message, 'err'); return; }
    const m = data.mutasi, items = data.items || [];
    const isPending = m.status === 'Dikirim';
    const pw = window.open('', '_blank', 'width=460,height=720');
    if (!pw) { toast('Popup diblokir browser. Izinkan popup untuk mencetak struk.', 'err'); return; }

    const itemsHTML = items.map(it => `
        <div class="row" style="margin-bottom:2px;"><span style="font-weight:600;">${esc(it.nama_barang_live || it.nama_barang || it.kode_barang)}</span></div>
        <div class="row"><span>${mtNum(it.qty_kirim)} ${esc(it.satuan||'')}${it.keterangan ? ' — ' + esc(it.keterangan) : ''}</span>${!isPending ? `<span>${mtNum(it.qty_diterima)} diterima</span>` : ''}</div>
    `).join('');

    pw.document.write(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>Struk Mutasi - ${m.no_ref}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body { background:#e9ebef; margin:0; padding:0; font-family:'Courier New','Consolas',monospace; }
  .toolbar { position: sticky; top:0; z-index:10; display:flex; gap:8px; justify-content:center; padding:12px; background:#1f2430; box-shadow:0 2px 8px rgba(0,0,0,.25); }
  .toolbar button { flex:1; max-width:170px; cursor:pointer; border:none; border-radius:8px; padding:11px 10px; font-family:'Plus Jakarta Sans',Arial,sans-serif; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; gap:6px; }
  .btn-print { background:#3b82f6; color:#fff; } .btn-pdf { background:#16a34a; color:#fff; } .btn-pdf[disabled]{opacity:.6;cursor:wait;}
  .sheet-wrap { display:flex; justify-content:center; padding:18px 10px 34px; }
  #struk { width:76mm; background:#fff; padding:5mm 4mm 7mm; font-size:11.5px; line-height:1.55; color:#111; box-shadow:0 6px 22px rgba(0,0,0,.18); position:relative; overflow:hidden; }
  #struk::before, #struk::after { content:""; position:absolute; left:0; right:0; height:6px; background:radial-gradient(circle at 4px 3px,#e9ebef 3px,transparent 3.5px) repeat-x; background-size:12px 6px; }
  #struk::before{top:0;} #struk::after{bottom:0;transform:rotate(180deg);}
  .center{text-align:center;} .bold{font-weight:700;}
  .brand{font-size:16px;letter-spacing:1px;} .tag{font-size:9.5px;letter-spacing:2px;color:#444;font-weight:600;margin-top:1px;}
  .divider{border-top:1px dashed #999;margin:7px 0;} .divider.solid{border-top:1.5px solid #111;}
  .doctitle{text-align:center;font-weight:700;font-size:12.5px;letter-spacing:1.5px;margin:2px 0;}
  .noslip{text-align:center;font-size:10px;color:#555;font-weight:600;margin-top:-2px;margin-bottom:4px;}
  .row{display:flex;justify-content:space-between;gap:6px;padding:1px 0;font-weight:700;}
  .row span:first-child{color:#111;} .row span:last-child{text-align:right;white-space:nowrap;font-weight:700;color:#111;}
  .status-box{margin:8px 0 2px;padding:7px 8px;border-radius:6px;background:#f7f7f4;border-top:1.5px solid #111;border-bottom:3px double #111;font-weight:800;text-align:center;font-size:11.5px;letter-spacing:.4px;}
  .footnote{font-size:9.5px;color:#333;font-weight:600;margin-top:10px;} .footnote.center{text-align:center;}
  .ttd-row{display:flex;gap:10px;margin-top:16px;} .ttd{flex:1;text-align:center;font-size:10px;}
  .ttd .line{margin-top:34px;border-top:1px dashed #444;padding-top:3px;font-weight:700;}
  @media print {
    .toolbar{display:none !important;} html,body{background:#fff;} .sheet-wrap{padding:0;} #struk{box-shadow:none;width:100%;}
    #struk, #struk * { color:#000 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    #struk { font-weight:600; }
    #struk .row, #struk .row span, #struk .footnote, #struk .noslip, #struk .tag { font-weight:700 !important; }
  }
</style></head><body>
  <div class="toolbar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Cetak Langsung</button>
    <button class="btn-pdf" id="btnPdf">⬇️ Simpan PDF</button>
  </div>
  <div class="sheet-wrap"><div id="struk">
    <div class="center bold brand">${esc(STATE.namaToko || 'TOKO SUMINI')}</div>
    <div class="center tag">SISTEM AKUNTANSI MULTI-CABANG</div>
    <div class="divider solid"></div>
    <div class="doctitle">SURAT JALAN MUTASI BARANG</div>
    <div class="noslip">No. ${esc(m.no_ref)}</div>
    <div class="divider"></div>
    <div class="row"><span>Tanggal</span><span>${mtTglPanjang(m.tgl)}</span></div>
    <div class="row"><span>Dari</span><span>${esc(m.dari_cabang)}</span></div>
    <div class="row"><span>Ke</span><span>${esc(m.ke_cabang)}</span></div>
    ${m.dikirim_oleh ? `<div class="row"><span>Dikirim Oleh</span><span>${esc(m.dikirim_oleh)}</span></div>` : ''}
    <div class="divider"></div>
    ${itemsHTML}
    <div class="divider"></div>
    <div class="status-box">${isPending ? 'MENUNGGU KONFIRMASI TUJUAN' : esc(m.status.toUpperCase())}</div>
    ${m.keterangan ? `<div class="footnote">Ket: ${esc(m.keterangan)}</div>` : ''}
    <div class="footnote center">Dicetak: ${new Date().toLocaleString('id-ID')}</div>
    <div class="ttd-row">
        <div class="ttd">Pengirim<div class="line">${esc(m.dikirim_oleh || '(...........)')}</div></div>
        <div class="ttd">Penerima<div class="line">${esc(m.diterima_oleh || '(...........)')}</div></div>
    </div>
  </div></div>
  <script>
    document.getElementById('btnPdf').onclick = function () {
      const btn = this; btn.disabled = true; btn.textContent = '⏳ Menyiapkan…';
      const el = document.getElementById('struk');
      html2pdf().set({
        margin: 0, filename: 'Struk-Mutasi-${m.no_ref}.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: [80, el.scrollHeight * 0.2646 + 6], orientation: 'portrait' }
      }).from(el).save().then(() => { btn.disabled = false; btn.innerHTML = '⬇️ Simpan PDF'; })
        .catch(() => { btn.disabled = false; btn.innerHTML = '⬇️ Simpan PDF'; alert('Gagal membuat PDF, coba lagi.'); });
    };
  <\/script>
</body></html>`);
    pw.document.close();
};

window.mtCetakFaktur = async (noRef) => {
    let data;
    try { data = await mtFetchForPrint(noRef); } catch (err) { toast(err.message, 'err'); return; }
    const m = data.mutasi, items = data.items || [];
    const isPending = m.status === 'Dikirim';
    const meta = mtStatusMeta(m.status);
    const pw = window.open('', '_blank', 'width=900,height=1000');
    if (!pw) { toast('Popup diblokir browser. Izinkan popup untuk mencetak faktur.', 'err'); return; }

    const rowsHTML = items.map((it, i) => `
        <tr>
            <td class="c">${i + 1}</td>
            <td>${esc(it.kode_barang)}</td>
            <td>${esc(it.nama_barang_live || it.nama_barang)}</td>
            <td class="c">${esc(it.satuan || '-')}</td>
            <td class="r">${mtNum(it.qty_kirim)}</td>
            ${!isPending ? `<td class="r">${mtNum(it.qty_diterima)}</td><td class="c">${Number(it.selisih||0) === 0 ? '✓' : (Number(it.selisih) > 0 ? '+'+mtNum(it.selisih) : mtNum(it.selisih))}</td>` : ''}
            <td>${esc(it.keterangan || '-')}</td>
        </tr>`).join('');

    pw.document.write(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>Faktur Mutasi - ${m.no_ref}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
<style>
  @page { size: A4; margin: 14mm; }
  * { box-sizing: border-box; }
  html, body { background:#e9ebef; margin:0; padding:0; font-family:'Plus Jakarta Sans', Arial, sans-serif; color:#111; }
  .toolbar { position: sticky; top:0; z-index:10; display:flex; gap:8px; justify-content:center; padding:12px; background:#1f2430; box-shadow:0 2px 8px rgba(0,0,0,.25); }
  .toolbar button { cursor:pointer; border:none; border-radius:8px; padding:11px 18px; font-size:13px; font-weight:700; }
  .btn-print { background:#3b82f6; color:#fff; } .btn-pdf { background:#16a34a; color:#fff; } .btn-pdf[disabled]{opacity:.6;cursor:wait;}
  .sheet-wrap { display:flex; justify-content:center; padding:24px 10px 40px; }
  #faktur { width:210mm; min-height:280mm; background:#fff; padding:16mm; box-shadow:0 6px 22px rgba(0,0,0,.18); }
  .fhead { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid #111; padding-bottom:14px; margin-bottom:18px; }
  .fhead .brand { font-size:22px; font-weight:800; letter-spacing:.5px; }
  .fhead .tag { font-size:11px; color:#555; letter-spacing:1px; margin-top:2px; }
  .fhead .doctitle { text-align:right; font-size:18px; font-weight:800; letter-spacing:1px; }
  .fhead .noref { text-align:right; font-size:13px; color:#555; margin-top:4px; }
  .status-chip { display:inline-block; margin-top:6px; padding:4px 12px; border-radius:99px; font-size:11px; font-weight:700; background:#eee; }
  .info-grid { display:grid; grid-template-columns: repeat(2,1fr); gap:10px 30px; margin-bottom:20px; font-size:13px; }
  .info-grid .dl { font-size:10.5px; text-transform:uppercase; letter-spacing:.05em; color:#777; font-weight:700; }
  .info-grid .dv { font-weight:700; margin-top:2px; }
  table.items { width:100%; border-collapse:collapse; font-size:12.5px; margin-bottom:22px; }
  table.items th, table.items td { border:1px solid #ccc; padding:7px 9px; }
  table.items th { background:#f2f2ee; text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.03em; }
  table.items td.c, table.items th.c { text-align:center; } table.items td.r, table.items th.r { text-align:right; }
  .ttd-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:40px; margin-top:50px; text-align:center; font-size:12.5px; }
  .ttd-grid .box-line { margin-top:60px; border-top:1px solid #333; padding-top:6px; font-weight:700; }
  .catatan { margin-top:14px; font-size:12px; color:#333; }
  .footnote { margin-top:26px; font-size:10.5px; color:#888; text-align:center; }
  @media print {
    .toolbar{display:none !important;} html,body{background:#fff;} .sheet-wrap{padding:0;} #faktur{box-shadow:none;}
  }
</style></head><body>
  <div class="toolbar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Cetak Langsung</button>
    <button class="btn-pdf" id="btnPdf">⬇️ Simpan PDF</button>
  </div>
  <div class="sheet-wrap"><div id="faktur">
    <div class="fhead">
        <div><div class="brand">${esc(STATE.namaToko || 'TOKO SUMINI')}</div><div class="tag">SISTEM AKUNTANSI MULTI-CABANG</div></div>
        <div><div class="doctitle">FAKTUR MUTASI BARANG</div><div class="noref">No. ${esc(m.no_ref)}</div><div class="status-chip">${meta.icon} ${esc(meta.label)}</div></div>
    </div>
    <div class="info-grid">
        <div><div class="dl">Tanggal</div><div class="dv">${mtTglPanjang(m.tgl)}</div></div>
        <div><div class="dl">Dikirim Oleh</div><div class="dv">${esc(m.dikirim_oleh || '-')}</div></div>
        <div><div class="dl">Cabang Asal</div><div class="dv">${esc(m.dari_cabang)}</div></div>
        <div><div class="dl">Cabang Tujuan</div><div class="dv">${esc(m.ke_cabang)}</div></div>
        ${m.diterima_oleh ? `<div><div class="dl">Diterima / Diperiksa Oleh</div><div class="dv">${esc(m.diterima_oleh)}</div></div>` : ''}
        ${m.waktu_terima ? `<div><div class="dl">Waktu Konfirmasi</div><div class="dv">${new Date(m.waktu_terima).toLocaleString('id-ID')}</div></div>` : ''}
    </div>
    <table class="items">
        <thead><tr>
            <th class="c">No</th><th>Kode</th><th>Nama Barang</th><th class="c">Satuan</th><th class="r">Qty Kirim</th>
            ${!isPending ? '<th class="r">Qty Diterima</th><th class="c">Selisih</th>' : ''}
            <th>Keterangan</th>
        </tr></thead>
        <tbody>${rowsHTML}</tbody>
    </table>
    ${m.keterangan ? `<div class="catatan"><strong>Catatan:</strong> ${esc(m.keterangan)}</div>` : ''}
    ${m.catatan_terima ? `<div class="catatan"><strong>Catatan Penerima:</strong> ${esc(m.catatan_terima)}</div>` : ''}
    <div class="ttd-grid">
        <div>Diserahkan oleh (${esc(m.dari_cabang)})<div class="box-line">${esc(m.dikirim_oleh || '')}</div></div>
        <div>Diterima oleh (${esc(m.ke_cabang)})<div class="box-line">${esc(m.diterima_oleh || '')}</div></div>
    </div>
    <div class="footnote">Dicetak ${new Date().toLocaleString('id-ID')} — dokumen ini sah tanpa tanda tangan basah selama kode mutasi dapat diverifikasi di sistem.</div>
  </div></div>
  <script>
    document.getElementById('btnPdf').onclick = function () {
      const btn = this; btn.disabled = true; btn.textContent = '⏳ Menyiapkan…';
      const el = document.getElementById('faktur');
      html2pdf().set({
        margin: 0, filename: 'Faktur-Mutasi-${m.no_ref}.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2.5, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      }).from(el).save().then(() => { btn.disabled = false; btn.innerHTML = '⬇️ Simpan PDF'; })
        .catch(() => { btn.disabled = false; btn.innerHTML = '⬇️ Simpan PDF'; alert('Gagal membuat PDF, coba lagi.'); });
    };
  <\/script>
</body></html>`);
    pw.document.close();
};
