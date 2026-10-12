/* =============================================================
   transaksi.js — Render & Input Semua Jenis Transaksi
   8 sub-modul di sini: jual, beli, jasa, sewa, retur,
                        kasbon, cashbon, biaya
   Sub-modul "mutasi" (Mutasi Barang) ada di mutasi.js sendiri —
   dipisah karena alurnya beda (paket multi-barang + konfirmasi
   2 sisi), bukan cuma form-simpan-tabel seperti yang lain.
   Setiap transaksi yang disimpan ke DB akan otomatis masuk
   ke jurnal double-entry saat DashboardController::buildJurnal()
   dipanggil oleh endpoint laporan/jurnal.
   ============================================================= */

/* ── FILTER STATE per sub-modul (jual/beli) — dipertahankan antar render ── */
window._trxFilter = window._trxFilter || {};
function trxFilter(jenis) {
    if (!window._trxFilter[jenis]) {
        window._trxFilter[jenis] = { preset: 'semua', dari: '', sampai: '', perPage: 30, search: '' };
    }
    return window._trxFilter[jenis];
}

/** Dipanggil dari tombol preset Hari ini / Bulan ini / Semua */
window.setTrxPreset = (jenis, elId, preset) => {
    const f = trxFilter(jenis);
    f.preset = preset;
    if (preset === 'hari') {
        f.dari = f.sampai = today();
    } else if (preset === 'bulan') {
        f.dari = today().slice(0, 8) + '01';
        f.sampai = today();
    } else if (preset === 'semua') {
        f.dari = f.sampai = '';
    }
    renderJualBeli(jenis, elId, 1);
};

/** Dipanggil saat user pilih tanggal custom (Dari/Sampai) */
window.setTrxTanggal = (jenis, elId, field, val) => {
    const f = trxFilter(jenis);
    f[field] = val;
    f.preset = 'custom';
    renderJualBeli(jenis, elId, 1);
};

window.setTrxPerPage = (jenis, elId, val) => {
    trxFilter(jenis).perPage = Number(val);
    renderJualBeli(jenis, elId, 1);
};
/* ── HELPER: Form Transaksi Jual/Beli ─────────────────────── */
/**
 * Kelompokkan baris trx_jual/trx_beli berdasarkan `no_nota` (transaksi yang
 * dibuat lewat Kasir POS, banyak barang dalam 1 struk) supaya Riwayat di
 * menu Transaksi lama menampilkan 1 baris per TRANSAKSI, bukan 1 baris per
 * barang — sama seperti tampilan Riwayat di Kasir POS. Baris lama (input
 * manual satu-satu, `no_nota` kosong) tetap tampil apa adanya, 1 baris
 * sendiri-sendiri, supaya tidak mengubah kelakuan yang sudah ada.
 * @param {Array} list - hasil dari GET /transaksi/jual atau /transaksi/beli
 * @returns {Array<{noNota:string,rows:Array}|{noNota:null,row:object}>}
 */
function trxGroupByNota(list) {
    const out = [];
    const idxByNota = {};
    list.forEach(t => {
        if (!t.no_nota) { out.push({ noNota: null, row: t }); return; }
        if (idxByNota[t.no_nota] === undefined) {
            idxByNota[t.no_nota] = out.length;
            out.push({ noNota: t.no_nota, rows: [t] });
        } else {
            out[idxByNota[t.no_nota]].rows.push(t);
        }
    });
    return out;
}

/* ── GRID MULTI-BARIS: Input Penjualan/Pembelian (4 Tingkat Harga) ───────
 * Setiap baris punya kode barang sendiri + 4 harga acuan dari Master Barang
 * (modal/HRG BELI, harga_jual/HGA TOKO, harga_grosir/HRG PARTAI,
 * harga_cabang/HRG CABANG). Klik salah satu chip harga akan mengisi kolom
 * "Harga Dipakai" (bisa diedit manual juga). Simpan akan mengirim tiap baris
 * sebagai 1 transaksi trx_jual/trx_beli, dikelompokkan pakai `no_nota`
 * (prefix TXJ-/TXB-) kalau baris lebih dari 1, supaya tetap tampil sebagai
 * 1 nota di Riwayat — konsisten dengan cara Kasir POS mengelompokkan notanya.
 * ────────────────────────────────────────────────────────────────────── */
window._trxGrid = window._trxGrid || { jual: [], beli: [] };
let _trxRowSeq = 0;

/* Untuk grid Pembelian, mulai dengan banyak baris kosong sekaligus (ala
   spreadsheet Excel/iPos) supaya user bisa langsung ketik ke bawah tanpa
   klik "+ Tambah Baris" berulang-ulang. Grid Penjualan tetap 1 baris
   (perilaku lama, tidak berubah). */
function trxGridSeedRows(jenis, n) {
    const rows = [];
    for (let i = 0; i < n; i++) rows.push(trxGridBlankRow());
    return rows;
}

function trxGridBlankRow() {
    return {
        id: ++_trxRowSeq, kode: '', nama: '', dikenal: null,
        satuanOpts: [{ val: 'PCS', isi: 1 }], satuan: 'PCS',
        modal: 0, hj: 0, hg: 0, hc: 0, qty: 1, harga: 0, diskon: 0,
        // ── Khusus grid Input Pembelian (ala iPos) ──────────────────────
        // pctHj/pctHg/pctHc = markup HGA TOKO/HRG PARTAI/HRG CABANG dlm %
        // dihitung dari HRG BELI (modal), dua arah bisa diedit (ubah harga →
        // % ikut update, ubah % → harga ikut update). diskonPct/diskon
        // (rupiah) juga dua arah serupa. tglExp = kadaluarsa opsional per
        // baris, otomatis tercatat ke Data Master > Kadaluarsa saat disimpan.
        pctHj: 0, pctHg: 0, pctHc: 0, diskonPct: 0, tglExp: '',
        // ppn: null = ikut status di Master Barang (default/lama).
        // 'Kena PPN' / 'Non-PPN' = override khusus baris/transaksi ini.
        ppnMaster: null, ppn: null,
    };
}

window.trxGridAddRow = (jenis) => {
    const row = trxGridBlankRow();
    window._trxGrid[jenis].push(row);
    trxGridRenderBody(jenis);
    // Fokuskan baris baru biar alur input banyak barang bisa lanjut cepat
    // tanpa perlu klik lagi (mis. setelah tekan Enter di kolom Qty).
    setTimeout(() => { document.getElementById(`trxKode_${jenis}_${row.id}`)?.focus(); }, 0);
};

window.trxGridRemoveRow = (jenis, id) => {
    window._trxGrid[jenis] = window._trxGrid[jenis].filter(r => r.id !== id);
    if (!window._trxGrid[jenis].length) window._trxGrid[jenis].push(trxGridBlankRow());
    trxGridRenderBody(jenis);
};

window.trxGridSetKode = (jenis, id, kode) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row.kode = (kode || '').trim();
    const b = getBarang(row.kode);
    if (b) {
        row.nama = b.nama;
        row.dikenal = true;
        row.satuanOpts = [{ val: b.satuan1 || 'PCS', isi: 1 }];
        if (b.satuan2 && Number(b.isi) > 1) row.satuanOpts.push({ val: b.satuan2, isi: Number(b.isi) });
        if (b.satuan3 && Number(b.isi3) > 1) row.satuanOpts.push({ val: b.satuan3, isi: Number(b.isi3) });
        row.satuan = row.satuanOpts[0].val;
        row.modal = Number(b.modal) || 0;
        // Harga jual mengikuti CABANG yang dipilih di form (harga khusus cabang kalau ada,
        // kalau tidak ikut harga standar Master Barang).
        const hCab = hargaBarangCabang(b, document.getElementById(jenis + '_cab')?.value || '');
        row.hj = Number(hCab.harga_jual) || 0;
        row.hg = Number(hCab.harga_grosir) || 0;
        row.hc = Number(hCab.harga_cabang) || 0;
        row.harga = jenis === 'beli' ? row.modal : (row.hj || row.modal);
        row.ppnMaster = b.ppn || 'Non-PPN';
        if (jenis === 'beli') Object.assign(row, _trxHitungPctDariMaster(row));
    } else if (row.kode) {
        row.nama = row.kode;
        row.dikenal = false;
        row.satuanOpts = [{ val: 'PCS', isi: 1 }];
        row.satuan = 'PCS';
        row.modal = row.hj = row.hg = row.hc = 0;
        row.pctHj = row.pctHg = row.pctHc = 0;
        row.ppnMaster = null;
    } else {
        row.dikenal = null;
        row.ppnMaster = null;
    }
    // Grid Pembelian: kalau baris yang baru diisi ini adalah baris PALING
    // BAWAH, otomatis tambah 1 baris kosong baru di bawahnya — supaya selalu
    // ada baris siap ketik tanpa perlu pencet "+ Tambah Baris" tiap kali
    // (ala spreadsheet Excel/iPos: ketik → Enter/pindah → baris baru muncul).
    if (jenis === 'beli' && row.kode) {
        const rows = window._trxGrid[jenis];
        if (rows.length && rows[rows.length - 1].id === row.id) rows.push(trxGridBlankRow());
    }
    trxGridRenderBody(jenis);
};

/* Cabang di form Penjualan/Pembelian diganti → segarkan harga jual tiap baris ke harga
   cabang yang baru. Harga Dipakai (Penjualan) ikut berubah HANYA kalau belum diubah manual
   (masih sama dengan HGA TOKO sebelumnya) dan barisnya masih satuan dasar. */
window.trxGridRefreshHargaCabang = jenis => {
    const cab = document.getElementById(jenis + '_cab')?.value || '';
    (window._trxGrid[jenis] || []).forEach(row => {
        if (!row.kode || row.dikenal === false) return;
        const b = getBarang(row.kode);
        if (!b) return;
        const isi = Number((row.satuanOpts || []).find(o => o.val === row.satuan)?.isi) || 1;
        const h = hargaBarangCabang(b, cab);
        const k = jenis === 'beli' ? isi : 1; // sama dengan cara trxGridSetSatuan menskala harga di Pembelian
        const hjLama = row.hj;
        row.hj = Math.round((Number(h.harga_jual) || 0) * k);
        row.hg = Math.round((Number(h.harga_grosir) || 0) * k);
        row.hc = Math.round((Number(h.harga_cabang) || 0) * k);
        if (jenis === 'jual' && isi === 1 && Number(row.harga) === Number(hjLama) && row.hj > 0) row.harga = row.hj;
    });
    trxGridRenderBody(jenis);
};

/* Dipanggil saat barang baru dipilih di grid Pembelian: hitung % markup
   HGA TOKO/HRG PARTAI/HRG CABANG terhadap HRG BELI (modal) dari harga
   default Master Barang, supaya kalau HRG BELI diedit nanti, harga-harga
   itu ikut naik/turun proporsional sesuai markup aslinya. */
function _trxHitungPctDariMaster(row) {
    const pct = (v) => (row.modal > 0 ? Math.round(((v - row.modal) / row.modal) * 10000) / 100 : 0);
    return { pctHj: pct(row.hj), pctHg: pct(row.hg), pctHc: pct(row.hc) };
}

window.trxGridSetSatuan = (jenis, id, satuan) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    const isiLama = (row.satuanOpts.find(o => o.val === row.satuan) || { isi: 1 }).isi;
    const opt = row.satuanOpts.find(o => o.val === satuan) || row.satuanOpts[0];
    row.satuan = opt.val;
    // Konversi kasar harga saat ganti satuan biar tidak salah kali lipat
    if (isiLama && opt.isi) {
        const rasio = opt.isi / isiLama;
        row.harga = Math.round(row.harga * rasio);
        if (jenis === 'beli') {
            row.modal = Math.round(row.modal * rasio);
            row.hj = Math.round(row.hj * rasio);
            row.hg = Math.round(row.hg * rasio);
            row.hc = Math.round(row.hc * rasio);
            row.harga = row.modal; // HRG BELI = Harga Dipakai utk Pembelian
        }
    }
    trxGridRenderBody(jenis);
};

window.trxGridSetNumber = (jenis, id, field, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row[field] = Number(val) || 0;
    // Qty berubah di grid Pembelian & DISC% lagi dipakai → RUPIAH ikut
    // menyesuaikan (basisnya qty × HRG BELI).
    if (jenis === 'beli' && field === 'qty' && row.diskonPct) {
        row.diskon = Math.round((Number(row.qty) || 0) * (Number(row.modal) || 0) * row.diskonPct / 100);
        _trxSyncCell(jenis, id, 'DiskonRp', row.diskon);
    }
    trxGridUpdateRowUI(jenis, row);
};

/* Tulis langsung ke sebuah <input> lain di baris yang sama (tanpa gambar
   ulang seluruh tabel) supaya kolom yang lagi diketik user tidak kehilangan
   fokus/kursor — pola sama dgn kenapa smartSearch di helpers.js menjaga
   fokus input pencarian. */
function _trxSyncCell(jenis, id, suffix, val) {
    const el = document.getElementById(`trx${suffix}_${jenis}_${id}`);
    if (el && document.activeElement !== el) el.value = val;
}

/* ── Grid Pembelian: HRG BELI, HGA TOKO/PARTAI/CABANG + %, DISC%/RUPIAH ──
 * HRG BELI = harga yang benar-benar dipakai di transaksi Pembelian ini
 * (menggantikan chip "Harga Dipakai" lama, khusus utk Pembelian). Markup
 * tiap tingkat harga disimpan sbg %, dua arah: ubah HRG BELI → 3 harga lain
 * ikut naik/turun sesuai % markup masing-masing; ubah salah satu harga
 * tier → % tier itu saja yang dihitung ulang; ubah % → harga tier itu saja
 * yang dihitung ulang. Sama utk DISC% ⇄ RUPIAH (basis: qty × HRG BELI). */
window.trxGridSetModal = (jenis, id, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row.modal = Number(val) || 0;
    row.harga = row.modal;
    row.hj = Math.round(row.modal * (1 + (row.pctHj || 0) / 100));
    row.hg = Math.round(row.modal * (1 + (row.pctHg || 0) / 100));
    row.hc = Math.round(row.modal * (1 + (row.pctHc || 0) / 100));
    if (row.diskonPct) row.diskon = Math.round((Number(row.qty) || 0) * row.modal * row.diskonPct / 100);
    _trxSyncCell(jenis, id, 'Hj', row.hj);
    _trxSyncCell(jenis, id, 'Hg', row.hg);
    _trxSyncCell(jenis, id, 'Hc', row.hc);
    _trxSyncCell(jenis, id, 'DiskonRp', row.diskon);
    trxGridUpdateRowUI(jenis, row);
};

const _TRX_TIER_PCT = { hj: 'pctHj', hg: 'pctHg', hc: 'pctHc' };
const _TRX_TIER_SUFFIX = { hj: 'Hj', hg: 'Hg', hc: 'Hc' };
const _TRX_PCT_SUFFIX = { pctHj: 'PctHj', pctHg: 'PctHg', pctHc: 'PctHc' };

window.trxGridSetTierHarga = (jenis, id, tier, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row[tier] = Number(val) || 0;
    const pctField = _TRX_TIER_PCT[tier];
    row[pctField] = row.modal > 0 ? Math.round(((row[tier] - row.modal) / row.modal) * 10000) / 100 : 0;
    _trxSyncCell(jenis, id, _TRX_PCT_SUFFIX[pctField], row[pctField]);
    trxGridUpdateRowUI(jenis, row);
};

window.trxGridSetTierPct = (jenis, id, tier, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    const pctField = _TRX_TIER_PCT[tier];
    row[pctField] = Number(val) || 0;
    row[tier] = Math.round((Number(row.modal) || 0) * (1 + row[pctField] / 100));
    _trxSyncCell(jenis, id, _TRX_TIER_SUFFIX[tier], row[tier]);
    trxGridUpdateRowUI(jenis, row);
};

window.trxGridSetDiskonPct = (jenis, id, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row.diskonPct = Number(val) || 0;
    row.diskon = Math.round((Number(row.qty) || 0) * (Number(row.modal) || 0) * row.diskonPct / 100);
    _trxSyncCell(jenis, id, 'DiskonRp', row.diskon);
    trxGridUpdateRowUI(jenis, row);
};

window.trxGridSetDiskonRp = (jenis, id, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row.diskon = Number(val) || 0;
    const basis = (Number(row.qty) || 0) * (Number(row.modal) || 0);
    row.diskonPct = basis > 0 ? Math.round((row.diskon / basis) * 10000) / 100 : 0;
    _trxSyncCell(jenis, id, 'DiskonPct', row.diskonPct);
    trxGridUpdateRowUI(jenis, row);
};

window.trxGridSetTglExp = (jenis, id, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row.tglExp = val || '';
};

/* PPN per baris — 'master' (ikut Master Barang), 'Kena PPN', atau 'Non-PPN'.
   Disimpan sbg row.ppn = null kalau 'master' (backend akan otomatis ikut
   Master Barang), atau nilai eksplisit kalau di-override. */
window.trxGridSetPpn = (jenis, id, val) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    row.ppn = val === 'master' ? null : val;
    trxGridRenderBody(jenis);
};

/* Terapkan status PPN yang sama ke SEMUA baris sekaligus — dipakai saat
   input banyak barang dalam 1 nota (mis. semua barang di faktur pembelian
   ini memang sama-sama kena PPN atau sama-sama tidak), tanpa harus
   mengubah satu-satu per baris. */
window.trxGridApplyPpnAll = (jenis) => {
    const val = document.getElementById(`trxPpnBulk_${jenis}`)?.value || 'master';
    const rows = window._trxGrid[jenis] || [];
    rows.forEach(r => { r.ppn = val === 'master' ? null : val; });
    trxGridRenderBody(jenis);
    toast(`Status PPN "${val === 'master' ? 'Ikut Master Barang' : val}" diterapkan ke ${rows.length} baris`, 'y');
};

window.trxGridPickHarga = (jenis, id, tier) => {
    const row = (window._trxGrid[jenis] || []).find(r => r.id === id);
    if (!row) return;
    const isi = (row.satuanOpts.find(o => o.val === row.satuan) || { isi: 1 }).isi;
    row.harga = Math.round((Number(row[tier]) || 0) * isi);
    const hargaInput = document.getElementById(`trxHarga_${jenis}_${id}`);
    if (hargaInput) hargaInput.value = row.harga;
    trxGridUpdateRowUI(jenis, row);
};

function trxGridUpdateRowUI(jenis, row) {
    const sub = Number(row.qty) * Number(row.harga) - Number(row.diskon || 0);
    const el = document.getElementById(`trxSubtotal_${jenis}_${row.id}`);
    if (el) el.textContent = R(sub);
    trxGridUpdateTotal(jenis);
}

function trxGridUpdateTotal(jenis) {
    const total = (window._trxGrid[jenis] || []).reduce((s, r) =>
        s + (Number(r.qty) * Number(r.harga) - Number(r.diskon || 0)), 0);
    const el = document.getElementById('trxGridTotal_' + jenis);
    if (el) el.textContent = R(total);
}

function trxGridRenderBody(jenis) {
    const tbody = document.getElementById('trxGridBody_' + jenis);
    if (!tbody) return;
    const rows = window._trxGrid[jenis] || [];

    const kodeCell = (r) => `<td>
        <div class="trx-kode-cell" style="position:relative;">
            <input class="finput" style="font-size:12px;" id="trxKode_${jenis}_${r.id}" value="${esc(r.kode)}"
                placeholder="🔍 Kode/barcode/nama barang…" autocomplete="off">
            <div class="pos-entry-dropdown" id="trxDropdown_${jenis}_${r.id}"></div>
        </div>
        ${r.kode ? `<div style="font-size:11px;color:${r.dikenal === false ? 'var(--red)' : 'var(--ink3)'};margin-top:2px;">${r.dikenal === false ? '⚠️ tidak dikenal di Master Barang' : esc(r.nama)}</div>` : ''}
    </td>`;
    const satuanCell = (r) => `<td>
        <select class="fselect" style="font-size:12px;" onchange="trxGridSetSatuan('${jenis}',${r.id},this.value)">
            ${r.satuanOpts.map(o => `<option value="${esc(o.val)}" ${o.val === r.satuan ? 'selected' : ''}>${esc(o.val)}</option>`).join('')}
        </select>
    </td>`;
    const ppnCell = (r) => `<td>
        <select class="fselect" style="font-size:11px;width:118px;" onchange="trxGridSetPpn('${jenis}',${r.id},this.value)" title="Status PPN utk baris ini">
            <option value="master" ${r.ppn === null ? 'selected' : ''}>Ikut Master${r.ppnMaster ? ` (${r.ppnMaster})` : ''}</option>
            <option value="Kena PPN" ${r.ppn === 'Kena PPN' ? 'selected' : ''}>Kena PPN</option>
            <option value="Non-PPN" ${r.ppn === 'Non-PPN' ? 'selected' : ''}>Non-PPN</option>
        </select>
    </td>`;

    if (jenis === 'beli') {
        // Grid Input Pembelian ala iPos: HRG BELI + tiap tingkat harga jual
        // langsung bisa diedit di sini (harga ATAU %-nya), plus DISC%/RUPIAH
        // dan Kadaluarsa per baris — tidak perlu buka Master Barang terpisah.
        const numCell = (id, val, step, oninput) =>
            `<input class="finput r" type="number" step="${step}" style="width:88px;" id="${id}" value="${val}" oninput="${oninput}">`;
        const pctCell = (id, val, oninput) =>
            `<input class="finput r" type="number" step="0.01" style="width:56px;" id="${id}" value="${val}" oninput="${oninput}" title="Markup dari HRG BELI">`;

        tbody.innerHTML = rows.map(r => `<tr>
            ${kodeCell(r)}
            ${satuanCell(r)}
            <td><input class="finput r" type="number" min="0.01" step="0.01" style="width:64px;" id="trxQty_${jenis}_${r.id}" value="${r.qty}"
                oninput="trxGridSetNumber('${jenis}',${r.id},'qty',this.value)"
                onkeydown="if(event.key==='Enter'){event.preventDefault();trxGridAddRow('${jenis}');}"></td>
            <td>${numCell(`trxModal_${jenis}_${r.id}`, r.modal, '1', `trxGridSetModal('${jenis}',${r.id},this.value)`)}</td>
            <td>${numCell(`trxHj_${jenis}_${r.id}`, r.hj, '1', `trxGridSetTierHarga('${jenis}',${r.id},'hj',this.value)`)}</td>
            <td>${pctCell(`trxPctHj_${jenis}_${r.id}`, r.pctHj, `trxGridSetTierPct('${jenis}',${r.id},'hj',this.value)`)}</td>
            <td>${numCell(`trxHg_${jenis}_${r.id}`, r.hg, '1', `trxGridSetTierHarga('${jenis}',${r.id},'hg',this.value)`)}</td>
            <td>${pctCell(`trxPctHg_${jenis}_${r.id}`, r.pctHg, `trxGridSetTierPct('${jenis}',${r.id},'hg',this.value)`)}</td>
            <td>${numCell(`trxHc_${jenis}_${r.id}`, r.hc, '1', `trxGridSetTierHarga('${jenis}',${r.id},'hc',this.value)`)}</td>
            <td>${pctCell(`trxPctHc_${jenis}_${r.id}`, r.pctHc, `trxGridSetTierPct('${jenis}',${r.id},'hc',this.value)`)}</td>
            <td>${pctCell(`trxDiskonPct_${jenis}_${r.id}`, r.diskonPct, `trxGridSetDiskonPct('${jenis}',${r.id},this.value)`)}</td>
            <td>${numCell(`trxDiskonRp_${jenis}_${r.id}`, r.diskon, '1', `trxGridSetDiskonRp('${jenis}',${r.id},this.value)`)}</td>
            <td><input class="finput" type="date" style="width:130px;font-size:12px;" id="trxExp_${jenis}_${r.id}" value="${esc(r.tglExp || '')}"
                onchange="trxGridSetTglExp('${jenis}',${r.id},this.value)"></td>
            ${ppnCell(r)}
            <td class="r" id="trxSubtotal_${jenis}_${r.id}" style="font-weight:700;">${R(Number(r.qty) * Number(r.harga) - Number(r.diskon || 0))}</td>
            <td><button type="button" class="row-del" onclick="trxGridRemoveRow('${jenis}',${r.id})">✕</button></td>
        </tr>`).join('');
    } else {
        // Grid Input Penjualan: 4 chip harga acuan → klik utk isi "Harga Dipakai" (perilaku lama, tidak berubah).
        tbody.innerHTML = rows.map(r => {
            const isi = (r.satuanOpts.find(o => o.val === r.satuan) || { isi: 1 }).isi;
            const chip = (tier, val) => val
                ? `<button type="button" class="trx-price-chip" onclick="trxGridPickHarga('${jenis}',${r.id},'${tier}')" title="Klik untuk pakai harga ini">${R(val * isi)}</button>`
                : `<button type="button" class="trx-price-chip" disabled>–</button>`;
            return `<tr>
                ${kodeCell(r)}
                <td><input class="finput r" type="number" min="0.01" step="0.01" style="width:64px;" id="trxQty_${jenis}_${r.id}" value="${r.qty}"
                    oninput="trxGridSetNumber('${jenis}',${r.id},'qty',this.value)"
                    onkeydown="if(event.key==='Enter'){event.preventDefault();trxGridAddRow('${jenis}');}"></td>
                ${satuanCell(r)}
                <td class="r">${chip('modal', r.modal)}</td>
                <td class="r">${chip('hj', r.hj)}</td>
                <td class="r">${chip('hg', r.hg)}</td>
                <td class="r">${chip('hc', r.hc)}</td>
                <td><input class="finput r" type="number" min="0" id="trxHarga_${jenis}_${r.id}" style="width:100px;" value="${r.harga}"
                    oninput="trxGridSetNumber('${jenis}',${r.id},'harga',this.value)"></td>
                <td><input class="finput r" type="number" min="0" style="width:90px;" value="${r.diskon}"
                    oninput="trxGridSetNumber('${jenis}',${r.id},'diskon',this.value)"></td>
                ${ppnCell(r)}
                <td class="r" id="trxSubtotal_${jenis}_${r.id}" style="font-weight:700;">${R(Number(r.qty) * Number(r.harga) - Number(r.diskon || 0))}</td>
                <td><button type="button" class="row-del" onclick="trxGridRemoveRow('${jenis}',${r.id})">✕</button></td>
            </tr>`;
        }).join('');
    }

    trxGridUpdateTotal(jenis);
    trxGridWireRows(jenis);
}

/* Cari barang berdasar kode/barcode/nama — pola sama dgn posSearchBarang
   di pos.js, dipakai utk dropdown saran di baris grid Pembelian/Penjualan. */
function trxGridSearchBarang(term) {
    const t = String(term || '').trim().toLowerCase();
    if (!t) return [];
    const list = STATE.barang || [];
    const starts = [], contains = [];
    list.forEach(b => {
        const nama = String(b.nama || '').toLowerCase();
        const kode = String(b.kode || '').toLowerCase();
        const bc = [b.barcode, b.barcode2, b.barcode3].filter(Boolean).map(x => String(x).toLowerCase());
        if (nama.startsWith(t) || kode.startsWith(t)) starts.push(b);
        else if (nama.includes(t) || kode.includes(t) || bc.some(x => x.includes(t))) contains.push(b);
    });
    return [...starts, ...contains].slice(0, 8);
}

window.trxGridPickBarang = (jenis, id, kode) => {
    trxGridSetKode(jenis, id, kode);
    // Lanjutkan ke kolom Qty biar alur input banyak barang bisa cepat:
    // ketik nama → pilih (klik/Enter) → langsung isi Qty.
    setTimeout(() => {
        const qtyInput = document.getElementById(`trxQty_${jenis}_${id}`);
        if (qtyInput) { qtyInput.focus(); qtyInput.select(); }
    }, 0);
};

/* Pasang dropdown pencarian + navigasi keyboard (↑↓ pilih, Enter tambah,
   Esc tutup) di kolom "Kode/barcode/nama barang" tiap baris grid — dipanggil
   ulang setiap kali trxGridRenderBody menggambar ulang isi tabel, supaya
   baris baru/baris yang berubah tetap punya pencarian yang berfungsi. */
function trxGridWireRows(jenis) {
    const rows = window._trxGrid[jenis] || [];
    rows.forEach(r => {
        const input = document.getElementById(`trxKode_${jenis}_${r.id}`);
        const dropdown = document.getElementById(`trxDropdown_${jenis}_${r.id}`);
        if (!input || !dropdown) return;

        let matches = [], activeIdx = -1, picked = false;

        const renderDropdown = () => {
            if (!matches.length) { dropdown.innerHTML = ''; dropdown.classList.remove('on'); return; }
            dropdown.innerHTML = matches.map((b, i) => `
                <div class="pos-entry-opt ${i === activeIdx ? 'active' : ''}">
                    <span class="nm">${esc(b.nama)}</span>
                    <span class="kd">${esc(b.kode)}${b.barcode ? ' · ' + esc(b.barcode) : ''}</span>
                </div>`).join('');
            dropdown.classList.add('on');
            dropdown.querySelectorAll('.pos-entry-opt').forEach((el, i) => {
                el.addEventListener('mousedown', e => {
                    e.preventDefault();
                    picked = true;
                    trxGridPickBarang(jenis, r.id, matches[i].kode);
                });
            });
        };

        input.addEventListener('input', () => {
            const trimmed = input.value.trim();
            if (!trimmed) { matches = []; activeIdx = -1; renderDropdown(); return; }
            matches = trxGridSearchBarang(trimmed);
            activeIdx = matches.length ? 0 : -1;
            renderDropdown();
        });

        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (matches.length) { activeIdx = (activeIdx + 1) % matches.length; renderDropdown(); }
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (matches.length) { activeIdx = (activeIdx - 1 + matches.length) % matches.length; renderDropdown(); }
            } else if (e.key === 'Escape') {
                matches = []; activeIdx = -1; renderDropdown();
            } else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIdx >= 0 && matches[activeIdx]) {
                    picked = true;
                    trxGridPickBarang(jenis, r.id, matches[activeIdx].kode);
                } else if (input.value.trim()) {
                    // Tidak ada saran cocok — tetap terima (kode persis / manual,
                    // spt scan barcode) sama seperti perilaku onchange sebelumnya.
                    picked = true;
                    trxGridSetKode(jenis, r.id, input.value);
                    setTimeout(() => { document.getElementById(`trxQty_${jenis}_${r.id}`)?.focus(); }, 0);
                }
            }
        });

        input.addEventListener('blur', () => {
            // Jeda sebentar supaya mousedown di opsi dropdown sempat diproses
            // duluan sebelum dropdown ditutup (blur selalu duluan dari click).
            setTimeout(() => {
                if (!picked && input.value.trim() !== (r.kode || '')) {
                    trxGridSetKode(jenis, r.id, input.value);
                }
                matches = []; activeIdx = -1;
                if (dropdown) { dropdown.innerHTML = ''; dropdown.classList.remove('on'); }
            }, 150);
        });
    });
}

window.trxGridSimpan = async (jenis, elId) => {
    const rows = (window._trxGrid[jenis] || []).filter(r => r.kode && Number(r.qty) > 0);
    if (!rows.length) { toast('Tambahkan minimal 1 barang dengan kode & qty valid', 'err'); return; }

    const tgl    = document.getElementById(jenis + '_tgl').value;
    const cabang = document.getElementById(jenis + '_cab').value;
    if (!cabang) { toast('Cabang wajib dipilih', 'err'); return; }
    const bayar  = document.getElementById(jenis + '_bayar').value;
    let kodeKas  = null;
    if (bayar === 'Tunai') {
        kodeKas = document.getElementById(jenis + '_kas').value;
        if (!kodeKas) { toast('Kode Kas wajib dipilih untuk pembayaran Tunai', 'err'); return; }
    }
    let supplier = null;
    if (jenis === 'beli') {
        supplier = document.getElementById(jenis + '_sup').value;
        if (!supplier) { toast('Supplier wajib dipilih', 'err'); return; }
    }
    const keteranganEl = document.getElementById(jenis + '_ket');
    const keterangan = keteranganEl && keteranganEl.value.trim() ? keteranganEl.value.trim() : null;

    // Peringatan kalau ada barang yang kodenya tidak cocok dengan Master Barang
    const takDikenal = rows.filter(r => r.dikenal === false);
    if (takDikenal.length) {
        const lanjut = await confirmDialog(
            `${takDikenal.length} barang tidak ditemukan di Master Barang (mis. "${takDikenal[0].kode}").\n\n` +
            `Tetap simpan? Nanti ditandai "tidak dikenal" di riwayat sampai kodenya dicocokkan.`,
            { okText: 'Tetap Simpan', danger: false }
        );
        if (!lanjut) return;
    }

    // No. Transaksi: mode Auto (reservasi dari backend, dijamin unik) atau
    // Ketik manual (divalidasi dulu ke backend supaya tidak dobel dengan
    // transaksi lain sebelum baris barang mulai disimpan).
    const noMode = document.getElementById(jenis + '_noMode')?.value || 'auto';
    let noNota = null;
    if (noMode === 'manual') {
        noNota = (document.getElementById(jenis + '_noManual')?.value || '').trim();
        if (!noNota) { toast('Nomor transaksi wajib diisi kalau pilih "Ketik", atau pilih "Auto"', 'err'); return; }
        try {
            const cek = await apiGet(`/transaksi/cek-nomor?jenis=${jenis}&no_nota=${encodeURIComponent(noNota)}`);
            if (!cek.tersedia) { toast(`Nomor transaksi "${noNota}" sudah dipakai, pakai nomor lain atau pilih Auto`, 'err'); return; }
        } catch (err) {
            toast('Gagal memvalidasi nomor transaksi, coba lagi', 'err'); return;
        }
    } else {
        // Reservasi 1 no_nota dari backend untuk seluruh baris di klik "Simpan"
        // ini — termasuk kalau cuma 1 barang — supaya SETIAP transaksi otomatis
        // dapat nomor & dijamin tidak dobel (dicek ke DB di server, bukan
        // digenerate asal dari jam di browser).
        try {
            const res = await apiGet(`/transaksi/nomor-baru?jenis=${jenis}&tgl=${tgl}`);
            noNota = res.no_nota;
        } catch (err) {
            // Kalau reservasi gagal (mis. koneksi putus), biarkan kosong — backend
            // tetap otomatis generate no_nota sendiri per baris saat disimpan.
            noNota = null;
        }
    }

    const btn = document.querySelector(`#${elId} .btn-p`);
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan…'; }

    // Grid Pembelian: kalau dicentang, sekalian update harga di Master Barang
    // (barang yang dikenal saja) sesuai angka HRG BELI/HGA TOKO/HRG
    // PARTAI/HRG CABANG di tabel — dilakukan SETELAH semua baris tersimpan,
    // dan gagal update master tidak membatalkan transaksi Pembelian yang
    // sudah tersimpan (cuma dilaporkan terpisah).
    const updateMaster = jenis === 'beli' && document.getElementById('trxBeliUpdateMaster')?.checked;

    let sukses = 0, gagal = [];
    for (const r of rows) {
        const payload = {
            tgl, cabang, kode_barang: r.kode, qty: r.qty, satuan: r.satuan,
            harga: r.harga, diskon: r.diskon || 0, bayar, kode_kas: kodeKas,
            keterangan, no_nota: noNota, ppn: r.ppn || null,
        };
        if (jenis === 'beli') {
            payload.supplier = supplier;
            if (r.tglExp) payload.tgl_exp = r.tglExp;
        }
        try {
            await apiPost(`/transaksi/${jenis}`, payload);
            sukses++;
        } catch (err) { gagal.push(`${r.kode}: ${err.message}`); }
    }

    let masterUpdated = 0, masterGagal = [];
    if (updateMaster) {
        for (const r of rows.filter(r => r.dikenal !== false)) {
            const b = getBarang(r.kode);
            if (!b) continue;
            try {
                await apiPut(`/barang/${b.id}`, {
                    modal: r.modal, harga_jual: r.hj, harga_grosir: r.hg, harga_cabang: r.hc,
                    cabang, // harga jual disimpan sebagai harga cabang ini; harga standar katalog tidak ditimpa
                });
                masterUpdated++;
            } catch (err) { masterGagal.push(`${r.kode}: ${err.message}`); }
        }
    }

    if (btn) { btn.disabled = false; btn.textContent = `💾 Simpan ${jenis === 'jual' ? 'Penjualan' : 'Pembelian'}`; }

    if (sukses) {
        toast(`${sukses} barang berhasil disimpan${jenis === 'jual' ? ' & stok otomatis berkurang' : ' & stok otomatis bertambah'}`
            + (masterUpdated ? `, harga ${masterUpdated} barang di Master ikut ter-update` : ''));
        window._trxGrid[jenis] = jenis === 'beli' ? trxGridSeedRows(jenis, 12) : [trxGridBlankRow()];
        // Muat ulang Master Barang kalau harga baru saja diupdate dari sini,
        // supaya baris berikutnya (atau modul lain) langsung pakai harga terbaru.
        if (jenis === 'beli' && masterUpdated) await loadMasterData();
    }
    if (gagal.length) toast(`${gagal.length} baris gagal disimpan — ${gagal[0]}`, 'err');
    if (masterGagal.length) toast(`${masterGagal.length} update harga Master gagal — ${masterGagal[0]}`, 'err');

    await renderJualBeli(jenis, elId, 1);
};

async function renderJualBeli(jenis, elId, page = 1) {
    const el  = document.getElementById(elId);
    el.innerHTML = loadingHTML;
    const isJ = jenis === 'jual';
    const f   = trxFilter(jenis);

    try {
        const cab = getCabang();
        const q   = buildQuery({ cabang: cab, page, per_page: f.perPage, dari: f.dari, sampai: f.sampai, search: f.search });
        const res  = await apiGet(`/transaksi/${jenis}` + q);
        const list = res.data || [];
        const meta = res.meta || {};
        // Total & jumlah transaksi diambil dari ringkasan backend (dihitung dari
        // SELURUH data yang cocok filter, bukan cuma baris di halaman ini),
        // supaya benar walau datanya lebih dari satu halaman.
        const summary = res.summary || {};
        const jumlahTrx = summary.jumlah ?? meta.total ?? list.length;
        const total = summary.total_nominal ?? list.reduce((s, t) => s + Number(t.qty) * Number(t.harga) - Number(t.diskon || 0), 0);

        const filterBarHTML = `
        <div class="box">
            <div class="box-bd" style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm ${f.preset==='hari'?'btn-p':'btn-g'}" onclick="setTrxPreset('${jenis}','${elId}','hari')">Hari ini</button>
                    <button class="btn btn-sm ${f.preset==='bulan'?'btn-p':'btn-g'}" onclick="setTrxPreset('${jenis}','${elId}','bulan')">Bulan ini</button>
                    <button class="btn btn-sm ${f.preset==='semua'?'btn-p':'btn-g'}" onclick="setTrxPreset('${jenis}','${elId}','semua')">Semua</button>
                </div>
                <div class="fgroup" style="margin:0;">
                    <label class="flabel">Dari Tanggal</label>
                    <input class="finput" type="date" value="${f.dari}" onchange="setTrxTanggal('${jenis}','${elId}','dari',this.value)">
                </div>
                <div class="fgroup" style="margin:0;">
                    <label class="flabel">Sampai Tanggal</label>
                    <input class="finput" type="date" value="${f.sampai}" onchange="setTrxTanggal('${jenis}','${elId}','sampai',this.value)">
                </div>
                <div class="fgroup" style="margin:0;min-width:200px;">
                    <label class="flabel">Cari</label>
                    <input class="finput" id="srchTrx_${jenis}" placeholder="🔍 Kode/nama barang, no. nota…" value="${esc(f.search || '')}"
                        oninput="smartSearch('srchTrx_${jenis}', this.value, v => { trxFilter('${jenis}').search = v; }, () => renderJualBeli('${jenis}','${elId}',1))">
                </div>
                <label style="font-size:12px;color:var(--ink3);display:flex;align-items:center;gap:6px;margin-left:auto;">
                    Tampilkan:
                    <select class="fselect" style="width:80px;" onchange="setTrxPerPage('${jenis}','${elId}',this.value)">
                        ${[30,50,100,200,500].map(n => `<option value="${n}" ${f.perPage==n?'selected':''}>${n}</option>`).join('')}
                        <option value="99999" ${f.perPage==99999?'selected':''}>Semua</option>
                    </select>
                    per halaman
                </label>
            </div>
        </div>`;

        el.innerHTML = `
        ${exportBar(`tbl_${jenis}`, `data-${jenis}`, elId, isJ ? 'Data Penjualan' : 'Data Pembelian')}
        <div class="export-bar no-print" style="margin-top:-8px;">
            <span class="lbl"></span>
            <button class="btn btn-blue btn-sm" onclick="exportJualBeliSemua('${jenis}')" title="Export SEMUA data (bukan cuma yang tampil di halaman ini) sesuai filter cabang/tanggal yang lagi aktif">📥 Export Semua (${jumlahTrx.toLocaleString('id-ID')} baris)</button>
            <button class="btn btn-g btn-sm" onclick="perbaikiNomorDobel('${jenis}','${elId}')" title="Cari nomor transaksi (no. nota) yang kepakai dobel oleh transaksi beda tanggal/cabang (biasanya dari import lama), lalu otomatis dipisah jadi nomor unik">🔧 Perbaiki Nomor Dobel</button>
        </div>
        ${filterBarHTML}

        <!-- Form Input: Grid Multi-Baris (4 Tingkat Harga) -->
        <div class="box">
            <div class="box-hd">
                <h3>${isJ ? 'Input Penjualan' : 'Input Pembelian'} — Multi Barang</h3>
                ${isJ
                    ? `<button class="btn btn-g btn-sm" onclick="bukaImportPenjualan()">📥 Import Excel Penjualan</button>`
                    : `<button class="btn btn-g btn-sm" onclick="bukaImportPembelian()">📥 Import Excel Pembelian</button>`}
            </div>
            <div class="box-bd">
                <div class="fgrid">
                    <div class="fgroup">
                        <label class="flabel">Tanggal</label>
                        <input class="finput" type="date" id="${jenis}_tgl" value="${today()}">
                    </div>
                    <div class="fgroup">
                        <label class="flabel">No. Transaksi</label>
                        <div style="display:flex;gap:6px;">
                            <select class="fselect" id="${jenis}_noMode" style="width:96px;flex:none;" onchange="document.getElementById('${jenis}_noManual').style.display = this.value==='manual' ? 'block' : 'none';">
                                <option value="auto">Auto</option>
                                <option value="manual">Ketik</option>
                            </select>
                            <input class="finput" id="${jenis}_noManual" placeholder="mis. ${isJ ? 'TXJ' : 'TXB'}-20260813-0001" style="display:none;">
                        </div>
                        <span class="fhint">Auto = nomor dibuat otomatis, dijamin tidak dobel</span>
                    </div>
                    <div class="fgroup">
                        <label class="flabel">Cabang</label>
                        <select class="fselect" id="${jenis}_cab" onchange="trxGridRefreshHargaCabang('${jenis}')">${cabangOpts()}</select>
                    </div>
                    <div class="fgroup">
                        <label class="flabel">Metode Bayar</label>
                        <select class="fselect" id="${jenis}_bayar" onchange="document.getElementById('${jenis}_kasWrap').style.display = this.value==='Tunai' ? 'block' : 'none';">
                            <option>Tunai</option>
                            <option>Kredit</option>
                        </select>
                    </div>
                    <div class="fgroup" id="${jenis}_kasWrap">
                        <label class="flabel">Kode Kas <span style="color:var(--red);">*wajib</span></label>
                        <select class="fselect" id="${jenis}_kas">${kasOpts()}</select>
                        <span class="fhint">Uang ${isJ ? 'masuk' : 'keluar'} akan dicatat di akun kas/bank ini</span>
                    </div>
                    ${!isJ ? `
                    <div class="fgroup">
                        <label class="flabel">Supplier <span style="color:var(--red);">*wajib</span></label>
                        <select class="fselect" id="${jenis}_sup">${supplierOpts()}</select>
                        <span class="fhint">${STATE.supplier?.length ? '' : '⚠️ Belum ada data supplier — tambahkan dulu di Data Master > Supplier'}</span>
                    </div>` : ''}
                    <div class="fgroup">
                        <label class="flabel">Keterangan</label>
                        <input class="finput" id="${jenis}_ket" placeholder="Opsional, mis. no. faktur">
                    </div>
                </div>

                <div class="note note-b" style="margin:12px 0;"><span class="note-ico">💡</span>
                    ${isJ
                        ? `<span>Klik salah satu angka <strong>HRG BELI / HGA TOKO / HRG PARTAI / HRG CABANG</strong> di baris barang untuk langsung memakai harga itu — kolom "Harga Dipakai" tetap bisa diedit manual. Kolom <strong>PPN</strong> per baris bisa di-override langsung di sini (tidak harus ikut status di Master Barang) — kalau beberapa/semua barang di transaksi ini statusnya sama, pakai tombol "Terapkan" di bawah tabel supaya tidak perlu ubah satu-satu.</span>`
                        : `<span>Ketik nama/kode barang, langsung terisi harga dari Master Barang — tinggal ketik lagi utk baris berikutnya (Enter di kolom Qty otomatis pindah baris). <strong>HRG BELI</strong> bisa diedit; 3 harga jual di sebelahnya ikut naik/turun sesuai <strong>%</strong> markup masing-masing (atau ubah harga/persennya langsung, dua arah saling menyesuaikan). <strong>DISC%/RUPIAH</strong> juga dua arah. Isi <strong>Kadaluarsa</strong> kalau barang ini punya tanggal exp — otomatis tercatat ke Data Master.</span>`}
                </div>

                <div class="tscroll" style="max-height:${isJ ? 440 : 560}px;">
                <table class="trx-grid-table${isJ ? '' : ' trx-grid-beli'}" id="trxGridTbl_${jenis}">
                    <thead><tr>
                        ${isJ ? `
                        <th style="min-width:180px;">Barang</th>
                        <th class="r" style="width:70px;">Qty</th>
                        <th style="width:90px;">Satuan</th>
                        <th class="r">HRG BELI</th>
                        <th class="r">HGA TOKO</th>
                        <th class="r">HRG PARTAI</th>
                        <th class="r">HRG CABANG</th>
                        <th class="r" style="width:110px;">Harga Dipakai</th>
                        <th class="r" style="width:100px;">Diskon</th>
                        <th style="width:120px;">PPN</th>
                        <th class="r">Subtotal</th>
                        <th></th>` : `
                        <th style="min-width:170px;">Barang</th>
                        <th style="width:80px;">Satuan</th>
                        <th class="r" style="width:60px;">Qty</th>
                        <th class="r" style="width:90px;">HRG BELI</th>
                        <th class="r" style="width:90px;">HGA TOKO</th>
                        <th class="r" style="width:58px;">%</th>
                        <th class="r" style="width:90px;">HRG PARTAI</th>
                        <th class="r" style="width:58px;">%</th>
                        <th class="r" style="width:90px;">HRG CABANG</th>
                        <th class="r" style="width:58px;">%</th>
                        <th class="r" style="width:58px;">DISC%</th>
                        <th class="r" style="width:90px;">RUPIAH</th>
                        <th style="width:132px;">Kadaluarsa</th>
                        <th style="width:120px;">PPN</th>
                        <th class="r">Subtotal</th>
                        <th></th>`}
                    </tr></thead>
                    <tbody id="trxGridBody_${jenis}"></tbody>
                </table>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px;flex-wrap:wrap;gap:8px;">
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <button class="btn btn-g btn-sm" onclick="trxGridAddRow('${jenis}')">+ Tambah Baris</button>
                        <span style="width:1px;height:22px;background:var(--line);display:inline-block;"></span>
                        <span style="font-size:12px;color:var(--ink3);">Terapkan PPN ke semua baris:</span>
                        <select class="fselect" id="trxPpnBulk_${jenis}" style="width:150px;font-size:12px;">
                            <option value="master">Ikut Master Barang</option>
                            <option value="Kena PPN">Kena PPN (semua)</option>
                            <option value="Non-PPN">Non-PPN (semua)</option>
                        </select>
                        <button class="btn btn-g btn-sm" onclick="trxGridApplyPpnAll('${jenis}')">Terapkan</button>
                    </div>
                    <div style="font-size:15px;font-weight:700;">Total: <span id="trxGridTotal_${jenis}">Rp 0</span></div>
                </div>
                ${!isJ ? `
                <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--ink3);margin-top:12px;">
                    <input type="checkbox" id="trxBeliUpdateMaster" checked>
                    Sekalian update <strong>HRG BELI / HGA TOKO / HRG PARTAI / HRG CABANG</strong> di Master Barang sesuai angka di tabel atas (barang yang dikenal saja)
                </label>` : ''}
                <button class="btn btn-p" style="margin-top:14px;" onclick="trxGridSimpan('${jenis}','${elId}')">
                    💾 Simpan ${isJ ? 'Penjualan' : 'Pembelian'}
                </button>
            </div>
        </div>

        <!-- Riwayat: gaya "list menurun" dengan kartu per-transaksi yang bisa
             dibuka/tutup (accordion native <details>), PERSIS seperti tampilan
             Jurnal & Buku Besar — bukan lagi tabel data yang padat kolom. -->
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat ${isJ ? 'Penjualan' : 'Pembelian'}</h3>
                <div class="meta">${jumlahTrx.toLocaleString('id-ID')} transaksi · Total: <strong>${R(total)}</strong></div>
            </div>
            <div class="box-bd pad0">
                ${list.length ? `
                <!-- Tabel asli disembunyikan, cuma dipakai sebagai sumber untuk tombol
                     "Export Excel" (SheetJS butuh elemen <table> asli) -->
                <table id="tbl_${jenis}" style="display:none;">
                    <thead><tr>
                        <th>Tanggal</th><th>Cabang</th><th>Barang</th>
                        <th class="r">Qty</th><th class="r">Harga</th>
                        <th class="r">Diskon</th>${!isJ ? '<th>Supplier</th><th>Operator</th>' : ''}
                        <th class="r">Total</th><th>Bayar</th>
                    </tr></thead>
                    <tbody>${list.map(t => {
                        const disc = Number(t.diskon || 0);
                        const tot  = Number(t.qty) * Number(t.harga) - disc;
                        return `<tr>
                        <td>${fmtTgl(t.tgl)}</td>
                        <td>${esc(t.cabang)}</td>
                        <td>${t.tidak_dikenal ? esc(t.kode_asli || t.kode_barang) : esc(t.nama_barang || t.kode_barang)}</td>
                        <td>${Number(t.qty).toLocaleString('id-ID')} ${esc(t.satuan||'')}</td>
                        <td>${R(t.harga)}</td>
                        <td>${disc ? R(disc) : ''}</td>
                        ${!isJ ? `<td>${esc(t.supplier || '')}</td><td>${esc(t.operator || '')}</td>` : ''}
                        <td>${R(tot)}</td>
                        <td>${esc(t.bayar)}</td>
                    </tr>`;
                    }).join('')}</tbody>
                </table>

                <div class="jr-groups" id="jrList_${jenis}">
                    ${trxGroupByNota(list).map((g, gi) => {
                        // ── Baris hasil Kasir POS (punya no_nota): DIGABUNG jadi
                        //    1 kartu per TRANSAKSI (bukan per barang), persis
                        //    tampilan Riwayat di menu Kasir POS. Klik untuk
                        //    lihat/ubah semua barang di nota itu (qty, satuan
                        //    PCS/KARTON, harga, hapus/tambah barang, dst) lewat
                        //    layar Kasir POS, lalu simpan & cetak ulang. Nota ini
                        //    TIDAK dibuka sebagai accordion di sini — langsung ke
                        //    layar edit Kasir POS.
                        if (g.noNota) {
                            const rows = g.rows;
                            const total = rows.reduce((s, t) => s + Number(t.qty) * Number(t.harga) - Number(t.diskon || 0), 0);
                            const namaBarang = rows.map(t => t.tidak_dikenal ? `⚠️ ${t.kode_asli || t.kode_barang}` : (t.nama_barang || t.kode_barang));
                            const preview = namaBarang.slice(0, 2).join(', ') + (namaBarang.length > 2 ? ` +${namaBarang.length - 2} lainnya` : '');
                            const first = rows[0];
                            const isPos = g.noNota.startsWith('POS-');

                            // Nota Kasir POS: kartu biasa (bukan <details>), klik → langsung buka layar edit Kasir POS.
                            if (isPos) {
                                return `<div class="jr-group">
                                    <div style="cursor:pointer;" onclick="posEditNotaFull('${esc(g.noNota)}')"
                                         class="jr-group-clickrow"
                                         onmouseover="this.style.background='rgba(46,125,90,.05)'" onmouseout="this.style.background=''"
                                    >
                                        <div style="padding:11px 18px;display:flex;align-items:center;gap:12px;font-size:13px;">
                                            <span class="jr-group-arrow" style="visibility:hidden;">▸</span>
                                            <span class="jr-group-label">${fmtTgl(first.tgl)} · ${esc(first.cabang)}</span>
                                            <span class="jr-group-meta">${preview} · <span class="badge badge-pos" onclick="event.stopPropagation();bukaBentukanRef('${esc(g.noNota)}')" title="Klik untuk lihat bentukan jurnal transaksi ini">🧾 ${esc(g.noNota)}</span> · ${rows.length} barang · ${esc(first.bayar)}</span>
                                            <span class="jr-group-amt">Total ${R(total)} · ✎ Buka di Kasir POS</span>
                                        </div>
                                    </div>
                                </div>`;
                            }

                            // Nota Penjualan/Pembelian grid ("TXJ-"/"TXB-"): kartu <details>
                            // yang bisa dibuka/tutup — daftar barangnya ada LANGSUNG DI BAWAH
                            // kartu (bisa discroll kalau barangnya banyak), tanpa popup.
                            const supplierBeli = !isJ ? (first.supplier || '') : null;
                            return `<details class="jr-group" ${gi < 15 ? 'open' : ''}>
                                <summary>
                                    <span class="jr-group-arrow">▸</span>
                                    <span class="jr-group-label">${fmtTgl(first.tgl)} · ${esc(first.cabang)}</span>
                                    <span class="jr-group-meta">${preview} · <span class="badge badge-pos" onclick="event.preventDefault();event.stopPropagation();bukaBentukanRef('${esc(g.noNota)}')" title="Klik untuk lihat bentukan jurnal transaksi ini">🧾 ${esc(g.noNota)}</span>${!isJ ? ` <span class="badge badge-info" style="cursor:pointer;" onclick="event.preventDefault();event.stopPropagation();bukaUbahNotaBeli({noNota:'${esc(g.noNota)}'})" title="Ubah No. Faktur (mis. ganti nomor TS… dengan nomor faktur asli supplier)">✏️ Faktur</span>` : ''} · ${rows.length} barang · ${esc(first.bayar)}
                                        ${!isJ ? (supplierBeli
                                            ? ` · ${esc(supplierBeli)}`
                                            : ` · <span class="badge badge-warn" style="cursor:pointer;" onclick="event.preventDefault();event.stopPropagation();bukaIsiSupplierBeli({noNota:'${esc(g.noNota)}'})" title="Nota ini belum ada suppliernya — klik untuk isi">⚠️ ✏️ Isi Supplier</span>`
                                        ) : ''}
                                        ${!isJ && first.operator ? ` · <span class="badge badge-info" title="Akun/operator yang menginput nota ini">👤 ${esc(first.operator)}</span>` : ''}
                                        ${isJ && first.kasir ? ` · <span class="badge badge-info" title="Akun kasir yang melayani">👤 ${esc(first.kasir)}</span>${first.shift ? ` <span class="badge ${first.shift === 'Pagi' ? 'badge-ppn' : 'badge-noppn'}" title="Shift kasir">${esc(first.shift)}</span>` : ''}` : ''}
                                    </span>
                                    <span class="jr-group-amt">Total ${R(total)}</span>
                                </summary>
                                <div style="max-height:280px;overflow-y:auto;">
                                    <table>
                                        <thead><tr>
                                            <th>Barang</th><th class="r">Qty</th><th class="r">Harga</th>
                                            <th class="r">Diskon</th><th>PPN</th><th class="r">Subtotal</th>
                                        </tr></thead>
                                        <tbody>${rows.map(t => `<tr>
                                            <td>${t.tidak_dikenal ? `⚠️ ${esc(t.kode_asli || t.kode_barang)}` : `<span class="link-barang" onclick="event.stopPropagation();lihatKartuHpp('${esc(t.kode_barang)}')" title="Klik untuk lihat riwayat masuk/keluar & HPP rata-rata barang ini">${esc(t.nama_barang || t.kode_barang)}</span>`}</td>
                                            <td class="r">${Number(t.qty).toLocaleString('id-ID')} ${esc(t.satuan||'')}</td>
                                            <td class="r">${R(t.harga)}</td>
                                            <td class="r">${t.diskon ? R(t.diskon) : '–'}</td>
                                            <td><span class="badge ${t.ppn_efektif === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}" title="${t.ppn ? 'Di-override khusus transaksi ini' : 'Ikut status di Master Barang'}">${esc(t.ppn_efektif || '–')}${t.ppn ? ' ✎' : ''}</span></td>
                                            <td class="r">${R(Number(t.qty) * Number(t.harga) - Number(t.diskon || 0))}</td>
                                        </tr>`).join('')}</tbody>
                                    </table>
                                </div>
                                <div style="display:flex;justify-content:flex-end;padding:8px 18px 12px;">
                                    ${!isJ ? `<button class="btn btn-g btn-sm" style="margin-right:8px;" onclick="event.preventDefault();event.stopPropagation();bukaUbahNotaBeli({noNota:'${esc(g.noNota)}'})">✏️ Ubah No. Faktur</button>` : ''}<button class="row-del" style="width:auto;padding:5px 12px;" onclick="event.preventDefault();event.stopPropagation();hapusNotaTransaksi('${jenis}','${esc(g.noNota)}')">🗑️ Hapus Nota Ini</button>
                                </div>
                            </details>`;
                        }

                        // ── Baris lama (input manual satu-satu, tanpa no_nota):
                        //    tetap 1 kartu per baris, gaya sama, tanpa accordion
                        //    (memang cuma 1 barang, tidak perlu dibuka lagi) ──
                        const t = g.row;
                        const disc = Number(t.diskon || 0);
                        const tot  = Number(t.qty) * Number(t.harga) - disc;
                        const refTrx = t.no_nota || ((isJ ? 'PJ-' : 'PB-') + t.id);
                        return `<div class="jr-group">
                            <div style="padding:11px 18px;display:flex;align-items:center;gap:12px;font-size:13px;${t.tidak_dikenal ? 'background:rgba(220,80,60,.06);' : ''}">
                                <span class="jr-group-arrow" style="visibility:hidden;">▸</span>
                                <span class="jr-group-label">${fmtTgl(t.tgl)} · ${esc(t.cabang)} · <span class="badge badge-pos" style="cursor:pointer;" onclick="bukaBentukanRef('${esc(refTrx)}')" title="Klik untuk lihat bentukan jurnal transaksi ini">🧾 ${esc(refTrx)}</span></span>
                                <span class="jr-group-meta">
                                    ${t.tidak_dikenal
                                        ? `⚠️ Kode tidak dikenal: ${esc(t.kode_asli || t.kode_barang)}`
                                        : `<span class="link-barang" onclick="event.stopPropagation();lihatKartuHpp('${esc(t.kode_barang)}')" title="Klik untuk lihat riwayat masuk/keluar & HPP rata-rata barang ini">${esc(t.nama_barang || t.kode_barang)}</span>`}
                                    · ${Number(t.qty).toLocaleString('id-ID')} ${esc(t.satuan||'')} × ${R(t.harga)}${disc ? ` − diskon ${R(disc)}` : ''}
                                    ${!isJ ? (t.supplier ? ` · ${esc(t.supplier)}` : ` · <span class="badge badge-warn" style="cursor:pointer;" onclick="bukaIsiSupplierBeli({ids:[${t.id}]})" title="Belum ada supplier — klik untuk isi">⚠️ ✏️ Isi Supplier</span>`) : ''}${!isJ && t.operator ? ` · <span class="badge badge-info" title="Akun/operator yang menginput">👤 ${esc(t.operator)}</span>` : ''} · ${esc(t.bayar)}
                                </span>
                                <span class="jr-group-amt">Total ${R(tot)}</span>
                                ${!isJ ? `<button class="btn btn-g btn-sm" style="flex-shrink:0;" onclick="bukaUbahNotaBeli({ids:[${t.id}],noNota:'${esc(t.no_nota || '')}'})" title="Isi/ubah No. Faktur">✏️ No. Faktur</button>` : ''}<button class="row-del" style="width:auto;padding:3px 10px;flex-shrink:0;" onclick="hapusTrx('${jenis}',${t.id})">✕ Hapus</button>
                            </div>
                        </div>`;
                    }).join('')}
                </div>
                ${paginationHTML(meta, `p=>renderJualBeli('${jenis}','${elId}',p)`)}`
                : `<div class="empty"><div class="ico">${isJ ? '🛒' : '📦'}</div><strong>Belum ada data.</strong></div>`}
            </div>
        </div>`;


        // Inisialisasi grid multi-baris — kalau sebelumnya sudah ada baris yang
        // diisi (mis. user pindah sub-tab lalu balik lagi), datanya tetap dipakai.
        if (!window._trxGrid[jenis] || !window._trxGrid[jenis].length) {
            window._trxGrid[jenis] = jenis === 'beli' ? trxGridSeedRows(jenis, 12) : [trxGridBlankRow()];
        }
        trxGridRenderBody(jenis);

        // Hapus 1 nota grid (Penjualan/Pembelian multi-baris) — tombol "🗑️ Hapus
        // Nota Ini" di dalam kartu <details> pada Riwayat di atas. Nota Kasir POS
        // ("POS-...") tidak pakai ini — dihapus/diedit lewat layar Kasir POS.

        window.hapusNotaTransaksi = async (jenisArg, noNota) => {
            if (!(await confirmDialog(`Hapus seluruh transaksi nota ${noNota}? Semua baris barang di nota ini akan dihapus dan stok dikembalikan.`))) return;
            const rows = list.filter(t => t.no_nota === noNota);
            try {
                for (const r of rows) { await apiDel(`/transaksi/${jenisArg}/${r.id}`); }
                toast('Nota berhasil dihapus');
                closeM();
                await renderJualBeli(jenisArg, elId, 1);
            } catch (err) { toast(err.message, 'err'); }
        };

    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── HAPUS TRANSAKSI (dipakai semua sub-modul) ────────────── */
window.hapusTrx = async (jenis, id) => {
    if (!(await confirmDialog('Hapus transaksi ini? Data jurnal terkait juga akan hilang.'))) return;
    try {
        await apiDel(`/transaksi/${jenis}/${id}`);
        toast('Transaksi dihapus', 'y');
        // Re-render sub-tab yang sedang aktif
        const subTabMap = {
            jual   : () => renderJualBeli('jual',  'tx-jual'),
            beli   : () => renderJualBeli('beli',  'tx-beli'),
            jasa   : renderTrxJasa,
            sewa   : renderSewa,
            retur  : renderRetur,
            kasbon : renderKasbon,
            cashbon: renderCashbon,
            biaya  : renderBiaya,
        };
        if (subTabMap[jenis]) await subTabMap[jenis]();
    } catch (err) { toast(err.message, 'err'); }
};

// Perbaikan nomor transaksi dobel — lihat catatan di TransaksiController::
// perbaikiNomorDobel(). Memindai SELURUH trx_jual & trx_beli (bukan cuma
// yang tampil di halaman ini), jadi hasilnya bisa membetulkan nota dobel
// dari tanggal/cabang manapun sekaligus.
window.perbaikiNomorDobel = async (jenis, elId) => {
    if (!(await confirmDialog('Cari & perbaiki semua nomor transaksi (no. nota) yang kepakai dobel oleh transaksi beda tanggal/cabang? Nomor yang bentrok akan otomatis diganti nomor baru yang unik.'))) return;
    try {
        const res = await apiPost('/transaksi/perbaiki-nomor-dobel', {});
        toast(res.message, 'y');
        await renderJualBeli(jenis, elId, 1);
    } catch (err) { toast(err.message, 'err'); }
};

/* ── JASA ─────────────────────────────────────────────────── */
async function renderTrxJasa() {
    const el = document.getElementById('tx-jasa');
    el.innerHTML = loadingHTML;
    const search = window._jasaSearch || '';
    try {
        const cab  = getCabang();
        const res  = await apiGet('/transaksi/jasa' + buildQuery({ cabang: cab, per_page: 50, search }));
        const list = res.data || [];
        const total = list.reduce((s, t) => s + Number(t.qty) * Number(t.harga), 0);

        el.innerHTML = `
        ${exportBar('tblJasaTx','data-jasa','tx-jasa','Data Transaksi Jasa')}
        <div class="box">
            <div class="box-hd"><h3>Input Penjualan Jasa</h3></div>
            <div class="box-bd">
                <form id="fJasaTx">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="js_tgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="js_cab" required>${cabangOpts()}</select></div>
                        <div class="fgroup"><label class="flabel">Kode Jasa</label><input class="finput" id="js_kj" list="dl_jasa" required placeholder="Ketik kode…"></div>
                        <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="js_qty" value="1" min="0.01" required></div>
                        <div class="fgroup"><label class="flabel">Harga (Rp)</label><input class="finput" type="number" id="js_hrg" min="0" required></div>
                        <div class="fgroup"><label class="flabel">Metode Bayar</label><select class="fselect" id="js_bayar"><option>Tunai</option><option>Kredit</option></select></div>
                    </div>
                    <div id="js_prev" class="fprev"></div>
                    <button class="btn btn-p" type="submit">+ Simpan Jasa</button>
                </form>
                ${jasaDatalist('dl_jasa')}
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Penjualan Jasa</h3>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input class="finput" id="srchJasa" placeholder="🔍 Cari jasa…" value="${esc(search)}" style="width:200px;"
                        oninput="smartSearch('srchJasa', this.value, v => { window._jasaSearch = v; }, renderTrxJasa)">
                    <div class="meta">${list.length} transaksi · Total: <strong>${R(total)}</strong></div>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblJasaTx">
                    <thead><tr><th>No. Transaksi</th><th>Tanggal</th><th>Cabang</th><th>Jasa</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Total</th><th>Bayar</th><th></th></tr></thead>
                    <tbody>${list.map(t => `<tr>
                        <td style="font-size:11px;color:var(--ink3);cursor:pointer;" onclick="bukaBentukanRef('JS-${t.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(t.no_transaksi || ('JS-'+t.id))}</td>
                        <td>${fmtTgl(t.tgl)}</td><td>${esc(t.cabang)}</td>
                        <td>${esc(t.nama_jasa || t.kode_jasa)}
                            <span class="badge ${(t.ppn_jasa||'') === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}">${t.ppn_jasa||''}</span>
                        </td>
                        <td class="r">${t.qty}</td><td class="r">${R(t.harga)}</td>
                        <td class="r">${R(t.qty * t.harga)}</td><td>${t.bayar}</td>
                        <td><button class="row-del" onclick="hapusTrx('jasa',${t.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">🛠️</div><strong>Belum ada data.</strong></div>'}
            </div>
        </div>`;

        const kjInput = document.getElementById('js_kj');
        kjInput.addEventListener('input', () => {
            const j = getJasa(kjInput.value.trim());
            const prev = document.getElementById('js_prev');
            if (j) {
                prev.textContent = `${j.nama} — ${j.ppn}${j.harga ? ' | Harga standar: ' + R(j.harga) : ''}`;
                if (j.harga) document.getElementById('js_hrg').value = j.harga;
            } else {
                prev.textContent = kjInput.value ? 'Kode tidak ditemukan di master jasa.' : '';
            }
        });

        document.getElementById('fJasaTx').onsubmit = async e => {
            e.preventDefault();
            const kj = kjInput.value.trim();
            if (!getJasa(kj)) { toast('Kode jasa tidak ditemukan. Tambahkan di Master Jasa.', 'err'); return; }
            try {
                await apiPost('/transaksi/jasa', {
                    tgl      : document.getElementById('js_tgl').value,
                    cabang   : document.getElementById('js_cab').value,
                    kode_jasa: kj,
                    qty      : Number(document.getElementById('js_qty').value),
                    harga    : Number(document.getElementById('js_hrg').value),
                    bayar    : document.getElementById('js_bayar').value,
                });
                toast('Transaksi jasa disimpan');
                await renderTrxJasa();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── SEWA ─────────────────────────────────────────────────── */
async function renderSewa() {
    const el = document.getElementById('tx-sewa');
    el.innerHTML = loadingHTML;
    const search = window._sewaSearch || '';
    try {
        const cab  = getCabang();
        const res  = await apiGet('/transaksi/sewa' + buildQuery({ cabang: cab, per_page: 50, search }));
        const list = res.data || [];
        const total = list.reduce((s, t) => s + Number(t.biaya), 0);

        el.innerHTML = `
        ${exportBar('tblSewa','data-sewa','tx-sewa','Data Sewa')}
        <div class="box">
            <div class="box-hd"><h3>Input Transaksi Sewa</h3></div>
            <div class="box-bd">
                <form id="fSewa">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Tanggal Input</label><input class="finput" type="date" id="sw_tgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="sw_cab" required>${cabangOpts()}</select></div>
                        <div class="fgroup"><label class="flabel">Nama Penyewa</label><input class="finput" id="sw_nama" required></div>
                        <div class="fgroup"><label class="flabel">Item yang Disewa</label><input class="finput" id="sw_item" required placeholder="Contoh: Tenda Pesta, Kursi, dll"></div>
                        <div class="fgroup"><label class="flabel">Tgl Mulai Sewa</label><input class="finput" type="date" id="sw_mulai" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Tgl Selesai Sewa</label><input class="finput" type="date" id="sw_selesai" required></div>
                        <div class="fgroup"><label class="flabel">Biaya Sewa (Rp)</label><input class="finput" type="number" id="sw_biaya" min="0" required></div>
                        <div class="fgroup"><label class="flabel">Status PPN</label><select class="fselect" id="sw_ppn"><option>Non-PPN</option><option>Kena PPN</option></select></div>
                        <div class="fgroup"><label class="flabel">Metode Bayar</label><select class="fselect" id="sw_bayar"><option>Tunai</option><option>Kredit</option></select></div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Sewa</button>
                </form>
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Sewa</h3>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input class="finput" id="srchSewa" placeholder="🔍 Cari penyewa atau item…" value="${esc(search)}" style="width:200px;"
                        oninput="smartSearch('srchSewa', this.value, v => { window._sewaSearch = v; }, renderSewa)">
                    <div class="meta">${list.length} transaksi · Total: <strong>${R(total)}</strong></div>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblSewa">
                    <thead><tr><th>No. Transaksi</th><th>Mulai</th><th>Selesai</th><th>Cabang</th><th>Penyewa</th><th>Item</th><th class="r">Biaya</th><th>PPN</th><th>Bayar</th><th></th></tr></thead>
                    <tbody>${list.map(t => `<tr>
                        <td style="font-size:11px;color:var(--ink3);cursor:pointer;" onclick="bukaBentukanRef('SW-${t.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(t.no_transaksi || ('SW-'+t.id))}</td>
                        <td>${fmtTgl(t.tgl_mulai)}</td><td>${fmtTgl(t.tgl_selesai)}</td>
                        <td>${esc(t.cabang)}</td><td>${esc(t.nama_penyewa)}</td><td>${esc(t.item)}</td>
                        <td class="r">${R(t.biaya)}</td>
                        <td><span class="badge ${t.ppn === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}">${t.ppn}</span></td>
                        <td>${t.bayar}</td>
                        <td><button class="row-del" onclick="hapusTrx('sewa',${t.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">🗝️</div><strong>Belum ada data sewa.</strong></div>'}
            </div>
        </div>`;

        document.getElementById('fSewa').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/transaksi/sewa', {
                    tgl         : document.getElementById('sw_tgl').value,
                    cabang      : document.getElementById('sw_cab').value,
                    nama_penyewa: document.getElementById('sw_nama').value.trim(),
                    item        : document.getElementById('sw_item').value.trim(),
                    tgl_mulai   : document.getElementById('sw_mulai').value,
                    tgl_selesai : document.getElementById('sw_selesai').value,
                    biaya       : Number(document.getElementById('sw_biaya').value),
                    ppn         : document.getElementById('sw_ppn').value,
                    bayar       : document.getElementById('sw_bayar').value,
                });
                toast('Data sewa disimpan');
                await renderSewa();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── MUTASI BARANG ANTAR CABANG ─────────────────────────────
   Dipindah ke public/js/modules/mutasi.js (paket multi-barang,
   alur kirim → konfirmasi tujuan → selesai, cetak struk & faktur).
   renderMutasi() didefinisikan di sana dan dipanggil dari nav.js
   persis seperti sub-modul lain. ─────────────────────────── */

/* ── RETUR BARANG ─────────────────────────────────────────── */
async function renderRetur() {
    const el = document.getElementById('tx-retur');
    el.innerHTML = loadingHTML;
    const search = window._returSearch || '';
    try {
        const cab  = getCabang();
        const list = await apiGet('/transaksi/retur' + buildQuery({ cabang: cab, search }));
        const totJ = list.filter(t => t.jenis === 'Jual').reduce((s, t) => s + t.qty * t.harga, 0);
        const totB = list.filter(t => t.jenis === 'Beli').reduce((s, t) => s + t.qty * t.harga, 0);

        el.innerHTML = `
        ${exportBar('tblRetur','data-retur','tx-retur','Data Retur Barang')}
        <div class="kpi-grid">
            <div class="kpi red"><div class="kpi-label">Nilai Retur Penjualan</div><div class="kpi-val neg">${R(totJ)}</div><div class="kpi-sub">Dikembalikan dari pelanggan</div></div>
            <div class="kpi green"><div class="kpi-label">Nilai Retur Pembelian</div><div class="kpi-val">${R(totB)}</div><div class="kpi-sub">Dikembalikan ke supplier</div></div>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Input Barang Retur</h3></div>
            <div class="box-bd">
                <form id="fRetur">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="rt_tgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="rt_cab" required>${cabangOpts()}</select></div>
                        <div class="fgroup">
                            <label class="flabel">Jenis Retur</label>
                            <select class="fselect" id="rt_jenis">
                                <option value="Jual">Retur Penjualan (dari pelanggan)</option>
                                <option value="Beli">Retur Pembelian (ke supplier)</option>
                            </select>
                        </div>
                        <div class="fgroup"><label class="flabel">Kode Barang</label><input class="finput" id="rt_kb" list="dl_retur" required placeholder="Ketik kode…"></div>
                        <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="rt_qty" value="1" min="0.01" required></div>
                        <div class="fgroup">
                            <label class="flabel">Satuan</label>
                            <select class="fselect" id="rt_sat"><option value="">PCS</option></select>
                            <span class="fhint" id="rt_satHint"></span>
                        </div>
                        <div class="fgroup"><label class="flabel">Harga per Satuan di Atas (Rp)</label><input class="finput" type="number" id="rt_hrg" min="0" required></div>
                        <div class="fgroup"><label class="flabel">Metode</label><select class="fselect" id="rt_bayar"><option>Tunai</option><option>Kredit</option></select></div>
                        <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="rt_ket" placeholder="Alasan retur…"></div>
                    </div>
                    <button class="btn btn-p" type="submit">+ Simpan Retur</button>
                </form>
                ${barangDatalist('dl_retur')}
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Retur</h3>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input class="finput" id="srchRetur" placeholder="🔍 Cari barang atau keterangan…" value="${esc(search)}" style="width:220px;"
                        oninput="smartSearch('srchRetur', this.value, v => { window._returSearch = v; }, renderRetur)">
                    <div class="meta">${list.length} retur</div>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblRetur">
                    <thead><tr><th>No. Transaksi</th><th>Tanggal</th><th>Cabang</th><th>Jenis</th><th>Barang</th><th class="r">Qty</th><th class="r">Total</th><th>Keterangan</th><th></th></tr></thead>
                    <tbody>${list.map(t => `<tr>
                        <td style="font-size:11px;color:var(--ink3);cursor:pointer;" onclick="bukaBentukanRef('RT-${t.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(t.no_transaksi || ('RT-'+t.id))}</td>
                        <td>${fmtTgl(t.tgl)}</td><td>${esc(t.cabang)}</td>
                        <td><span class="badge ${t.jenis === 'Jual' ? 'badge-out' : 'badge-in'}">Retur ${t.jenis}</span></td>
                        <td><span class="link-barang" onclick="lihatKartuHpp('${esc(t.kode_barang)}')" title="Klik untuk lihat riwayat masuk/keluar & HPP rata-rata barang ini">${esc(t.nama_barang || t.kode_barang)}</span></td>
                        <td class="r">${t.qty_asal ? `${Number(t.qty_asal).toLocaleString('id-ID')} ${esc(t.satuan||'')}<br><span style="font-size:11px;color:var(--ink3);">= ${Number(t.qty).toLocaleString('id-ID')} ${esc(t.satuan1||'')}</span>` : `${Number(t.qty).toLocaleString('id-ID')} ${esc(t.satuan1||'')}`}</td>
                        <td class="r">${R(t.qty * t.harga)}</td>
                        <td>${esc(t.keterangan || '–')}</td>
                        <td><button class="row-del" onclick="hapusTrx('retur',${t.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">↩️</div><strong>Belum ada retur.</strong></div>'}
            </div>
        </div>`;

        // Isi pilihan satuan (PCS/DUS dst) sesuai barang, sama seperti form Penjualan/Pembelian
        const rtKb = document.getElementById('rt_kb');
        const rtSat = document.getElementById('rt_sat');
        const rtSatHint = document.getElementById('rt_satHint');
        const rtHrg = document.getElementById('rt_hrg');
        const updateSatuanRetur = (b) => {
            const opts = [{ val: b?.satuan1 || 'PCS', label: b?.satuan1 || 'PCS', isi: 1 }];
            if (b?.satuan2 && b.isi > 1) opts.push({ val: b.satuan2, label: `${b.satuan2} (isi ${b.isi} ${b.satuan1 || 'PCS'})`, isi: Number(b.isi) });
            rtSat.innerHTML = opts.map(o => `<option value="${esc(o.val)}" data-isi="${o.isi}">${esc(o.label)}</option>`).join('');
            rtSatHint.textContent = opts.length > 1 ? 'Pilih satuan sesuai barang fisik yang diretur — dikonversi otomatis ke satuan dasar.' : '';
        };
        rtSat.onchange = () => {
            const opt = rtSat.selectedOptions[0];
            const isi = Number(opt?.dataset.isi || 1);
            rtSatHint.textContent = isi > 1 ? `1 ${opt.value} = ${isi} ${getBarang(rtKb.value.trim())?.satuan1 || 'PCS'} — harga di atas dianggap harga per ${opt.value}.` : '';
        };
        rtKb.addEventListener('input', () => {
            const b = getBarang(rtKb.value.trim());
            updateSatuanRetur(b);
            if (b && !rtHrg.value) rtHrg.value = document.getElementById('rt_jenis').value === 'Jual' ? (b.harga_jual || 0) : (b.modal || 0);
        });

        document.getElementById('fRetur').onsubmit = async e => {
            e.preventDefault();
            const kb = document.getElementById('rt_kb').value.trim();
            if (!getBarang(kb)) { toast('Kode barang tidak ditemukan di master', 'err'); return; }
            try {
                await apiPost('/transaksi/retur', {
                    tgl         : document.getElementById('rt_tgl').value,
                    cabang      : document.getElementById('rt_cab').value,
                    jenis       : document.getElementById('rt_jenis').value,
                    kode_barang : kb,
                    qty         : Number(document.getElementById('rt_qty').value),
                    satuan      : rtSat.value || null,
                    harga       : Number(document.getElementById('rt_hrg').value),
                    bayar       : document.getElementById('rt_bayar').value,
                    keterangan  : document.getElementById('rt_ket').value.trim(),
                });
                toast('Retur disimpan');
                await renderRetur();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── KASBON KARYAWAN ──────────────────────────────────────── */
async function renderKasbon() {
    const el = document.getElementById('tx-kasbon');
    el.innerHTML = loadingHTML;
    const search = window._kasbonSearch || '';
    try {
        const cab = getCabang();
        const [res, karyawanList] = await Promise.all([
            apiGet('/transaksi/kasbon' + buildQuery({ cabang: cab, search })),
            apiGet('/karyawan?status=Aktif'),
        ]);
        const list = res.data || [];
        const saldo = Number(res.saldo) || 0;
        const perKaryawan = res.per_karyawan || [];

        el.innerHTML = `
        ${exportBar('tblKasbon','data-kasbon','tx-kasbon','Data Kasbon Karyawan')}
        <div class="row2">
            <div class="box">
                <div class="box-hd"><h3>Input Kasbon Karyawan</h3></div>
                <div class="box-bd">
                    <form id="fKasbon">
                        <div class="fgrid">
                            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="kb_tgl" value="${today()}" required></div>
                            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="kb_cab" required>${cabangOpts()}</select></div>
                            <div class="fgroup"><label class="flabel">Karyawan</label>
                                <select class="fselect" id="kb_kid" required onchange="isiCabangKasbon(this.value)">
                                    <option value="">-- Pilih Karyawan --</option>
                                    ${karyawanList.map(k=>`<option value="${k.id}" data-cabang="${esc(k.cabang||'')}">${esc(k.kode)} - ${esc(k.nama)}</option>`).join('')}
                                </select></div>
                            <div class="fgroup">
                                <label class="flabel">Jenis</label>
                                <select class="fselect" id="kb_jenis">
                                    <option value="Diberikan">Diberikan (kasbon keluar)</option>
                                    <option value="Dibayar">Dibayar / Dilunasi</option>
                                </select>
                            </div>
                            <div class="fgroup"><label class="flabel">Nominal (Rp)</label><input class="finput" type="number" id="kb_nom" min="0" required></div>
                            <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="kb_ket" placeholder="Opsional"></div>
                        </div>
                        <button class="btn btn-p" type="submit">+ Simpan Kasbon</button>
                    </form>
                </div>
            </div>
            <div class="box">
                <div class="box-hd"><h3>Ringkasan Kasbon</h3></div>
                <div class="box-bd">
                    <div class="kpi green" style="margin-bottom:12px;">
                        <div class="kpi-label">Total Piutang Kasbon Beredar</div>
                        <div class="kpi-val ${saldo > 0 ? 'pos' : ''}">${R(saldo)}</div>
                        <div class="kpi-sub">
                            ${list.filter(t => t.jenis === 'Diberikan').length} diberikan
                            &nbsp;·&nbsp;
                            ${list.filter(t => t.jenis === 'Dibayar').length} dilunasi
                        </div>
                    </div>
                    ${perKaryawan.length ? `
                    <div style="font-size:12px;color:var(--ink3);margin-bottom:6px;">Sisa kasbon per karyawan:</div>
                    <table style="width:100%;font-size:12px;">
                        <tbody>${perKaryawan.map(p=>`<tr>
                            <td>${esc(p.nama)}</td>
                            <td class="r" style="color:var(--neg);font-weight:600;">${R(p.saldo)}</td>
                        </tr>`).join('')}</tbody>
                    </table>` : '<div style="font-size:12px;color:var(--ink3);">Belum ada karyawan dengan sisa kasbon.</div>'}
                </div>
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Kasbon</h3>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input class="finput" id="srchKasbon" placeholder="🔍 Cari nama karyawan…" value="${esc(search)}" style="width:200px;"
                        oninput="smartSearch('srchKasbon', this.value, v => { window._kasbonSearch = v; }, renderKasbon)">
                    <div class="meta">${list.length} transaksi</div>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblKasbon">
                    <thead><tr><th>No. Transaksi</th><th>Tanggal</th><th>Cabang</th><th>Karyawan</th><th>Jenis</th><th class="r">Nominal</th><th>Keterangan</th><th></th></tr></thead>
                    <tbody>${list.map(t => `<tr>
                        <td style="font-size:11px;color:var(--ink3);cursor:pointer;" onclick="bukaBentukanRef('KB-${t.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(t.no_transaksi || ('KB-'+t.id))}</td>
                        <td>${fmtTgl(t.tgl)}</td><td>${esc(t.cabang)}</td>
                        <td>${t.kode_karyawan?`<span style="font-size:11px;color:var(--ink3);">${esc(t.kode_karyawan)}</span> `:''}${esc(t.nama_karyawan)}</td>
                        <td><span class="badge ${t.jenis === 'Diberikan' ? 'badge-out' : 'badge-in'}">${t.jenis}</span></td>
                        <td class="r">${R(t.nominal)}</td>
                        <td style="font-size:11px;color:var(--ink3);">${esc(t.keterangan||'')}</td>
                        <td><button class="row-del" onclick="hapusTrx('kasbon',${t.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">💵</div><strong>Belum ada kasbon.</strong></div>'}
            </div>
        </div>`;

        document.getElementById('fKasbon').onsubmit = async e => {
            e.preventDefault();
            const kid = document.getElementById('kb_kid').value;
            if (!kid) { toast('Pilih karyawan dulu','err'); return; }
            try {
                await apiPost('/transaksi/kasbon', {
                    tgl         : document.getElementById('kb_tgl').value,
                    cabang      : document.getElementById('kb_cab').value,
                    karyawan_id : parseInt(kid),
                    jenis       : document.getElementById('kb_jenis').value,
                    nominal     : Number(document.getElementById('kb_nom').value),
                    keterangan  : document.getElementById('kb_ket').value.trim()||null,
                });
                toast('Kasbon disimpan');
                await renderKasbon();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

window.isiCabangKasbon = id => {
    if (!id) return;
    const sel = document.getElementById('kb_kid');
    const opt = sel.options[sel.selectedIndex];
    const cab = opt.dataset.cabang;
    if (!cab) return;
    const cabSel = document.getElementById('kb_cab');
    for (let o of cabSel.options) { if (o.value === cab) { cabSel.value = cab; break; } }
};

/* ── CASHBON PELANGGAN ────────────────────────────────────── */
async function renderCashbon() {
    const el = document.getElementById('tx-cashbon');
    el.innerHTML = loadingHTML;
    const search = window._cashbonSearch || '';
    try {
        const cab  = getCabang();
        const res  = await apiGet('/transaksi/cashbon' + buildQuery({ cabang: cab, search }));
        const list = res.data || [];
        const saldo = Number(res.saldo) || 0;

        el.innerHTML = `
        <div class="note note-b"><span class="note-ico">ℹ️</span>
            <span>Cashbon Pelanggan: mencatat pinjaman tunai ke pelanggan. Berbeda dari Kasbon Karyawan.</span>
        </div>
        ${exportBar('tblCashbon','data-cashbon','tx-cashbon','Data Cashbon Pelanggan')}
        <div class="row2">
            <div class="box">
                <div class="box-hd"><h3>Input Cashbon Pelanggan</h3></div>
                <div class="box-bd">
                    <form id="fCashbon">
                        <div class="fgrid">
                            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="cb_tgl" value="${today()}" required></div>
                            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="cb_cab" required>${cabangOpts()}</select></div>
                            <div class="fgroup"><label class="flabel">Nama Pelanggan</label><input class="finput" id="cb_nama" required placeholder="Nama pelanggan"></div>
                            <div class="fgroup">
                                <label class="flabel">Jenis</label>
                                <select class="fselect" id="cb_jenis">
                                    <option value="Diberikan">Diberikan (cashbon keluar)</option>
                                    <option value="Dibayar">Dibayar / Dilunasi</option>
                                </select>
                            </div>
                            <div class="fgroup"><label class="flabel">Nominal (Rp)</label><input class="finput" type="number" id="cb_nom" min="0" required></div>
                        </div>
                        <button class="btn btn-p" type="submit">+ Simpan Cashbon</button>
                    </form>
                </div>
            </div>
            <div class="box">
                <div class="box-hd"><h3>Total Piutang Cashbon</h3></div>
                <div class="box-bd">
                    <div class="kpi green" style="margin-bottom:0;">
                        <div class="kpi-label">Piutang Cashbon Pelanggan Beredar</div>
                        <div class="kpi-val pos">${R(saldo)}</div>
                        <div class="kpi-sub">
                            ${list.filter(t => t.jenis === 'Diberikan').length} diberikan
                            &nbsp;·&nbsp;
                            ${list.filter(t => t.jenis === 'Dibayar').length} dilunasi
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Cashbon</h3>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input class="finput" id="srchCashbon" placeholder="🔍 Cari nama pelanggan…" value="${esc(search)}" style="width:200px;"
                        oninput="smartSearch('srchCashbon', this.value, v => { window._cashbonSearch = v; }, renderCashbon)">
                    <div class="meta">${list.length} transaksi</div>
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblCashbon">
                    <thead><tr><th>No. Transaksi</th><th>Tanggal</th><th>Cabang</th><th>Pelanggan</th><th>Jenis</th><th class="r">Nominal</th><th></th></tr></thead>
                    <tbody>${list.map(t => `<tr>
                        <td style="font-size:11px;color:var(--ink3);cursor:pointer;" onclick="bukaBentukanRef('CB-${t.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(t.no_transaksi || ('CB-'+t.id))}</td>
                        <td>${fmtTgl(t.tgl)}</td><td>${esc(t.cabang)}</td><td>${esc(t.nama_pelanggan)}</td>
                        <td><span class="badge ${t.jenis === 'Diberikan' ? 'badge-out' : 'badge-in'}">${t.jenis}</span></td>
                        <td class="r">${R(t.nominal)}</td>
                        <td><button class="row-del" onclick="hapusTrx('cashbon',${t.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">🏷️</div><strong>Belum ada cashbon pelanggan.</strong></div>'}
            </div>
        </div>`;

        document.getElementById('fCashbon').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/transaksi/cashbon', {
                    tgl            : document.getElementById('cb_tgl').value,
                    cabang         : document.getElementById('cb_cab').value,
                    nama_pelanggan : document.getElementById('cb_nama').value.trim(),
                    jenis          : document.getElementById('cb_jenis').value,
                    nominal        : Number(document.getElementById('cb_nom').value),
                });
                toast('Cashbon disimpan');
                await renderCashbon();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── PENGELUARAN / BIAYA ──────────────────────────────────── */

// State filter periode pengeluaran — tersimpan di window supaya tidak reset
// tiap kali tab di-render ulang (mis. habis simpan/hapus data).
function defaultBiayaFilter() {
    return { tipe: 'Bulanan', tgl: today(), minggu: today(), bulan: today().slice(0, 7), tahun: new Date().getFullYear() };
}
window._biayaFilter = window._biayaFilter || defaultBiayaFilter();

// Hitung rentang tanggal dari-sampai berdasarkan tipe periode yang dipilih
function rentangBiaya() {
    const f = window._biayaFilter;
    if (f.tipe === 'Harian') {
        return { dari: f.tgl, sampai: f.tgl, label: fmtTgl(f.tgl) };
    }
    if (f.tipe === 'Mingguan') {
        const d = new Date(f.minggu + 'T00:00:00');
        const day = d.getDay(); // 0=Minggu..6=Sabtu
        const geserKeSenin = (day === 0 ? -6 : 1 - day);
        const senin = new Date(d); senin.setDate(d.getDate() + geserKeSenin);
        const ahad  = new Date(senin); ahad.setDate(senin.getDate() + 6);
        const iso = x => x.toISOString().slice(0, 10);
        return { dari: iso(senin), sampai: iso(ahad), label: `${fmtTgl(iso(senin))} – ${fmtTgl(iso(ahad))}` };
    }
    if (f.tipe === 'Tahunan') {
        return { dari: `${f.tahun}-01-01`, sampai: `${f.tahun}-12-31`, label: `Tahun ${f.tahun}` };
    }
    // Bulanan (default)
    const [y, m]  = f.bulan.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    return { dari: `${f.bulan}-01`, sampai: `${f.bulan}-${String(lastDay).padStart(2,'0')}`, label: monthLabel(f.bulan) };
}

window.ubahTipeBiaya = tipe => { window._biayaFilter.tipe = tipe; renderBiaya(); };
window.ubahAnchorBiaya = (field, val) => { window._biayaFilter[field] = val; renderBiaya(); };
window.resetBiayaFilter = () => { window._biayaFilter = defaultBiayaFilter(); renderBiaya(); };

function inputAnchorBiaya() {
    const f = window._biayaFilter;
    if (f.tipe === 'Harian')
        return `<label class="flabel">Pilih Tanggal</label><input class="finput" type="date" value="${f.tgl}" onchange="ubahAnchorBiaya('tgl', this.value)">`;
    if (f.tipe === 'Mingguan')
        return `<label class="flabel">Pilih Tanggal (dalam minggu)</label><input class="finput" type="date" value="${f.minggu}" onchange="ubahAnchorBiaya('minggu', this.value)">`;
    if (f.tipe === 'Tahunan')
        return `<label class="flabel">Pilih Tahun</label><input class="finput" type="number" min="2000" max="2100" value="${f.tahun}" style="width:110px;" onchange="ubahAnchorBiaya('tahun', Number(this.value))">`;
    return `<label class="flabel">Pilih Bulan</label><input class="finput" type="month" value="${f.bulan}" onchange="ubahAnchorBiaya('bulan', this.value)">`;
}

async function renderBiaya() {
    const el = document.getElementById('tx-biaya');
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const { dari, sampai, label } = rentangBiaya();
        const akunBeban = STATE.coa.filter(c => c.kat === 'Beban');

        const [res, ring] = await Promise.all([
            apiGet('/transaksi/biaya' + buildQuery({ cabang: cab, dari, sampai, per_page: 200, search: window._biayaSearch || '' })),
            apiGet('/transaksi/biaya/summary' + buildQuery({ cabang: cab, dari, sampai })),
        ]);
        const list = res.data || [];

        const jumlahHari   = Math.max(1, Math.round((new Date(sampai) - new Date(dari)) / 86400000) + 1);
        const rataRataHari = ring.total_nominal / jumlahHari;
        const kategoriTop  = ring.per_kategori?.[0] || null;
        const perKategori  = (ring.per_kategori || []).slice(0, 8);
        const terbesar     = ring.terbesar || [];

        // Data tren: kalau tahunan, kelompokkan per bulan biar tidak terlalu padat;
        // selain itu tampil per tanggal apa adanya.
        let trenLabels = [], trenValues = [];
        if (window._biayaFilter.tipe === 'Tahunan') {
            const map = {};
            (ring.per_tanggal || []).forEach(r => {
                const bln = monthOf(r.tgl);
                map[bln] = (map[bln] || 0) + Number(r.total);
            });
            const keys = Object.keys(map).sort();
            trenLabels = keys.map(monthLabel);
            trenValues = keys.map(k => map[k]);
        } else {
            trenLabels = (ring.per_tanggal || []).map(r => fmtTgl(r.tgl));
            trenValues = (ring.per_tanggal || []).map(r => Number(r.total));
        }

        el.innerHTML = `
        <div class="box" style="margin-bottom:20px;">
            <div class="box-hd"><h3>➕ Input Pengeluaran / Biaya</h3><button class="btn btn-g btn-sm" type="button" onclick="bukaImportBiaya()">📥 Import Excel</button></div>
            <div class="box-bd">
                <form id="fBiaya">
                    <div class="fgrid">
                        <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="bx_tgl" value="${today()}" required></div>
                        <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="bx_cab" required>${cabangOpts()}</select></div>
                        <div class="fgroup">
                            <label class="flabel">Kategori Biaya (Akun)</label>
                            <select class="fselect" id="bx_akun" required>
                                ${akunBeban.map(c => `<option value="${esc(c.kode)}">${esc(c.kode)} – ${esc(c.nama)}</option>`).join('')}
                            </select>
                        </div>
                        <div class="fgroup"><label class="flabel">Nominal (Rp)</label><input class="finput" type="number" id="bx_nom" min="0" required></div>
                        <div class="fgroup">
                            <label class="flabel">Dibayar dari</label>
                            <select class="fselect" id="bx_bayar">
                                <option>Kas</option>
                                <option>Bank</option>
                            </select>
                        </div>
                        <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="bx_ket" placeholder="Detail pengeluaran…"></div>
                    </div>
                    <div class="fhint" style="margin-bottom:8px;">Nomor bukti/kode pengeluaran (contoh: BX-20260702-0001) dibuat otomatis saat disimpan.</div>
                    <button class="btn btn-p" type="submit">+ Simpan Pengeluaran</button>
                </form>
            </div>
        </div>

        <div class="box" style="margin-bottom:20px;">
            <div class="box-hd"><h3>📅 Filter Periode</h3><div class="meta">Menampilkan: <strong>${label}</strong></div></div>
            <div class="box-bd">
                <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
                    <div class="fgroup" style="margin:0;min-width:130px;">
                        <label class="flabel">Tampilkan Per</label>
                        <select class="fselect" onchange="ubahTipeBiaya(this.value)">
                            <option value="Harian"   ${window._biayaFilter.tipe==='Harian'  ?'selected':''}>Harian</option>
                            <option value="Mingguan" ${window._biayaFilter.tipe==='Mingguan'?'selected':''}>Mingguan</option>
                            <option value="Bulanan"  ${window._biayaFilter.tipe==='Bulanan' ?'selected':''}>Bulanan</option>
                            <option value="Tahunan"  ${window._biayaFilter.tipe==='Tahunan' ?'selected':''}>Tahunan</option>
                        </select>
                    </div>
                    <div class="fgroup" style="margin:0;min-width:170px;">${inputAnchorBiaya()}</div>
                    <button class="btn btn-g btn-sm" onclick="resetBiayaFilter()" style="height:38px;">↺ Hari/Bulan Ini</button>
                </div>
            </div>
        </div>

        <div class="kpi-grid">
            <div class="kpi red"><div class="kpi-label">💸 Total Pengeluaran</div><div class="kpi-val neg">${R(ring.total_nominal)}</div></div>
            <div class="kpi"><div class="kpi-label">🧾 Jumlah Transaksi</div><div class="kpi-val">${ring.jumlah_transaksi}</div></div>
            <div class="kpi"><div class="kpi-label">📊 Rata-rata / Hari</div><div class="kpi-val">${R(rataRataHari)}</div></div>
            <div class="kpi"><div class="kpi-label">🏆 Kategori Terbanyak</div><div class="kpi-val" style="font-size:15px;">${esc(kategoriTop?.nama_akun || '–')}</div>
                <div style="font-size:11px;color:var(--ink3);margin-top:2px;">${kategoriTop ? R(kategoriTop.total) : ''}</div>
            </div>
        </div>

        ${ring.jumlah_transaksi ? `
        <div class="row2">
            <div class="box">
                <div class="box-hd"><h3>Pengeluaran per Kategori</h3><div class="meta">Top ${perKategori.length}</div></div>
                <div class="box-bd"><div class="chart-wrap" style="height:210px;"><canvas id="cBiayaKategori"></canvas></div></div>
            </div>
            <div class="box">
                <div class="box-hd"><h3>Tren Pengeluaran</h3><div class="meta">${label}</div></div>
                <div class="box-bd"><div class="chart-wrap" style="height:210px;"><canvas id="cBiayaTren"></canvas></div></div>
            </div>
        </div>

        <div class="row2">
            <div class="box">
                <div class="box-hd"><h3>Ranking Kategori Terboros</h3></div>
                <div class="box-bd pad0 tscroll" style="max-height:320px;">
                    <table>
                        <thead><tr><th>#</th><th>Kategori</th><th class="r">Jml Trx</th><th class="r">Total</th><th class="r">%</th></tr></thead>
                        <tbody>${perKategori.map((k,i) => `<tr>
                            <td>${i<3 ? `<div class="rank-num ${i===0?'gold':i===1?'silver':'bronze'}" style="width:20px;height:20px;font-size:10px;">${i+1}</div>` : `<span style="font-size:12px;color:var(--ink3);">${i+1}</span>`}</td>
                            <td><strong>${esc(k.nama_akun)}</strong></td>
                            <td class="r">${k.jumlah}</td>
                            <td class="r laba-neg">${R(k.total)}</td>
                            <td class="r" style="font-weight:700;">${ring.total_nominal>0 ? Math.round(k.total/ring.total_nominal*100) : 0}%</td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>
            <div class="box">
                <div class="box-hd"><h3>Pengeluaran Terbesar</h3><div class="meta">Top ${terbesar.length}</div></div>
                <div class="box-bd pad0 tscroll" style="max-height:320px;">
                    <table>
                        <thead><tr><th>#</th><th>Tanggal</th><th>Kategori</th><th class="r">Nominal</th></tr></thead>
                        <tbody>${terbesar.map((t,i) => `<tr>
                            <td>${i<3 ? `<div class="rank-num ${i===0?'gold':i===1?'silver':'bronze'}" style="width:20px;height:20px;font-size:10px;">${i+1}</div>` : `<span style="font-size:12px;color:var(--ink3);">${i+1}</span>`}</td>
                            <td>${fmtTgl(t.tgl)}</td>
                            <td>${esc(t.nama_akun || t.kode_akun)}${t.keterangan ? `<div style="font-size:11px;color:var(--ink3);">${esc(t.keterangan)}</div>` : ''}</td>
                            <td class="r laba-neg"><strong>${R(t.nominal)}</strong></td>
                        </tr>`).join('')}</tbody>
                    </table>
                </div>
            </div>
        </div>` : `<div class="note note-b"><span class="note-ico">ℹ️</span><span>Belum ada pengeluaran di periode <strong>${label}</strong>.</span></div>`}

        <div class="box" style="margin-top:20px;">
            <div class="box-hd">
                <h3>Riwayat Pengeluaran</h3>
                <div style="display:flex;gap:8px;align-items:center;">
                    <input class="finput" id="srchBiaya" placeholder="🔍 Cari kategori atau keterangan…" value="${esc(window._biayaSearch || '')}" style="width:220px;"
                        oninput="smartSearch('srchBiaya', this.value, v => { window._biayaSearch = v; }, renderBiaya)">
                    <div class="meta">${label} · ${list.length} transaksi ditampilkan</div>
                </div>
            </div>
            ${exportBar('tblBiaya','data-pengeluaran','tx-biaya','Data Pengeluaran')}
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblBiaya">
                    <thead><tr><th>No. Bukti</th><th>Tanggal</th><th>Cabang</th><th>Kategori</th><th>Keterangan</th><th class="r">Nominal</th><th>Dari</th><th></th></tr></thead>
                    <tbody>${list.map(t => `<tr>
                        <td style="font-family:var(--F-m);font-size:11px;cursor:pointer;" onclick="bukaBentukanRef('BX-${t.id}')" title="Klik untuk lihat bentukan jurnal transaksi ini">${esc(t.no_bukti || ('BX-'+t.id))}</td>
                        <td>${fmtTgl(t.tgl)}</td><td>${esc(t.cabang)}</td>
                        <td>${esc(t.nama_akun || t.kode_akun)}</td>
                        <td>${esc(t.keterangan || '–')}</td>
                        <td class="r laba-neg">${R(t.nominal)}</td>
                        <td><span class="badge badge-noppn">${t.bayar}</span></td>
                        <td><button class="row-del" onclick="hapusTrx('biaya',${t.id})">✕</button></td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">💸</div><strong>Belum ada pengeluaran di periode ini.</strong></div>'}
            </div>
        </div>`;

        setTimeout(() => {
            if (perKategori.length) drawBarCanvas('cBiayaKategori', perKategori.map(k => k.nama_akun), perKategori.map(k => Number(k.total)), '#c0392b');
            if (trenValues.length)  drawLineCanvas('cBiayaTren', trenLabels, trenValues, '#c0392b');
        }, 60);

        document.getElementById('fBiaya').onsubmit = async e => {
            e.preventDefault();
            try {
                await apiPost('/transaksi/biaya', {
                    tgl        : document.getElementById('bx_tgl').value,
                    cabang     : document.getElementById('bx_cab').value,
                    kode_akun  : document.getElementById('bx_akun').value,
                    nominal    : Number(document.getElementById('bx_nom').value),
                    bayar      : document.getElementById('bx_bayar').value,
                    keterangan : document.getElementById('bx_ket').value.trim(),
                });
                toast('Pengeluaran disimpan');
                await renderBiaya();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* =============================================================
   IMPORT PENGELUARAN DARI EXCEL (laporan setoran kasir harian)
   Format: 1 sheet = 1 tanggal ("TANGGAL 1", "TGL 2", "11", …), tiap sheet
   punya blok SHIFT PAGI & SHIFT SIANG. Yang diambil HANYA tabel
   "PENGELUARAN LAIN-LAIN" (kolom KETERANGAN + NOMINAL). Tabel PEMBELIAN,
   TF, QR, dan PIUTANG sengaja tidak dibaca.
   "MODAL PAGI/SIANG/…" = uang kas yang dioper antar shift (bukan biaya),
   jadi dilewati kecuali kotaknya dicentang.
   ============================================================= */
window._importBiayaItems = [];

function parseSetoranPengeluaran(wb, { bulan, sampaiTgl, sertakanModal }) {
    const [thn, bln] = bulan.split('-').map(Number);
    const teks = v => (v === null || v === undefined) ? '' : String(v).trim();
    const items = [], modalDilewati = [], sheetDilewati = [], sheetDibaca = [];
    wb.SheetNames.forEach(nm => {
        const m = nm.match(/(\d+)/);
        if (!m) { sheetDilewati.push(nm + ' (nama sheet tanpa tanggal)'); return; }
        const hari = Number(m[1]);
        if (hari < 1 || hari > 31) { sheetDilewati.push(nm); return; }
        if (sampaiTgl && hari > sampaiTgl) { sheetDilewati.push(nm + ' (lewat cut-off)'); return; }
        const tgl = `${thn}-${String(bln).padStart(2, '0')}-${String(hari).padStart(2, '0')}`;
        const aoa = XLSX.utils.sheet_to_json(wb.Sheets[nm], { header: 1, defval: '', raw: true });
        let blok = 0, dalam = false, n = 0;
        aoa.forEach(r => {
            const a = teks(r[0]).toUpperCase(), e = teks(r[4]);
            if (e.toUpperCase() === 'PENGELUARAN LAIN-LAIN') { blok++; dalam = true; return; }
            if (!dalam) return;
            if (/^(TOTALAN|SETORAN|SHIFT)/.test(a)) { dalam = false; return; }
            if (!e || e.toUpperCase() === 'KETERANGAN') return;
            const nom = Number(r[5]);
            if (!isFinite(nom) || nom <= 0) return;
            const shift = blok === 1 ? 'Pagi' : 'Siang';
            const row = { tgl, hari, shift, ket: e.replace(/\s+/g, ' '), nominal: nom, sheet: nm };
            if (/^modal\b/i.test(e)) { modalDilewati.push(row); if (!sertakanModal) return; }
            items.push(row); n++;
        });
        sheetDibaca.push(nm);
    });
    return { items, modalDilewati, sheetDilewati, sheetDibaca };
}

window.bukaImportBiaya = () => {
    const akunBeban = STATE.coa.filter(c => c.kat === 'Beban');
    const putri1 = (STATE.cabang.find(c => /putri\s*1/i.test(c.nama)) || {}).nama || '';
    const akunDef = (akunBeban.find(c => c.kode === '6105') || akunBeban[0] || {}).kode;
    const bulanDef = (today() || '').slice(0, 7);
    openM(`
    <div class="mhd"><h3>📥 Import Pengeluaran dari Excel</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
            <span>Untuk file setoran kasir harian (1 sheet = 1 tanggal). Hanya tabel <strong>PENGELUARAN LAIN-LAIN</strong> yang dibaca —
            Pembelian, TF, QR, dan Piutang <strong>tidak ikut</strong>. Import ulang file yang sama aman: baris yang sudah ada dilewati.</span>
        </div>
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Pilih File Excel</label>
                <input type="file" id="impBxFile" accept=".xlsx,.xls" class="finput" style="padding:6px;"></div>
            <div class="fgroup"><label class="flabel">Cabang</label>
                <select class="fselect" id="impBxCab">${cabangOpts(putri1)}</select></div>
            <div class="fgroup"><label class="flabel">Bulan (tahun-bulan)</label>
                <input class="finput" type="month" id="impBxBulan" value="${bulanDef}"></div>
            <div class="fgroup"><label class="flabel">Cut-off: sampai tanggal</label>
                <input class="finput" type="number" id="impBxSampai" min="1" max="31" value="26" style="width:110px;">
                <span class="fhint">Sheet tanggal di atas angka ini tidak diimpor (tanggal ini ikut)</span></div>
            <div class="fgroup"><label class="flabel">Kategori Biaya (Akun)</label>
                <select class="fselect" id="impBxAkun">${akunBeban.map(c => `<option value="${esc(c.kode)}" ${c.kode === akunDef ? 'selected' : ''}>${esc(c.kode)} – ${esc(c.nama)}</option>`).join('')}</select></div>
            <div class="fgroup"><label class="flabel">Dibayar dari</label>
                <select class="fselect" id="impBxBayar"><option>Kas</option><option>Bank</option></select></div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;">
            <input type="checkbox" id="impBxModal">
            Sertakan juga baris <strong>MODAL PAGI / MODAL SIANG</strong> (uang kas antar shift — biasanya BUKAN biaya, jadi dibiarkan tidak dicentang)
        </label>
        <div id="impBxPreview" style="margin-top:12px;"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnDoImpBx" onclick="doImportBiaya()" disabled>Import Sekarang</button>
    </div>`);
    ['impBxFile', 'impBxBulan', 'impBxSampai', 'impBxModal'].forEach(id =>
        document.getElementById(id).addEventListener('change', previewImportBiaya));
};

window.previewImportBiaya = async () => {
    const file = document.getElementById('impBxFile').files[0];
    const prev = document.getElementById('impBxPreview');
    const btn  = document.getElementById('btnDoImpBx');
    window._importBiayaItems = []; btn.disabled = true;
    if (!file) return;
    prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';
    try {
        if (typeof XLSX === 'undefined') throw new Error('Library XLSX belum dimuat.');
        const bulan = document.getElementById('impBxBulan').value;
        if (!bulan) throw new Error('Pilih bulan dulu.');
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        const hasil = parseSetoranPengeluaran(wb, {
            bulan,
            sampaiTgl: Number(document.getElementById('impBxSampai').value) || 0,
            sertakanModal: document.getElementById('impBxModal').checked,
        });
        window._importBiayaItems = hasil.items;
        const total = hasil.items.reduce((s, r) => s + r.nominal, 0);
        const modalTot = hasil.modalDilewati.reduce((s, r) => s + r.nominal, 0);
        const perHari = {};
        hasil.items.forEach(r => { (perHari[r.hari] = perHari[r.hari] || { n: 0, t: 0 }); perHari[r.hari].n++; perHari[r.hari].t += r.nominal; });
        const hariList = Object.keys(perHari).map(Number).sort((a, b) => a - b);
        prev.innerHTML = `
        <div class="note ${hasil.items.length ? 'note-g' : 'note-y'}" style="margin-bottom:8px;"><span class="note-ico">${hasil.items.length ? '✓' : '⚠️'}</span>
            <span><strong>${hasil.items.length} baris pengeluaran</strong> dari ${hasil.sheetDibaca.length} sheet — total <strong>${R(total)}</strong>.
            ${hasil.modalDilewati.length ? `<br>${document.getElementById('impBxModal').checked ? 'Termasuk' : 'Dilewati'}: ${hasil.modalDilewati.length} baris Modal Pagi/Siang (${R(modalTot)}).` : ''}
            ${hasil.sheetDilewati.length ? `<br>Sheet tidak diimpor: ${esc(hasil.sheetDilewati.join(', '))}` : ''}</span></div>
        ${hasil.items.length ? `
        <div style="max-height:260px;overflow:auto;border:1px solid var(--brd);border-radius:8px;">
            <table style="font-size:12px;"><thead><tr><th>Tanggal</th><th>Shift</th><th>Keterangan</th><th class="r">Nominal</th></tr></thead>
            <tbody>${hasil.items.map(r => `<tr><td>${fmtTgl(r.tgl)}</td><td>${r.shift}</td><td>${esc(r.ket)}</td><td class="r">${R(r.nominal)}</td></tr>`).join('')}</tbody></table>
        </div>
        <div class="fhint" style="margin-top:6px;">Per tanggal: ${hariList.map(h => `${h}: ${R(perHari[h].t)}`).join(' · ')}</div>` : ''}`;
        btn.disabled = !hasil.items.length;
    } catch (err) {
        prev.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
    }
};

window.doImportBiaya = async () => {
    const items = window._importBiayaItems || [];
    const cabang = document.getElementById('impBxCab').value;
    const kode_akun = document.getElementById('impBxAkun').value;
    const bayar = document.getElementById('impBxBayar').value;
    if (!items.length) { toast('Tidak ada data untuk diimpor', 'err'); return; }
    if (!cabang) { toast('Pilih cabang dulu', 'err'); return; }
    const btn = document.getElementById('btnDoImpBx');
    btn.disabled = true; btn.textContent = 'Mengimpor…';
    try {
        let added = 0, dilewati = 0;
        for (let i = 0; i < items.length; i += 200) {
            const res = await apiPost('/transaksi/biaya/import', {
                cabang, kode_akun, bayar,
                items: items.slice(i, i + 200).map(r => ({
                    tgl: r.tgl, nominal: r.nominal,
                    keterangan: `${r.ket} (Shift ${r.shift})`,
                })),
            });
            added += res.added || 0; dilewati += res.dilewati || 0;
        }
        closeM();
        toast(`Import selesai: ${added} pengeluaran masuk` + (dilewati ? `, ${dilewati} dilewati (sudah ada)` : ''));
        await renderBiaya();
    } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false; btn.textContent = 'Import Sekarang';
    }
};

/* =============================================================
   IMPORT PENJUALAN DARI EXCEL (Laporan Penjualan Detail / By Kasir)
   Mendukung format laporan kasir Toko Sumini: sheet "Detail Transaksi"
   dengan kolom No. Transaksi, Kasir, Kode Barang (boleh barcode),
   Nama Barang, QTY, Harga Satuan, Subtotal. Tanggal diambil dari judul
   laporan (mis. "LAPORAN PENJUALAN BY KASIR (01/07/2026)") kalau ada.
   Backend (/transaksi/jual/import) otomatis:
     - mencocokkan Kode Barang ke kode ATAU barcode di Master Barang
     - mengurangi stok sesuai cabang yang dipilih
     - baris yang barangnya tidak ditemukan akan dilaporkan, bukan gagal semua
   ============================================================= */
window._importJualItems = [];

window.bukaImportPenjualan = () => {
    // Coba tebak tanggal hari ini sebagai default
    openM(`
    <div class="mhd"><h3>📥 Import Penjualan dari Excel</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
            <span>Untuk file "Laporan Penjualan Detail/By Kasir" dari sistem kasir (kolom Kode Barang, Nama Barang, QTY, Harga Satuan),
            ATAU file Template Import / hasil "Export Semua" (kolom No. Referensi, Tanggal, Diskon, dst — baris dgn No. Referensi sama akan digabung 1 nota).
            Kode Barang boleh berupa barcode — akan dicocokkan otomatis ke Master Barang.
            Tanggal akan dibaca dari judul laporan / kolom Tanggal per baris kalau ada, silakan cek/ubah sebelum import.</span>
        </div>
        <button class="btn btn-g btn-sm" style="margin-bottom:10px;" onclick="downloadTemplateImport('jual')">📄 Download Template Excel</button>
        <div class="fgrid">
            <div class="fgroup">
                <label class="flabel">Pilih File Excel</label>
                <input type="file" id="importJualFile" accept=".xlsx,.xls,.csv" class="finput" style="padding:6px;">
            </div>
            <div class="fgroup">
                <label class="flabel">Tanggal Transaksi</label>
                <input class="finput" type="date" id="importJualTgl" value="${today()}">
                <span class="fhint" id="importJualTglHint">Otomatis dari kolom Tanggal di file (per baris) atau judul laporan</span>
            </div>
            <div class="fgroup">
                <label class="flabel">Cabang</label>
                <select class="fselect" id="importJualCab">${cabangOpts()}</select>
                <span class="fhint" id="importJualCabHint">Kalau file punya kolom "Cabang" (atau "Kasir"), tiap baris masuk ke cabangnya sendiri; pilihan ini jadi cadangan untuk baris yang cabangnya kosong</span>
            </div>
            <div class="fgroup">
                <label class="flabel">Metode Bayar</label>
                <select class="fselect" id="importJualBayar"><option>Tunai</option><option>Kredit</option></select>
            </div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;">
            <input type="checkbox" id="importJualForcePpn">
            Tandai SEMUA baris sebagai <strong>Kena PPN</strong> (override — abaikan status PPN di Master Barang &amp; kolom PPN di file)
        </label>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;">
            <input type="checkbox" id="importJualHppPpn">
            Kolom <strong>HPP</strong> di file <strong>sudah termasuk PPN</strong> (laporan kasir lama) — dibagi 1+PPN untuk baris Kena PPN, supaya sebasis dengan penjualan (DPP) di Laba Rugi
        </label>
        <div id="importJualHppHint" style="font-size:12px;margin-top:4px;"></div>
        <div id="importJualPreview" style="margin-top:12px;"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnDoImportJual" onclick="doImportPenjualan()" disabled>Import Sekarang</button>
    </div>`);

    document.getElementById('importJualFile').addEventListener('change', previewImportPenjualan);
};

window.previewImportPenjualan = async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const prev = document.getElementById('importJualPreview');
    prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';

    try {
        if (typeof XLSX === 'undefined') throw new Error('Library XLSX belum dimuat.');

        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });

        // Pilih sheet yang paling mirip "Detail Transaksi", kalau tidak ada pakai sheet pertama
        const sheetName = wb.SheetNames.find(n => /detail/i.test(n)) || wb.SheetNames[0];
        const ws  = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

        const inTglJ = document.getElementById('importJualTgl'), hintTglJ = document.getElementById('importJualTglHint');
        inTglJ.disabled = false; inTglJ.value = today();
        hintTglJ.textContent = 'Otomatis dari kolom Tanggal di file (per baris) atau judul laporan';

        // Cari baris header — dikenali dari kolom "Kode Barang" & "QTY" (format
        // Laporan Kasir) ATAU dari kolom "No. Referensi" (format Template Import /
        // hasil Export Semua Riwayat Penjualan — lihat exportJualBeliSemua()).
        const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        let headerIdx = -1, col = {};
        for (let r = 0; r < aoa.length; r++) {
            const cells = (aoa[r] || []).map(norm);
            const iKode = cells.findIndex(c => c === 'kodebarang' || c === 'kode');
            const iQty  = cells.findIndex(c => c === 'qty' || c === 'jumlah');
            if (iKode >= 0 && iQty >= 0) {
                headerIdx = r;
                col = {
                    kode     : iKode,
                    nama     : cells.findIndex(c => c === 'namabarang' || c === 'nama'),
                    qty      : iQty,
                    harga    : cells.findIndex(c => c === 'hargasatuan' || c === 'harga'),
                    satuan   : cells.findIndex(c => c === 'satuan'),
                    // Kolom tambahan dari Template Import / Export Semua — opsional,
                    // kalau tidak ada di file, tetap pakai nilai dari form (spt sebelumnya).
                    noNota   : cells.findIndex(c => c.includes('referensi') || c === 'nonota' || c === 'noref'),
                    tgl      : cells.findIndex(c => c === 'tanggal'),
                    cabangCol: cells.findIndex(c => c === 'cabang'),
                    diskon   : cells.findIndex(c => c === 'diskon'),
                    bayarCol : cells.findIndex(c => c === 'bayar'),
                    ket      : cells.findIndex(c => c === 'keterangan'),
                    // HPP (harga pokok per satuan baris ini) & PPN — opsional, lihat
                    // catatan di TransaksiController::importTrx & downloadTemplateImport('jual').
                    hpp      : cells.findIndex(c => c === 'hpp' || c === 'hargapokok'),
                    ppnCol   : cells.findIndex(c => c === 'ppn' || c === 'statusppn'),
                    // Kasir (akun kasir) & Shift (Pagi/Siang) — opsional. Kosong/tak ada → shift
                    // ditebak backend dari akun (berakhiran 1 = Pagi, selain itu Siang).
                    kasirCol : cells.findIndex(c => c === 'kasir' || c === 'operator' || c === 'akun' || c === 'akunkasir'),
                    shiftCol : cells.findIndex(c => c === 'shift'),
                    // Pelanggan (nama) & Kode Pelanggan — opsional. Ditautkan ke Master Pelanggan supaya
                    // riwayat & total pembelian muncul di Kontak ▸ Pelanggan.
                    pelCol   : cells.findIndex(c => c === 'pelanggan' || c === 'namapelanggan'),
                    pelKodeCol: cells.findIndex(c => c === 'kodepelanggan'),
                };
                break;
            }
        }
        if (headerIdx === -1) throw new Error('Format tidak dikenali: kolom "Kode Barang" & "QTY" tidak ditemukan.');

        // Tanggal dari judul laporan — hanya baris DI ATAS header (format dd/mm/yyyy)
        for (let r = 0; r < Math.min(6, headerIdx); r++) {
            const line = (aoa[r] || []).map(c => String(c ?? '')).join(' ');
            const mm = [...line.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
            if (mm.length) { const m = mm[mm.length - 1]; inTglJ.value = `${m[3]}-${m[2]}-${m[1]}`; break; }
        }

        const items = [];
        for (let r = headerIdx + 1; r < aoa.length; r++) {
            const row = aoa[r] || [];
            const kode = String(row[col.kode] ?? '').trim();
            const qty  = parseFloat(row[col.qty]);
            if (!kode || !qty || isNaN(qty)) continue; // lewati baris kosong/total/ringkasan

            // Kalau file punya kolom Satuan eksplisit, pakai itu (ini yang paling akurat —
            // sama seperti Import Pembelian). Kalau tidak ada/kosong, fallback: deteksi dari
            // barcode mana yang cocok di Master Barang (barcode = PCS, barcode2 = satuan
            // besar mis. KARTON).
            const satuanKolom = col.satuan >= 0 ? (String(row[col.satuan] ?? '').trim() || null) : null;
            const det = satuanKolom ? null : detectSatuanBarang(kode);

            items.push({
                kode_barang: kode,
                nama       : col.nama >= 0 ? String(row[col.nama] ?? '').trim() : '',
                qty        : qty,
                harga      : col.harga >= 0 ? (parseFloat(row[col.harga]) || 0) : 0,
                satuan     : satuanKolom || (det ? det.satuan : null), // null kalau kode tidak ketemu & tidak ada kolom Satuan
                viaField   : satuanKolom ? 'kolom' : (det ? det.viaField : null), // 'kolom' | 'barcode' | 'barcode2' | 'barcode3' | 'kode' | null
                isi        : det ? det.isi : 1,
                // No. Referensi — kalau diisi, baris-baris dengan nilai yang sama akan
                // digabung jadi 1 nota di Riwayat (persis seperti input lewat grid).
                no_nota    : col.noNota >= 0 ? String(row[col.noNota] ?? '').trim() : '',
                tglRow     : col.tgl >= 0 ? excelTglKeISO(row[col.tgl]) : '',
                diskon     : col.diskon >= 0 ? (parseFloat(row[col.diskon]) || 0) : 0,
                bayarRow   : col.bayarCol >= 0 ? String(row[col.bayarCol] ?? '').trim() : '',
                keterangan : col.ket >= 0 ? String(row[col.ket] ?? '').trim() : '',
                // HPP per satuan baris ini (opsional) & override status PPN per baris
                hpp        : col.hpp >= 0 ? (parseFloat(row[col.hpp]) || 0) : 0,
                ppnRow     : col.ppnCol >= 0 ? String(row[col.ppnCol] ?? '').trim() : '',
                cabangRow  : col.cabangCol >= 0 ? String(row[col.cabangCol] ?? '').trim() : '',
                kasir      : col.kasirCol >= 0 ? String(row[col.kasirCol] ?? '').trim() : '',
                shift      : col.shiftCol >= 0 ? String(row[col.shiftCol] ?? '').trim() : '',
                pelanggan  : col.pelCol >= 0 ? String(row[col.pelCol] ?? '').trim() : '',
                pelKode    : col.pelKodeCol >= 0 ? String(row[col.pelKodeCol] ?? '').trim() : '',
            });
        }

        window._importJualItems = items;

        // Tanggal & cabang otomatis dari file
        const bertglJ = items.filter(r => r.tglRow);
        if (bertglJ.length === items.length && items.length) {
            const ds = bertglJ.map(r => r.tglRow).sort(); inTglJ.value = ds[ds.length - 1]; inTglJ.disabled = true;
            hintTglJ.textContent = `✅ Otomatis dari kolom Tanggal di file: ${ds[0].split('-').reverse().join('/')}${ds[0] !== ds[ds.length - 1] ? ' s/d ' + ds[ds.length - 1].split('-').reverse().join('/') : ''}`;
        } else if (bertglJ.length) {
            hintTglJ.textContent = `⚠️ ${items.length - bertglJ.length} baris tanpa tanggal valid memakai tanggal di kotak ini`;
        }
        const perCab = {}; items.forEach(r => { const k = r.cabangRow || (r.kasir ? '(dari akun kasir)' : '(pilihan form)'); perCab[k] = (perCab[k] || 0) + 1; });
        const perKasir = {}; items.forEach(r => { if (r.kasir) perKasir[r.kasir.toUpperCase().replace(/[^A-Z0-9]/g, '')] = 1; });
        const jmlKasir = Object.keys(perKasir).length;

        // HPP di file vs penjualan → deteksi HPP yang sudah termasuk PPN
        const sumJual = items.reduce((a, r) => a + (r.qty * r.harga - r.diskon), 0);
        const sumHpp  = items.reduce((a, r) => a + (r.hpp > 0 ? r.qty * r.hpp : 0), 0);
        const ratioHpp = sumJual > 0 ? sumHpp / sumJual : 0;
        const cbHpp = document.getElementById('importJualHppPpn'), hintHpp = document.getElementById('importJualHppHint');
        cbHpp.checked = false; hintHpp.innerHTML = '';
        if (sumHpp > 0) {
            if (ratioHpp > 0.9) {
                cbHpp.checked = true;
                hintHpp.innerHTML = `<span style="color:#b45309;">⚠️ HPP di file = ${(ratioHpp * 100).toFixed(0)}% dari penjualan (lebih tinggi dari 1/1,11 = 90%) → kemungkinan HPP sudah termasuk PPN, opsi di atas saya centang otomatis. Hilangkan centang kalau HPP di file sudah sebelum PPN.</span>`;
            } else {
                hintHpp.innerHTML = `<span style="color:var(--ink3);">HPP di file = ${(ratioHpp * 100).toFixed(0)}% dari penjualan.</span>`;
            }
        }
        const takDikenal = items.filter(r => !r.viaField).length;
        const punyaReferensi = items.some(r => r.no_nota);
        const perPel = {}, notaPel = {};
        items.forEach(r => { const k = (r.pelKode || r.pelanggan || '').toLowerCase(); if (k) { perPel[k] = 1; notaPel[r.no_nota || ('#' + Math.random())] = 1; } });
        const jmlPelanggan = Object.keys(perPel).length, jmlNotaPelanggan = Object.keys(notaPel).length;
        prev.innerHTML = `
        <div class="note note-b"><span>✅ Ditemukan <strong>${items.length}</strong> baris transaksi dari sheet "${esc(sheetName)}".</span></div>
        ${punyaReferensi ? `<div class="note note-b" style="margin-top:8px;"><span>🧾 Kolom No. Referensi terdeteksi — baris dengan No. Referensi yang sama akan digabung jadi 1 nota di Riwayat.</span></div>` : ''}
        ${jmlKasir ? `<div class="note note-b" style="margin-top:8px;"><span>👤 ${jmlKasir} akun kasir terdeteksi. Cabang: ${Object.entries(perCab).map(([k, v]) => `${esc(k)} (${v} baris)`).join(', ')}. Shift: kolom Shift di file, atau ditebak dari akun (berakhiran 1 = Pagi, berakhiran 2 = Siang, ADM/PSR = Sehari).</span></div>` : ''}
        ${jmlPelanggan ? `<div class="note note-b" style="margin-top:8px;"><span>🧑‍🤝‍🧑 Kolom Pelanggan terdeteksi — ${jmlNotaPelanggan} nota dari ${jmlPelanggan} pelanggan akan ditautkan ke Master Pelanggan (riwayat & total pembelian muncul di menu Kontak). Pelanggan yang belum ada di Master dibuat otomatis.</span></div>` : ''}
        ${takDikenal ? `<div class="note note-y" style="margin-top:8px;"><span>⚠️ ${takDikenal} baris kode/barcode-nya tidak ketemu di Master Barang — satuan tidak bisa dideteksi, tetap akan diimpor apa adanya (dianggap satuan dasar) dan ditandai "Kode tidak dikenal".</span></div>` : ''}
        <div class="tscroll" style="max-height:220px;overflow-y:auto;margin-top:8px;">
        <table><thead><tr>${punyaReferensi ? '<th>No. Referensi</th>' : ''}${jmlKasir ? '<th>Cabang</th><th>Kasir</th><th>Shift</th>' : ''}<th>Kode/Barcode</th><th>Nama</th><th class="r">Qty</th><th class="r">Harga</th><th>Satuan Terdeteksi</th></tr></thead>
        <tbody>${items.slice(0, 20).map(r => `<tr>
            ${punyaReferensi ? `<td style="font-size:11px;font-family:var(--F-m);">${esc(r.no_nota || '–')}</td>` : ''}
            ${jmlKasir ? `<td style="font-size:11px;">${esc(r.cabangRow || '–')}</td><td style="font-size:11px;">${esc(r.kasir || '–')}</td><td style="font-size:11px;">${esc(r.shift || 'otomatis')}</td>` : ''}
            <td style="font-size:11px;font-family:var(--F-m);">${esc(r.kode_barang)}</td>
            <td style="font-size:12px;">${esc(r.nama)}</td>
            <td class="r" style="font-size:11px;">${r.qty}</td>
            <td class="r" style="font-size:11px;">${R(r.harga)}</td>
            <td>${r.viaField
                ? `<span class="badge ${r.viaField === 'barcode2' || r.viaField === 'barcode3' ? 'badge-info' : 'badge-ppn'}" title="${r.viaField === 'kolom' ? 'Dari kolom Satuan di file' : 'Cocok lewat field ' + esc(r.viaField)}">${esc(r.satuan)}${(r.viaField === 'barcode2' || r.viaField === 'barcode3' || r.viaField === 'kolom') && r.isi > 1 ? ` (isi ${r.isi})` : ''}</span>`
                : `<span class="badge badge-noppn" title="Kode/barcode tidak ditemukan di Master Barang">⚠️ Tidak dikenal</span>`}
            </td>
        </tr>`).join('')}
        ${items.length > 20 ? `<tr><td colspan="${(punyaReferensi ? 6 : 5) + (jmlKasir ? 3 : 0)}" style="text-align:center;color:var(--ink3);font-size:12px;">… dan ${items.length - 20} baris lainnya</td></tr>` : ''}
        </tbody></table></div>`;
        document.getElementById('btnDoImportJual').disabled = items.length === 0;
    } catch (err) {
        prev.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
    }
};

window.doImportPenjualan = async () => {
    const items  = window._importJualItems || [];
    const tgl    = document.getElementById('importJualTgl').value;
    const cabang = document.getElementById('importJualCab').value;
    const bayar  = document.getElementById('importJualBayar').value;
    const forcePpn = document.getElementById('importJualForcePpn')?.checked;
    const hppPpn   = document.getElementById('importJualHppPpn')?.checked;
    if (!items.length) { toast('Tidak ada data valid untuk diimpor', 'err'); return; }
    if (!tgl && items.some(r => !r.tglRow)) { toast('Ada baris tanpa tanggal — isi Tanggal Transaksi dulu', 'err'); return; }
    if (!cabang && items.some(r => !r.cabangRow && !r.kasir)) { toast('Ada baris tanpa cabang/kasir — pilih Cabang dulu', 'err'); return; }
    const cabangLabel = cabang || '(per baris: ' + [...new Set(items.map(r => r.cabangRow).filter(Boolean))].slice(0, 8).join(', ') + ')';

    // tglRow/bayarRow: kalau file punya kolom Tanggal/Bayar sendiri per baris
    // (format Template Import), pakai itu — kalau tidak/kosong, jatuh balik ke
    // nilai satu form ini (spt sebelumnya, format Laporan Kasir).
    const rowsUntukHash = items.map(r => ({ tgl: r.tglRow || tgl, kode_barang: r.kode_barang, qty: r.qty, harga: r.harga, satuan: r.satuan, no_nota: r.no_nota, cabang: r.cabangRow || '' }));
    let cekDobel;
    try {
        cekDobel = await cekDanKonfirmasiImportDobel('jual', cabangLabel, rowsUntukHash);
    } catch (err) { toast(err.message, 'err'); return; }
    if (!cekDobel.lanjut) return;

    const btn = document.getElementById('btnDoImportJual');
    btn.disabled = true;
    btn.textContent = 'Mengimpor…';
    try {
        let totalAdded = 0, totalDitandai = 0, totalSkipped = 0, tidakDitemukan = [], totalNominal = 0, kasirTanpaKolom = false, totalPelBaru = 0;
        const notaDobel = []; let totalBarisDobel = 0; // FIX: dulu tidak dideklarasikan → ReferenceError setelah batch pertama
        for (let i = 0; i < items.length; i += 200) {
            const batch = items.slice(i, i + 200).map(r => ({
                tgl: r.tglRow || tgl, kode_barang: r.kode_barang, qty: r.qty, harga: r.harga,
                bayar: r.bayarRow || bayar,
                satuan: r.satuan, // hasil deteksi dari barcode yang cocok — biar backend konversi qty×isi kalau ini satuan besar (KARTON)
                no_nota: r.no_nota || undefined, // kalau diisi di file, baris dgn nilai sama akan digabung 1 nota
                diskon: r.diskon || 0,
                keterangan: r.keterangan || undefined,
                hpp: r.hpp || 0, // opsional — HPP per satuan baris ini (lihat TransaksiController::importTrx)
                ppn: forcePpn ? 'Kena PPN' : (r.ppnRow || undefined), // checkbox "paksa Kena PPN" menang atas kolom PPN di file
                cabang: r.cabangRow || undefined, // kolom Cabang di file → tiap baris ke cabangnya sendiri
                kasir: r.kasir || undefined, shift: r.shift || undefined, // akun kasir & shift (Pagi/Siang)
                pelanggan: r.pelanggan || undefined, pelanggan_kode: r.pelKode || undefined, // tautan ke Master Pelanggan
            }));
            const res = await apiPost('/transaksi/jual/import', { cabang: cabang || undefined, items: batch, hpp_termasuk_ppn: !!hppPpn });
            if (res.kasir_tanpa_kolom) kasirTanpaKolom = true;
            totalPelBaru  += (res.pelanggan_baru || 0);
            totalAdded    += (res.added    || 0);
            totalDitandai += (res.ditandai || 0);
            totalSkipped  += (res.skipped  || 0);
            totalBarisDobel += (res.baris_dobel_dilewati || 0);
            (res.nota_dobel_dilewati || []).forEach(x => { if (!notaDobel.includes(x)) notaDobel.push(x); });
            tidakDitemukan = tidakDitemukan.concat(res.tidak_ditemukan || []);
        }
        totalNominal = items.reduce((s, r) => s + ((Number(r.qty) || 0) * (Number(r.harga) || 0) - (Number(r.diskon) || 0)), 0);
        await catatImportSelesai('jual', cabangLabel, cekDobel.hash, items.length, totalNominal);
        closeM();
        toast(`Import selesai: ${totalAdded} transaksi masuk` + (totalSkipped ? `, ${totalSkipped} dilewati (baris tanpa kode)` : '') + (totalPelBaru ? `, ${totalPelBaru} pelanggan baru dibuat` : ''));
        if (notaDobel.length) toast(`${notaDobel.length} nota sudah ada → dilewati (${totalBarisDobel} baris): ${notaDobel.slice(0,5).join(', ')}`, 'y');
        if (kasirTanpaKolom) toast('Kolom Kasir/Shift belum ada di database, jadi akun kasir tidak tersimpan. Jalankan "php artisan migrate" lalu import ulang agar laporan per shift terisi.', 'y');
        if (totalDitandai) {
            toast(`${totalDitandai} dari transaksi tersebut kode/barcode-nya tidak dikenal — tetap masuk tapi ditandai "⚠️ Kode tidak dikenal" di riwayat, mis: ${tidakDitemukan.slice(0,5).join(', ')}`, 'y');
        }
        await renderJualBeli('jual', 'tx-jual', 1);
    } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Import Sekarang';
    }
};

/* =============================================================
   IMPORT PEMBELIAN DARI EXCEL (Laporan Pembelian Detail)
   Mendukung format laporan pembelian Toko Sumini: kolom Kode Barang
   (boleh barcode), Nama Barang, Harga Beli, Diskon (nominal per baris,
   opsional), QTY, JUMLAH. Tanggal diambil dari judul laporan
   (mis. "PERIODE : 01/07/2026 S/D 02/07/2026") kalau ada.
   Backend (/transaksi/beli/import) otomatis:
     - mencocokkan Kode Barang ke kode ATAU barcode di Master Barang
     - menambah stok sesuai cabang yang dipilih
     - baris yang barangnya tidak ditemukan akan dilaporkan, bukan gagal semua
   ============================================================= */
window._importBeliItems = [];

// ─── UBAH NO. FAKTUR PEMBELIAN ──────────────────────────────────────────
// Dipanggil dari tombol "✏️ Faktur" / "✏️ Ubah No. Faktur" di Riwayat Pembelian.
// Dipakai saat nota internal "TS…-" ternyata punya nomor faktur asli supplier:
// nomor diganti, status PPN otomatis ikut aturan (TS…- = Non-PPN, selain itu
// Kena PPN), Kartu HPP & Jurnal ikut terhitung ulang di backend.
// target = { noNota } untuk 1 nota, atau { ids:[...], noNota? } untuk baris lepas.
// onDone (opsional): dipanggil setelah berhasil simpan, dipakai pemanggil dari halaman
// lain (mis. Kontak ▸ Supplier). Tanpa onDone → daftar Riwayat Pembelian disegarkan.
window.bukaUbahNotaBeli = (target, onDone) => {
    window._ubahNotaSelesai = typeof onDone === 'function' ? onDone : null; // reset tiap buka → tidak bocor dari pembukaan sebelumnya
    const lama = target.noNota || '';
    openM(`
    <div class="mhd"><h3>✏️ Ubah No. Faktur</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgroup">
            <label class="flabel">No. Faktur / Referensi baru</label>
            <input class="finput" id="ubahNotaBaru" maxlength="30" value="${esc(lama)}" placeholder="mis. nomor faktur asli dari supplier" oninput="ubahNotaHintPpn()">
            <span class="fhint">Nomor sekarang: <strong>${esc(lama || '(belum ada)')}</strong> · maks. 30 karakter</span>
        </div>
        <div class="fgroup">
            <label class="flabel">Status PPN</label>
            <select class="fselect" id="ubahNotaPpn" onchange="ubahNotaHintPpn()">
                <option value="auto" selected>Otomatis dari nomor (TS…- = Non-PPN, selain itu Kena PPN)</option>
                <option value="Kena PPN">Kena PPN</option>
                <option value="Non-PPN">Non-PPN</option>
                <option value="tetap">Jangan ubah status PPN</option>
            </select>
            <span class="fhint" id="ubahNotaHint"></span>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnUbahNota" onclick="simpanUbahNotaBeli(${esc(JSON.stringify(target))})">Simpan</button>
    </div>`);
    ubahNotaHintPpn();
};

window.ubahNotaHintPpn = () => {
    const baru = (document.getElementById('ubahNotaBaru')?.value || '').trim();
    const mode = document.getElementById('ubahNotaPpn')?.value;
    const el = document.getElementById('ubahNotaHint');
    if (!el) return;
    const hasil = mode === 'auto' ? ppnDariNoNota(baru) : (mode === 'tetap' ? null : mode);
    el.textContent = hasil
        ? `Semua barang di nota ini akan berstatus ${hasil}. HPP & jurnal ikut dihitung ulang.`
        : 'Status PPN barang di nota ini tidak diubah.';
};

window.simpanUbahNotaBeli = async (target) => {
    const baru = (document.getElementById('ubahNotaBaru').value || '').trim();
    const ppn  = document.getElementById('ubahNotaPpn').value;
    if (!baru) { toast('No. faktur baru wajib diisi', 'err'); return; }
    const body = { no_nota_baru: baru, ppn };
    if (target.ids && target.ids.length) body.ids = target.ids; else body.no_nota_lama = target.noNota;
    const btn = document.getElementById('btnUbahNota');
    btn.disabled = true; btn.textContent = 'Menyimpan…';
    try {
        const res = await apiPost('/transaksi/beli/ubah-nota', body);
        toast(res.message || 'No. faktur diperbarui');
        // Dipanggil dari halaman lain (mis. Kontak ▸ Supplier)? Pakai callback-nya.
        // Kalau tidak, segarkan daftar Riwayat Pembelian bila sedang tampil.
        const cb = window._ubahNotaSelesai; window._ubahNotaSelesai = null;
        if (typeof cb === 'function') { await cb(res); }
        else {
            closeM();
            if (document.getElementById('tx-beli')) await renderJualBeli('beli', 'tx-beli', 1);
        }
    } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false; btn.textContent = 'Simpan';
    }
};

// ─── ISI SUPPLIER BELAKANGAN ────────────────────────────────────────────
// Dipanggil dari badge "⚠️ ✏️ Isi Supplier" di Riwayat Pembelian, untuk
// transaksi hasil Import Excel yang suppliernya sengaja dikosongkan saat
// import. target = { noNota } untuk 1 nota grid, atau { ids: [id,...] }
// untuk baris lepas.
window.bukaIsiSupplierBeli = (target) => {
    openM(`
    <div class="mhd"><h3>✏️ Isi Supplier</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgroup">
            <label class="flabel">Supplier</label>
            <select class="fselect" id="isiSupplierSelect">${supplierOpts()}</select>
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick='simpanIsiSupplierBeli(${JSON.stringify(target)})'>Simpan</button>
    </div>`);
};

window.simpanIsiSupplierBeli = async (target) => {
    const supplier = document.getElementById('isiSupplierSelect').value;
    if (!supplier) { toast('Pilih supplier terlebih dahulu', 'err'); return; }
    try {
        const res = await apiPost('/transaksi/beli/set-supplier', { ...target, supplier });
        closeM();
        toast(res.message || 'Supplier berhasil disimpan');
        await renderJualBeli('beli', 'tx-beli', 1);
    } catch (err) {
        toast(err.message, 'err');
    }
};

// Cocokkan nama cabang dari file ke Master Cabang (tanpa peduli huruf besar/kecil,
// spasi, tanda baca). Coba persis dulu, lalu "mengandung" — hanya kalau hasilnya
// tepat 1 cabang. Return '' kalau tidak ada yang cocok / ambigu.
function cocokkanCabangImport(nama) {
    const n = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    const t = n(nama);
    if (!t) return '';
    const list = STATE.cabang || [];
    const persis = list.find(c => n(c.nama) === t);
    if (persis) return persis.nama;
    const mirip = list.filter(c => n(c.nama).includes(t) || t.includes(n(c.nama)));
    return mirip.length === 1 ? mirip[0].nama : '';
}
window.cocokkanCabangImport = cocokkanCabangImport;

// Aturan PPN otomatis dari No. Referensi/Faktur:
//   diawali "TS" + angka + "-" (mis. TS1-250926008 = nota internal)  → Non-PPN
//   selain itu (faktur asli supplier)                                 → Kena PPN
window.ppnDariNoNota = (noNota) => /^TS\d*-/i.test(String(noNota || '').trim()) ? 'Non-PPN' : 'Kena PPN';

window.bukaImportPembelian = () => {
    openM(`
    <div class="mhd"><h3>📥 Import Pembelian dari Excel</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
            <span>Untuk file "Laporan Pembelian" (kolom Kode Barang, Nama Barang, Harga Beli, Diskon, QTY),
            ATAU file Template Import / hasil "Export Semua" (kolom No. Referensi, Tanggal, dst — baris dgn No. Referensi sama akan digabung 1 nota).
            Kode Barang boleh berupa barcode — akan dicocokkan otomatis ke Master Barang.
            Tanggal akan dibaca dari judul laporan / kolom Tanggal per baris kalau ada, silakan cek/ubah sebelum import.</span>
        </div>
        <button class="btn btn-g btn-sm" style="margin-bottom:10px;" onclick="downloadTemplateImport('beli')">📄 Download Template Excel</button>
        <div class="fgrid">
            <div class="fgroup">
                <label class="flabel">Pilih File Excel</label>
                <input type="file" id="importBeliFile" accept=".xlsx,.xls,.csv" class="finput" style="padding:6px;">
            </div>
            <div class="fgroup">
                <label class="flabel">Tanggal Transaksi</label>
                <input class="finput" type="date" id="importBeliTgl" value="${today()}">
                <span class="fhint" id="importBeliTglHint">Otomatis terisi dari kolom Tanggal di file (per baris) atau judul laporan</span>
            </div>
            <div class="fgroup">
                <label class="flabel">Cabang</label>
                <select class="fselect" id="importBeliCab">${cabangOpts()}</select>
                <span class="fhint">Kalau file punya kolom "Cabang", tiap baris masuk ke cabangnya sendiri (pilihan ini jadi cadangan untuk baris yang cabangnya kosong)</span>
            </div>
            <div class="fgroup">
                <label class="flabel">Metode Bayar</label>
                <select class="fselect" id="importBeliBayar"><option>Tunai</option><option>Kredit</option></select>
                <span class="fhint">Kalau file punya kolom "Bayar" (Tunai/Kredit), otomatis dipakai per baris</span>
            </div>
            <div class="fgroup">
                <label class="flabel">Supplier <span style="font-weight:400;color:var(--ink3);">(boleh dikosongkan)</span></label>
                <select class="fselect" id="importBeliSup">${supplierOpts()}</select>
                <span class="fhint">Kosongkan kalau mau import barangnya dulu — supplier bisa diisi belakangan lewat tombol "✏️ Isi Supplier" di Riwayat Pembelian</span>
            </div>
        </div>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;">
            <input type="checkbox" id="importBeliBuatBarang" checked>
            Barang yang belum ada di <strong>Master Barang</strong> dibuat otomatis (harga jual = HPP sementara, supaya ikut terbentuk jurnal)
        </label>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;">
            <input type="checkbox" id="importBeliAutoPpn" checked>
            Tentukan PPN otomatis dari <strong>No. Referensi</strong>: diawali <code>TS…-</code> = Non-PPN, selain itu = Kena PPN (abaikan kolom PPN di file)
        </label>
        <label style="display:flex;align-items:center;gap:6px;margin-top:8px;font-size:13px;">
            <input type="checkbox" id="importBeliForcePpn">
            Tandai SEMUA baris sebagai <strong>Kena PPN</strong> (override — abaikan status PPN di Master Barang &amp; kolom PPN di file)
        </label>
        <div id="importBeliPreview" style="margin-top:12px;"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnDoImportBeli" onclick="doImportPembelian()" disabled>Import Sekarang</button>
    </div>`);

    document.getElementById('importBeliFile').addEventListener('change', previewImportPembelian);
};

window.previewImportPembelian = async function (e) {
    const file = e.target.files[0];
    if (!file) return;
    const prev = document.getElementById('importBeliPreview');
    prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';

    try {
        if (typeof XLSX === 'undefined') throw new Error('Library XLSX belum dimuat.');

        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });

        // Pilih sheet yang paling mirip "Pembelian", kalau tidak ada pakai sheet pertama
        const sheetName = wb.SheetNames.find(n => /pembelian|beli/i.test(n)) || wb.SheetNames[0];
        const ws  = wb.Sheets[sheetName];
        const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

        // Reset kotak tanggal tiap ganti file
        const inTgl  = document.getElementById('importBeliTgl');
        const hintEl = document.getElementById('importBeliTglHint');
        inTgl.disabled = false;
        inTgl.value = today();
        hintEl.textContent = 'Otomatis terisi dari kolom Tanggal di file (per baris) atau judul laporan';

        // Cari baris header (mengandung "Kode Barang" & "QTY")
        const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
        let headerIdx = -1, col = {};
        for (let r = 0; r < aoa.length; r++) {
            const cells = (aoa[r] || []).map(norm);
            const iKode = cells.findIndex(c => c === 'kodebarang' || c === 'kode');
            const iQty  = cells.findIndex(c => c === 'qty' || c === 'jumlah');
            if (iKode >= 0 && iQty >= 0) {
                headerIdx = r;
                col = {
                    kode  : iKode,
                    nama  : cells.findIndex(c => c === 'namabarang' || c === 'nama'),
                    qty   : iQty,
                    harga : cells.findIndex(c => c === 'hargabeli' || c === 'hargasatuan' || c === 'harga'),
                    diskon: cells.findIndex(c => c === 'diskon'),
                    satuan: cells.findIndex(c => c === 'satuan'),
                    // Kolom tambahan dari Template Import / Export Semua — opsional.
                    noNota   : cells.findIndex(c => c.includes('referensi') || c === 'nonota' || c === 'noref'),
                    tgl      : cells.findIndex(c => c === 'tanggal'),
                    bayarCol : cells.findIndex(c => c === 'bayar'),
                    supCol   : cells.findIndex(c => c === 'supplier'),
                    ket      : cells.findIndex(c => c === 'keterangan'),
                    ppnCol   : cells.findIndex(c => c === 'ppn' || c === 'statusppn'),
                    operCol  : cells.findIndex(c => c === 'operator'),
                    cabCol   : cells.findIndex(c => c === 'cabang'),
                };
                break;
            }
        }
        if (headerIdx === -1) throw new Error('Format tidak dikenali: kolom "Kode Barang" & "QTY" tidak ditemukan.');

        // Cari tanggal dari judul laporan — HANYA baris DI ATAS header (supaya teks
        // di kolom Keterangan/isi data tidak ikut terbaca). Format dd/mm/yyyy;
        // kalau ada dua tanggal (mis. "PERIODE: 01/07/2026 S/D 02/07/2026"), pakai yang terakhir.
        for (let r = 0; r < Math.min(6, headerIdx); r++) {
            const line = (aoa[r] || []).map(c => String(c ?? '')).join(' ');
            const matches = [...line.matchAll(/(\d{2})\/(\d{2})\/(\d{4})/g)];
            if (matches.length) {
                const m = matches[matches.length - 1];
                inTgl.value = `${m[3]}-${m[2]}-${m[1]}`;
                break;
            }
        }

        const items = [];
        for (let r = headerIdx + 1; r < aoa.length; r++) {
            const row = aoa[r] || [];
            const kode = String(row[col.kode] ?? '').trim();
            const qty  = parseFloat(row[col.qty]);
            if (!kode || !qty || isNaN(qty)) continue; // lewati baris kosong/baris "TOTAL"/ringkasan

            // Kalau file punya kolom Satuan eksplisit, pakai itu. Kalau tidak/kosong,
            // fallback: deteksi dari barcode mana yang cocok di Master Barang
            // (barcode = satuan dasar, barcode2 = satuan besar mis. KARTON).
            const satuanKolom = col.satuan >= 0 ? (String(row[col.satuan] ?? '').trim() || null) : null;
            const det = satuanKolom ? null : detectSatuanBarang(kode);

            const cabangMentah = col.cabCol >= 0 ? String(row[col.cabCol] ?? '').trim() : '';
            items.push({
                cabangRow  : cabangMentah ? cocokkanCabangImport(cabangMentah) : '',
                cabangMentah,
                operator   : col.operCol >= 0 ? String(row[col.operCol] ?? '').trim() : '',
                kode_barang: kode,
                nama       : col.nama >= 0 ? String(row[col.nama] ?? '').trim() : '',
                qty        : qty,
                harga      : col.harga  >= 0 ? (parseFloat(row[col.harga])  || 0) : 0,
                diskon     : col.diskon >= 0 ? (parseFloat(row[col.diskon]) || 0) : 0,
                satuan     : satuanKolom || (det ? det.satuan : null),
                satuanAsal : satuanKolom ? 'kolom' : (det && det.viaField ? det.viaField : null),
                no_nota    : col.noNota >= 0 ? String(row[col.noNota] ?? '').trim() : '',
                tglRow     : col.tgl >= 0 ? excelTglKeISO(row[col.tgl]) : '',
                bayarRow   : col.bayarCol >= 0 ? String(row[col.bayarCol] ?? '').trim() : '',
                supplierRow: col.supCol >= 0 ? String(row[col.supCol] ?? '').trim() : '',
                keterangan : col.ket >= 0 ? String(row[col.ket] ?? '').trim() : '',
                ppnRow     : col.ppnCol >= 0 ? String(row[col.ppnCol] ?? '').trim() : '',
            });
        }

        window._importBeliItems = items;

        // Tanggal per baris dari kolom "Tanggal" di file → otomatis, kotak tanggal jadi cadangan.
        const bertgl   = items.filter(r => r.tglRow);
        const tanpaTgl = items.length - bertgl.length;
        if (bertgl.length) {
            const daftarTgl = bertgl.map(r => r.tglRow).sort();
            const fmt = d => d.split('-').reverse().join('/');
            const awal = daftarTgl[0], akhir = daftarTgl[daftarTgl.length - 1];
            inTgl.value = akhir;
            if (tanpaTgl === 0) {
                inTgl.disabled = true;
                hintEl.textContent = `✅ Otomatis dari kolom Tanggal di file: ${fmt(awal)}${awal !== akhir ? ' s/d ' + fmt(akhir) : ''} — tiap baris memakai tanggalnya sendiri`;
            } else {
                hintEl.textContent = `⚠️ ${tanpaTgl} baris tanpa tanggal valid di file akan memakai tanggal di kotak ini; sisanya (${bertgl.length} baris) pakai tanggal dari file`;
            }
        }
        const totalNominal = items.reduce((s, r) => s + r.qty * r.harga - r.diskon, 0);
        const punyaReferensiBeli = items.some(r => r.no_nota);
        // Ringkasan cabang per baris (import multi-cabang) + peringatan nama cabang yang tak cocok
        const perCabang = {};
        items.forEach(r => { const k = r.cabangRow || (r.cabangMentah ? '⚠️ ' + r.cabangMentah : '(pakai cabang form)'); perCabang[k] = (perCabang[k] || 0) + 1; });
        const cabangGagal = [...new Set(items.filter(r => r.cabangMentah && !r.cabangRow).map(r => r.cabangMentah))];
        const punyaCabangKolom = items.some(r => r.cabangMentah);
        const infoCabang = punyaCabangKolom ? `<div class="note ${cabangGagal.length ? 'note-y' : 'note-b'}" style="margin-top:8px;"><span>🏬 Cabang per baris: ${Object.entries(perCabang).map(([k, v]) => `<strong>${esc(k)}</strong> ${v}`).join(' · ')}${cabangGagal.length ? `<br>⚠️ Nama cabang tidak ada di Master Cabang: <strong>${cabangGagal.map(esc).join(', ')}</strong> — baris ini akan dilewati kecuali kamu pilih cabang cadangan di atas dan kosongkan kolomnya.` : ''}</span></div>` : '';
        prev.innerHTML = `
        <div class="note note-b"><span>✅ Ditemukan <strong>${items.length}</strong> baris dari sheet "${esc(sheetName)}" — total nominal ${R(totalNominal)}.</span></div>
        ${infoCabang}
        ${punyaReferensiBeli ? `<div class="note note-b" style="margin-top:8px;"><span>🧾 Kolom No. Referensi terdeteksi — baris dengan No. Referensi yang sama akan digabung jadi 1 nota di Riwayat.</span></div>` : ''}
        <div class="tscroll" style="max-height:220px;overflow-y:auto;margin-top:8px;">
        <table><thead><tr>${bertgl.length ? '<th>Tanggal</th>' : ''}${punyaReferensiBeli ? '<th>No. Referensi</th>' : ''}<th>Kode/Barcode</th><th>Nama</th><th class="r">Qty</th><th class="r">Harga Beli</th><th class="r">Diskon</th><th>Satuan</th></tr></thead>
        <tbody>${items.slice(0, 20).map(r => `<tr>
            ${bertgl.length ? `<td style="font-size:11px;white-space:nowrap;">${r.tglRow ? r.tglRow.split('-').reverse().join('/') : '<span style="color:var(--warn,#b45309);">pakai kotak</span>'}</td>` : ''}
            ${punyaReferensiBeli ? `<td style="font-size:11px;font-family:var(--F-m);">${esc(r.no_nota || '–')}</td>` : ''}
            <td style="font-size:11px;font-family:var(--F-m);">${esc(r.kode_barang)}</td>
            <td style="font-size:12px;">${esc(r.nama)}</td>
            <td class="r" style="font-size:11px;">${r.qty}</td>
            <td class="r" style="font-size:11px;">${R(r.harga)}</td>
            <td class="r" style="font-size:11px;">${r.diskon ? R(r.diskon) : '–'}</td>
            <td>${r.satuan
                ? `<span class="badge ${r.satuanAsal === 'barcode2' || r.satuanAsal === 'barcode3' ? 'badge-info' : 'badge-ppn'}" title="${r.satuanAsal === 'kolom' ? 'Dari kolom Satuan di file' : 'Dideteksi dari barcode field ' + esc(r.satuanAsal||'')}">${esc(r.satuan)}</span>`
                : `<span class="badge badge-noppn" title="Satuan tidak diketahui — kode/barcode tidak ketemu di Master Barang">– (satuan dasar)</span>`}
            </td>
        </tr>`).join('')}
        ${items.length > 20 ? `<tr><td colspan="${(punyaReferensiBeli ? 7 : 6) + (bertgl.length ? 1 : 0)}" style="text-align:center;color:var(--ink3);font-size:12px;">… dan ${items.length - 20} baris lainnya</td></tr>` : ''}
        </tbody></table></div>`;
        document.getElementById('btnDoImportBeli').disabled = items.length === 0;
    } catch (err) {
        prev.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
    }
};

window.doImportPembelian = async () => {
    const items  = window._importBeliItems || [];
    const tgl    = document.getElementById('importBeliTgl').value;
    const cabang = document.getElementById('importBeliCab').value;
    const bayar  = document.getElementById('importBeliBayar').value;
    const supplier = document.getElementById('importBeliSup').value;
    const forcePpn = document.getElementById('importBeliForcePpn')?.checked;
    const autoPpn  = document.getElementById('importBeliAutoPpn')?.checked;
    const buatBarang = document.getElementById('importBeliBuatBarang')?.checked;
    if (!items.length) { toast('Tidak ada data valid untuk diimpor', 'err'); return; }
    // Cabang boleh kosong di form kalau SEMUA baris file sudah punya cabang yang cocok.
    const adaBarisTanpaCabang = items.some(r => !r.cabangRow);
    const multiCabang = items.some(r => r.cabangRow);
    if (!tgl && items.some(r => !r.tglRow)) { toast('Ada baris tanpa tanggal — isi Tanggal Transaksi dulu', 'err'); return; }
    if (adaBarisTanpaCabang && !cabang) { toast('Ada baris tanpa cabang — pilih Cabang cadangan dulu', 'err'); return; }
    // Supplier BOLEH kosong — barang tetap masuk, suppliernya diisi belakangan
    // lewat "✏️ Isi Supplier" di Riwayat Pembelian (lihat setSupplierBeli()).

    const rowsUntukHash = items.map(r => ({
        tgl: r.tglRow || tgl, kode_barang: r.kode_barang, qty: r.qty, harga: r.harga,
        diskon: r.diskon, satuan: r.satuan, supplier: r.supplierRow || supplier || '-', no_nota: r.no_nota,
        cabang: r.cabangRow || undefined,
    }));
    const cabangLabel = multiCabang ? 'MULTI CABANG' : cabang;
    let cekDobel;
    try {
        cekDobel = await cekDanKonfirmasiImportDobel('beli', cabangLabel, rowsUntukHash);
    } catch (err) { toast(err.message, 'err'); return; }
    if (!cekDobel.lanjut) return;

    const btn = document.getElementById('btnDoImportBeli');
    btn.disabled = true;
    btn.textContent = 'Mengimpor…';
    try {
        let totalAdded = 0, totalDitandai = 0, totalSkipped = 0, tidakDitemukan = [], totalNominal = 0, totalBarangBaru = 0;
        const cabangGagal = [];
        // Potong batch ±200 baris TANPA membelah 1 nota (No. Faktur+Tanggal+Cabang) ke dua
        // batch — backend melewati nota yang sudah ada, jadi nota yang terbelah bisa
        // salah dianggap dobel. Baris 1 nota juga dikelompokkan dulu (urutan nota tetap).
        const kunciNota = r => (r.no_nota || '') + '|' + (r.tglRow || tgl || '') + '|' + (r.cabangRow || cabang || '');
        const urutNota = [], petaNota = {};
        items.forEach((r, idx) => {
            if (!r.no_nota) { urutNota.push([r]); return; }
            const k = kunciNota(r);
            if (!petaNota[k]) { petaNota[k] = []; urutNota.push(petaNota[k]); }
            petaNota[k].push(r);
        });
        const potongan = []; let sedang = [];
        urutNota.forEach(grup => {
            if (sedang.length && sedang.length + grup.length > 200) { potongan.push(sedang); sedang = []; }
            sedang = sedang.concat(grup);
        });
        if (sedang.length) potongan.push(sedang);
        const notaDobel = []; let totalBarisDobel = 0;
        for (const potong of potongan) {
            const batch = potong.map(r => ({
                tgl: r.tglRow || tgl, kode_barang: r.kode_barang, nama: r.nama || undefined, qty: r.qty, harga: r.harga,
                diskon: r.diskon, satuan: r.satuan, bayar: r.bayarRow || bayar,
                no_nota: r.no_nota || undefined,
                supplier: r.supplierRow || undefined, // kosongkan kalau tidak ada kolomnya di file → backend pakai supplier default
                keterangan: r.keterangan || undefined,
                // prioritas: "paksa Kena PPN" > aturan otomatis No. Referensi (TS…- = Non-PPN, selain itu Kena PPN) > kolom PPN di file
                ppn: forcePpn ? 'Kena PPN' : ((autoPpn && r.no_nota) ? ppnDariNoNota(r.no_nota) : (r.ppnRow || undefined)),
                operator: r.operator || undefined, // akun/operator penginput asal (kolom "Operator")
                cabang: r.cabangRow || undefined,  // cabang per baris (kolom "Cabang")
            }));
            const res = await apiPost('/transaksi/beli/import', { cabang: cabang || undefined, items: batch, supplier: supplier || undefined, buat_barang_baru: !!buatBarang });
            (res.cabang_tidak_valid || []).forEach(x => { if (!cabangGagal.includes(x)) cabangGagal.push(x); });
            totalAdded    += (res.added    || 0);
            totalBarangBaru += (res.barang_baru || 0);
            totalDitandai += (res.ditandai || 0);
            totalSkipped  += (res.skipped  || 0);
            tidakDitemukan = tidakDitemukan.concat(res.tidak_ditemukan || []);
        }
        totalNominal = items.reduce((s, r) => s + ((Number(r.qty) || 0) * (Number(r.harga) || 0) - (Number(r.diskon) || 0)), 0);
        await catatImportSelesai('beli', cabangLabel, cekDobel.hash, items.length, totalNominal);
        closeM();
        toast(`Import selesai: ${totalAdded} transaksi masuk` + (totalSkipped ? `, ${totalSkipped} dilewati (baris tanpa kode / cabang tidak dikenal)` : ''));
        if (notaDobel.length) toast(`${notaDobel.length} nota SUDAH ADA (No. Faktur + Tanggal + Cabang sama) → dilewati agar tidak dobel (${totalBarisDobel} baris): ${notaDobel.slice(0,5).join(', ')}${notaDobel.length > 5 ? ', …' : ''}`, 'y');
        if (totalBarangBaru) toast(`${totalBarangBaru} barang baru otomatis dibuat di Master Barang (harga jual = HPP sementara) — silakan lengkapi kategori & harga jual di Data Master ▸ Barang`, 'y');
        if (cabangGagal.length) toast(`Cabang tidak dikenal, baris dilewati: ${cabangGagal.join(', ')}`, 'y');
        if (totalDitandai) {
            toast(`${totalDitandai} dari transaksi tersebut kode/barcode-nya tidak dikenal — tetap masuk tapi ditandai "⚠️ Kode tidak dikenal" di riwayat, mis: ${tidakDitemukan.slice(0,5).join(', ')}`, 'y');
        }
        await renderJualBeli('beli', 'tx-beli', 1);
    } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false;
        btn.textContent = 'Import Sekarang';
    }
};
