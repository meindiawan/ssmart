/* =============================================================
   saldoawal.js — Saldo Awal (migrasi ke sistem baru)
   Sub-tab di Data Master (ms-saldoawal). Dua bagian:
     1. Saldo Awal Akun      → matriks Akun × Cabang, otomatis
                                diimbangi ke akun 3102 (Modal Awal)
                                lewat DashboardController::buildJurnal().
     2. Saldo Awal Inventory → input manual per barang per cabang
                                (grid + import Excel), ditulis ke
                                barang_masuk sumber='Saldo Awal Manual'.
                                Juga menampilkan tombol untuk fitur
                                deteksi otomatis (barang laku tapi
                                tidak pernah tercatat dibeli) yang
                                sudah ada di backend sejak sebelumnya
                                (MasterController::generateSaldoAwal).
   Backend: App\Http\Controllers\Api\SaldoAwalController
   ============================================================= */

async function renderSaldoAwal() {
    const el = document.getElementById('ms-saldoawal');
    el.innerHTML = `
    <div class="itab" id="saTabs">
        <div class="itab-nav">
            <button type="button" class="on" data-tab="akun" onclick="onSaldoAwalTab('akun')">🧾 Saldo Awal Akun</button>
            <button type="button" data-tab="inventory" onclick="onSaldoAwalTab('inventory')">📦 Saldo Awal Inventory</button>
        </div>
        <div class="itab-panel">
            <div class="itab-page on" id="saTabs-akun"></div>
            <div class="itab-page" id="saTabs-inventory"></div>
        </div>
    </div>`;
    await renderSaldoAwalAkun();
}

window.onSaldoAwalTab = async (key) => {
    switchItab('saTabs', key);
    if (key === 'akun') await renderSaldoAwalAkun();
    else await renderSaldoAwalInventory();
};

/* ══════════════════════ 1. SALDO AWAL AKUN ══════════════════════ */

window._saAkunData = { akun: [], cabang: [], saldo: [] };
window._saAkunTgl = today();

async function renderSaldoAwalAkun() {
    const el = document.getElementById('saTabs-akun');
    el.innerHTML = loadingHTML;
    try {
        const res = await apiGet('/saldo-awal/akun');
        window._saAkunData = res;
        drawSaldoAwalAkun();
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ Gagal memuat: ${esc(err.message)}</span></div>`;
    }
}

function drawSaldoAwalAkun() {
    const el = document.getElementById('saTabs-akun');
    const { akun, cabang, saldo } = window._saAkunData;

    if (!cabang.length) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ Belum ada Cabang. Tambahkan cabang dulu di sub-tab "🏬 Cabang".</span></div>`;
        return;
    }

    const saldoMap = {}; // "kode|cabang" -> nominal
    saldo.forEach(s => { saldoMap[s.kode_akun + '|' + s.cabang] = Number(s.nominal); });

    const grup = { Aset: [], Liabilitas: [], Modal: [] };
    akun.forEach(a => { if (grup[a.kat]) grup[a.kat].push(a); });

    const rowsHtml = (list) => list.map(a => `
        <tr>
            <td style="font-family:var(--F-m);font-size:12px;">${esc(a.kode)}</td>
            <td style="font-size:12px;">${esc(a.nama)} <span style="color:var(--ink3);font-size:11px;">(${a.normal === 'D' ? 'Debit' : 'Kredit'})</span></td>
            ${cabang.map(c => `
                <td>
                    <input class="finput r sa-akun-input" type="number" min="0" step="1"
                        style="width:110px;font-size:12px;"
                        data-kode="${esc(a.kode)}" data-cabang="${esc(c)}"
                        value="${saldoMap[a.kode + '|' + c] || ''}" placeholder="0">
                </td>`).join('')}
        </tr>`).join('');

    el.innerHTML = `
    <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
        <span>Isi saldo pembukaan tiap akun per cabang (nilai di sisi normal akun tsb — Aset & Beban = Debit, Liabilitas/Modal/Pendapatan = Kredit).
        Setiap baris otomatis diimbangi ke akun <strong>3102 – Modal Awal</strong> supaya Neraca tetap seimbang walau diisi bertahap.
        <strong>Persediaan (1105)</strong> TIDAK diisi di sini — pakai tab "📦 Saldo Awal Inventory".</span>
    </div>
    <div class="fgrid col2" style="margin-bottom:12px;max-width:420px;">
        <div class="fgroup"><label class="flabel">Tanggal Saldo Awal</label>
            <input type="date" class="finput" id="saAkunTgl" value="${window._saAkunTgl}"
                onchange="window._saAkunTgl=this.value">
        </div>
    </div>
    <div class="tscroll" style="max-height:520px;overflow:auto;">
    <table>
        <thead><tr>
            <th style="min-width:70px;">Kode</th><th style="min-width:180px;">Nama Akun</th>
            ${cabang.map(c => `<th style="text-align:right;">${esc(c)}</th>`).join('')}
        </tr></thead>
        <tbody>
            ${grup.Aset.length ? `<tr><td colspan="${2 + cabang.length}" style="background:var(--bg2);font-weight:700;font-size:12px;">ASET</td></tr>${rowsHtml(grup.Aset)}` : ''}
            ${grup.Liabilitas.length ? `<tr><td colspan="${2 + cabang.length}" style="background:var(--bg2);font-weight:700;font-size:12px;">LIABILITAS</td></tr>${rowsHtml(grup.Liabilitas)}` : ''}
            ${grup.Modal.length ? `<tr><td colspan="${2 + cabang.length}" style="background:var(--bg2);font-weight:700;font-size:12px;">MODAL</td></tr>${rowsHtml(grup.Modal)}` : ''}
        </tbody>
    </table>
    </div>
    <div style="margin-top:14px;display:flex;gap:8px;">
        <button class="btn btn-p" onclick="simpanSaldoAwalAkun()">💾 Simpan Saldo Awal Akun</button>
    </div>`;
}

window.simpanSaldoAwalAkun = async () => {
    const tgl = document.getElementById('saAkunTgl').value;
    if (!tgl) { toast('Tanggal wajib diisi', 'err'); return; }
    const inputs = document.querySelectorAll('.sa-akun-input');
    const items = [];
    inputs.forEach(inp => {
        const nominal = parseFloat(inp.value || '0') || 0;
        // Kirim SEMUA baris (termasuk yg 0 — backend akan hapus baris 0
        // supaya koreksi/pembatalan gampang) sesuai isi terakhir di layar.
        items.push({ kode_akun: inp.dataset.kode, cabang: inp.dataset.cabang, tgl, nominal });
    });
    if (!items.length) { toast('Tidak ada data', 'err'); return; }
    try {
        const res = await apiPost('/saldo-awal/akun', { items });
        toast(res.message);
        if (res.gagal && res.gagal.length) {
            toast(`⚠️ ${res.gagal.length} baris gagal: ${res.gagal[0]}`, 'y');
        }
        await renderSaldoAwalAkun();
    } catch (err) {
        toast('Gagal menyimpan: ' + err.message, 'err');
    }
};

/* ══════════════════════ 2. SALDO AWAL INVENTORY ══════════════════════ */

window._saInvGrid = [];
let _saInvRowSeq = 0;
window._saInvTgl = today();

function saInvBlankRow() {
    return { id: ++_saInvRowSeq, kode: '', nama: '', dikenal: null, cabang: '', qty: '', harga: '' };
}

async function renderSaldoAwalInventory() {
    const el = document.getElementById('saTabs-inventory');
    el.innerHTML = loadingHTML;
    try {
        const list = await apiGet('/saldo-awal/inventory');
        window._saInvList = list;
        if (!window._saInvGrid.length) window._saInvGrid = [saInvBlankRow()];
        drawSaldoAwalInventory();
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ Gagal memuat: ${esc(err.message)}</span></div>`;
    }
}

function drawSaldoAwalInventory() {
    const el = document.getElementById('saTabs-inventory');
    const list = window._saInvList || [];
    const totalNilai = list.reduce((s, r) => s + Number(r.qty) * Number(r.harga_beli), 0);

    el.innerHTML = `
    <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
        <span>Input saldo awal stok per barang per cabang saat migrasi (qty & HPP/harga modal saat itu).
        Nilainya otomatis masuk ke Persediaan (1105) & diimbangi ke akun <strong>3103 – Saldo Awal Persediaan</strong>, TIDAK memengaruhi Laba Rugi.</span>
    </div>

    <div class="fgrid col2" style="margin-bottom:12px;max-width:420px;">
        <div class="fgroup"><label class="flabel">Tanggal Saldo Awal</label>
            <input type="date" class="finput" id="saInvTgl" value="${window._saInvTgl}" onchange="window._saInvTgl=this.value">
        </div>
    </div>

    <h4 style="margin:6px 0;">✏️ Input Manual</h4>
    <div class="tscroll" style="overflow:visible;">
    <table>
        <thead><tr>
            <th style="min-width:220px;">Barang</th><th style="min-width:150px;">Cabang</th>
            <th>Qty</th><th>Harga/HPP</th><th>Subtotal</th><th></th>
        </tr></thead>
        <tbody id="saInvGridBody"></tbody>
    </table>
    </div>
    <div style="margin:10px 0;display:flex;gap:8px;">
        <button class="btn btn-g btn-sm" onclick="saInvAddRow()">+ Tambah Baris</button>
        <button class="btn btn-p btn-sm" onclick="saInvSimpanGrid()">💾 Simpan Baris di Atas</button>
    </div>

    <h4 style="margin:18px 0 6px;">📥 Import dari Excel</h4>
    <div class="note note-b" style="margin-bottom:8px;"><span>Kolom: <strong>KODE_BARANG, CABANG, QTY, HARGA</strong> (harga = HPP/modal saat itu). Baris kode+cabang yang sama akan meng-update baris yang sudah ada.</span></div>
    <input type="file" id="saInvImportFile" accept=".xlsx,.xls,.csv" class="finput" style="padding:6px;max-width:340px;">
    <div id="saInvImportPreview" style="margin-top:10px;"></div>

    <h4 style="margin:18px 0 6px;">🔍 Deteksi Otomatis</h4>
    <div class="note note-y" style="margin-bottom:8px;"><span>Cari barang yang sudah pernah <em>terjual</em> tapi tidak pernah tercatat riwayat pembelian di sistem ini (mis. data migrasi dari kasir lama), lalu buatkan baris Saldo Awal otomatis untuk kekurangannya saja.</span></div>
    <button class="btn btn-g btn-sm" onclick="saInvGenerateOtomatis()">🔄 Jalankan Deteksi Otomatis</button>

    <h4 style="margin:18px 0 6px;">📋 Daftar Saldo Awal Inventory Tersimpan (${list.length} baris — total ${R(totalNilai)})</h4>
    <div class="tscroll" style="max-height:360px;overflow:auto;">
    <table>
        <thead><tr><th>Tanggal</th><th>Sumber</th><th>Barang</th><th>Cabang</th><th>Qty</th><th>Harga (DPP)</th><th>PPN Masukan</th><th>Subtotal</th><th></th></tr></thead>
        <tbody>
        ${list.length ? list.map(r => {
            const otomatis = r.sumber === 'Saldo Awal';
            return `<tr>
            <td style="font-size:12px;">${esc(r.tgl)}</td>
            <td style="font-size:11px;">
                ${otomatis
                    ? `<span class="badge badge-info" title="Dibuat otomatis dari histori Penjualan lewat 'Jalankan Deteksi Otomatis' — akan dihitung ulang tiap tombol itu diklik, tidak bisa dihapus satu-satu di sini.">🔄 Otomatis</span>`
                    : `<span class="badge badge-ppn" title="Diinput manual / import Excel di halaman ini">✏️ Manual</span>`}
            </td>
            <td style="font-size:12px;">${esc(r.nama_barang)}<div style="font-size:10px;color:var(--ink3);">${esc(r.kode_barang)}</div></td>
            <td style="font-size:12px;">${esc(r.cabang)}</td>
            <td class="r" style="font-size:12px;">${r.qty}</td>
            <td class="r" style="font-size:12px;">${R(r.harga_beli)}</td>
            <td class="r" style="font-size:12px;">${R(r.ppn_masukan || 0)}</td>
            <td class="r" style="font-size:12px;font-weight:700;">${R(r.qty * r.harga_beli)}</td>
            <td>${otomatis ? '' : `<button class="row-del" onclick="saInvHapus(${r.id})">✕</button>`}</td>
        </tr>`;
        }).join('') : `<tr><td colspan="9" style="text-align:center;color:var(--ink3);padding:16px;">Belum ada data</td></tr>`}
        </tbody>
    </table>
    </div>`;

    saInvRenderGridBody();
    document.getElementById('saInvImportFile').addEventListener('change', saInvPreviewImport);
}

/* ── Grid input manual ─────────────────────────────────────── */
function saInvRenderGridBody() {
    const tbody = document.getElementById('saInvGridBody');
    if (!tbody) return;
    const rows = window._saInvGrid;
    tbody.innerHTML = rows.map(r => `<tr>
        <td>
            <div style="position:relative;">
                <input class="finput" style="font-size:12px;" id="saInvKode_${r.id}" value="${esc(r.kode)}"
                    placeholder="🔍 Kode/nama barang…" autocomplete="off">
                <div class="pos-entry-dropdown" id="saInvDropdown_${r.id}"></div>
            </div>
            ${r.kode ? `<div style="font-size:11px;color:${r.dikenal === false ? 'var(--red)' : 'var(--ink3)'};margin-top:2px;">${r.dikenal === false ? '⚠️ tidak ditemukan di Master Barang' : esc(r.nama)}</div>` : ''}
        </td>
        <td><select class="fselect" style="font-size:12px;" onchange="saInvSetField(${r.id},'cabang',this.value)">${cabangOpts(r.cabang)}</select></td>
        <td><input class="finput r" type="number" min="0.01" step="0.01" style="width:80px;" value="${r.qty}"
            oninput="saInvSetField(${r.id},'qty',this.value)"></td>
        <td><input class="finput r" type="number" min="0" step="1" style="width:100px;" value="${r.harga}"
            oninput="saInvSetField(${r.id},'harga',this.value)"></td>
        <td class="r" style="font-weight:700;">${R(Number(r.qty || 0) * Number(r.harga || 0))}</td>
        <td><button type="button" class="row-del" onclick="saInvRemoveRow(${r.id})">✕</button></td>
    </tr>`).join('');
    saInvWireRows();
}

window.saInvAddRow = () => { window._saInvGrid.push(saInvBlankRow()); saInvRenderGridBody(); };
window.saInvRemoveRow = (id) => {
    window._saInvGrid = window._saInvGrid.filter(r => r.id !== id);
    if (!window._saInvGrid.length) window._saInvGrid.push(saInvBlankRow());
    saInvRenderGridBody();
};
window.saInvSetField = (id, field, val) => {
    const r = window._saInvGrid.find(x => x.id === id);
    if (r) r[field] = val;
    if (field === 'qty' || field === 'harga') {
        // Cukup update subtotal tanpa gambar ulang seluruh grid (jaga fokus input)
        const row = window._saInvGrid.find(x => x.id === id);
        const tr = document.getElementById(`saInvKode_${id}`)?.closest('tr');
        if (tr) tr.children[4].textContent = R(Number(row.qty || 0) * Number(row.harga || 0));
    }
};
function saInvSetKode(id, kode) {
    const r = window._saInvGrid.find(x => x.id === id);
    if (!r) return;
    const b = getBarang(kode);
    r.kode = kode; r.nama = b ? b.nama : ''; r.dikenal = b ? true : (kode ? false : null);
    if (b && !r.harga) r.harga = b.modal || '';
    saInvRenderGridBody();
}

/* Dropdown pencarian barang — pola sama dgn transaksi.js (trxGridWireRows) */
function saInvWireRows() {
    window._saInvGrid.forEach(r => {
        const input = document.getElementById(`saInvKode_${r.id}`);
        const dropdown = document.getElementById(`saInvDropdown_${r.id}`);
        if (!input || !dropdown) return;
        let matches = [], activeIdx = -1, picked = false;

        const renderDropdown = () => {
            if (!matches.length) { dropdown.innerHTML = ''; dropdown.classList.remove('on'); return; }
            dropdown.innerHTML = matches.map((b, i) => `
                <div class="pos-entry-opt ${i === activeIdx ? 'active' : ''}">
                    <span class="nm">${esc(b.nama)}</span><span class="kd">${esc(b.kode)}</span>
                </div>`).join('');
            dropdown.classList.add('on');
            dropdown.querySelectorAll('.pos-entry-opt').forEach((el, i) => {
                el.addEventListener('mousedown', e => { e.preventDefault(); picked = true; saInvSetKode(r.id, matches[i].kode); });
            });
        };

        input.addEventListener('input', () => {
            const t = input.value.trim();
            matches = t ? trxGridSearchBarang(t) : [];
            activeIdx = matches.length ? 0 : -1;
            renderDropdown();
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') { e.preventDefault(); if (matches.length) { activeIdx = (activeIdx + 1) % matches.length; renderDropdown(); } }
            else if (e.key === 'ArrowUp') { e.preventDefault(); if (matches.length) { activeIdx = (activeIdx - 1 + matches.length) % matches.length; renderDropdown(); } }
            else if (e.key === 'Escape') { matches = []; activeIdx = -1; renderDropdown(); }
            else if (e.key === 'Enter') {
                e.preventDefault();
                if (activeIdx >= 0 && matches[activeIdx]) { picked = true; saInvSetKode(r.id, matches[activeIdx].kode); }
                else if (input.value.trim()) { picked = true; saInvSetKode(r.id, input.value); }
            }
        });
        input.addEventListener('blur', () => {
            setTimeout(() => {
                if (!picked && input.value.trim() !== (r.kode || '')) saInvSetKode(r.id, input.value);
                matches = []; activeIdx = -1;
                if (dropdown) { dropdown.innerHTML = ''; dropdown.classList.remove('on'); }
            }, 150);
        });
    });
}

window.saInvSimpanGrid = async () => {
    const tgl = window._saInvTgl;
    if (!tgl) { toast('Tanggal wajib diisi', 'err'); return; }
    const items = window._saInvGrid
        .filter(r => r.kode && r.cabang && Number(r.qty) > 0)
        .map(r => ({ kode_barang: r.kode, cabang: r.cabang, qty: Number(r.qty), harga_beli: Number(r.harga || 0), tgl }));
    if (!items.length) { toast('Isi minimal 1 baris valid (barang, cabang, qty)', 'err'); return; }
    try {
        const res = await apiPost('/saldo-awal/inventory/import', { items });
        toast(res.message);
        if (res.gagal && res.gagal.length) toast(`⚠️ ${res.gagal.length} baris gagal, mis: ${res.gagal[0]}`, 'y');
        window._saInvGrid = [saInvBlankRow()];
        await renderSaldoAwalInventory();
        await loadMasterData();
    } catch (err) {
        toast('Gagal menyimpan: ' + err.message, 'err');
    }
};

window.saInvHapus = async (id) => {
    const ok = await confirmDialog('Hapus baris Saldo Awal Inventory ini? Stok akan disesuaikan otomatis.', { danger: true });
    if (!ok) return;
    try {
        await apiDel('/saldo-awal/inventory/' + id);
        toast('Baris dihapus');
        await renderSaldoAwalInventory();
        await loadMasterData();
    } catch (err) { toast('Gagal menghapus: ' + err.message, 'err'); }
};

window.saInvGenerateOtomatis = async () => {
    const ok = await confirmDialog('Jalankan deteksi otomatis? Ini akan membuat/memperbarui baris Saldo Awal (Otomatis) untuk barang yang laku tapi tidak pernah tercatat dibeli di sistem ini.', { danger: false });
    if (!ok) return;
    try {
        const res = await apiPost('/master/saldo-awal/generate', {});
        toast(res.message);
        await renderSaldoAwalInventory();
        await loadMasterData();
    } catch (err) { toast('Gagal menjalankan deteksi: ' + err.message, 'err'); }
};

/* ── Import Excel ─────────────────────────────────────────── */
window._saInvImportItems = [];
window.saInvPreviewImport = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const prev = document.getElementById('saInvImportPreview');
    prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';
    try {
        const rows = file.name.endsWith('.csv') ? await saInvParseCsv(file) : await saInvParseXlsx(file);
        window._saInvImportItems = rows;
        const valid = rows.filter(r => r.kode_barang && r.cabang && r.qty > 0);
        prev.innerHTML = `
        <div class="note note-b"><span>✅ ${rows.length} baris terbaca, ${valid.length} valid.</span></div>
        <div class="tscroll" style="max-height:220px;overflow:auto;margin-top:8px;">
        <table><thead><tr><th>Kode</th><th>Cabang</th><th>Qty</th><th>Harga</th></tr></thead>
        <tbody>${valid.slice(0, 20).map(r => `<tr>
            <td style="font-size:11px;font-family:var(--F-m);">${esc(r.kode_barang)}</td>
            <td style="font-size:12px;">${esc(r.cabang)}</td>
            <td class="r" style="font-size:12px;">${r.qty}</td>
            <td class="r" style="font-size:12px;">${R(r.harga_beli)}</td>
        </tr>`).join('')}
        ${valid.length > 20 ? `<tr><td colspan="4" style="text-align:center;color:var(--ink3);">… dan ${valid.length - 20} baris lainnya</td></tr>` : ''}
        </tbody></table></div>
        <button class="btn btn-p btn-sm" style="margin-top:10px;" onclick="saInvDoImport()">Import ${valid.length} Baris</button>`;
    } catch (err) {
        prev.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
    }
};

async function saInvParseXlsx(file) {
    return new Promise((resolve, reject) => {
        if (typeof XLSX === 'undefined') { reject(new Error('Library XLSX belum dimuat. Simpan sebagai .csv lalu coba lagi.')); return; }
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb = XLSX.read(e.target.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });
                resolve(saInvMapAoa(aoa));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Gagal baca file'));
        reader.readAsArrayBuffer(file);
    });
}

function saInvMapAoa(aoa) {
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let headerIdx = -1, col = {};
    const ALIAS = { kode: ['kodebarang', 'kode'], cabang: ['cabang'], qty: ['qty', 'jumlah'], harga: ['harga', 'hpp', 'modal'] };
    for (let r = 0; r < aoa.length; r++) {
        const cells = (aoa[r] || []).map(norm);
        const iKode = cells.findIndex(c => ALIAS.kode.includes(c));
        const iCab = cells.findIndex(c => ALIAS.cabang.includes(c));
        if (iKode >= 0 && iCab >= 0) {
            headerIdx = r;
            for (const [f, aliases] of Object.entries(ALIAS)) col[f] = cells.findIndex(c => aliases.includes(c));
            break;
        }
    }
    if (headerIdx === -1) throw new Error('Header tidak ditemukan (butuh minimal kolom KODE_BARANG dan CABANG)');
    const rows = [];
    for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const get = (f) => col[f] >= 0 ? row[col[f]] : '';
        const kode = String(get('kode') ?? '').trim();
        if (!kode) continue;
        rows.push({
            kode_barang: kode,
            cabang: String(get('cabang') ?? '').trim(),
            qty: parseFloat(get('qty')) || 0,
            harga_beli: parseFloat(get('harga')) || 0,
        });
    }
    return rows;
}

async function saInvParseCsv(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const lines = e.target.result.split('\n');
                const aoa = lines.filter(l => l.trim()).map(l => l.split(','));
                resolve(saInvMapAoa(aoa));
            } catch (err) { reject(err); }
        };
        reader.onerror = () => reject(new Error('Gagal baca CSV'));
        reader.readAsText(file);
    });
}

window.saInvDoImport = async () => {
    const tgl = window._saInvTgl || today();
    const items = (window._saInvImportItems || [])
        .filter(r => r.kode_barang && r.cabang && r.qty > 0)
        .map(r => ({ ...r, tgl }));
    if (!items.length) { toast('Tidak ada baris valid', 'err'); return; }
    try {
        let ditambah = 0, diperbarui = 0, gagal = [];
        for (let i = 0; i < items.length; i += 200) {
            const batch = items.slice(i, i + 200);
            const res = await apiPost('/saldo-awal/inventory/import', { items: batch });
            ditambah += res.ditambah || 0;
            diperbarui += res.diperbarui || 0;
            gagal = gagal.concat(res.gagal || []);
        }
        toast(`Import selesai: ${ditambah} ditambah, ${diperbarui} diperbarui` + (gagal.length ? `, ${gagal.length} gagal` : ''));
        if (gagal.length) toast(`⚠️ Contoh gagal: ${gagal[0]}`, 'y');
        await renderSaldoAwalInventory();
        await loadMasterData();
    } catch (err) {
        toast('Gagal import: ' + err.message, 'err');
    }
};
