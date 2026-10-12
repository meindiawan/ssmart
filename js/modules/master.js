/* =============================================================
   master.js — CRUD Data Master
   Cabang, COA, Barang, Jasa, Pelanggan, Barang Kadaluarsa
   ============================================================= */

/* ── CABANG ───────────────────────────────────────────────── */
async function renderCabang() {
    const el = document.getElementById('ms-cabang');
    el.innerHTML = loadingHTML;
    const list = STATE.cabang;

    el.innerHTML = `
    <div class="row2">
        <div class="box">
            <div class="box-hd"><h3>Tambah Cabang Baru</h3></div>
            <div class="box-bd">
                <form id="fCabang">
                    <div class="fgrid">
                        <div class="fgroup">
                            <label class="flabel">Nama Cabang</label>
                            <input class="finput" id="cbNama" required placeholder="Contoh: Cabang Kudus">
                        </div>
                        <div class="fgroup">
                            <label class="flabel">Alamat</label>
                            <input class="finput" id="cbAlamat" placeholder="Opsional">
                        </div>
                        <div class="fgroup">
                            <label class="flabel">No. Telepon</label>
                            <input class="finput" id="cbTelp" placeholder="Opsional">
                        </div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Cabang</button>
                </form>
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Daftar Cabang</h3>
                <div class="meta">${list.length} cabang terdaftar</div>
            </div>
            <div class="box-bd pad0">
                ${list.length
                    ? `<table><thead><tr><th>Nama</th><th>Alamat</th><th>Telepon</th><th></th></tr></thead><tbody>
                        ${list.map(c => `<tr class="row-click" ondblclick="editCabang(${c.id},'${esc(c.nama)}','${esc(c.alamat||'')}','${esc(c.telp||'')}')" title="Klik 2x untuk edit">
                            <td><strong>${esc(c.nama)}</strong></td>
                            <td>${esc(c.alamat || '–')}</td>
                            <td>${esc(c.telp || '–')}</td>
                            <td style="display:flex;gap:4px;">
                                <button class="btn btn-g btn-sm" onclick="event.stopPropagation();editCabang(${c.id},'${esc(c.nama)}','${esc(c.alamat||'')}','${esc(c.telp||'')}')">✏️</button>
                                <button class="row-del" onclick="event.stopPropagation();hapusCabang(${c.id})">✕</button>
                            </td>
                        </tr>`).join('')}
                    </tbody></table>`
                    : '<div class="empty"><div class="ico">🏬</div><strong>Belum ada cabang.</strong></div>'
                }
            </div>
        </div>
    </div>`;

    document.getElementById('fCabang').onsubmit = async e => {
        e.preventDefault();
        try {
            await apiPost('/master/cabang', {
                nama  : document.getElementById('cbNama').value.trim(),
                alamat: document.getElementById('cbAlamat').value.trim(),
                telp  : document.getElementById('cbTelp').value.trim(),
            });
            toast('Cabang ditambahkan');
            await loadMasterData();
            await renderCabang();
        } catch (err) { toast(err.message, 'err'); }
    };
}

window.editCabang = (id, nama, alamat, telp) => {
    openM(`
    <div class="mhd"><h3>✏️ Edit Cabang</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Nama Cabang</label>
                <input class="finput" id="eCbNama" value="${esc(nama)}" required></div>
            <div class="fgroup"><label class="flabel">Alamat</label>
                <input class="finput" id="eCbAlamat" value="${esc(alamat)}"></div>
            <div class="fgroup"><label class="flabel">No. Telepon</label>
                <input class="finput" id="eCbTelp" value="${esc(telp)}"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="saveCabang(${id})">Simpan Perubahan</button>
    </div>`);
};
window.saveCabang = async id => {
    try {
        await apiPut('/master/cabang/' + id, {
            nama  : document.getElementById('eCbNama').value.trim(),
            alamat: document.getElementById('eCbAlamat').value.trim(),
            telp  : document.getElementById('eCbTelp').value.trim(),
        });
        toast('Cabang diperbarui');
        closeM();
        await loadMasterData();
        await renderCabang();
    } catch (err) { toast(err.message, 'err'); }
};
window.hapusCabang = async id => {
    if (!(await confirmDialog('Hapus cabang ini?'))) return;
    try {
        await apiDel('/master/cabang/' + id);
        toast('Cabang dihapus', 'y');
        await loadMasterData();
        await renderCabang();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── COA ──────────────────────────────────────────────────── */
async function renderCOA() {
    const el   = document.getElementById('ms-coa');
    el.innerHTML = loadingHTML;
    const list = STATE.coa;
    const cats = ['Aset', 'Liabilitas', 'Modal', 'Pendapatan', 'Beban'];

    // Total (Rupiah) per akun — real-time dari jurnal (lihat
    // DashboardController::saldoAkun), supaya di Data Master > COA langsung
    // kelihatan saldo tiap akun tanpa harus buka Buku Besar/Neraca Saldo dulu.
    let saldoByKode = {}, totalSemua = 0;
    try {
        const cab = getCabang();
        const sal = await apiGet('/laporan/saldo-akun' + (cab ? `?cabang=${encodeURIComponent(cab)}` : ''));
        (sal.data || []).forEach(s => { saldoByKode[s.kode] = s.saldo; });
        totalSemua = sal.total_semua || 0;
    } catch (err) { /* kalau gagal, kolom saldo ditampilkan '–' saja */ }

    const rows = cats.flatMap(cat => {
        const items = list.filter(c => c.kat === cat);
        if (!items.length) return [];
        const totalKat = items.reduce((s, c) => s + (saldoByKode[c.kode] || 0), 0);
        return [
            `<tr class="coa-cat-hd"><td colspan="4">${cat}</td><td class="r" style="font-weight:700;">${R(totalKat)}</td><td></td></tr>`,
            ...items.map(c => `<tr>
                <td style="font-family:var(--F-m);font-size:12px;">${c.kode}</td>
                <td>${esc(c.nama)}</td>
                <td><span class="badge ${c.normal === 'D' ? 'badge-info' : 'badge-warn'}">${c.normal === 'D' ? 'Debit' : 'Kredit'}</span></td>
                <td>${cat === 'Aset' ? `<label class="coa-kas-toggle" title="Tampilkan sebagai pilihan Kode Kas di Kasir">
                    <input type="checkbox" ${c.is_kas ? 'checked' : ''} onchange="toggleKasCOA(${c.id}, this.checked)"> Kas/Bank
                </label>` : ''}</td>
                <td class="r" style="font-size:12px;">${saldoByKode[c.kode] !== undefined ? R(saldoByKode[c.kode]) : '–'}</td>
                <td>${c.is_default
                    ? '<span style="font-size:11px;color:var(--ink3);">standar</span>'
                    : `<button class="row-del" onclick="hapusCOA(${c.id})">✕</button>`
                }</td>
            </tr>`),
        ];
    }).join('');

    el.innerHTML = `
    <div class="note note-b"><span class="note-ico">ℹ️</span>
        <span>22 akun standar sudah tersedia dan tidak bisa dihapus. Tambah akun biaya khusus sesuai kebutuhan. Centang <strong>Kas/Bank</strong> pada akun bertipe Aset supaya akun tsb muncul sebagai pilihan <strong>Kode Kas</strong> di Kasir Penjualan/Pembelian — ini penting supaya saldo per-akun (mis. Kas Toko A vs Kas Toko B) dan perhitungan modal tetap akurat.</span>
    </div>
    <div class="row2">
        <div class="box">
            <div class="box-hd"><h3>Tambah Akun Baru</h3>
                <button class="btn btn-g btn-sm" onclick="bukaImportMaster('coa')">📥 Import Excel</button>
            </div>
            <div class="box-bd">
                <form id="fCOA">
                    <div class="fgrid">
                        <div class="fgroup">
                            <label class="flabel">Kode Akun</label>
                            <input class="finput" id="coaKode" required placeholder="6106">
                        </div>
                        <div class="fgroup">
                            <label class="flabel">Nama Akun</label>
                            <input class="finput" id="coaNama" required placeholder="Kas Toko Cabang B">
                        </div>
                        <div class="fgroup">
                            <label class="flabel">Kategori</label>
                            <select class="fselect" id="coaKat" onchange="document.getElementById('coaKasWrap').style.display = this.value==='Aset' ? 'flex' : 'none';">
                                <option>Aset</option><option>Liabilitas</option>
                                <option>Modal</option><option>Pendapatan</option>
                                <option selected>Beban</option>
                            </select>
                        </div>
                        <div class="fgroup" id="coaKasWrap" style="display:none;align-items:center;">
                            <label class="coa-kas-toggle" style="margin-top:22px;">
                                <input type="checkbox" id="coaIsKas"> Jadikan pilihan Kode Kas di Kasir
                            </label>
                        </div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Akun</button>
                </form>
            </div>
        </div>
        <div class="box" style="overflow:hidden;">
            <div class="box-hd">
                <h3>Daftar Akun (COA)</h3>
                <div class="meta">${list.length} akun · Total semua akun: <strong>${R(totalSemua)}</strong></div>
            </div>
            <div class="box-bd pad0 tscroll" style="max-height:440px;overflow-y:auto;">
                <table><thead><tr><th>Kode</th><th>Nama Akun</th><th>Normal</th><th>Kode Kas</th><th class="r">Total (Rp)</th><th></th></tr></thead>
                <tbody>${rows}</tbody></table>
            </div>
        </div>
    </div>`;

    document.getElementById('fCOA').onsubmit = async e => {
        e.preventDefault();
        try {
            await apiPost('/master/coa', {
                kode  : document.getElementById('coaKode').value.trim(),
                nama  : document.getElementById('coaNama').value.trim(),
                kat   : document.getElementById('coaKat').value,
                is_kas: document.getElementById('coaKat').value === 'Aset' && document.getElementById('coaIsKas').checked,
            });
            toast('Akun ditambahkan');
            await loadMasterData();
            await renderCOA();
        } catch (err) { toast(err.message, 'err'); }
    };
}
window.toggleKasCOA = async (id, checked) => {
    try {
        await apiPut('/master/coa/' + id, { is_kas: checked });
        toast(checked ? 'Akun ditandai sebagai Kas/Bank' : 'Akun dilepas dari daftar Kas/Bank', 'ok');
        await loadMasterData();
    } catch (err) { toast(err.message, 'err'); await renderCOA(); }
};
window.hapusCOA = async id => {
    if (!(await confirmDialog('Hapus akun ini?'))) return;
    try {
        await apiDel('/master/coa/' + id);
        toast('Akun dihapus', 'y');
        await loadMasterData();
        await renderCOA();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── BARANG ───────────────────────────────────────────────── */
window._barangPage    = 1;
window._barangSearch  = '';
window._barangPerPage = 50;

async function renderBarang(page = 1) {
    window._barangPage = page;
    const el = document.getElementById('ms-barang');
    el.innerHTML = loadingHTML;
    try {
        const search  = window._barangSearch || '';
        const perPage = window._barangPerPage || 50;
        const cabang  = window._barangCabang || '';
        const res  = await apiGet(`/master/barang?page=${page}&per_page=${perPage}${search ? '&search='+encodeURIComponent(search) : ''}${cabang ? '&cabang='+encodeURIComponent(cabang) : ''}`);
        const list = res.data || [];
        const meta = res.meta || {};

        el.innerHTML = `
        <div class="note note-b"><span class="note-ico">ℹ️</span>
            <span>Status PPN menentukan pemecahan DPP & PPN. Setiap barang punya <strong>3 tingkat harga jual</strong>: HGA TOKO (ecer), HRG PARTAI (grosir), HRG CABANG. Import Excel mendukung format ekspor dari sistem kasir (kolom KODE_BARANG, NAMA, HARGA_TOKO_1, HARGA_PARTAI_1, HARGA_CABANG_1, dll).</span>
        </div>
        ${cabang ? `<div class="note note-b"><span class="note-ico">🏬</span>
            <span>Menampilkan <strong>Master Barang cabang ${esc(cabang)}</strong>: hanya barang yang terdaftar/punya stok di cabang ini, dengan <strong>harga jual khusus cabang ini</strong> (kosong = ikut harga standar). Pilih "Semua Cabang" untuk melihat katalog gabungan. Untuk mengisi daftar barang cabang ini, pakai <strong>Import Excel</strong> dengan Cabang Tujuan = ${esc(cabang)}.</span></div>` : ''}
        <div class="box">
            <div class="box-hd">
                <h3>Tambah Barang${cabang ? ' — ' + esc(cabang) : ''}</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap;">
                    <button class="btn btn-g btn-sm" onclick="bukaImportBarang()">📥 Import Excel</button>
                    <button class="btn btn-g btn-sm" onclick="exportExcel('tblBarang','master-barang')">📊 Export Excel</button>
                    <button class="btn btn-d btn-sm" onclick="bukaHapusSemuaBarang()">🗑️ Hapus Semua Barang</button>
                </div>
            </div>
            <div class="box-bd">
                <form id="fBarang">
                    <div class="itab" id="brTabs">
                        <div class="itab-nav">
                            <button type="button" class="on" data-tab="umum" onclick="switchItab('brTabs','umum')"><span class="itab-step">1</span> Data Umum</button>
                            <button type="button" data-tab="harga" onclick="switchItab('brTabs','harga')"><span class="itab-step">2</span> Satuan & Harga Jual</button>
                            <button type="button" data-tab="stok" onclick="switchItab('brTabs','stok')"><span class="itab-step">3</span> Stok Awal</button>
                        </div>
                        <div class="itab-panel">
                            <div class="itab-page on" id="brTabs-umum">
                                <div class="fgrid">
                                    <div class="fgroup"><label class="flabel">Kode Barang *</label><input class="finput" id="brK" required></div>
                                    <div class="fgroup"><label class="flabel">Nama Barang *</label><input class="finput" id="brN" required></div>
                                    <div class="fgroup">
                                        <label class="flabel">Status PPN *</label>
                                        <select class="fselect" id="brP"><option>Kena PPN</option><option>Non-PPN</option></select>
                                    </div>
                                    <div class="fgroup"><label class="flabel">Kategori</label><input class="finput" id="brKat" placeholder="Contoh: ROKOK"></div>
                                    <div class="fgroup"><label class="flabel">Sub Kategori</label><input class="finput" id="brSubKat" placeholder="Opsional"></div>
                                    <div class="fgroup"><label class="flabel">Supplier</label><input class="finput" id="brSup" placeholder="Opsional"></div>
                                </div>
                            </div>
                            <div class="itab-page" id="brTabs-harga">
                                <div class="fgrid col2">
                                    <div class="fgroup"><label class="flabel">Satuan Dasar *</label>
                                        <input class="finput" id="brSatuanDasar" value="PCS" required placeholder="Contoh: PCS">
                                        <span class="fhint">Satuan terkecil untuk jual eceran</span></div>
                                    <div class="fgroup"><label class="flabel">Barcode Satuan Dasar</label>
                                        <input class="finput" id="brBC" placeholder="Opsional"></div>
                                </div>
                                <label class="unit-toggle">
                                    <input type="checkbox" id="brPunyaSatuan2" onchange="document.getElementById('brSatuan2Box').classList.toggle('on', this.checked)">
                                    Barang ini juga dijual dalam satuan besar (mis. DUS / KARTON / LUSIN)?
                                </label>
                                <div class="fgrid col2 unit-extra" id="brSatuan2Box">
                                    <div class="fgroup"><label class="flabel">Nama Satuan Besar</label>
                                        <input class="finput" id="brSatuanBesar" placeholder="Contoh: DUS"></div>
                                    <div class="fgroup"><label class="flabel">Isi per Satuan Besar</label>
                                        <input class="finput" type="number" id="brIsi" min="1" placeholder="Contoh: 12" value="1">
                                        <span class="fhint">1 satuan besar = berapa satuan dasar</span></div>
                                    <div class="fgroup"><label class="flabel">Barcode Satuan Besar</label>
                                        <input class="finput" id="brBC2" placeholder="Opsional"></div>
                                </div>
                                <label class="unit-toggle">
                                    <input type="checkbox" id="brPunyaSatuan3" onchange="document.getElementById('brSatuan3Box').classList.toggle('on', this.checked)">
                                    Ada satuan kemasan ke-3 yang lebih besar lagi (mis. KARTON isi beberapa DUS)?
                                </label>
                                <div class="fgrid col2 unit-extra" id="brSatuan3Box">
                                    <div class="fgroup"><label class="flabel">Nama Satuan 3</label>
                                        <input class="finput" id="brSatuan3" placeholder="Contoh: KARTON"></div>
                                    <div class="fgroup"><label class="flabel">Isi per Satuan 3</label>
                                        <input class="finput" type="number" id="brIsi3" min="1" placeholder="Contoh: 144" value="1">
                                        <span class="fhint">1 Satuan 3 = berapa satuan dasar (bukan berapa Satuan Besar)</span></div>
                                    <div class="fgroup"><label class="flabel">Barcode Satuan 3</label>
                                        <input class="finput" id="brBC3" placeholder="Opsional"></div>
                                </div>
                                <div class="fgrid col2" style="margin-top:4px;">
                                    <div class="fgroup"><label class="flabel">HRG BELI — Harga Modal (Rp)</label>
                                        <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                            <input class="finput" inputmode="numeric" id="brM" placeholder="0"
                                                oninput="onMoneyInput(this); syncHargaJualDariMargin('br'); cekWarningModal()"></div>
                                        <span class="fhint" id="brMWarn" style="display:none;color:var(--red);">⚠️ Kosongkan/isi 0 di sini akan membuat margin barang ini terhitung 100% (dianggap tanpa modal) di laporan Analisis Margin.</span>
                                    </div>
                                    <div class="fgroup"><label class="flabel">HGA TOKO — Harga Ecer (Rp)</label>
                                        <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                            <input class="finput" inputmode="numeric" id="brHJ" placeholder="0"
                                                oninput="onMoneyInput(this); syncMarginDariHargaJual('br'); cekWarningModal()"></div>
                                        <div class="fmargin-row">
                                            <label>Margin</label>
                                            <input type="number" id="brMargin" placeholder="0" oninput="syncHargaJualDariMargin('br')">
                                            <span class="pct">%</span><span class="eq">dari harga modal</span>
                                        </div>
                                    </div>
                                    <div class="fgroup"><label class="flabel">HRG PARTAI — Harga Grosir (Rp)</label>
                                        <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                            <input class="finput" inputmode="numeric" id="brHG" placeholder="0" oninput="onMoneyInput(this)"></div></div>
                                    <div class="fgroup"><label class="flabel">HRG CABANG (Rp)</label>
                                        <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                            <input class="finput" inputmode="numeric" id="brHC" placeholder="0" oninput="onMoneyInput(this)"></div>
                                        <span class="fhint">Harga khusus dipakai untuk transaksi antar/oleh cabang</span></div>
                                </div>
                            </div>
                            <div class="itab-page" id="brTabs-stok">
                                <div class="note note-b">
                                    <span class="note-ico">📦</span>
                                    <span><strong>Stok Awal (opsional)</strong> — isi kalau barang ini sudah punya stok fisik sekarang
                                    (mis. hasil stok opname / migrasi dari toko lama) dan mau langsung dicatat sebagai saldo pembukaan,
                                    <u>tanpa</u> membuat transaksi Pembelian.</span>
                                </div>
                                <div class="fgrid col2">
                                    <div class="fgroup"><label class="flabel">Cabang untuk Stok Awal</label>
                                        <select class="fselect" id="brStokCab"><option value="">– Tidak diisi –</option>${cabangOpts()}</select>
                                    </div>
                                    <div class="fgroup"><label class="flabel">Jumlah Stok Awal</label>
                                        <input class="finput" type="number" id="brStokQty" min="0" step="0.01" placeholder="0">
                                        <span class="fhint">Pastikan Harga Modal di tab "Satuan & Harga Jual" juga sudah diisi supaya nilai stok & margin akurat.</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <button class="btn btn-p" type="submit" style="margin-top:16px;">+ Simpan Barang</button>
                </form>
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Daftar Barang</h3>
                <div class="meta">${meta.total || list.length} item</div>
            </div>
            <div class="box-bd">
                <div style="display:flex;gap:8px;margin-bottom:12px;align-items:center;flex-wrap:wrap;">
                    <input class="finput" id="srchBarang" placeholder="🔍 Cari kode, barcode, atau nama barang…"
                        value="${esc(search)}" style="flex:1;min-width:200px;max-width:380px;"
                        oninput="smartSearch('srchBarang', this.value, v => { window._barangSearch = v; window._barangPage = 1; }, () => renderBarang(1))">
                    ${search ? `<button class="btn btn-g btn-sm" onclick="clearSearchBarang()">✕ Reset</button>` : ''}
                    <label style="font-size:12px;color:var(--ink3);display:flex;align-items:center;gap:6px;">
                        Cabang:
                        <select class="fselect" style="width:160px;" onchange="setBarangCabang(this.value)">
                            <option value="">Semua Cabang (total)</option>
                            ${(STATE.cabang || []).map(c => `<option value="${esc(c.nama)}" ${c.nama === cabang ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}
                        </select>
                    </label>
                    <label style="font-size:12px;color:var(--ink3);display:flex;align-items:center;gap:6px;margin-left:auto;">
                        Tampilkan:
                        <select class="fselect" style="width:80px;" onchange="setBarangPerPage(this.value)">
                            ${[25,50,100,200,500].map(n => `<option value="${n}" ${perPage==n?'selected':''}>${n}</option>`).join('')}
                            <option value="99999" ${perPage==99999?'selected':''}>Semua</option>
                        </select>
                        per halaman
                    </label>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblBarang">
                    <thead><tr>
                        <th>Kode</th><th>Barcode</th><th>Nama Barang</th><th>Kategori</th>
                        <th>PPN</th><th>Satuan</th><th class="r">HRG BELI</th><th class="r">HGA TOKO</th>
                        <th class="r">HRG PARTAI</th><th class="r">HRG CABANG</th>
                        <th class="r">Stok ${cabang ? `(${esc(cabang)})` : '(Semua Cabang)'}</th><th></th>
                    </tr></thead>
                    <tbody>${list.map(b => {
                        const stok = Number(b.stok_total || 0);
                        const stokRendah = b.stok_min > 0 && stok <= b.stok_min;
                        const unitRows = buildUnitRows(b);
                        return unitRows.map((u, idx) => `
                        <tr class="row-click ${idx === 0 ? 'grp-first' : 'grp-rest'}" onclick="lihatKartuHpp('${esc(b.kode)}')" ondblclick="editBarang(${b.id})" title="Klik untuk lihat Kartu HPP (riwayat masuk/keluar & rata-rata harga) · Klik 2x untuk edit">
                        <td style="font-family:var(--F-m);font-size:11px;${idx > 0 ? 'color:var(--ink3);' : ''}">${esc(b.kode)}</td>
                        <td style="font-family:var(--F-m);font-size:11px;">${esc(u.barcode || '–')}</td>
                        <td${idx > 0 ? ' style="color:var(--ink3);"' : ''}>${esc(b.nama)}</td>
                        <td><span style="font-size:11px;color:var(--ink3);">${esc(b.kategori || '–')}</span></td>
                        <td><span class="badge ${b.ppn === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}">
                            <span class="dot"></span>${b.ppn}
                        </span></td>
                        <td style="font-size:11px;font-weight:700;">${esc(u.satuan)}</td>
                        <td class="r" title="HPP rata-rata berjalan (Kartu HPP) — klik baris untuk lihat riwayatnya">${u.modal ? R(u.modal) : '–'}</td>
                        <td class="r">${u.hargaJual ? R(u.hargaJual) + (u.hargaAuto ? ' *' : '') : '–'}</td>
                        <td class="r">${idx === 0 ? (b.harga_grosir ? R(b.harga_grosir) : '–') : ''}</td>
                        <td class="r">${idx === 0 ? (b.harga_cabang ? R(b.harga_cabang) : '–') : ''}</td>
                        <td class="r">
                            ${u.noConv
                                ? `<span class="stok-sub" title="Belum ada faktor konversi (Isi) untuk satuan ini">– (blm ada konversi)</span>`
                                : `<span class="badge ${stokRendah ? 'badge-noppn' : 'badge-ppn'}" title="${stokRendah ? 'Stok di bawah/samadengan stok minimum' : 'Stok aman'} — ${cabang ? esc(cabang) : 'gabungan semua cabang'}">
                                    ${Number(u.qty).toLocaleString('id-ID')} ${esc(u.satuan)}
                                </span>`}
                        </td>
                        <td style="display:flex;gap:4px;">
                            ${idx === 0 ? `
                            <button class="btn btn-g btn-sm" onclick="event.stopPropagation();editBarang(${b.id})">✏️</button>
                            <button class="row-del" onclick="event.stopPropagation();hapusBarang(${b.id})">✕</button>
                            ` : ''}
                        </td>
                    </tr>`).join('');
                    }).join('')}</tbody>
                </table>
                <div class="stok-sub" style="padding:8px 14px;">* HGA TOKO dihitung otomatis dari harga × Isi karena field <strong>HRG PARTAI</strong> belum diisi manual untuk barang ini — edit barang untuk mengoreksi harga per satuan besar yang sebenarnya.</div>
                ${paginationHTML(meta, 'renderBarang')}`
                : `<div class="empty"><div class="ico">📦</div><strong>${search ? 'Barang tidak ditemukan untuk pencarian "'+esc(search)+'".' : 'Belum ada barang.'}</strong></div>`}
            </div>
        </div>`;

        document.getElementById('fBarang').onsubmit = async e => {
            e.preventDefault();
            const punyaSatuan2 = document.getElementById('brPunyaSatuan2').checked;
            const satuanBesar  = document.getElementById('brSatuanBesar').value.trim();
            const punyaSatuan3 = document.getElementById('brPunyaSatuan3').checked;
            const satuan3      = document.getElementById('brSatuan3').value.trim();
            const stokCab = document.getElementById('brStokCab').value;
            const stokQty = document.getElementById('brStokQty').value;
            try {
                await apiPost('/master/barang', {
                    kode        : document.getElementById('brK').value.trim(),
                    nama        : document.getElementById('brN').value.trim(),
                    barcode     : document.getElementById('brBC').value.trim() || null,
                    barcode2    : (punyaSatuan2 && satuanBesar) ? (document.getElementById('brBC2').value.trim() || null) : null,
                    barcode3    : (punyaSatuan3 && satuan3) ? (document.getElementById('brBC3').value.trim() || null) : null,
                    kategori    : document.getElementById('brKat').value.trim() || null,
                    sub_kategori: document.getElementById('brSubKat').value.trim() || null,
                    supplier    : document.getElementById('brSup').value.trim() || null,
                    ppn         : document.getElementById('brP').value,
                    satuan1     : document.getElementById('brSatuanDasar').value.trim() || 'PCS',
                    satuan2     : (punyaSatuan2 && satuanBesar) ? satuanBesar : null,
                    isi         : (punyaSatuan2 && satuanBesar) ? (Number(document.getElementById('brIsi').value) || 1) : 1,
                    satuan3     : (punyaSatuan3 && satuan3) ? satuan3 : null,
                    isi3        : (punyaSatuan3 && satuan3) ? (Number(document.getElementById('brIsi3').value) || 1) : 1,
                    modal       : parseRibuan(document.getElementById('brM').value),
                    harga_jual  : parseRibuan(document.getElementById('brHJ').value),
                    harga_grosir: parseRibuan(document.getElementById('brHG').value),
                    harga_cabang: parseRibuan(document.getElementById('brHC').value),
                    stok_awal        : (stokCab && stokQty !== '') ? Number(stokQty) : null,
                    stok_awal_cabang : stokCab || null,
                    cabang           : window._barangCabang || null, // difilter per cabang → daftarkan barang baru ke cabang itu
                });
                toast('Barang ditambahkan' + (stokCab && stokQty !== '' ? ` beserta stok awal ${stokQty} di ${stokCab}` : ''));
                await loadMasterData();
                await renderBarang(window._barangPage);
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}
window.renderBarang = renderBarang;

/** Tampilkan peringatan kalau Harga Jual diisi tapi Harga Modal masih kosong/0 —
 *  ini penyebab paling umum margin barang muncul 100% di laporan Analisis Margin. */
window.cekWarningModal = (prefix = 'br') => {
    const modalEl = document.getElementById(prefix + 'M');
    const hjEl    = document.getElementById(prefix + 'HJ');
    const warnEl  = document.getElementById(prefix + 'MWarn');
    if (!modalEl || !hjEl || !warnEl) return;
    const modal = parseRibuan(modalEl.value);
    const hj    = parseRibuan(hjEl.value);
    warnEl.style.display = (hj > 0 && modal <= 0) ? '' : 'none';
};

/**
 * Sinkron Harga Jual dari Harga Modal + Margin % — dipanggil saat Harga Modal
 * atau field Margin diketik. Meniru iPos: "Harga Pokok, % =, Harga Jual" saling
 * terhubung, tapi di sini persennya SELALU bilangan bulat (tanpa desimal/koma).
 * @param {string} prefix - 'br' (form Tambah Barang) atau 'eBr' (modal Edit Barang)
 */
window.syncHargaJualDariMargin = (prefix = 'br') => {
    const modalEl  = document.getElementById(prefix + 'M');
    const marginEl = document.getElementById(prefix + 'Margin');
    const hjEl     = document.getElementById(prefix + 'HJ');
    if (!modalEl || !marginEl || !hjEl) return;
    const modal  = parseRibuan(modalEl.value);
    const margin = marginEl.value === '' ? null : (Number(marginEl.value) || 0);
    // Kalau margin belum pernah diisi user, jangan timpa Harga Jual yang sudah diketik manual.
    if (margin === null || modal <= 0) return;
    hjEl.value = fmtRibuan(Math.round(modal * (1 + margin / 100)));
};

/**
 * Sinkron Margin % dari Harga Modal + Harga Jual — dipanggil saat Harga Jual diketik.
 * @param {string} prefix - 'br' atau 'eBr'
 */
window.syncMarginDariHargaJual = (prefix = 'br') => {
    const modalEl  = document.getElementById(prefix + 'M');
    const marginEl = document.getElementById(prefix + 'Margin');
    const hjEl     = document.getElementById(prefix + 'HJ');
    if (!modalEl || !marginEl || !hjEl) return;
    const modal = parseRibuan(modalEl.value);
    const hj    = parseRibuan(hjEl.value);
    marginEl.value = (modal > 0 && hj > 0) ? Math.round((hj - modal) / modal * 100) : '';
};

window.setBarangPerPage = val => {
    window._barangPerPage = Number(val);
    window._barangPage    = 1;
    renderBarang(1);
};

window.setBarangCabang = val => {
    window._barangCabang = val;
    window._barangPage   = 1;
    renderBarang(1);
};

window.clearSearchBarang = () => {
    window._barangSearch = '';
    window._barangPage   = 1;
    renderBarang(1);
};

/* ── KARTU HPP — riwayat barang masuk/keluar & rata-rata harga ──────────
   Dipanggil saat 1 baris Master Barang diklik. Datanya dari Kartu HPP
   (App\Services\HppService di backend) — rata-rata bergerak PER CABANG
   dari riwayat Pembelian/Penjualan/Barang Masuk-Keluar/Retur/Mutasi/Opname
   yang SUDAH ADA, bukan angka Harga Modal manual. Setiap baris tercatat
   dengan harga saat itu, jadi kelihatan jelas kenapa HPP-nya jadi segitu. */
window.lihatKartuHpp = async (kode) => {
    openM(`<div class="mhd"><h3>📇 Kartu HPP — ${esc(kode)}</h3><button class="mclose" onclick="closeM()">×</button></div>
        <div class="mbd">${loadingHTML}</div>
        <div class="mft"><button class="btn btn-g" onclick="closeM()">Tutup</button></div>`);

    try {
        const res = await apiGet(`/master/barang/${encodeURIComponent(kode)}/kartu-hpp`);
        const mbd = document.querySelector('#mbox .mbd');

        if (!res.ada_riwayat) {
            mbd.innerHTML = `
            <div style="margin-bottom:10px;"><strong>${esc(res.nama_barang)}</strong> <span style="color:var(--ink3);font-size:12px;">(${esc(res.satuan)})</span></div>
            <div class="note note-y"><span>ℹ️</span><span>Belum ada riwayat barang masuk/keluar untuk barang ini di Kartu HPP — HPP belum bisa dihitung dari riwayat transaksi. Kalau barang ini sebenarnya SUDAH punya transaksi lama, jalankan <code>php artisan hpp:rebuild</code> di server sekali untuk membangun ulang Kartu HPP dari data historis.</span></div>`;
            return;
        }

        const perCabangRows = (res.per_cabang || []).map(c => `
            <tr>
                <td>${esc(c.cabang)}</td>
                <td class="r">${Number(c.qty).toLocaleString('id-ID')} ${esc(res.satuan)}</td>
                <td class="r">${R(c.nilai)}</td>
                <td class="r" style="font-weight:700;">${R(c.hpp)}</td>
            </tr>`).join('');

        const riwayatRows = (res.riwayat || []).map(r => {
            const masuk  = Number(r.qty_masuk)  > 0;
            const keluar = Number(r.qty_keluar) > 0;
            return `<tr>
                <td>${fmtTgl(r.tgl)}</td>
                <td><span class="badge ${masuk ? 'badge-ppn' : 'badge-noppn'}" style="font-size:10px;">${esc(r.tipe)}</span></td>
                <td style="font-size:11px;color:var(--ink3);">${esc(r.cabang)}</td>
                <td style="font-family:var(--F-m);font-size:11px;">${r.ref
                    ? `<span class="link-barang" onclick="bukaRiwayatNota('${esc(r.ref_tabel || '')}','${esc(r.ref)}','${esc(kode)}')" title="Klik untuk membuka riwayat nota ${esc(r.ref)}">${esc(r.ref)}</span>`
                    : '–'}</td>
                <td style="font-size:11px;color:var(--ink2);">${esc(r.keterangan || '–')}</td>
                <td class="r laba-pos">${masuk ? `${Number(r.qty_masuk).toLocaleString('id-ID')} @ ${R(r.harga_masuk)}` : ''}</td>
                <td class="r laba-neg">${keluar ? `${Number(r.qty_keluar).toLocaleString('id-ID')} @ ${R(r.hpp_satuan)}` : ''}</td>
                <td class="r" style="font-weight:600;">${Number(r.saldo_qty).toLocaleString('id-ID')}</td>
                <td class="r" style="font-weight:700;">${R(r.saldo_hpp)}</td>
            </tr>`;
        }).join('');

        mbd.innerHTML = `
            <div style="margin-bottom:12px;display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;">
                <div><strong>${esc(res.nama_barang)}</strong> <span style="color:var(--ink3);font-size:12px;">(${esc(res.satuan)})</span></div>
                <div style="text-align:right;">
                    <div style="font-size:11px;color:var(--ink3);">HPP rata-rata gabungan semua cabang saat ini</div>
                    <div style="font-size:20px;font-weight:800;">${R(res.hpp_rata2_global)}</div>
                    <div style="font-size:11px;color:var(--ink3);">Stok ${Number(res.qty_global).toLocaleString('id-ID')} ${esc(res.satuan)} · Nilai persediaan ${R(res.nilai_global)}</div>
                </div>
            </div>

            <div class="note note-b" style="margin-bottom:12px;">
                <span class="note-ico">ℹ️</span>
                <span>HPP dihitung dari <strong>riwayat barang masuk & keluar asli</strong> (bukan Harga Modal manual di Master). Barang masuk dengan harga naik/turun otomatis di-rata-rata; barang keluar memakai HPP rata-rata yang berlaku SAAT itu — persis nilai yang dipakai di Jurnal & Laba Rugi.</span>
            </div>

            ${perCabangRows ? `
            <h4 style="margin:0 0 6px;font-size:13px;">HPP per Cabang</h4>
            <table style="width:100%;margin-bottom:16px;">
                <thead><tr><th>Cabang</th><th class="r">Stok</th><th class="r">Nilai Persediaan</th><th class="r">HPP/Satuan</th></tr></thead>
                <tbody>${perCabangRows}</tbody>
            </table>` : ''}

            <h4 style="margin:0 0 6px;font-size:13px;">Riwayat Masuk / Keluar (terbaru dulu)</h4>
            <div class="tscroll" style="max-height:360px;">
            <table style="width:100%;">
                <thead><tr>
                    <th>Tanggal</th><th>Tipe</th><th>Cabang</th><th>Referensi</th><th>Keterangan</th>
                    <th class="r">Masuk</th><th class="r">Keluar</th><th class="r">Saldo Qty</th><th class="r">HPP Saldo</th>
                </tr></thead>
                <tbody>${riwayatRows || '<tr><td colspan="9" style="text-align:center;color:var(--ink3);padding:16px;">Tidak ada riwayat.</td></tr>'}</tbody>
            </table>
            </div>`;
    } catch (err) {
        const mbd = document.querySelector('#mbox .mbd');
        if (mbd) mbd.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};

/* ── BUKA RIWAYAT NOTA dari Kartu HPP ────────────────────────────────────
   Dipanggil saat No. Referensi di tabel "Riwayat Masuk / Keluar" diklik.
   Menutup modal Kartu HPP lalu membawa user ke halaman riwayat yang sesuai
   jenis transaksinya, sudah terfilter ke nota itu:
     trx_beli            → Transaksi › Pembelian   (kotak cari = no. nota)
     trx_jual            → Transaksi › Penjualan   (kotak cari = no. nota)
     trx_retur           → Transaksi › Retur
     barang_masuk        → Stok › Barang Masuk     (cari no. dokumen)
     barang_keluar       → Stok › Barang Keluar    (cari kode barang)
     trx_mutasi          → Transaksi › Mutasi
     mutasi_kirim_detail → popup detail Mutasi (no. ref)
     stok_opname_detail  → Stok › Opname, langsung ke detail SO-nya        */
window.bukaRiwayatNota = async (refTabel, ref, kode) => {
    closeM();
    const goto = async (tab, prefix, sub) => {
        await setTab(tab);
        await setSubTab(prefix, sub);
    };
    try {
        switch (refTabel) {
            case 'trx_beli':
            case 'trx_jual': {
                const jenis = refTabel === 'trx_beli' ? 'beli' : 'jual';
                // Reset filter tanggal/preset supaya nota lama pun pasti kelihatan
                window._trxFilter = window._trxFilter || {};
                window._trxFilter[jenis] = { preset: 'semua', dari: '', sampai: '', perPage: 30, search: ref };
                await goto('transaksi', 'tx', jenis);
                break;
            }
            case 'trx_retur':
                await goto('transaksi', 'tx', 'retur');
                break;
            case 'trx_mutasi':
                await goto('transaksi', 'tx', 'mutasi');
                break;
            case 'mutasi_kirim_detail':
                await openMutasiDetail(ref);
                break;
            case 'barang_masuk':
                // Kalau no. dokumen kosong, ref cuma "BM-<id>" (buatan sistem) → cari pakai kode barang.
                window._bmSearch = /^BM-\d+$/.test(ref) ? kode : ref;
                await goto('stok', 'stok', 'masuk');
                break;
            case 'barang_keluar':
                window._bkSearch = kode;
                await goto('stok', 'stok', 'keluar');
                break;
            case 'stok_opname_detail': {
                const id = parseInt(String(ref).replace(/^SO-/, ''), 10);
                window._soAktif = Number.isFinite(id) ? id : null;
                await goto('stok', 'stok', 'opname');
                break;
            }
            default:
                toast('Jenis nota ini belum punya halaman riwayat', 'y');
        }
    } catch (err) { toast(err.message, 'err'); }
};

window.editBarang = async id => {
    // Ambil data barang dari list yang sudah ada, atau fetch ulang.
    // Pakai /barang/all (tanpa paginasi) — sebelumnya pakai per_page=1000
    // yang cuma ambil 1000 barang pertama alfabetis, jadi barang yang
    // urutan namanya jatuh di luar 1000 pertama (total barang sekarang
    // 15.000+) gagal ketemu meskipun barangnya jelas ada.
    let b = null;
    try {
        const cabEdit = window._barangCabang || '';
        const list = await apiGet('/master/barang/all' + (cabEdit ? '?cabang=' + encodeURIComponent(cabEdit) : ''));
        b = (Array.isArray(list) ? list : (list.data || [])).find(x => x.id === id);
    } catch(e) {}
    if (!b) { toast('Data barang tidak ditemukan', 'err'); return; }

    // Saldo stok per cabang barang ini (untuk diedit sebagai stok awal/opname cepat)
    let stokRows = [];
    try {
        const sres = await apiGet(`/master/barang/${id}/stok`);
        stokRows = sres.stok || [];
    } catch (e) { /* kalau gagal, tampilkan form tanpa data stok — tetap bisa diisi manual */ }
    if (!stokRows.length) stokRows = (STATE.cabang || []).map(c => ({ cabang: c.nama, qty: 0 }));

    const punyaSatuan2 = !!(b.satuan2 && Number(b.isi) > 1);
    const punyaSatuan3 = !!(b.satuan3 && Number(b.isi3) > 1);
    const marginAwal = (b.modal > 0 && b.harga_jual > 0) ? Math.round((b.harga_jual - b.modal) / b.modal * 100) : '';

    openM(`
    <div class="mhd"><h3>✏️ Edit Data Item : ${esc(b.kode)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" style="max-height:72vh;overflow-y:auto;">
        <div class="itab" id="eBrTabs">
            <div class="itab-nav">
                <button type="button" class="on" data-tab="umum" onclick="switchItab('eBrTabs','umum')"><span class="itab-step">1</span> Data Umum</button>
                <button type="button" data-tab="harga" onclick="switchItab('eBrTabs','harga')"><span class="itab-step">2</span> Satuan & Harga Jual</button>
                <button type="button" data-tab="stok" onclick="switchItab('eBrTabs','stok')"><span class="itab-step">3</span> Stok per Cabang</button>
            </div>
            <div class="itab-panel">
                <div class="itab-page on" id="eBrTabs-umum">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Kode Barang</label>
                            <input class="finput" value="${esc(b.kode)}" disabled style="opacity:.6;"></div>
                        <div class="fgroup"><label class="flabel">Nama Barang *</label>
                            <input class="finput" id="eBrN" value="${esc(b.nama)}" required></div>
                        <div class="fgroup"><label class="flabel">Status PPN *</label>
                            <select class="fselect" id="eBrP">
                                <option ${b.ppn==='Kena PPN'?'selected':''}>Kena PPN</option>
                                <option ${b.ppn==='Non-PPN'?'selected':''}>Non-PPN</option>
                            </select></div>
                        <div class="fgroup"><label class="flabel">Kategori</label>
                            <input class="finput" id="eBrKat" value="${esc(b.kategori||'')}"></div>
                        <div class="fgroup"><label class="flabel">Sub Kategori</label>
                            <input class="finput" id="eBrSubKat" value="${esc(b.sub_kategori||'')}"></div>
                        <div class="fgroup"><label class="flabel">Supplier</label>
                            <input class="finput" id="eBrSup" value="${esc(b.supplier||'')}"></div>
                    </div>
                </div>
                <div class="itab-page" id="eBrTabs-harga">
                    <div class="fgrid col2">
                        <div class="fgroup"><label class="flabel">Satuan Dasar *</label>
                            <input class="finput" id="eBrSatuanDasar" value="${esc(b.satuan1||'PCS')}" required></div>
                        <div class="fgroup"><label class="flabel">Barcode Satuan Dasar</label>
                            <input class="finput" id="eBrBC" value="${esc(b.barcode||'')}"></div>
                    </div>
                    <label class="unit-toggle">
                        <input type="checkbox" id="eBrPunyaSatuan2" ${punyaSatuan2?'checked':''} onchange="document.getElementById('eBrSatuan2Box').classList.toggle('on', this.checked)">
                        Barang ini juga dijual dalam satuan besar (mis. DUS / KARTON / LUSIN)?
                    </label>
                    <div class="fgrid col2 unit-extra ${punyaSatuan2?'on':''}" id="eBrSatuan2Box">
                        <div class="fgroup"><label class="flabel">Nama Satuan Besar</label>
                            <input class="finput" id="eBrSatuanBesar" value="${esc(b.satuan2||'')}" placeholder="Contoh: DUS"></div>
                        <div class="fgroup"><label class="flabel">Isi per Satuan Besar</label>
                            <input class="finput" type="number" id="eBrIsi" value="${b.isi||1}" min="1">
                            <span class="fhint">1 satuan besar = berapa satuan dasar</span></div>
                        <div class="fgroup"><label class="flabel">Barcode Satuan Besar</label>
                            <input class="finput" id="eBrBC2" value="${esc(b.barcode2||'')}"></div>
                    </div>
                    <label class="unit-toggle">
                        <input type="checkbox" id="eBrPunyaSatuan3" ${punyaSatuan3?'checked':''} onchange="document.getElementById('eBrSatuan3Box').classList.toggle('on', this.checked)">
                        Ada satuan kemasan ke-3 yang lebih besar lagi (mis. KARTON isi beberapa DUS)?
                    </label>
                    <div class="fgrid col2 unit-extra ${punyaSatuan3?'on':''}" id="eBrSatuan3Box">
                        <div class="fgroup"><label class="flabel">Nama Satuan 3</label>
                            <input class="finput" id="eBrSatuan3" value="${esc(b.satuan3||'')}" placeholder="Contoh: KARTON"></div>
                        <div class="fgroup"><label class="flabel">Isi per Satuan 3</label>
                            <input class="finput" type="number" id="eBrIsi3" value="${b.isi3||1}" min="1">
                            <span class="fhint">1 Satuan 3 = berapa satuan dasar (bukan berapa Satuan Besar)</span></div>
                        <div class="fgroup"><label class="flabel">Barcode Satuan 3</label>
                            <input class="finput" id="eBrBC3" value="${esc(b.barcode3||'')}"></div>
                    </div>
                    ${window._barangCabang ? `<div class="note note-b" style="margin-top:8px;"><span class="note-ico">🏬</span><span>Harga jual di bawah (HGA TOKO / HRG PARTAI / HRG CABANG) disimpan sebagai <strong>harga khusus cabang ${esc(window._barangCabang)}</strong>. Harga standar & cabang lain tidak berubah. Pilih "Semua Cabang" di daftar untuk mengubah harga standar.</span></div>` : ''}
                    <div class="fgrid col2" style="margin-top:4px;">
                        <div class="fgroup"><label class="flabel">HRG BELI — Harga Modal (Rp)</label>
                            <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                <input class="finput" inputmode="numeric" id="eBrM" value="${fmtRibuan(b.modal||0)}"
                                    oninput="onMoneyInput(this); syncHargaJualDariMargin('eBr'); cekWarningModal('eBr')"></div>
                            <span class="fhint" id="eBrMWarn" style="display:none;color:var(--red);">⚠️ Kosongkan/isi 0 di sini akan membuat margin & laba barang ini terhitung 100% (dianggap tanpa modal) di laporan.</span></div>
                        <div class="fgroup"><label class="flabel">HGA TOKO — Harga Ecer (Rp)</label>
                            <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                <input class="finput" inputmode="numeric" id="eBrHJ" value="${fmtRibuan(b.harga_jual||0)}"
                                    oninput="onMoneyInput(this); syncMarginDariHargaJual('eBr'); cekWarningModal('eBr')"></div>
                            <div class="fmargin-row">
                                <label>Margin</label>
                                <input type="number" id="eBrMargin" value="${marginAwal}" oninput="syncHargaJualDariMargin('eBr')">
                                <span class="pct">%</span><span class="eq">dari harga modal</span>
                            </div></div>
                        <div class="fgroup"><label class="flabel">HRG PARTAI — Harga Grosir (Rp)</label>
                            <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                <input class="finput" inputmode="numeric" id="eBrHG" value="${fmtRibuan(b.harga_grosir||0)}" oninput="onMoneyInput(this)"></div></div>
                        <div class="fgroup"><label class="flabel">HRG CABANG (Rp)</label>
                            <div class="fmoney-wrap"><span class="fmoney-prefix">Rp</span>
                                <input class="finput" inputmode="numeric" id="eBrHC" value="${fmtRibuan(b.harga_cabang||0)}" oninput="onMoneyInput(this)"></div></div>
                    </div>
                    <div class="fgrid col2" style="margin-top:4px;">
                        <div class="fgroup"><label class="flabel">Stok Minimum</label>
                            <input class="finput" type="number" id="eBrSMin" value="${b.stok_min||0}" min="0">
                            <span class="fhint">Peringatan stok rendah akan muncul di bawah angka ini</span></div>
                        <div class="fgroup"><label class="flabel">Stok Maksimum</label>
                            <input class="finput" type="number" id="eBrSMax" value="${b.stok_max||0}" min="0"></div>
                    </div>
                </div>
                <div class="itab-page" id="eBrTabs-stok">
                    <div class="note note-b">
                        <span class="note-ico">📦</span>
                        <span><strong>Stok per Cabang</strong> — ubah angka di bawah untuk mengoreksi saldo stok saat ini
                        (mis. barang baru diimport dan stoknya masih 0 padahal fisiknya sudah ada). Perubahan ini
                        langsung dianggap <u>saldo stok</u> (seperti stok opname), <u>tidak</u> membuat transaksi Pembelian/Penjualan
                        dan tidak memengaruhi Laba Rugi.</span>
                    </div>
                    <div class="fgrid" id="eBrStokGrid">
                        ${stokRows.map((s, i) => {
                            const fq = formatStok(s.qty, b.satuan1, b.satuan2, b.isi);
                            return `
                        <div class="fgroup"><label class="flabel">${esc(s.cabang)}</label>
                            <input class="finput" type="number" min="0" step="0.01" id="eBrStok_${i}" value="${s.qty}" data-cabang="${esc(s.cabang)}"
                                oninput="document.getElementById('eBrStokHint_${i}').textContent = formatStok(this.value, '${esc(b.satuan1||'')}', '${esc(b.satuan2||'')}', ${Number(b.isi)||1}).main">
                            <span class="fhint" id="eBrStokHint_${i}">${esc(fq.main)}${b.satuan1 ? ' (satuan: ' + esc(b.satuan1) + ')' : ''}</span></div>
                        `;
                        }).join('') || '<div class="fgroup"><span class="fhint">Belum ada cabang terdaftar di Master ▸ Cabang.</span></div>'}
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="saveBarang(${id})">Simpan Perubahan</button>
    </div>`);
    cekWarningModal('eBr');
};
window.saveBarang = async id => {
    try {
        const punyaSatuan2 = document.getElementById('eBrPunyaSatuan2').checked;
        const satuanBesar  = document.getElementById('eBrSatuanBesar').value.trim();
        const punyaSatuan3 = document.getElementById('eBrPunyaSatuan3').checked;
        const satuan3      = document.getElementById('eBrSatuan3').value.trim();
        await apiPut('/master/barang/' + id, {
            nama        : document.getElementById('eBrN').value.trim(),
            barcode     : document.getElementById('eBrBC').value.trim() || null,
            barcode2    : (punyaSatuan2 && satuanBesar) ? (document.getElementById('eBrBC2').value.trim() || null) : null,
            barcode3    : (punyaSatuan3 && satuan3) ? (document.getElementById('eBrBC3').value.trim() || null) : null,
            kategori    : document.getElementById('eBrKat').value.trim() || null,
            sub_kategori: document.getElementById('eBrSubKat').value.trim() || null,
            supplier    : document.getElementById('eBrSup').value.trim() || null,
            ppn         : document.getElementById('eBrP').value,
            satuan1     : document.getElementById('eBrSatuanDasar').value.trim() || 'PCS',
            satuan2     : (punyaSatuan2 && satuanBesar) ? satuanBesar : null,
            isi         : (punyaSatuan2 && satuanBesar) ? (Number(document.getElementById('eBrIsi').value) || 1) : 1,
            satuan3     : (punyaSatuan3 && satuan3) ? satuan3 : null,
            isi3        : (punyaSatuan3 && satuan3) ? (Number(document.getElementById('eBrIsi3').value) || 1) : 1,
            modal       : parseRibuan(document.getElementById('eBrM').value),
            harga_jual  : parseRibuan(document.getElementById('eBrHJ').value),
            harga_grosir: parseRibuan(document.getElementById('eBrHG').value),
            harga_cabang: parseRibuan(document.getElementById('eBrHC').value),
            stok_min    : Number(document.getElementById('eBrSMin').value) || 0,
            stok_max    : Number(document.getElementById('eBrSMax').value) || 0,
            cabang      : window._barangCabang || null, // difilter per cabang → 3 harga jual disimpan sebagai harga cabang itu
        });

        // Simpan saldo stok per cabang (kalau ada grid-nya)
        const stokGrid = document.getElementById('eBrStokGrid');
        if (stokGrid) {
            const stokInputs = stokGrid.querySelectorAll('input[data-cabang]');
            const stok = Array.from(stokInputs).map(inp => ({
                cabang: inp.dataset.cabang,
                qty: Number(inp.value) || 0,
            }));
            if (stok.length) await apiPut(`/master/barang/${id}/stok`, { stok });
        }

        toast('Barang diperbarui');
        closeM();
        await loadMasterData();
        await renderBarang(window._barangPage);
    } catch (err) { toast(err.message, 'err'); }
};

window.hapusBarang  = async id => {
    if (!(await confirmDialog('Hapus barang ini?'))) return;
    try {
        await apiDel('/master/barang/' + id);
        toast('Barang dihapus', 'y');
        await loadMasterData();
        await renderBarang(window._barangPage);
    } catch (err) { toast(err.message, 'err'); }
};

/** Hapus SEMUA Master Barang sekaligus — dipakai kalau mau input ulang dari nol.
 *  Pakai pengaman ketik-ulang teks (bukan confirm() biasa) karena aksi ini permanen
 *  & memengaruhi banyak sekali data (barang, stok, kadaluarsa) sekaligus. */
window.bukaHapusSemuaBarang = () => {
    openM(`
    <div class="mhd"><h3>🗑️ Hapus Semua Master Barang</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-y"><span class="note-ico">⚠️</span>
            <span><strong>Aksi ini permanen dan tidak bisa dibatalkan.</strong><br>
            Semua data Master Barang, saldo stok per cabang, dan data barang kadaluarsa akan dihapus.
            Riwayat transaksi Penjualan/Pembelian yang sudah ada TIDAK ikut terhapus (kodenya akan
            tampil sebagai "barang tidak dikenal").</span>
        </div>
        <div class="fgroup" style="margin-top:14px;">
            <label class="flabel">Ketik <strong>HAPUS SEMUA BARANG</strong> untuk konfirmasi</label>
            <input class="finput" id="confHapusBarang" placeholder="HAPUS SEMUA BARANG" autocomplete="off">
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-d" onclick="jalankanHapusSemuaBarang()">Hapus Semua Sekarang</button>
    </div>`);
};

window.jalankanHapusSemuaBarang = async () => {
    const teks = (document.getElementById('confHapusBarang').value || '').trim();
    if (teks !== 'HAPUS SEMUA BARANG') {
        toast('Ketik persis "HAPUS SEMUA BARANG" untuk melanjutkan', 'err');
        return;
    }
    try {
        const res = await apiDel('/master/barang-semua?konfirmasi=' + encodeURIComponent(teks));
        toast(res.message || 'Semua barang berhasil dihapus');
        closeM();
        await loadMasterData();
        await renderBarang(1);
    } catch (err) { toast(err.message, 'err'); }
};

/* ── IMPORT EXCEL BARANG ─────────────────────────────────── */
window.bukaImportBarang = () => {
    openM(`
    <div class="mhd"><h3>📥 Import Barang dari Excel</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
            <span>Mendukung file Excel (.xlsx/.xls) dengan kolom: <strong>KODE_BARANG, KODE_BARCODE, NAMA, KATEGORI, SUB_KATEGORI, SUPPLIER, HARGA_TOKO_1 (HGA TOKO), HARGA_PARTAI_1 (HRG PARTAI), HARGA_CABANG_1 (HRG CABANG), SATUAN_1, SATUAN_2, STOK_MIN, STOK_MAX, TOKO, GUDANG</strong>.<br>
            Baris yang sudah ada (kode sama) akan di-update otomatis:
            <strong>harga jual yang berubah di file langsung menggantikan harga lama</strong> (nilai 0/kosong di file tidak menghapus harga yang ada),
            <strong>Tanpa kolom HPP</strong>: kalau file punya kolom HPP, kolom itu diabaikan. HPP barang hanya terbentuk dari <strong>Pembelian</strong> — barang yang belum pernah dibeli HPP-nya 0 di Laba Rugi, Neraca & laporan lain.</span>
        </div>
        <div class="fgroup" style="margin-bottom:10px;">
            <label class="flabel">Cabang Tujuan (file ini = daftar barang cabang mana?)</label>
            <select class="fselect" id="importCabang">
                <option value="">– Semua cabang (harga standar katalog gabungan) –</option>
                ${(STATE.cabang || []).map(c => `<option value="${esc(c.nama)}" ${c.nama === (window._barangCabang || '') ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}
            </select>
            <span class="fhint">Pilih cabang asal file ini (mis. file <em>pusat_barang.xls</em> → Pusat). Barang didaftarkan ke cabang itu dan harga jualnya disimpan
                sebagai harga cabang tsb, jadi import file cabang lain tidak saling menimpa harga.</span>
        </div>
        <button class="btn btn-g btn-sm" style="margin-bottom:10px;" onclick="downloadTemplateImportBarang()">📄 Download Template Excel</button>
        <div class="fgroup">
            <label class="flabel">Pilih File Excel</label>
            <input type="file" id="importFile" accept=".xlsx,.xls,.csv" class="finput" style="padding:6px;">
        </div>
        <div class="fgrid col2" style="margin-top:10px;">
            <div class="fgroup"><label class="flabel">Kolom TOKO → Stok Awal cabang</label>
                <select class="fselect" id="importStokTokoCab"><option value="">– Jangan set stok –</option>${cabangOpts()}</select>
                <span class="fhint">Nilai minus di kolom TOKO otomatis dianggap 0 (bukan diimport apa adanya)</span></div>
            <div class="fgroup"><label class="flabel">Kolom GUDANG → Stok Awal cabang</label>
                <select class="fselect" id="importStokGudangCab"><option value="">– Jangan set stok –</option>${cabangOpts()}</select>
                <span class="fhint">Nilai minus di kolom GUDANG otomatis dianggap 0 juga</span></div>
        </div>
        <div id="importPreview" style="margin-top:12px;"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnDoImport" onclick="doImportBarang()" disabled>Import Sekarang</button>
    </div>`);

    document.getElementById('importFile').addEventListener('change', previewImportBarang);
};

window._importItems = [];
window.previewImportBarang = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const prev = document.getElementById('importPreview');
    prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';

    try {
        // Pakai SheetJS (xlsx) jika tersedia, fallback CSV
        let rows = [];
        if (file.name.endsWith('.csv')) {
            rows = await parseCsvFile(file);
        } else {
            rows = await parseXlsxFile(file);
        }
        window._importItems = rows;
        const valid = rows.filter(r => r.kode && r.nama);
        const jumlahMinusToko   = valid.filter(r => r.stok_toko_minus).length;
        const jumlahMinusGudang = valid.filter(r => r.stok_gudang_minus).length;
        prev.innerHTML = `
        <div class="note note-b"><span>✅ Ditemukan <strong>${rows.length}</strong> baris, <strong>${valid.length}</strong> valid (ada kode & nama).</span></div>
        ${(jumlahMinusToko || jumlahMinusGudang) ? `<div class="note note-y" style="margin-top:6px;"><span>⚠️ ${jumlahMinusToko} baris stok TOKO minus & ${jumlahMinusGudang} baris stok GUDANG minus terdeteksi — akan otomatis dianggap 0 saat import (bukan diimport apa adanya).</span></div>` : ''}
        <div class="tscroll" style="max-height:220px;overflow-y:auto;margin-top:8px;">
        <table><thead><tr><th>Kode</th><th>Nama</th><th>Kategori</th><th>HGA TOKO</th><th>Stok Toko</th><th>Stok Gudang</th></tr></thead>
        <tbody>${valid.slice(0,20).map(r => `<tr>
            <td style="font-size:11px;font-family:var(--F-m);">${esc(r.kode)}</td>
            <td style="font-size:12px;">${esc(r.nama)}</td>
            <td style="font-size:11px;">${esc(r.kategori||'')}</td>
            <td class="r" style="font-size:11px;">${r.harga_jual ? R(r.harga_jual) : '–'}</td>
            <td class="r" style="font-size:11px;">${r.stok_toko === null ? '–' : r.stok_toko}${r.stok_toko_minus ? ' <span style="color:var(--red);">(asal minus)</span>' : ''}</td>
            <td class="r" style="font-size:11px;">${r.stok_gudang === null ? '–' : r.stok_gudang}${r.stok_gudang_minus ? ' <span style="color:var(--red);">(asal minus)</span>' : ''}</td>
        </tr>`).join('')}
        ${valid.length > 20 ? `<tr><td colspan="6" style="text-align:center;color:var(--ink3);font-size:12px;">… dan ${valid.length-20} baris lainnya</td></tr>` : ''}
        </tbody></table></div>`;
        document.getElementById('btnDoImport').disabled = valid.length === 0;
    } catch(err) {
        prev.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
    }
};

async function parseXlsxFile(file) {
    return new Promise((resolve, reject) => {
        // Cek apakah SheetJS tersedia
        if (typeof XLSX === 'undefined') {
            // Fallback: minta user simpan sebagai CSV
            reject(new Error('Library XLSX belum dimuat. Simpan file sebagai .csv lalu coba lagi.'));
            return;
        }
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb  = XLSX.read(e.target.result, { type: 'array' });
                const ws  = wb.Sheets[wb.SheetNames[0]];
                // Baca sebagai array-of-array dulu (BUKAN langsung sheet_to_json dengan
                // header otomatis dari baris 1) — banyak file laporan (mis. hasil export
                // sistem kasir) punya baris judul/alamat/periode di atas baris header
                // asli. Kalau baris 1 dipaksa jadi header, semua kolom bisa bergeser
                // dan nilai (mis. barcode) bisa "nyasar" ke kolom lain (mis. stok_min).
                // Jadi di sini kita CARI baris header yang sebenarnya (mengandung
                // "KODE_BARANG"/"KODE"/"nama" dst) baru dipetakan berdasarkan POSISI kolom.
                const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
                resolve(mapAoaBarang(aoa));
            } catch(err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Gagal baca file'));
        reader.readAsArrayBuffer(file);
    });
}

// Header yang dikenali untuk tiap kolom Master Barang, urut prioritas.
// Dicocokkan setelah nama kolom dinormalisasi (huruf kecil, tanpa spasi/underscore/simbol).
const BARANG_HEADER_ALIAS = {
    kode        : ['kodebarang', 'kode'],
    barcode     : ['kodebarcode', 'barcode'],
    barcode2    : ['kodebarcode2', 'barcode2'],
    barcode3    : ['kodebarcode3', 'barcode3'],
    nama        : ['nama', 'namabarang'],
    kategori    : ['kategori'],
    sub_kategori: ['subkategori'],
    supplier    : ['supplier'],
    satuan1     : ['satuan1'],
    satuan2     : ['satuan2'],
    satuan3     : ['satuan3'],
    isi         : ['isi'],
    isi3        : ['isi3', 'isisatuan3'],
    harga_jual  : ['hargatoko1', 'hargajual'],
    harga_grosir: ['hargapartai1', 'hargagrosir'],
    harga_cabang: ['hargacabang1', 'hargacabang'],
    stok_min    : ['stokmin'],
    stok_max    : ['stokmax'],
    stok_toko   : ['toko', 'stoktoko'],
    stok_gudang : ['gudang', 'stokgudang'],
};

function mapAoaBarang(aoa) {
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Cari baris yang punya kolom "kode" DAN "nama" — itu baris header aslinya,
    // di manapun posisinya (lewati baris judul/alamat/periode di atasnya).
    let headerIdx = -1, col = {};
    for (let r = 0; r < aoa.length; r++) {
        const cells = (aoa[r] || []).map(norm);
        const iKode = cells.findIndex(c => BARANG_HEADER_ALIAS.kode.includes(c));
        const iNama = cells.findIndex(c => BARANG_HEADER_ALIAS.nama.includes(c));
        if (iKode >= 0 && iNama >= 0) {
            headerIdx = r;
            for (const [field, aliases] of Object.entries(BARANG_HEADER_ALIAS)) {
                col[field] = cells.findIndex(c => aliases.includes(c));
            }
            break;
        }
    }
    if (headerIdx === -1) {
        throw new Error('Baris header tidak ditemukan: pastikan file punya kolom "KODE_BARANG" & "NAMA" (nama kolom bebas urutannya).');
    }

    const get = (row, field, def = '') => {
        const idx = col[field];
        return idx >= 0 && idx < row.length ? row[idx] : def;
    };

    const rows = [];
    for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const kode = String(get(row, 'kode')).trim();
        const nama = String(get(row, 'nama')).trim();
        if (!kode && !nama) continue; // baris kosong
        rows.push(mapExcelRow({
            KODE_BARANG      : kode,
            NAMA             : nama,
            KODE_BARCODE     : get(row, 'barcode'),
            KODE_BARCODE_2   : get(row, 'barcode2'),
            KODE_BARCODE_3   : get(row, 'barcode3'),
            KATEGORI         : get(row, 'kategori'),
            SUB_KATEGORI     : get(row, 'sub_kategori'),
            SUPPLIER         : get(row, 'supplier'),
            SATUAN_1         : get(row, 'satuan1'),
            SATUAN_2         : get(row, 'satuan2'),
            SATUAN_3         : get(row, 'satuan3'),
            ISI              : get(row, 'isi'),
            ISI_3            : get(row, 'isi3'),
            HARGA_TOKO_1     : get(row, 'harga_jual'),
            HARGA_PARTAI_1   : get(row, 'harga_grosir'),
            HARGA_CABANG_1   : get(row, 'harga_cabang'),
            STOK_MIN         : get(row, 'stok_min'),
            STOK_MAX         : get(row, 'stok_max'),
            TOKO             : get(row, 'stok_toko'),
            GUDANG           : get(row, 'stok_gudang'),
        }));
    }
    return rows;
}

async function parseCsvFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const lines = e.target.result.split('\n');
                const headers = lines[0].split('\t').map(h => h.trim());
                const rows = [];
                for (let i = 1; i < lines.length; i++) {
                    if (!lines[i].trim()) continue;
                    const vals = lines[i].split('\t');
                    const obj = {};
                    headers.forEach((h, idx) => { obj[h] = (vals[idx] || '').trim(); });
                    rows.push(mapExcelRow(obj));
                }
                resolve(rows);
            } catch(err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Gagal baca CSV'));
        reader.readAsText(file);
    });
}

function mapExcelRow(r) {
    // Support header dari sistem kasir Toko Sumini maupun header generik
    const kode  = String(r['KODE_BARANG'] || r['kode'] || r['Kode'] || '').trim();
    const nama  = String(r['NAMA'] || r['nama'] || r['Nama'] || '').trim();
    // HPP sengaja TIDAK dibaca dari Excel — HPP hanya dari Pembelian (Kartu HPP).
    // Barang baru = 0 sampai ada pembelian.
    const modal = 0;

    // Stok TOKO/GUDANG dari file kasir sumber (mis. hasil stok opname yang
    // sudah kadung minus karena pembelian tidak selalu tercatat) — sesuai
    // keputusan pengguna, nilai negatif diperlakukan sebagai "tidak diketahui"
    // (dianggap 0) alih-alih diimport apa adanya, supaya minusnya tidak
    // ikut terbawa ke Toko Sumini. Kolom kosong (bukan angka) → null, artinya
    // baris itu TIDAK menyentuh stok sama sekali (bukan di-nolkan).
    const parseStok = raw => {
        if (raw === '' || raw === null || raw === undefined) return { nilai: null, diflorkan: false };
        const v = parseFloat(raw);
        if (isNaN(v)) return { nilai: null, diflorkan: false };
        return v < 0 ? { nilai: 0, diflorkan: true } : { nilai: v, diflorkan: false };
    };
    const stokToko   = parseStok(r['TOKO']   ?? r['stok_toko']);
    const stokGudang = parseStok(r['GUDANG'] ?? r['stok_gudang']);

    return {
        kode,
        nama,
        barcode     : String(r['KODE_BARCODE']   || r['barcode']   || '').trim() || null,
        barcode2    : String(r['KODE_BARCODE_2']  || r['barcode2']  || '').trim() || null,
        barcode3    : String(r['KODE_BARCODE_3']  || r['barcode3']  || '').trim() || null,
        kategori    : String(r['KATEGORI']        || r['kategori']  || '').trim() || null,
        sub_kategori: String(r['SUB_KATEGORI']    || r['sub_kategori'] || '').trim() || null,
        supplier    : String(r['SUPPLIER']        || r['supplier']  || '').trim() || null,
        ppn         : 'Kena PPN', // default; bisa dikustomisasi
        satuan1     : String(r['SATUAN_1'] || r['satuan1'] || 'PCS').trim() || 'PCS',
        satuan2     : String(r['SATUAN_2'] || r['satuan2'] || '').trim() || null,
        satuan3     : String(r['SATUAN_3'] || r['satuan3'] || '').trim() || null,
        isi         : parseInt(r['ISI'] || r['isi'] || 1) || 1,
        isi3        : parseInt(r['ISI_3'] || r['isi3'] || 1) || 1,
        modal,
        harga_jual  : parseFloat(r['HARGA_TOKO_1']   || r['harga_jual']   || 0) || 0,
        harga_grosir: parseFloat(r['HARGA_PARTAI_1'] || r['harga_grosir'] || 0) || 0,
        harga_cabang: parseFloat(r['HARGA_CABANG_1'] || r['harga_cabang'] || 0) || 0,
        stok_min    : parseInt(r['STOK_MIN'] || r['stok_min'] || 0) || 0,
        stok_max    : parseInt(r['STOK_MAX'] || r['stok_max'] || 0) || 0,
        stok_toko       : stokToko.nilai,
        stok_toko_minus : stokToko.diflorkan,
        stok_gudang       : stokGudang.nilai,
        stok_gudang_minus : stokGudang.diflorkan,
    };
}

window.doImportBarang = async () => {
    const items = (window._importItems || []).filter(r => r.kode && r.nama);
    if (!items.length) { toast('Tidak ada data valid', 'err'); return; }
    const stokTokoCabang   = document.getElementById('importStokTokoCab').value || null;
    const stokGudangCabang = document.getElementById('importStokGudangCab').value || null;
    const cabangTujuan     = document.getElementById('importCabang')?.value || null;
    const btn = document.getElementById('btnDoImport');
    btn.disabled = true;
    btn.textContent = 'Mengimpor…';
    try {
        // Kirim per-batch 200 item
        let totalAdded = 0, totalUpdated = 0, totalSkipped = 0, totalStokDiisi = 0;
        let peringatan = [], gagal = [];
        for (let i = 0; i < items.length; i += 200) {
            const batch = items.slice(i, i + 200);
            const res = await apiPost('/master/barang/import', {
                items: batch, stok_toko_cabang: stokTokoCabang, stok_gudang_cabang: stokGudangCabang,
                cabang: cabangTujuan,
            });
            totalAdded    += (res.added        || 0);
            totalUpdated  += (res.updated      || 0);
            totalSkipped  += (res.skipped      || 0);
            totalStokDiisi+= (res.stok_diisi   || 0);
            peringatan = peringatan.concat(res.peringatan || []);
            gagal      = gagal.concat(res.gagal || []);
        }
        toast(`Import selesai: ${totalAdded} ditambah, ${totalUpdated} diperbarui` + (totalSkipped ? `, ${totalSkipped} gagal/dilewati` : ''));
        if (totalStokDiisi) toast(`📦 Stok Awal ter-set untuk ${totalStokDiisi} baris (nilai minus sudah dianggap 0)`, 'ok');
        // Setelah Master Barang terisi, cocokkan ulang transaksi lama yang sebelumnya "tidak terdeteksi"
        // (tanda ⚠️ dibersihkan; kode barcode/alternatif dialihkan ke kode utama barang).
        try {
            const cocok = await apiPost('/transaksi/barang-tidak-terdeteksi/cocokkan', {});
            if (cocok.dialihkan_ke_kode_master || cocok.flag_dibersihkan) toast('🔗 ' + cocok.message, 'ok');
        } catch (e) { console.warn('Cocokkan ulang transaksi gagal:', e.message); }
        if (peringatan.length) {
            toast(`⚠️ ${peringatan.length} baris punya nilai janggal yang diabaikan (kemungkinan kolom di Excel tertukar) — cek riwayat/console untuk detail, mis: ${peringatan[0]}`, 'y');
            console.warn('Peringatan import barang:', peringatan);
        }
        if (gagal.length) {
            toast(`❌ ${gagal.length} baris gagal disimpan, mis: ${gagal[0]}`, 'err');
            console.warn('Baris gagal import barang:', gagal);
        }
        closeM();
        await loadMasterData();
        await renderBarang(1);
    } catch(err) {
        toast('Gagal import: ' + err.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Import Sekarang';
    }
};

/* ── JASA ─────────────────────────────────────────────────── */
async function renderJasaMaster() {
    const el   = document.getElementById('ms-jasa');
    el.innerHTML = loadingHTML;
    const list = STATE.jasa;

    el.innerHTML = `
    <div class="box">
        <div class="box-hd">
            <h3>Tambah Jasa / Layanan</h3>
            <button class="btn btn-g btn-sm" onclick="bukaImportMaster('jasa')">📥 Import Excel</button>
                <button class="btn btn-g btn-sm" onclick="exportExcel('tblJasaMaster','master-jasa')">📊 Export Excel</button>
        </div>
        <div class="box-bd">
            <form id="fJasaMaster">
                <div class="fgrid">
                    <div class="fgroup"><label class="flabel">Kode Jasa</label><input class="finput" id="jsK" required></div>
                    <div class="fgroup"><label class="flabel">Nama Jasa</label><input class="finput" id="jsN" required></div>
                    <div class="fgroup">
                        <label class="flabel">Status PPN</label>
                        <select class="fselect" id="jsP"><option>Non-PPN</option><option>Kena PPN</option></select>
                    </div>
                    <div class="fgroup">
                        <label class="flabel">Harga Standar (Rp)</label>
                        <input class="finput" type="number" id="jsH" min="0" placeholder="0">
                    </div>
                </div>
                <button class="btn btn-p" type="submit">+ Simpan Jasa</button>
            </form>
        </div>
    </div>
    <div class="box">
        <div class="box-hd"><h3>Daftar Jasa</h3><div class="meta">${list.length} jenis jasa</div></div>
        <div class="box-bd pad0 tscroll">
            ${list.length ? `
            <table id="tblJasaMaster">
                <thead><tr><th>Kode</th><th>Nama Jasa</th><th>Status PPN</th><th class="r">Harga Standar</th><th></th></tr></thead>
                <tbody>${list.map(j => `<tr class="row-click" ondblclick="editJasa(${j.id},'${esc(j.nama)}','${j.ppn}',${j.harga||0})" title="Klik 2x untuk edit">
                    <td style="font-family:var(--F-m);font-size:12px;">${esc(j.kode)}</td>
                    <td>${esc(j.nama)}</td>
                    <td><span class="badge ${j.ppn === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}">${j.ppn}</span></td>
                    <td class="r">${j.harga ? R(j.harga) : '–'}</td>
                    <td style="display:flex;gap:4px;">
                        <button class="btn btn-g btn-sm" onclick="event.stopPropagation();editJasa(${j.id},'${esc(j.nama)}','${j.ppn}',${j.harga||0})">✏️</button>
                        <button class="row-del" onclick="event.stopPropagation();hapusJasa(${j.id})">✕</button>
                    </td>
                </tr>`).join('')}</tbody>
            </table>`
            : '<div class="empty"><div class="ico">🛠️</div><strong>Belum ada jasa.</strong></div>'}</div>
    </div>`;

    document.getElementById('fJasaMaster').onsubmit = async e => {
        e.preventDefault();
        try {
            await apiPost('/master/jasa', {
                kode : document.getElementById('jsK').value.trim(),
                nama : document.getElementById('jsN').value.trim(),
                ppn  : document.getElementById('jsP').value,
                harga: Number(document.getElementById('jsH').value) || 0,
            });
            toast('Jasa ditambahkan');
            await loadMasterData();
            await renderJasaMaster();
        } catch (err) { toast(err.message, 'err'); }
    };
}

window.editJasa = (id, nama, ppn, harga) => {
    openM(`
    <div class="mhd"><h3>✏️ Edit Jasa</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Nama Jasa</label>
                <input class="finput" id="eJsN" value="${esc(nama)}" required></div>
            <div class="fgroup"><label class="flabel">Status PPN</label>
                <select class="fselect" id="eJsP">
                    <option ${ppn==='Non-PPN'?'selected':''}>Non-PPN</option>
                    <option ${ppn==='Kena PPN'?'selected':''}>Kena PPN</option>
                </select></div>
            <div class="fgroup"><label class="flabel">Harga Standar (Rp)</label>
                <input class="finput" type="number" id="eJsH" value="${harga}" min="0"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="saveJasa(${id})">Simpan Perubahan</button>
    </div>`);
};
window.saveJasa = async id => {
    try {
        await apiPut('/master/jasa/' + id, {
            nama : document.getElementById('eJsN').value.trim(),
            ppn  : document.getElementById('eJsP').value,
            harga: Number(document.getElementById('eJsH').value) || 0,
        });
        toast('Jasa diperbarui');
        closeM();
        await loadMasterData();
        await renderJasaMaster();
    } catch (err) { toast(err.message, 'err'); }
};
window.hapusJasa = async id => {
    if (!(await confirmDialog('Hapus jasa ini?'))) return;
    try {
        await apiDel('/master/jasa/' + id);
        toast('Jasa dihapus', 'y');
        await loadMasterData();
        await renderJasaMaster();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── PELANGGAN ────────────────────────────────────────────── */
async function renderPelanggan() {
    const el = document.getElementById('ms-pelanggan');
    el.innerHTML = loadingHTML;
    try {
        const res  = await apiGet('/master/pelanggan');
        const list = Array.isArray(res) ? res : (res.data || []);

        el.innerHTML = `
        <div class="box">
            <div class="box-hd">
                <h3>Tambah Pelanggan</h3>
                <button class="btn btn-g btn-sm" onclick="bukaImportMaster('pelanggan')">📥 Import Excel</button>
                <button class="btn btn-g btn-sm" onclick="exportExcel('tblPelanggan','master-pelanggan')">📊 Export Excel</button>
            </div>
            <div class="box-bd">
                <form id="fPelanggan">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Kode Pelanggan</label><input class="finput" id="plK" required></div>
                        <div class="fgroup"><label class="flabel">Nama</label><input class="finput" id="plN" required></div>
                        <div class="fgroup"><label class="flabel">No. Telepon</label><input class="finput" id="plT" placeholder="Opsional"></div>
                        <div class="fgroup"><label class="flabel">Alamat</label><input class="finput" id="plA" placeholder="Opsional"></div>
                        <div class="fgroup"><label class="flabel">Poin Awal</label><input class="finput" type="number" id="plP" min="0" placeholder="0"></div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Pelanggan</button>
                </form>
            </div>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Daftar Pelanggan</h3><div class="meta">${list.length} pelanggan</div></div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblPelanggan">
                    <thead><tr><th>Kode</th><th>Nama</th><th>Telepon</th><th>Alamat</th><th class="r">Poin</th><th></th></tr></thead>
                    <tbody>${list.map(p => `<tr class="row-click" ondblclick="editPelanggan(${p.id},'${esc(p.nama)}','${esc(p.telp||'')}','${esc(p.alamat||'')}',${p.poin||0})" title="Klik 2x untuk edit">
                        <td style="font-family:var(--F-m);font-size:12px;">${esc(p.kode)}</td>
                        <td><strong>${esc(p.nama)}</strong></td>
                        <td>${esc(p.telp || '–')}</td>
                        <td>${esc(p.alamat || '–')}</td>
                        <td class="r"><span class="badge badge-info">${p.poin || 0} pts</span></td>
                        <td style="display:flex;gap:4px;">
                            <button class="btn btn-g btn-sm" onclick="event.stopPropagation();editPelanggan(${p.id},'${esc(p.nama)}','${esc(p.telp||'')}','${esc(p.alamat||'')}',${p.poin||0})">✏️</button>
                            <button class="row-del" onclick="event.stopPropagation();hapusPelanggan(${p.id})">✕</button>
                        </td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">🧑‍🤝‍🧑</div><strong>Belum ada pelanggan.</strong></div>'}</div>
        </div>`;

        document.getElementById('fPelanggan').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/master/pelanggan', {
                    kode  : document.getElementById('plK').value.trim(),
                    nama  : document.getElementById('plN').value.trim(),
                    telp  : document.getElementById('plT').value.trim(),
                    alamat: document.getElementById('plA').value.trim(),
                    poin  : Number(document.getElementById('plP').value) || 0,
                });
                toast('Pelanggan ditambahkan');
                await renderPelanggan();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}
window.editPelanggan = (id, nama, telp, alamat, poin) => {
    openM(`
    <div class="mhd"><h3>✏️ Edit Pelanggan</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Nama</label>
                <input class="finput" id="ePlN" value="${esc(nama)}" required></div>
            <div class="fgroup"><label class="flabel">No. Telepon</label>
                <input class="finput" id="ePlT" value="${esc(telp)}"></div>
            <div class="fgroup"><label class="flabel">Alamat</label>
                <input class="finput" id="ePlA" value="${esc(alamat)}"></div>
            <div class="fgroup"><label class="flabel">Poin</label>
                <input class="finput" type="number" id="ePlP" value="${poin}" min="0"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="savePelanggan(${id})">Simpan Perubahan</button>
    </div>`);
};
window.savePelanggan = async id => {
    try {
        await apiPut('/master/pelanggan/' + id, {
            nama  : document.getElementById('ePlN').value.trim(),
            telp  : document.getElementById('ePlT').value.trim(),
            alamat: document.getElementById('ePlA').value.trim(),
            poin  : Number(document.getElementById('ePlP').value) || 0,
        });
        toast('Pelanggan diperbarui');
        closeM();
        await renderPelanggan();
    } catch (err) { toast(err.message, 'err'); }
};
window.hapusPelanggan = async id => {
    if (!(await confirmDialog('Hapus pelanggan ini?'))) return;
    try {
        await apiDel('/master/pelanggan/' + id);
        toast('Pelanggan dihapus', 'y');
        await renderPelanggan();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── SUPPLIER ─────────────────────────────────────────────── */
async function renderSupplier() {
    const el = document.getElementById('ms-supplier');
    el.innerHTML = loadingHTML;
    try {
        const res  = await apiGet('/supplier');
        const list = Array.isArray(res) ? res : (res.data || []);
        STATE.supplier = list; // sinkron ke STATE supaya dropdown Pembelian ikut update

        el.innerHTML = `
        <div class="box">
            <div class="box-hd">
                <h3>Tambah Supplier</h3>
                <button class="btn btn-g btn-sm" onclick="bukaImportMaster('supplier')">📥 Import Excel</button>
                <button class="btn btn-g btn-sm" onclick="exportExcel('tblSupplier','master-supplier')">📊 Export Excel</button>
            </div>
            <div class="box-bd">
                <form id="fSupplier">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Nama Supplier</label><input class="finput" id="spN" required></div>
                        <div class="fgroup"><label class="flabel">Nama Kontak (PIC)</label><input class="finput" id="spK" placeholder="Opsional"></div>
                        <div class="fgroup"><label class="flabel">No. Telepon</label><input class="finput" id="spT" placeholder="Opsional"></div>
                        <div class="fgroup"><label class="flabel">Alamat</label><input class="finput" id="spA" placeholder="Opsional"></div>
                        <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="spKet" placeholder="Opsional"></div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Supplier</button>
                </form>
            </div>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Daftar Supplier</h3><div class="meta">${list.length} supplier</div></div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblSupplier">
                    <thead><tr><th>Nama</th><th>Kontak</th><th>Telepon</th><th>Alamat</th><th>Keterangan</th><th></th></tr></thead>
                    <tbody>${list.map(s => `<tr class="row-click" ondblclick="editSupplier(${s.id},'${esc(s.nama)}','${esc(s.kontak||'')}','${esc(s.telp||'')}','${esc(s.alamat||'')}','${esc(s.keterangan||'')}')" title="Klik 2x untuk edit">
                        <td><strong>${esc(s.nama)}</strong></td>
                        <td>${esc(s.kontak || '–')}</td>
                        <td>${esc(s.telp || '–')}</td>
                        <td>${esc(s.alamat || '–')}</td>
                        <td>${esc(s.keterangan || '–')}</td>
                        <td style="display:flex;gap:4px;">
                            <button class="btn btn-g btn-sm" onclick="event.stopPropagation();editSupplier(${s.id},'${esc(s.nama)}','${esc(s.kontak||'')}','${esc(s.telp||'')}','${esc(s.alamat||'')}','${esc(s.keterangan||'')}')">✏️</button>
                            <button class="row-del" onclick="event.stopPropagation();hapusSupplier(${s.id})">✕</button>
                        </td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">🚚</div><strong>Belum ada supplier.</strong><br>Tambahkan supplier dulu sebelum input Pembelian.</div>'}</div>
        </div>`;

        document.getElementById('fSupplier').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/supplier', {
                    nama      : document.getElementById('spN').value.trim(),
                    kontak    : document.getElementById('spK').value.trim(),
                    telp      : document.getElementById('spT').value.trim(),
                    alamat    : document.getElementById('spA').value.trim(),
                    keterangan: document.getElementById('spKet').value.trim(),
                });
                toast('Supplier ditambahkan');
                await renderSupplier();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}
window.editSupplier = (id, nama, kontak, telp, alamat, keterangan) => {
    openM(`
    <div class="mhd"><h3>✏️ Edit Supplier</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Nama Supplier</label>
                <input class="finput" id="eSpN" value="${esc(nama)}" required></div>
            <div class="fgroup"><label class="flabel">Nama Kontak (PIC)</label>
                <input class="finput" id="eSpK" value="${esc(kontak)}"></div>
            <div class="fgroup"><label class="flabel">No. Telepon</label>
                <input class="finput" id="eSpT" value="${esc(telp)}"></div>
            <div class="fgroup"><label class="flabel">Alamat</label>
                <input class="finput" id="eSpA" value="${esc(alamat)}"></div>
            <div class="fgroup"><label class="flabel">Keterangan</label>
                <input class="finput" id="eSpKet" value="${esc(keterangan)}"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="saveSupplier(${id})">Simpan Perubahan</button>
    </div>`);
};
window.saveSupplier = async id => {
    try {
        await apiPut('/supplier/' + id, {
            nama      : document.getElementById('eSpN').value.trim(),
            kontak    : document.getElementById('eSpK').value.trim(),
            telp      : document.getElementById('eSpT').value.trim(),
            alamat    : document.getElementById('eSpA').value.trim(),
            keterangan: document.getElementById('eSpKet').value.trim(),
        });
        toast('Supplier diperbarui');
        closeM();
        await renderSupplier();
    } catch (err) { toast(err.message, 'err'); }
};
window.hapusSupplier = async id => {
    if (!(await confirmDialog('Hapus supplier ini?'))) return;
    try {
        await apiDel('/supplier/' + id);
        toast('Supplier dihapus', 'y');
        await renderSupplier();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── BARANG KADALUARSA ────────────────────────────────────── */
async function renderKadaluarsa() {
    const el = document.getElementById('ms-kadaluarsa');
    el.innerHTML = loadingHTML;
    try {
        const cab  = getCabang();
        const list = await apiGet('/master/kadaluarsa' + buildQuery({ cabang: cab }));
        const sorted   = [...list].sort((a, b) => (a.tgl_exp || '').localeCompare(b.tgl_exp || ''));
        const expired  = sorted.filter(x => expStatus(x.tgl_exp).diff < 0).length;
        const near     = sorted.filter(x => { const d = expStatus(x.tgl_exp).diff; return d >= 0 && d <= 30; }).length;

        el.innerHTML = `
        ${exportBar('tblKadaluarsa','barang-kadaluarsa','ms-kadaluarsa','Barang Kadaluarsa')}
        <div class="kpi-grid">
            <div class="kpi"><div class="kpi-label">Total Dipantau</div><div class="kpi-val">${list.length}</div></div>
            <div class="kpi red"><div class="kpi-label">Sudah Kadaluarsa</div><div class="kpi-val neg">${expired}</div></div>
            <div class="kpi"><div class="kpi-label">Mendekati (≤ 30 hr)</div><div class="kpi-val">${near}</div></div>
        </div>

        <div class="box">
            <div class="box-hd"><h3>Catat Tanggal Kadaluarsa</h3></div>
            <div class="box-bd">
                <form id="fKadaluarsa">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Tanggal Catat</label><input class="finput" type="date" id="kd_tgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="kd_cab" required>${cabangOpts()}</select></div>
                        <div class="fgroup"><label class="flabel">Kode Barang</label><input class="finput" id="kd_kb" list="dl_kdl" required placeholder="Ketik kode…"></div>
                        <div class="fgroup"><label class="flabel">No. Batch</label><input class="finput" id="kd_batch" placeholder="Opsional"></div>
                        <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="kd_qty" value="1" min="1" required></div>
                        <div class="fgroup"><label class="flabel">Tanggal Kadaluarsa</label><input class="finput" type="date" id="kd_exp" required></div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Data Kadaluarsa</button>
                </form>
                ${barangDatalist('dl_kdl')}
            </div>
        </div>

        <div class="box">
            <div class="box-hd"><h3>Daftar Pantauan Kadaluarsa</h3><div class="meta">${list.length} item · diurutkan terdekat</div></div>
            <div class="box-bd pad0 tscroll">
                ${sorted.length ? `
                <table id="tblKadaluarsa">
                    <thead><tr><th>Tgl Exp</th><th>Cabang</th><th>Barang</th><th>Batch</th><th class="r">Qty</th><th>Status</th><th></th></tr></thead>
                    <tbody>${sorted.map(x => {
                        const st = expStatus(x.tgl_exp);
                        return `<tr>
                            <td><strong>${fmtTgl(x.tgl_exp)}</strong></td>
                            <td>${esc(x.cabang)}</td>
                            <td>${x.nama_barang ? esc(x.nama_barang) : `<em style="color:var(--ink3);">${esc(x.kode_barang)}</em>`}</td>
                            <td>${esc(x.batch || '–')}</td>
                            <td class="r">${x.qty}</td>
                            <td><span class="badge ${st.cls}">${st.lbl}</span></td>
                            <td><button class="row-del" onclick="hapusKadaluarsa(${x.id})">✕</button></td>
                        </tr>`;
                    }).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">⏳</div><strong>Belum ada data kadaluarsa.</strong></div>'}</div>
        </div>`;

        document.getElementById('fKadaluarsa').onsubmit = async e => {
            e.preventDefault();
            const kb = document.getElementById('kd_kb').value.trim();
            if (!getBarang(kb)) { toast('Kode barang tidak ditemukan di master', 'err'); return; }
            try {
                await apiPost('/master/kadaluarsa', {
                    tgl         : document.getElementById('kd_tgl').value,
                    cabang      : document.getElementById('kd_cab').value,
                    kode_barang : kb,
                    batch       : document.getElementById('kd_batch').value.trim(),
                    qty         : Number(document.getElementById('kd_qty').value),
                    tgl_exp     : document.getElementById('kd_exp').value,
                });
                toast('Data kadaluarsa disimpan');
                await renderKadaluarsa();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}
window.hapusKadaluarsa = async id => {
    if (!(await confirmDialog('Hapus data ini?'))) return;
    try {
        await apiDel('/master/kadaluarsa/' + id);
        toast('Data dihapus', 'y');
        await renderKadaluarsa();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── MODAL PENGATURAN (Tarif PPN & Stok Minus) ───────────────── */
document.getElementById('btnEditTarif').addEventListener('click', () => {
    openM(`
    <div class="mhd">
        <h3>⚙️ Pengaturan Aplikasi</h3>
        <button class="mclose" onclick="closeM()">×</button>
    </div>
    <div class="mbd">
        <div class="fgroup">
            <label class="flabel">Tarif PPN (%)</label>
            <input class="finput" type="number" id="settingTarif" min="0" max="100" step="0.5" value="${STATE.tarif}">
            <span class="fhint">Tarif PPN Indonesia saat ini: 11%. Ubah sesuai peraturan terbaru.</span>
        </div>
        <div class="fgroup" style="margin-top:14px;">
            <label class="flabel">Stok Barang</label>
            <label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:400;">
                <input type="checkbox" id="settingStokMinus" ${STATE.stokBolehMinus ? 'checked' : ''} style="width:16px;height:16px;">
                Izinkan stok sampai minus (negatif)
            </label>
            <span class="fhint">
                Jika dicentang: Penjualan/Barang Keluar tetap tersimpan walau stok kurang (stok bisa jadi minus).<br>
                Jika tidak dicentang: transaksi akan ditolak kalau stok tidak cukup.<br>
                Saat ini diaktifkan sementara agar data penjualan lama (mis. import Excel) bisa masuk semua dulu.
            </span>
        </div>
        <div class="fgroup" style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--bd);">
            <label class="flabel">Perbaiki Laba Rugi (Harga Modal)</label>
            <span class="fhint">
                Margin barang kebaca lebih dari 90%? Itu BUKAN soal stok, tapi kolom Harga Modal (HPP per unit)
                di Master Barang yang masih 0. Tombol ini otomatis mengisi Harga Modal dari rata-rata harga di
                riwayat Pembelian (tidak menimpa barang yang modal-nya sudah diisi manual).
            </span>
            <button class="btn btn-g" style="margin-top:8px;" onclick="jalankanIsiModalOtomatis()">Isi Otomatis Harga Modal dari Riwayat Pembelian</button>
        </div>
        <div class="fgroup" style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--bd);">
            <label class="flabel">Perbaiki Laba Rugi (Konversi Satuan KARTON/DUS)</label>
            <span class="fhint">
                Laba Rugi meledak jauh di luar akal sehat (mis. puluhan/ratusan juta padahal omzet segitu-gitu saja)?
                Kemungkinan besar penyebabnya barang yang dijual/dibeli per KARTON/DUS tapi qty & harganya kebaca
                sebagai PCS. Perbaikannya 2 langkah, urutan WAJIB dari atas ke bawah:
            </span>
            <button class="btn btn-g" style="margin-top:8px;" onclick="bukaImportSatuanMassal()">1) Lengkapi Satuan 2/3 &amp; Isi dari Excel</button>
            <button class="btn btn-g" style="margin-top:8px;" onclick="bukaPerbaikanKonversi()">2) Cek &amp; Perbaiki Konversi Transaksi Lama</button>
        </div>
        <div class="fgroup" style="margin-top:18px;padding-top:14px;border-top:1px dashed var(--bd);">
            <label class="flabel" style="color:var(--red);">Zona Bahaya</label>
            <span class="fhint">Hapus SEMUA data Penjualan & Pembelian (tidak bisa dibatalkan). Stok otomatis dikembalikan ke posisi sebelum transaksi tsb ada.</span>
            <button class="btn btn-d" style="margin-top:8px;" onclick="jalankanResetJualBeli()">Hapus Semua Penjualan & Pembelian</button>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="saveTarif()">Simpan Pengaturan</button>
    </div>`);
});

window.jalankanIsiModalOtomatis = async () => {
    if (!(await confirmDialog(
        'Sistem akan mengisi Harga Modal tiap barang dari rata-rata harga di riwayat Pembelian yang sudah ada. Barang yang Harga Modal-nya SUDAH diisi manual tidak akan ditimpa. Lanjutkan?',
        { title: 'Isi Otomatis Harga Modal', okText: 'Lanjutkan', danger: false }
    ))) return;
    try {
        const res = await apiPost('/master/barang/isi-modal-otomatis', {});
        let msg = res.message;
        if (res.perlu_input_manual && res.perlu_input_manual.length) {
            msg += '\n\n' + res.perlu_input_manual.length + ' barang sudah terjual tapi belum pernah ada riwayat Pembelian, perlu isi Harga Modal manual untuk: ' +
                res.perlu_input_manual.slice(0, 10).map(b => b.nama).join(', ') +
                (res.perlu_input_manual.length > 10 ? ', dst.' : '');
        }
        closeM();
        toast(res.message, 'y');
        alert(msg);
        const elBr = document.getElementById('ms-barang');
        if (elBr && elBr.style.display !== 'none') await renderBarang();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── LENGKAPI SATUAN 2/3 & ISI DARI EXCEL (endpoint AMAN, cuma update Satuan/Isi) ── */
window.bukaImportSatuanMassal = () => {
    openM(`
    <div class="mhd"><h3>📦 Lengkapi Satuan 2/3 &amp; Isi dari Excel</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
            <span>File Excel butuh kolom <strong>KODE_BARANG (atau kode)</strong> + minimal salah satu dari
            <strong>SATUAN_2, ISI, SATUAN_3, ISI_3</strong>. Endpoint ini <strong>HANYA</strong> mengubah kolom
            Satuan &amp; Isi — Harga Modal, Harga Jual, Harga Grosir, dan Harga Cabang yang sudah ada di Master
            Barang TIDAK akan tersentuh sama sekali, meski file-nya ada kolom harga.</span>
        </div>
        <button class="btn btn-g btn-sm" style="margin-bottom:10px;" onclick="downloadTemplateImportSatuan()">📄 Download Template Excel</button>
        <div class="fgroup">
            <label class="flabel">Pilih File Excel</label>
            <input type="file" id="importSatuanFile" accept=".xlsx,.xls,.csv" class="finput" style="padding:6px;">
        </div>
        <div id="importSatuanPreview" style="margin-top:12px;"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnDoImportSatuan" onclick="doImportSatuanMassal()" disabled>Simpan Satuan/Isi Sekarang</button>
    </div>`);
    document.getElementById('importSatuanFile').addEventListener('change', previewImportSatuanMassal);
};

window._importSatuanItems = [];
const SATUAN_HEADER_ALIAS = {
    kode    : ['kodebarang', 'kode'],
    satuan1 : ['satuan1'],
    satuan2 : ['satuan2'],
    satuan3 : ['satuan3'],
    isi     : ['isi'],
    isi3    : ['isi3', 'isisatuan3'],
};
function mapAoaSatuan(aoa) {
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let headerIdx = -1, col = {};
    for (let r = 0; r < aoa.length; r++) {
        const cells = (aoa[r] || []).map(norm);
        const iKode = cells.findIndex(c => SATUAN_HEADER_ALIAS.kode.includes(c));
        if (iKode >= 0) {
            headerIdx = r;
            for (const [field, aliases] of Object.entries(SATUAN_HEADER_ALIAS)) {
                col[field] = cells.findIndex(c => aliases.includes(c));
            }
            break;
        }
    }
    if (headerIdx === -1) {
        throw new Error('Baris header tidak ditemukan: pastikan file punya kolom "KODE_BARANG" atau "kode".');
    }
    const get = (row, field) => {
        const idx = col[field];
        return idx >= 0 && idx < row.length ? row[idx] : '';
    };
    const rows = [];
    for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const kode = String(get(row, 'kode')).trim();
        if (!kode) continue;
        rows.push({
            kode,
            satuan1: String(get(row, 'satuan1')).trim(),
            satuan2: String(get(row, 'satuan2')).trim(),
            satuan3: String(get(row, 'satuan3')).trim(),
            isi    : String(get(row, 'isi')).trim(),
            isi3   : String(get(row, 'isi3')).trim(),
        });
    }
    return rows;
}
window.previewImportSatuanMassal = async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const prev = document.getElementById('importSatuanPreview');
    prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';
    try {
        let rows;
        if (file.name.endsWith('.csv')) {
            const text = await file.text();
            const lines = text.split('\n').map(l => l.split(/[\t,;]/));
            rows = mapAoaSatuan(lines);
        } else {
            if (typeof XLSX === 'undefined') throw new Error('Library XLSX belum dimuat. Simpan file sebagai .csv lalu coba lagi.');
            const buf = await file.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
            rows = mapAoaSatuan(aoa);
        }
        window._importSatuanItems = rows;
        const valid = rows.filter(r => r.kode && (r.satuan2 || r.satuan3 || r.isi || r.isi3));
        prev.innerHTML = `
        <div class="note note-b"><span>✅ Ditemukan <strong>${rows.length}</strong> baris kode, <strong>${valid.length}</strong> punya data Satuan/Isi untuk disimpan.</span></div>
        <div class="tscroll" style="max-height:220px;overflow-y:auto;margin-top:8px;">
        <table><thead><tr><th>Kode</th><th>Satuan1</th><th>Satuan2</th><th>Isi</th><th>Satuan3</th><th>Isi3</th></tr></thead>
        <tbody>${valid.slice(0,20).map(r => `<tr>
            <td style="font-size:11px;font-family:var(--F-m);">${esc(r.kode)}</td>
            <td style="font-size:11px;">${esc(r.satuan1||'–')}</td>
            <td style="font-size:11px;">${esc(r.satuan2||'–')}</td>
            <td class="r" style="font-size:11px;">${esc(r.isi||'–')}</td>
            <td style="font-size:11px;">${esc(r.satuan3||'–')}</td>
            <td class="r" style="font-size:11px;">${esc(r.isi3||'–')}</td>
        </tr>`).join('')}
        ${valid.length > 20 ? `<tr><td colspan="6" style="text-align:center;color:var(--ink3);font-size:12px;">… dan ${valid.length-20} baris lainnya</td></tr>` : ''}
        </tbody></table></div>`;
        document.getElementById('btnDoImportSatuan').disabled = valid.length === 0;
    } catch (err) {
        prev.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
    }
};
window.doImportSatuanMassal = async () => {
    const items = (window._importSatuanItems || []).filter(r => r.kode && (r.satuan2 || r.satuan3 || r.isi || r.isi3));
    if (!items.length) { toast('Tidak ada data valid', 'err'); return; }
    const btn = document.getElementById('btnDoImportSatuan');
    btn.disabled = true;
    btn.textContent = 'Menyimpan…';
    try {
        let totalUpdated = 0, totalTidakDitemukan = 0, totalDilewati = 0, contohTidakDitemukan = [];
        for (let i = 0; i < items.length; i += 200) {
            const batch = items.slice(i, i + 200);
            const res = await apiPost('/master/barang/isi-satuan-massal', { items: batch });
            totalUpdated         += (res.updated || 0);
            totalTidakDitemukan  += (res.tidak_ditemukan || 0);
            totalDilewati        += (res.dilewati || 0);
            contohTidakDitemukan = contohTidakDitemukan.concat(res.contoh_tidak_ditemukan || []);
        }
        toast(`Satuan/Isi tersimpan: ${totalUpdated} barang diperbarui` + (totalTidakDitemukan ? `, ${totalTidakDitemukan} kode tidak ditemukan di Master Barang` : ''));
        if (contohTidakDitemukan.length) {
            console.warn('Kode tidak ditemukan di Master Barang:', contohTidakDitemukan);
        }
        closeM();
        await loadMasterData();
        const elBr = document.getElementById('ms-barang');
        if (elBr && elBr.style.display !== 'none') await renderBarang();
        alert(`Selesai. ${totalUpdated} barang diperbarui Satuan/Isi-nya.\n\nLangkah selanjutnya: klik "2) Cek & Perbaiki Konversi Transaksi Lama" untuk mengoreksi transaksi Penjualan/Pembelian lama yang tercatat sebelum Satuan/Isi ini diisi.`);
    } catch (err) { toast(err.message, 'err'); }
    finally { btn.disabled = false; btn.textContent = 'Simpan Satuan/Isi Sekarang'; }
};

/* ── CEK & PERBAIKI KONVERSI SATUAN TRANSAKSI LAMA ───────────────────── */
window.bukaPerbaikanKonversi = async () => {
    openM(`
    <div class="mhd"><h3>🔧 Cek &amp; Perbaiki Konversi Satuan Transaksi Lama</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" id="perbaikanKonversiBody"><div style="color:var(--ink3);font-size:13px;">Memeriksa data…</div></div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Tutup</button>
    </div>`);
    try {
        const res = await apiGet('/transaksi/perbaikan-konversi/preview');
        window._perbaikanKonversiPreview = res;
        const body = document.getElementById('perbaikanKonversiBody');
        if (!res.total_baris) {
            body.innerHTML = `<div class="note note-b"><span>✅ Tidak ada transaksi lama yang perlu dikonversi. Semua sudah konsisten dengan Satuan/Isi Master Barang saat ini.</span></div>`;
            return;
        }
        const baris = (label, d) => `
            <div style="margin-top:10px;">
                <strong>${label}</strong>: ${d.jumlah_baris} baris terdampak
                — nilai lama ${R(d.total_nilai_lama)} → nilai benar setelah dikonversi ${R(d.total_nilai_baru)}
                (selisih ${R(d.total_nilai_lama - d.total_nilai_baru)})
            </div>`;
        body.innerHTML = `
            <div class="note note-y"><span>⚠️ Ditemukan <strong>${res.total_baris}</strong> baris transaksi lama yang tercatat MENTAH (belum terkonversi ke satuan dasar), padahal Master Barang-nya sekarang sudah punya Satuan/Isi. Ini biasanya penyebab Laba Rugi meledak.</span></div>
            ${baris('Penjualan', res.jual)}
            ${baris('Pembelian', res.beli)}
            <div class="tscroll" style="max-height:200px;overflow-y:auto;margin-top:12px;">
            <table><thead><tr><th>Kode</th><th>Nama</th><th>Satuan</th><th>Qty Lama→Baru</th><th>Harga Lama→Baru</th></tr></thead>
            <tbody>${[...res.jual.contoh, ...res.beli.contoh].slice(0,20).map(r => `<tr>
                <td style="font-size:11px;font-family:var(--F-m);">${esc(r.kode_barang)}</td>
                <td style="font-size:12px;">${esc(r.nama||'')}</td>
                <td style="font-size:11px;">${esc(r.satuan)}</td>
                <td class="r" style="font-size:11px;">${r.qty_lama} → ${r.qty_baru}</td>
                <td class="r" style="font-size:11px;">${R(r.harga_lama)} → ${R(r.harga_baru)}</td>
            </tr>`).join('')}</tbody></table></div>
            <div class="fgroup" style="margin-top:14px;">
                <label class="flabel">Ketik "PERBAIKI KONVERSI" untuk menerapkan</label>
                <input class="finput" type="text" id="konfirmasiPerbaikanKonversi" placeholder='Ketik: PERBAIKI KONVERSI'>
                <span class="fhint">Stok akan disesuaikan otomatis mengikuti selisih qty. Tindakan ini bisa dijalankan berkali-kali dengan aman (baris yang sudah benar tidak akan diubah lagi).</span>
            </div>
            <button class="btn btn-p" style="margin-top:10px;" onclick="terapkanPerbaikanKonversi()">Terapkan Perbaikan Sekarang</button>
        `;
    } catch (err) {
        document.getElementById('perbaikanKonversiBody').innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};
window.terapkanPerbaikanKonversi = async () => {
    const teks = (document.getElementById('konfirmasiPerbaikanKonversi').value || '').trim();
    if (teks !== 'PERBAIKI KONVERSI') { toast('Ketik persis "PERBAIKI KONVERSI" untuk melanjutkan', 'err'); return; }
    try {
        const res = await apiPost('/transaksi/perbaikan-konversi/terapkan', { konfirmasi: teks });
        closeM();
        toast(res.message, 'y');
        await setTab('dashboard');
    } catch (err) { toast(err.message, 'err'); }
};

window.jalankanResetJualBeli = () => {
    openM(`
    <div class="mhd"><h3>Hapus Semua Penjualan & Pembelian</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <p style="line-height:1.6;">Tindakan ini akan menghapus SELURUH data transaksi Penjualan dan Pembelian secara permanen. Data Master Barang, Stok Awal, dan transaksi lain (Jasa, Sewa, Biaya, dll) tidak terpengaruh.</p>
        <p style="line-height:1.6;">Ketik HAPUS SEMUA di bawah ini untuk konfirmasi:</p>
        <input class="finput" type="text" id="konfirmasiResetInput" placeholder="Ketik: HAPUS SEMUA">
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-d" onclick="konfirmasiResetJualBeli()">Hapus Permanen</button>
    </div>`);
};
window.konfirmasiResetJualBeli = async () => {
    const teks = document.getElementById('konfirmasiResetInput').value.trim();
    if (teks !== 'HAPUS SEMUA') { toast('Ketik persis HAPUS SEMUA untuk melanjutkan', 'err'); return; }
    try {
        const res = await apiPost('/transaksi/reset-jual-beli', { konfirmasi: teks });
        closeM();
        toast(res.message, 'y');
        await setTab('dashboard');
    } catch (err) { toast(err.message, 'err'); }
};
window.saveTarif = async () => {
    const tarif = Number(document.getElementById('settingTarif').value);
    if (isNaN(tarif) || tarif < 0 || tarif > 100) { toast('Tarif harus antara 0–100%', 'err'); return; }
    const bolehMinus = document.getElementById('settingStokMinus').checked;
    try {
        await apiPut('/master/settings', { tarif_ppn: tarif, stok_boleh_minus: bolehMinus });
        STATE.tarif = tarif;
        STATE.stokBolehMinus = bolehMinus;
        document.getElementById('tarifBadge').textContent = tarif + '%';
        closeM();
        toast('Pengaturan disimpan');
    } catch (err) { toast(err.message, 'err'); }
};

/* ═══════════════════════════════════════════════════════════════
   MODUL KARYAWAN — Data, Absensi, Penggajian
   ═══════════════════════════════════════════════════════════════ */

// Jam kerja per shift — dipakai untuk auto-isi jam masuk/keluar di Absensi
// supaya admin tinggal pilih shift, tidak perlu ketik jam satu-satu.
const SHIFT_JAM = {
    Pagi  : { masuk: '07:00', keluar: '17:00', label: 'Pagi (07.00–17.00)' },
    Malam : { masuk: '14:00', keluar: '21:30', label: 'Malam (14.00–21.30)' },
};
function shiftOpts(selected) {
    return Object.keys(SHIFT_JAM).map(s => `<option value="${s}" ${selected===s?'selected':''}>${SHIFT_JAM[s].label}</option>`).join('');
}

window._karyawanTab = 'data'; // data | absensi | gaji

async function renderKaryawan(subTab) {
    if (subTab) window._karyawanTab = subTab;
    const el = document.getElementById('ms-karyawan');
    const tab = window._karyawanTab;

    const tabs = `
    <div class="subnav" style="margin-bottom:16px;">
        <button class="${tab==='data'?'on':''}" onclick="renderKaryawan('data')">👤 Data Karyawan</button>
        <button class="${tab==='absensi'?'on':''}" onclick="renderKaryawan('absensi')">📅 Absensi</button>
        <button class="${tab==='gaji'?'on':''}" onclick="renderKaryawan('gaji')">💰 Penggajian</button>
    </div>`;

    el.innerHTML = tabs + loadingHTML;

    if (tab === 'data')    await renderKaryawanData(el, tabs);
    if (tab === 'absensi') await renderKaryawanAbsensi(el, tabs);
    if (tab === 'gaji')    await renderKaryawanGaji(el, tabs);
}
window.renderKaryawan = renderKaryawan;

/* ── DATA KARYAWAN ─────────────────────────────────────────── */
window.toggleLabelGajiPokok = (selId, labelId) => {
    const tipe = document.getElementById(selId).value;
    document.getElementById(labelId).textContent = tipe === 'Harian' ? 'Gaji Pokok / Hari (Rp) *' : 'Gaji Pokok (Rp) *';
};

async function renderKaryawanData(el, tabs) {
    try {
        const listAll = await apiGet('/karyawan');
        const search = window._karyawanSearch || '';
        const list = window.clientSearch(listAll, search, ['kode', 'nama', 'jabatan', 'cabang']);
        const aktif   = listAll.filter(k => k.status === 'Aktif').length;
        const nonaktif = listAll.length - aktif;

        el.innerHTML = tabs + `
        <div class="kpi-grid" style="margin-bottom:16px;">
            <div class="kpi"><div class="kpi-label">Total Karyawan</div><div class="kpi-val">${list.length}</div></div>
            <div class="kpi"><div class="kpi-label">Aktif</div><div class="kpi-val pos">${aktif}</div></div>
            <div class="kpi"><div class="kpi-label">Nonaktif</div><div class="kpi-val">${nonaktif}</div></div>
        </div>
        <div class="row2">
            <div class="box">
                <div class="box-hd"><h3>Tambah Karyawan</h3>
                    <button class="btn btn-g btn-sm" onclick="bukaImportKaryawan()">📋 Import Banyak Sekaligus</button>
                </div>
                <div class="box-bd">
                    <form id="fKaryawan">
                        <div class="fgrid">
                            <div class="fgroup"><label class="flabel">Kode Karyawan *</label>
                                <input class="finput" id="krK" required placeholder="KRY001"></div>
                            <div class="fgroup"><label class="flabel">Nama Lengkap *</label>
                                <input class="finput" id="krN" required></div>
                            <div class="fgroup"><label class="flabel">Jabatan</label>
                                <input class="finput" id="krJ" placeholder="Kasir, Admin, dsb"></div>
                            <div class="fgroup"><label class="flabel">Shift Kerja *</label>
                                <select class="fselect" id="krShift">${shiftOpts('Pagi')}</select></div>
                            <div class="fgroup"><label class="flabel">Cabang</label>
                                <select class="fselect" id="krC">${cabangOpts()}</select></div>
                            <div class="fgroup"><label class="flabel">No. Telepon</label>
                                <input class="finput" id="krT" placeholder="Opsional"></div>
                            <div class="fgroup"><label class="flabel">Tanggal Masuk</label>
                                <input class="finput" type="date" id="krTM"></div>
                            <div class="fgroup"><label class="flabel">Tipe Gaji *</label>
                                <select class="fselect" id="krTG" onchange="toggleLabelGajiPokok('krTG','krLabelGP')">
                                    <option>Harian</option><option>Bulanan</option><option>Mingguan</option>
                                </select></div>
                            <div class="fgroup"><label class="flabel" id="krLabelGP">Gaji Pokok / Hari (Rp) *</label>
                                <input class="finput" type="number" id="krGP" min="0" required placeholder="0"></div>
                            <div class="fgroup"><label class="flabel">Tunjangan (Rp)</label>
                                <input class="finput" type="number" id="krTJ" min="0" placeholder="0"></div>
                            <div class="fgroup"><label class="flabel">Catatan</label>
                                <input class="finput" id="krCat" placeholder="Opsional"></div>
                        </div>
                        <button class="btn btn-p" type="submit">+ Simpan Karyawan</button>
                    </form>
                </div>
            </div>
            <div class="box">
                <div class="box-hd">
                    <h3>Daftar Karyawan</h3>
                    <div style="display:flex;gap:8px;align-items:center;">
                        <input class="finput" id="srchKaryawan" placeholder="🔍 Cari nama, kode, jabatan…" value="${esc(search)}" style="width:180px;"
                            oninput="smartSearch('srchKaryawan', this.value, v => { window._karyawanSearch = v; }, () => renderKaryawan('data'))">
                        <button class="btn btn-g btn-sm" onclick="exportExcel('tblKaryawan','karyawan')">📊 Export</button>
                    </div>
                </div>
                <div class="box-bd pad0 tscroll">
                    ${list.length ? `
                    <table id="tblKaryawan">
                        <thead><tr><th>Kode</th><th>Nama</th><th>Jabatan</th><th>Shift</th><th>Cabang</th><th>Tipe Gaji</th><th class="r">Gaji Pokok</th><th>Status</th><th></th></tr></thead>
                        <tbody>${list.map(k => `<tr class="row-click" ondblclick="editKaryawan(${k.id})" title="Klik 2x untuk edit">
                            <td style="font-family:var(--F-m);font-size:11px;">${esc(k.kode)}</td>
                            <td><strong>${esc(k.nama)}</strong>${k.telp ? `<div style="font-size:11px;color:var(--ink3);">${esc(k.telp)}</div>` : ''}</td>
                            <td>${esc(k.jabatan||'–')}</td>
                            <td><span class="badge ${k.shift==='Malam'?'badge-warn':'badge-info'}">${k.shift==='Malam'?'🌙':'☀️'} ${k.shift||'Pagi'}</span></td>
                            <td>${esc(k.cabang||'–')}</td>
                            <td><span class="badge badge-info">${k.tipe_gaji}</span></td>
                            <td class="r"><strong>${R(k.gaji_pokok)}${k.tipe_gaji==='Harian'?'<span style="font-weight:400;color:var(--ink3);">/hari</span>':''}</strong>${k.tunjangan>0?`<div style="font-size:11px;color:var(--ink3);">+${R(k.tunjangan)} tunjangan</div>`:''}</td>
                            <td><span class="badge ${k.status==='Aktif'?'badge-in':'badge-out'}">${k.status}</span></td>
                            <td style="display:flex;gap:4px;">
                                <button class="btn btn-g btn-sm" onclick="event.stopPropagation();editKaryawan(${k.id})">✏️</button>
                                <button class="row-del" onclick="event.stopPropagation();hapusKaryawan(${k.id})">✕</button>
                            </td>
                        </tr>`).join('')}</tbody>
                    </table>`
                    : '<div class="empty"><div class="ico">👤</div><strong>Belum ada karyawan.</strong></div>'}</div>
            </div>
        </div>`;

        document.getElementById('fKaryawan').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/karyawan', {
                    kode       : document.getElementById('krK').value.trim(),
                    nama       : document.getElementById('krN').value.trim(),
                    jabatan    : document.getElementById('krJ').value.trim()||null,
                    shift      : document.getElementById('krShift').value,
                    cabang     : document.getElementById('krC').value||null,
                    telp       : document.getElementById('krT').value.trim()||null,
                    tgl_masuk  : document.getElementById('krTM').value||null,
                    tipe_gaji  : document.getElementById('krTG').value,
                    gaji_pokok : Number(document.getElementById('krGP').value)||0,
                    tunjangan  : Number(document.getElementById('krTJ').value)||0,
                    catatan    : document.getElementById('krCat').value.trim()||null,
                });
                toast('Karyawan ditambahkan');
                await renderKaryawan('data');
            } catch(err) { toast(err.message,'err'); }
        };
    } catch(err) {
        el.innerHTML = tabs + `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}

window.editKaryawan = async id => {
    const list = await apiGet('/karyawan');
    const k = list.find(x => x.id === id);
    if (!k) { toast('Data tidak ditemukan','err'); return; }
    openM(`
    <div class="mhd"><h3>✏️ Edit Karyawan</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" style="max-height:70vh;overflow-y:auto;">
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Kode</label>
                <input class="finput" value="${esc(k.kode)}" disabled style="opacity:.6;"></div>
            <div class="fgroup"><label class="flabel">Nama *</label>
                <input class="finput" id="ekN" value="${esc(k.nama)}" required></div>
            <div class="fgroup"><label class="flabel">Jabatan</label>
                <input class="finput" id="ekJ" value="${esc(k.jabatan||'')}"></div>
            <div class="fgroup"><label class="flabel">Shift Kerja</label>
                <select class="fselect" id="ekShift">${shiftOpts(k.shift||'Pagi')}</select></div>
            <div class="fgroup"><label class="flabel">Cabang</label>
                <select class="fselect" id="ekC">${cabangOpts(k.cabang)}</select></div>
            <div class="fgroup"><label class="flabel">Telepon</label>
                <input class="finput" id="ekT" value="${esc(k.telp||'')}"></div>
            <div class="fgroup"><label class="flabel">Tanggal Masuk</label>
                <input class="finput" type="date" id="ekTM" value="${k.tgl_masuk||''}"></div>
            <div class="fgroup"><label class="flabel">Tipe Gaji</label>
                <select class="fselect" id="ekTG" onchange="toggleLabelGajiPokok('ekTG','ekLabelGP')">
                    <option ${k.tipe_gaji==='Harian'?'selected':''}>Harian</option>
                    <option ${k.tipe_gaji==='Bulanan'?'selected':''}>Bulanan</option>
                    <option ${k.tipe_gaji==='Mingguan'?'selected':''}>Mingguan</option>
                </select></div>
            <div class="fgroup"><label class="flabel" id="ekLabelGP">${k.tipe_gaji==='Harian'?'Gaji Pokok / Hari (Rp)':'Gaji Pokok (Rp)'}</label>
                <input class="finput" type="number" id="ekGP" value="${k.gaji_pokok||0}" min="0"></div>
            <div class="fgroup"><label class="flabel">Tunjangan (Rp)</label>
                <input class="finput" type="number" id="ekTJ" value="${k.tunjangan||0}" min="0"></div>
            <div class="fgroup"><label class="flabel">Status</label>
                <select class="fselect" id="ekSt">
                    <option ${k.status==='Aktif'?'selected':''}>Aktif</option>
                    <option ${k.status==='Nonaktif'?'selected':''}>Nonaktif</option>
                </select></div>
            <div class="fgroup"><label class="flabel">Catatan</label>
                <input class="finput" id="ekCat" value="${esc(k.catatan||'')}"></div>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="saveKaryawan(${id})">Simpan Perubahan</button>
    </div>`);
};
window.saveKaryawan = async id => {
    try {
        await apiPut('/karyawan/'+id, {
            nama      : document.getElementById('ekN').value.trim(),
            jabatan   : document.getElementById('ekJ').value.trim()||null,
            shift     : document.getElementById('ekShift').value,
            cabang    : document.getElementById('ekC').value||null,
            telp      : document.getElementById('ekT').value.trim()||null,
            tgl_masuk : document.getElementById('ekTM').value||null,
            tipe_gaji : document.getElementById('ekTG').value,
            gaji_pokok: Number(document.getElementById('ekGP').value)||0,
            tunjangan : Number(document.getElementById('ekTJ').value)||0,
            status    : document.getElementById('ekSt').value,
            catatan   : document.getElementById('ekCat').value.trim()||null,
        });
        toast('Karyawan diperbarui'); closeM();
        await renderKaryawan('data');
    } catch(err) { toast(err.message,'err'); }
};
window.hapusKaryawan = async id => {
    if (!(await confirmDialog('Hapus karyawan ini? Semua data absensi & gaji ikut terhapus.'))) return;
    try {
        await apiDel('/karyawan/'+id);
        toast('Karyawan dihapus','y');
        await renderKaryawan('data');
    } catch(err) { toast(err.message,'err'); }
};

/* ── IMPORT BANYAK KARYAWAN SEKALIGUS ─────────────────────────
   Ditujukan untuk kasus paste daftar dari catatan/foto: satu baris
   per karyawan, format "Nama, Gaji" atau "Nama<tab>Gaji". Tipe gaji
   & cabang diterapkan ke SEMUA baris yang di-paste (bisa diedit
   satu-satu lagi setelahnya kalau ada pengecualian). */
window.bukaImportKaryawan = () => {
    openM(`
    <div class="mhd"><h3>📋 Import Banyak Karyawan Sekaligus</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
            <span>Paste daftar, satu baris per karyawan, format <strong>Nama, Gaji</strong> (boleh juga dipisah tab).<br>
            Contoh: <code>Silfi, 150000</code> — kode karyawan (KRY001, dst) dibuat otomatis.</span>
        </div>
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tipe Gaji (berlaku untuk semua baris)</label>
                <select class="fselect" id="impTG">
                    <option>Harian</option><option>Bulanan</option><option>Mingguan</option>
                </select></div>
            <div class="fgroup"><label class="flabel">Cabang (opsional, berlaku untuk semua baris)</label>
                <select class="fselect" id="impCab">${cabangOpts()}</select></div>
        </div>
        <div class="fgroup">
            <label class="flabel">Daftar Nama &amp; Gaji</label>
            <textarea class="finput" id="impText" rows="10" style="font-family:var(--F-m,monospace);font-size:12.5px;" placeholder="Silfi, 150000
Dwi Putri, 140000
Tiwul, 90000"></textarea>
        </div>
        <div id="impPreview" style="margin-top:10px;font-size:12.5px;color:var(--ink3);"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="prosesImportKaryawan()">Import Sekarang</button>
    </div>`);
    document.getElementById('impText').addEventListener('input', previewImportKaryawan);
};

function parseBarisKaryawan(teks) {
    return teks.split('\n').map(line => {
        const parts = line.includes('\t') ? line.split('\t') : line.split(',');
        const nama = (parts[0] || '').trim();
        let gajiRaw = (parts[1] || '').trim().replace(/[^\d]/g, '');
        const gaji = gajiRaw ? parseInt(gajiRaw, 10) : NaN;
        return { nama, gaji };
    }).filter(r => r.nama);
}

window.previewImportKaryawan = () => {
    const rows = parseBarisKaryawan(document.getElementById('impText').value);
    const valid = rows.filter(r => !isNaN(r.gaji) && r.gaji > 0);
    const invalid = rows.length - valid.length;
    document.getElementById('impPreview').innerHTML =
        `${rows.length} baris terbaca, <strong style="color:var(--pos);">${valid.length} valid</strong>` +
        (invalid ? `, <strong style="color:var(--neg);">${invalid} baris gagal dibaca angka gajinya (dilewati)</strong>` : '');
};

window.prosesImportKaryawan = async () => {
    const rows = parseBarisKaryawan(document.getElementById('impText').value);
    const valid = rows.filter(r => !isNaN(r.gaji) && r.gaji > 0);
    if (!valid.length) { toast('Tidak ada baris valid untuk diimport','err'); return; }
    const tipeGaji = document.getElementById('impTG').value;
    const cabang   = document.getElementById('impCab').value || null;
    try {
        const res = await apiPost('/karyawan/import-bulk', {
            items: valid.map(r => ({ nama: r.nama, gaji_pokok: r.gaji, tipe_gaji: tipeGaji, cabang }))
        });
        toast(res.message, 'y');
        closeM();
        await renderKaryawan('data');
    } catch(err) { toast(err.message, 'err'); }
};

/* ── ABSENSI ───────────────────────────────────────────────── */
async function renderKaryawanAbsensi(el, tabs) {
    try {
        const tglDefault = today();
        const karyawanList = await apiGet('/karyawan?status=Aktif');
        const absenList    = await apiGet('/karyawan/absensi?tgl=' + tglDefault);
        const absenMap     = {};
        absenList.forEach(a => { absenMap[a.karyawan_id] = a; });

        el.innerHTML = tabs + `
        <div class="box">
            <div class="box-hd">
                <h3>Catat Absensi</h3>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input class="finput" type="date" id="absTgl" value="${tglDefault}" onchange="reloadAbsensi(this.value)" style="width:160px;">
                    ${karyawanList.length ? `<button class="btn btn-p btn-sm" onclick="simpanAbsensiMassal()">💾 Simpan Semua Absensi</button>` : ''}
                </div>
            </div>
            <div class="box-bd">
                <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
                    <span>Klik status &amp; pilih <strong>Shift</strong> untuk isi jam otomatis (Pagi 07.00–17.00 / Malam 14.00–21.30). Klik <strong>Simpan Semua Absensi</strong> di atas untuk menyimpan sekaligus.</span>
                </div>
                ${karyawanList.length ? `
                <table id="tblAbsen">
                    <thead><tr><th>Karyawan</th><th>Jabatan</th><th>Cabang</th><th>Status</th><th>Shift</th><th>Keterangan</th></tr></thead>
                    <tbody>
                    ${karyawanList.map(k => {
                        const abs = absenMap[k.id] || {};
                        const st  = abs.status || 'Hadir';
                        const sh  = abs.shift || k.shift || 'Pagi';
                        return `<tr>
                            <td><strong>${esc(k.nama)}</strong></td>
                            <td style="font-size:12px;">${esc(k.jabatan||'–')}</td>
                            <td style="font-size:12px;">${esc(k.cabang||'–')}</td>
                            <td>
                                <select class="fselect abs-status" data-kid="${k.id}" style="width:100px;">
                                    ${['Hadir','Izin','Sakit','Alpha'].map(s=>`<option ${st===s?'selected':''}>${s}</option>`).join('')}
                                </select>
                            </td>
                            <td>
                                <select class="fselect abs-shift" data-kid="${k.id}" style="width:170px;">
                                    ${shiftOpts(sh)}
                                </select>
                            </td>
                            <td><input class="finput abs-ket" data-kid="${k.id}" value="${esc(abs.keterangan||'')}" placeholder="–" style="width:120px;"></td>
                        </tr>`;
                    }).join('')}
                    </tbody>
                </table>`
                : '<div class="empty"><div class="ico">👤</div><strong>Belum ada karyawan aktif.</strong></div>'}
            </div>
        </div>

        <div class="box">
            <div class="box-hd"><h3>Rekap Absensi Bulanan</h3>
                <div style="display:flex;gap:8px;">
                    <input class="finput" type="month" id="rekapBulan" value="${tglDefault.slice(0,7)}" style="width:150px;">
                    <button class="btn btn-g btn-sm" onclick="loadRekapAbsensi()">Tampilkan</button>
                </div>
            </div>
            <div id="rekapAbsensiEl" class="box-bd pad0">
                <div class="empty"><div class="ico">📅</div><strong>Pilih bulan lalu klik Tampilkan.</strong></div>
            </div>
        </div>`;

    } catch(err) {
        el.innerHTML = tabs + `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.reloadAbsensi = async tgl => {
    const absenList = await apiGet('/karyawan/absensi?tgl=' + tgl);
    const absenMap  = {};
    absenList.forEach(a => { absenMap[a.karyawan_id] = a; });
    // Update values di tabel tanpa re-render penuh
    document.querySelectorAll('.abs-status').forEach(sel => {
        const kid = parseInt(sel.dataset.kid);
        const abs = absenMap[kid] || {};
        sel.value = abs.status || 'Hadir';
    });
    document.querySelectorAll('.abs-shift').forEach(sel => {
        const kid = parseInt(sel.dataset.kid);
        const abs = absenMap[kid] || {};
        if (abs.shift) sel.value = abs.shift;
    });
    document.querySelectorAll('.abs-ket').forEach(inp => {
        const kid = parseInt(inp.dataset.kid);
        inp.value = (absenMap[kid]||{}).keterangan || '';
    });
};
window.simpanAbsensiMassal = async () => {
    const tgl   = document.getElementById('absTgl').value;
    const items = [];
    document.querySelectorAll('.abs-status').forEach(sel => {
        const kid   = sel.dataset.kid;
        const shift = document.querySelector(`.abs-shift[data-kid="${kid}"]`)?.value || 'Pagi';
        const jam   = SHIFT_JAM[shift] || SHIFT_JAM.Pagi;
        items.push({
            karyawan_id: parseInt(kid),
            status     : sel.value,
            shift      : shift,
            jam_masuk  : jam.masuk,
            jam_keluar : jam.keluar,
            keterangan : document.querySelector(`.abs-ket[data-kid="${kid}"]`)?.value || null,
        });
    });
    try {
        const res = await apiPost('/karyawan/absensi/bulk', { tgl, items });
        toast(`Absensi ${tgl} tersimpan (${res.saved} karyawan)`);
    } catch(err) { toast(err.message,'err'); }
};
window.loadRekapAbsensi = async () => {
    const bulan = document.getElementById('rekapBulan').value;
    const el    = document.getElementById('rekapAbsensiEl');
    el.innerHTML = loadingHTML;
    try {
        const res = await apiGet('/karyawan/absensi/rekap?bulan=' + bulan);
        if (!res.length) { el.innerHTML = '<div class="empty"><div class="ico">📅</div><strong>Tidak ada data.</strong></div>'; return; }
        el.innerHTML = `
        <table>
            <thead><tr><th>Nama</th><th>Jabatan</th><th>Cabang</th><th class="r">Hadir</th><th class="r">Izin</th><th class="r">Sakit</th><th class="r">Alpha</th><th class="r">Total Hari</th></tr></thead>
            <tbody>${res.map(r => `<tr>
                <td><strong>${esc(r.karyawan.nama)}</strong></td>
                <td style="font-size:12px;">${esc(r.karyawan.jabatan||'–')}</td>
                <td style="font-size:12px;">${esc(r.karyawan.cabang||'–')}</td>
                <td class="r"><span class="badge badge-in">${r.hadir}</span></td>
                <td class="r"><span class="badge badge-info">${r.izin}</span></td>
                <td class="r"><span class="badge badge-warn">${r.sakit}</span></td>
                <td class="r"><span class="badge badge-out">${r.alpha}</span></td>
                <td class="r">${r.total_hari}</td>
            </tr>`).join('')}</tbody>
        </table>`;
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

/* ── PENGGAJIAN ────────────────────────────────────────────── */
async function renderKaryawanGaji(el, tabs) {
    try {
        const karyawanList = await apiGet('/karyawan?status=Aktif');
        const gajiList     = await apiGet('/karyawan/gaji');
        window._gajiListCache = gajiList; // dipakai cetakSlipGaji() agar tak perlu fetch ulang

        el.innerHTML = tabs + `
        <div class="note note-b"><span class="note-ico">ℹ️</span>
            <span>Setelah gaji disimpan, otomatis tercatat di <strong>Pengeluaran (Beban Gaji)</strong>. Hapus data gaji = hapus pengeluaran terkait.</span>
        </div>
        <div class="row2">
            <div class="box">
                <div class="box-hd"><h3>Bayar Gaji</h3></div>
                <div class="box-bd">
                    <form id="fGaji">
                        <div class="fgrid">
                            <div class="fgroup"><label class="flabel">Karyawan *</label>
                                <select class="fselect" id="gjKid" onchange="isiGajiOtomatis(this.value)">
                                    <option value="">-- Pilih Karyawan --</option>
                                    ${karyawanList.map(k=>`<option value="${k.id}" data-pokok="${k.gaji_pokok}" data-tunjangan="${k.tunjangan}" data-tipe="${k.tipe_gaji}" data-cabang="${esc(k.cabang||'')}">${esc(k.nama)} (${k.tipe_gaji})</option>`).join('')}
                                </select></div>
                            <div class="fgroup"><label class="flabel">Periode Mulai *</label>
                                <input class="finput" type="date" id="gjMul" required></div>
                            <div class="fgroup"><label class="flabel">Periode Selesai *</label>
                                <input class="finput" type="date" id="gjSel" required></div>
                            <div class="fgroup"><label class="flabel">Cabang</label>
                                <select class="fselect" id="gjCab">${cabangOpts()}</select></div>
                            <div class="fgroup"><label class="flabel">Gaji Pokok (Rp)</label>
                                <input class="finput" type="number" id="gjGP" min="0" placeholder="Otomatis dari data karyawan"></div>
                            <div class="fgroup"><label class="flabel">Tunjangan (Rp)</label>
                                <input class="finput" type="number" id="gjTJ" min="0" value="0"></div>
                            <div class="fgroup"><label class="flabel">Bonus (Rp)</label>
                                <input class="finput" type="number" id="gjBon" min="0" value="0"></div>
                            <div class="fgroup"><label class="flabel">Potongan Manual (Rp)</label>
                                <input class="finput" type="number" id="gjPot" min="0" value="0">
                                <span class="fhint">Potongan alpha dihitung otomatis dari absensi</span></div>
                            <div class="fgroup"><label class="flabel">Potong dari Kasbon (Rp)</label>
                                <input class="finput" type="number" id="gjPotKasbon" min="0" value="0">
                                <span class="fhint" id="gjKasbonHint">Pilih karyawan dulu untuk melihat sisa kasbon</span></div>
                            <div class="fgroup"><label class="flabel">Keterangan</label>
                                <input class="finput" id="gjKet" placeholder="Opsional"></div>
                        </div>
                        <div id="gjPreview" style="display:none;background:var(--bg2);border-radius:8px;padding:12px;margin:8px 0;font-size:13px;"></div>
                        <button class="btn btn-p" type="submit">💰 Proses & Simpan Gaji</button>
                    </form>
                </div>
            </div>
            <div class="box">
                <div class="box-hd">
                    <h3>Riwayat Pembayaran Gaji</h3>
                    <button class="btn btn-g btn-sm" onclick="exportExcel('tblGaji','riwayat-gaji')">📊 Export</button>
                </div>
                <div class="box-bd pad0 tscroll">
                    ${gajiList.length ? `
                    <table id="tblGaji">
                        <thead><tr><th>Karyawan</th><th>Periode</th><th>Tipe</th><th class="r">Pokok</th><th class="r">Bonus</th><th class="r">Potongan</th><th class="r">Kasbon</th><th class="r">Total</th><th>Absensi</th><th></th></tr></thead>
                        <tbody>${gajiList.map(g=>`<tr>
                            <td><strong>${esc(g.nama_karyawan)}</strong><div style="font-size:11px;color:var(--ink3);">${esc(g.jabatan||'')}</div></td>
                            <td style="font-size:11px;">${fmtTgl(g.periode_mulai)}<br>s/d ${fmtTgl(g.periode_selesai)}</td>
                            <td><span class="badge badge-info">${g.tipe_gaji}</span></td>
                            <td class="r">${R(g.gaji_pokok)}${g.tunjangan>0?`<div style="font-size:11px;color:var(--ink3);">+${R(g.tunjangan)}</div>`:''}</td>
                            <td class="r">${g.bonus>0?`<span style="color:var(--pos);">+${R(g.bonus)}</span>`:'–'}</td>
                            <td class="r">${g.potongan>0?`<span style="color:var(--neg);">-${R(g.potongan)}</span>`:'–'}</td>
                            <td class="r">${g.potongan_kasbon>0?`<span style="color:var(--neg);">-${R(g.potongan_kasbon)}</span>`:'–'}</td>
                            <td class="r"><strong>${R(g.total)}</strong></td>
                            <td style="font-size:11px;">
                                <span class="badge badge-in">H:${g.hari_hadir}</span>
                                ${g.hari_izin>0?`<span class="badge badge-info">I:${g.hari_izin}</span>`:''}
                                ${g.hari_alpha>0?`<span class="badge badge-out">A:${g.hari_alpha}</span>`:''}
                            </td>
                            <td style="display:flex;gap:4px;">
                                <button class="btn btn-g btn-sm" onclick="cetakSlipGaji(${g.id})">🖨️ Slip</button>
                                <button class="row-del" onclick="hapusGaji(${g.id})">✕</button>
                            </td>
                        </tr>`).join('')}</tbody>
                    </table>`
                    : '<div class="empty"><div class="ico">💰</div><strong>Belum ada riwayat gaji.</strong></div>'}</div>
            </div>
        </div>`;

        document.getElementById('fGaji').onsubmit = async e => {
            e.preventDefault();
            const kid = document.getElementById('gjKid').value;
            if (!kid) { toast('Pilih karyawan dulu','err'); return; }
            const potKasbon = Number(document.getElementById('gjPotKasbon').value)||0;
            if (potKasbon > (window._gjKasbonSaldo||0)) {
                toast('Potongan kasbon melebihi sisa kasbon karyawan ini','err'); return;
            }
            try {
                const res = await apiPost('/karyawan/gaji', {
                    karyawan_id    : parseInt(kid),
                    periode_mulai  : document.getElementById('gjMul').value,
                    periode_selesai: document.getElementById('gjSel').value,
                    cabang         : document.getElementById('gjCab').value||null,
                    bonus          : Number(document.getElementById('gjBon').value)||0,
                    potongan       : Number(document.getElementById('gjPot').value)||0,
                    potong_kasbon  : Number(document.getElementById('gjPotKasbon').value)||0,
                    keterangan     : document.getElementById('gjKet').value.trim()||null,
                });
                toast(`Gaji ${R(res.total)} berhasil diproses & dicatat ke pengeluaran`);
                await renderKaryawan('gaji');
            } catch(err) { toast(err.message,'err'); }
        };
    } catch(err) {
        el.innerHTML = tabs + `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}

window.isiGajiOtomatis = async id => {
    if (!id) return;
    const sel  = document.getElementById('gjKid');
    const opt  = sel.options[sel.selectedIndex];
    const gp   = parseFloat(opt.dataset.pokok||0);
    const tj   = parseFloat(opt.dataset.tunjangan||0);
    const tipe = opt.dataset.tipe;
    const cab  = opt.dataset.cabang;

    document.getElementById('gjGP').value = gp;
    document.getElementById('gjTJ').value = tj;
    if (cab) {
        const cabSel = document.getElementById('gjCab');
        for (let o of cabSel.options) { if (o.value === cab) { cabSel.value = cab; break; } }
    }
    // Set periode otomatis
    const now = new Date();
    if (tipe === 'Mingguan') {
        // Senin minggu ini → Minggu ini
        const day = now.getDay(); // 0=Sun
        const mon = new Date(now); mon.setDate(now.getDate() - (day===0?6:day-1));
        const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        document.getElementById('gjMul').value = mon.toISOString().slice(0,10);
        document.getElementById('gjSel').value = sun.toISOString().slice(0,10);
    } else {
        // Bulan ini
        const y = now.getFullYear(), m = now.getMonth();
        document.getElementById('gjMul').value = `${y}-${String(m+1).padStart(2,'0')}-01`;
        const lastDay = new Date(y, m+1, 0).getDate();
        document.getElementById('gjSel').value = `${y}-${String(m+1).padStart(2,'0')}-${lastDay}`;
    }
    // Preview total estimasi
    const prev = document.getElementById('gjPreview');
    prev.style.display = 'block';
    if (tipe === 'Harian') {
        prev.innerHTML = `<strong>Estimasi Gaji Harian:</strong> ${R(gp)} / hari × jumlah hari <em>Hadir</em> di periode ini (dihitung otomatis dari Absensi saat disimpan) ${tj>0?`+ ${R(tj)} tunjangan`:''}.
            <span style="color:var(--ink3);font-size:11px;"> Pastikan Absensi periode ini sudah diisi dulu, kalau belum ada absensi sama sekali proses gaji akan ditolak.</span>`;
    } else {
        const total = gp + tj;
        prev.innerHTML = `<strong>Estimasi Gaji:</strong> ${R(gp)} pokok + ${R(tj)} tunjangan = <strong style="color:var(--pos);">${R(total)}</strong>
            <span style="color:var(--ink3);font-size:11px;"> (belum termasuk bonus & potongan alpha dari absensi)</span>`;
    }

    // Cek sisa kasbon karyawan ini, supaya admin bisa langsung potong dari gaji
    const potInput = document.getElementById('gjPotKasbon');
    const hint      = document.getElementById('gjKasbonHint');
    potInput.value  = 0;
    hint.textContent = 'Memuat sisa kasbon…';
    try {
        const kb = await apiGet('/karyawan/'+id+'/kasbon-saldo');
        const saldo = Number(kb.saldo) || 0;
        potInput.max = saldo;
        window._gjKasbonSaldo = saldo;
        if (saldo > 0) {
            hint.innerHTML = `Sisa kasbon karyawan ini: <strong style="color:var(--neg);">${R(saldo)}</strong> — <a href="#" onclick="document.getElementById('gjPotKasbon').value=${saldo};return false;">potong semua</a>`;
        } else {
            hint.textContent = 'Karyawan ini tidak punya sisa kasbon.';
        }
    } catch (err) {
        hint.textContent = 'Gagal memuat sisa kasbon.';
    }
};

window.hapusGaji = async id => {
    if (!(await confirmDialog('Hapus data gaji ini? Pengeluaran terkait juga akan dihapus.'))) return;
    try {
        await apiDel('/karyawan/gaji/'+id);
        toast('Gaji dihapus & pengeluaran dibatalkan','y');
        await renderKaryawan('gaji');
    } catch(err) { toast(err.message,'err'); }
};
