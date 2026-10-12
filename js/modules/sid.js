/* =============================================================
   sid.js — Integrasi SID Kasir
   Status koneksi, sync penjualan, sync barang/stok, pengaturan
   ============================================================= */

/* ── STATUS KONEKSI ───────────────────────────────────────── */
async function renderSidStatus() {
    const el = document.getElementById('sid-status');
    el.innerHTML = loadingHTML;
    try {
        const d = await apiGet('/sid/status');
        const koneksi = d.koneksi_sid;
        const last    = d.last_sync;

        el.innerHTML = `
        <div class="kpi-grid" style="margin-bottom:16px;">
            <div class="kpi ${koneksi?'':'red'}">
                <div class="kpi-label">Status Koneksi SID</div>
                <div class="kpi-val" style="font-size:18px;">${koneksi ? '🟢 Online' : '🔴 Offline'}</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Total Nota Tersync</div>
                <div class="kpi-val">${d.total_synced}</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Sync Hari Ini</div>
                <div class="kpi-val pos">${d.today_synced}</div>
            </div>
            <div class="kpi">
                <div class="kpi-label">Terakhir Sync</div>
                <div class="kpi-val" style="font-size:13px;">${last ? fmtTgl(last.sync_at) : '–'}</div>
            </div>
        </div>

        ${!koneksi ? `
        <div class="note note-y" style="margin-bottom:16px;">
            <span class="note-ico">⚠️</span>
            <span>Tidak bisa terhubung ke SID API. Pastikan:
                <ul style="margin:8px 0 0 16px;">
                    <li>Komputer terhubung ke internet</li>
                    <li>API Key SID valid</li>
                    <li>sidretail.id bisa diakses</li>
                </ul>
            </span>
        </div>` : `
        <div class="note note-b" style="margin-bottom:16px;">
            <span class="note-ico">ℹ️</span>
            <span>SID terhubung. Sync otomatis berjalan <strong>setiap 5 menit</strong> via Laravel Scheduler.
            Untuk mengaktifkan scheduler, jalankan perintah berikut di CMD dan biarkan berjalan:
            <code style="display:block;margin-top:6px;padding:6px 10px;background:var(--bg3);border-radius:4px;font-size:12px;">php artisan schedule:work</code>
            </span>
        </div>`}

        <div class="box">
            <div class="box-hd">
                <h3>Riwayat Sync Terakhir</h3>
                <button class="btn btn-g btn-sm" onclick="renderSidStatus()">🔄 Refresh</button>
            </div>
            <div class="box-bd pad0 tscroll">
                ${d.logs?.length ? `
                <table>
                    <thead><tr><th>Waktu</th><th>Jenis</th><th class="r">Berhasil</th><th class="r">Dilewati</th><th class="r">Gagal</th><th>Pesan</th></tr></thead>
                    <tbody>${d.logs.map(l=>`<tr>
                        <td style="font-size:12px;">${fmtTglWaktu(l.sync_at)}</td>
                        <td><span class="badge badge-info">${l.jenis}</span></td>
                        <td class="r"><span style="color:var(--pos);font-weight:600;">${l.berhasil}</span></td>
                        <td class="r">${l.dilewati}</td>
                        <td class="r">${l.gagal>0?`<span style="color:var(--neg);">${l.gagal}</span>`:'0'}</td>
                        <td style="font-size:11px;color:var(--ink3);max-width:300px;">${esc(l.pesan||'–')}</td>
                    </tr>`).join('')}</tbody>
                </table>`
                : '<div class="empty"><div class="ico">📡</div><strong>Belum ada riwayat sync.</strong></div>'}
            </div>
        </div>`;
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.renderSidStatus = renderSidStatus;

/* ── SYNC PENJUALAN ───────────────────────────────────────── */
async function renderSidSyncJual() {
    const el = document.getElementById('sid-syncjual');
    el.innerHTML = `
    <div class="note note-b"><span class="note-ico">ℹ️</span>
        <span>Sync menarik data penjualan dari SID untuk tanggal yang dipilih.
        Nota yang sudah pernah disync akan <strong>dilewati otomatis</strong> (tidak dobel).
        Setelah sync, stok di Toko Sumini otomatis dikurangi.</span>
    </div>

    <div class="row2">
        <div class="box">
            <div class="box-hd"><h3>🛒 Sync Penjualan Harian</h3></div>
            <div class="box-bd">
                <div class="fgrid">
                    <div class="fgroup">
                        <label class="flabel">Tanggal</label>
                        <input class="finput" type="date" id="sjTgl" value="${today()}">
                    </div>
                </div>
                <button class="btn btn-p" onclick="doSyncJual()">
                    🔄 Sync Sekarang
                </button>
                <div id="sjResult" style="margin-top:12px;"></div>
            </div>
        </div>

        <div class="box">
            <div class="box-hd"><h3>📅 Sync Range Tanggal</h3></div>
            <div class="box-bd">
                <div class="note note-y" style="margin-bottom:12px;"><span class="note-ico">⚠️</span>
                    <span>Proses ini bisa lama jika range-nya panjang. Gunakan untuk import data historis.</span>
                </div>
                <div class="fgrid">
                    <div class="fgroup">
                        <label class="flabel">Dari Tanggal</label>
                        <input class="finput" type="date" id="srDari" value="${firstDayOfMonth()}">
                    </div>
                    <div class="fgroup">
                        <label class="flabel">Sampai Tanggal</label>
                        <input class="finput" type="date" id="srSampai" value="${today()}">
                    </div>
                </div>
                <button class="btn btn-p" onclick="doSyncRange()">
                    🔄 Sync Range
                </button>
                <div id="srResult" style="margin-top:12px;"></div>
            </div>
        </div>
    </div>`;
}
window.renderSidSyncJual = renderSidSyncJual;

window.doSyncJual = async () => {
    const tgl = document.getElementById('sjTgl').value;
    if (!tgl) { toast('Pilih tanggal dulu','err'); return; }
    // Konversi yyyy-mm-dd → dd/mm/yyyy untuk SID
    const [y,m,d2] = tgl.split('-');
    const tglSid = `${d2}/${m}/${y}`;
    const res = document.getElementById('sjResult');
    res.innerHTML = loadingHTML;
    try {
        const r = await apiPost('/sid/sync/penjualan', { tanggal: tglSid });
        res.innerHTML = resultBadge(r);
        toast(`Sync selesai: ${r.berhasil} nota berhasil`);
        if (r.berhasil > 0) await renderSidStatus();
    } catch(err) {
        res.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

window.doSyncRange = async () => {
    const dari   = document.getElementById('srDari').value;
    const sampai = document.getElementById('srSampai').value;
    if (!dari || !sampai) { toast('Isi tanggal dari dan sampai','err'); return; }
    const res = document.getElementById('srResult');
    res.innerHTML = `<div style="color:var(--ink3);font-size:13px;">⏳ Sedang sync semua tanggal, harap tunggu…</div>`;
    try {
        const r = await apiPost('/sid/sync/range', { dari, sampai });
        res.innerHTML = resultBadge(r);
        toast(`Sync range selesai: ${r.berhasil} nota`);
    } catch(err) {
        res.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

/* ── SYNC BARANG & STOK ───────────────────────────────────── */
window._sbOffset = 0;
window._sbLimit  = 200;

async function renderSidSyncBarang() {
    const el = document.getElementById('sid-syncbarang');
    el.innerHTML = `
    <div class="note note-b"><span class="note-ico">ℹ️</span>
        <span>Sync barang menarik master barang dari SID dan menyimpannya ke Toko Sumini.
        Barang yang sudah ada akan <strong>diperbarui</strong> (nama, harga, HPP).
        Sync stok menyalin jumlah stok toko dari SID ke cabang yang dipilih.</span>
    </div>

    <div class="row2">
        <div class="box">
            <div class="box-hd"><h3>📦 Sync Master Barang</h3></div>
            <div class="box-bd">
                <div class="fgrid">
                    <div class="fgroup">
                        <label class="flabel">Jumlah per Batch</label>
                        <select class="fselect" id="sbLimit" style="width:120px;">
                            <option value="100">100 item</option>
                            <option value="200" selected>200 item</option>
                            <option value="500">500 item</option>
                        </select>
                    </div>
                    <div class="fgroup">
                        <label class="flabel">Mulai dari (offset)</label>
                        <input class="finput" type="number" id="sbOffset" value="0" min="0" style="width:100px;">
                        <span class="fhint">0 = dari awal. Jika timeout, naikkan offset untuk lanjutkan.</span>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;">
                    <button class="btn btn-p" onclick="doSyncBarang()">🔄 Sync Barang</button>
                    <button class="btn btn-g" onclick="doSyncBarangSemua()">🔄 Sync Semua (Auto)</button>
                </div>
                <div id="sbResult" style="margin-top:12px;"></div>
            </div>
        </div>

        <div class="box">
            <div class="box-hd"><h3>📊 Sync Stok dari SID</h3></div>
            <div class="box-bd">
                <div class="note note-y" style="margin-bottom:12px;"><span class="note-ico">⚠️</span>
                    <span>Sync stok akan <strong>menimpa</strong> jumlah stok di cabang yang dipilih dengan data stok toko dari SID. Lakukan hanya sekali saat setup awal atau jika ada perbedaan besar.</span>
                </div>
                <div class="fgrid">
                    <div class="fgroup">
                        <label class="flabel">Tuju ke Cabang</label>
                        <select class="fselect" id="stokCabang">${cabangOpts()}</select>
                    </div>
                </div>
                <button class="btn btn-p" onclick="doSyncStok()">🔄 Sync Stok</button>
                <div id="stokResult" style="margin-top:12px;"></div>
            </div>
        </div>
    </div>`;
}
window.renderSidSyncBarang = renderSidSyncBarang;

window.doSyncBarang = async () => {
    const limit  = parseInt(document.getElementById('sbLimit').value)  || 200;
    const offset = parseInt(document.getElementById('sbOffset').value) || 0;
    const res    = document.getElementById('sbResult');
    res.innerHTML = `<div style="color:var(--ink3);font-size:13px;">⏳ Menarik ${limit} barang dari offset ${offset}…</div>`;
    try {
        const r = await apiPost('/sid/sync/barang', { limit, offset });
        res.innerHTML = `
        <div class="note note-b">
            <span>✅ Selesai — <strong>${r.ditambah}</strong> barang baru, <strong>${r.diperbarui}</strong> diperbarui (total: ${r.total}).</span>
        </div>
        ${r.total >= limit ? `<div style="font-size:12px;color:var(--ink3);margin-top:4px;">Ada kemungkinan masih ada barang. Naikkan offset ke <strong>${offset+limit}</strong> untuk lanjutkan.</div>` : ''}`;
        toast(`Sync barang: ${r.ditambah} baru, ${r.diperbarui} update`);
    } catch(err) {
        res.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

window.doSyncBarangSemua = async () => {
    const res = document.getElementById('sbResult');
    res.innerHTML = `<div style="color:var(--ink3);font-size:13px;">⏳ Sync semua barang otomatis (per 200)…</div>`;
    let offset = 0; const limit = 200;
    let totalBaru = 0; totalUpdate = 0;
    try {
        while(true) {
            const r = await apiPost('/sid/sync/barang', { limit, offset });
            totalBaru   += (r.ditambah || 0);
            totalUpdate += (r.diperbarui || 0);
            res.innerHTML = `<div style="color:var(--ink3);font-size:13px;">⏳ Progress: ${totalBaru+totalUpdate} barang diproses (offset ${offset})…</div>`;
            if ((r.total || 0) < limit) break; // sudah habis
            offset += limit;
            if (offset > 50000) break; // safety limit
        }
        res.innerHTML = `<div class="note note-b"><span>✅ Selesai — <strong>${totalBaru}</strong> barang baru, <strong>${totalUpdate}</strong> diperbarui.</span></div>`;
        toast(`Sync semua barang selesai: ${totalBaru} baru, ${totalUpdate} update`);
    } catch(err) {
        res.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

window.doSyncStok = async () => {
    const cabang = document.getElementById('stokCabang').value;
    if (!cabang) { toast('Pilih cabang dulu','err'); return; }
    if (!(await confirmDialog(`Sync stok SID ke cabang "${cabang}"? Stok saat ini di cabang tersebut akan ditimpa.`, { okText: "Sync", danger: false }))) return;
    const res = document.getElementById('stokResult');
    res.innerHTML = `<div style="color:var(--ink3);font-size:13px;">⏳ Menyalin stok…</div>`;
    try {
        const r = await apiPost('/sid/sync/stok', { cabang });
        res.innerHTML = `<div class="note note-b"><span>✅ ${r.diperbarui} item stok diperbarui di cabang <strong>${esc(cabang)}</strong>.</span></div>`;
        toast(`Sync stok selesai: ${r.diperbarui} item`);
    } catch(err) {
        res.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

/* ── PENGATURAN ───────────────────────────────────────────── */
async function renderSidPengaturan() {
    const el = document.getElementById('sid-pengaturan');
    el.innerHTML = loadingHTML;
    try {
        const [mapList, opList] = await Promise.all([
            apiGet('/sid/cabang-map').catch(() => []),
            apiGet('/sid/operator').catch(() => []),
        ]);
        const cabangList = STATE.cabang || [];

        el.innerHTML = `
        <div class="note note-b" style="margin-bottom:16px;"><span class="note-ico">ℹ️</span>
            <span>Petakan <strong>Operator SID</strong> (kasir yang login di SID) ke <strong>Cabang Toko Sumini</strong>.
            Data penjualan dari operator tersebut akan masuk ke cabang yang sesuai.
            Jika operator tidak dipetakan, data masuk ke cabang pertama.</span>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>⚙️ Mapping Operator SID → Cabang</h3>
                <button class="btn btn-p btn-sm" onclick="tambahMapRow()">+ Tambah Baris</button>
            </div>
            <div class="box-bd">
                <table id="tblMap">
                    <thead><tr><th>Operator SID</th><th>Cabang Toko Sumini</th><th></th></tr></thead>
                    <tbody id="mapBody">
                        ${mapList.length
                            ? mapList.map((m,i)=>mapRow(i, m.operator_sid, m.cabang_lokal, cabangList)).join('')
                            : opList.map((o,i)=>mapRow(i, o.operator||'', '', cabangList)).join('')
                        }
                        ${(!mapList.length && !opList.length) ? mapRow(0,'','',cabangList) : ''}
                    </tbody>
                </table>
                <div style="margin-top:12px;display:flex;gap:8px;">
                    <button class="btn btn-p" onclick="simpanMap()">💾 Simpan Mapping</button>
                </div>
            </div>
        </div>

        <div class="box" style="margin-top:16px;">
            <div class="box-hd"><h3>ℹ️ Info Koneksi SID</h3></div>
            <div class="box-bd">
                <table>
                    <tr><td style="color:var(--ink3);width:160px;">API Key</td><td><code style="font-size:12px;">1c36be2a4bb74fce2adffa5a8dfdc5631</code></td></tr>
                    <tr><td style="color:var(--ink3);">Base URL</td><td><code style="font-size:12px;">https://sidretail.id/api</code></td></tr>
                    <tr><td style="color:var(--ink3);">Scheduler</td><td><code style="font-size:12px;">php artisan schedule:work</code></td></tr>
                    <tr><td style="color:var(--ink3);">Manual sync</td><td><code style="font-size:12px;">php artisan sid:sync</code></td></tr>
                    <tr><td style="color:var(--ink3);">Sync tanggal</td><td><code style="font-size:12px;">php artisan sid:sync --tanggal=25/06/2026</code></td></tr>
                </table>
            </div>
        </div>`;
    } catch(err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.renderSidPengaturan = renderSidPengaturan;

let _mapIdx = 0;
function mapRow(i, opSid, cabLok, cabangList) {
    _mapIdx = Math.max(_mapIdx, i+1);
    return `<tr id="mrow-${i}">
        <td><input class="finput map-op" value="${esc(opSid)}" placeholder="ADM1" style="width:150px;"></td>
        <td><select class="fselect map-cab">
            <option value="">-- Pilih Cabang --</option>
            ${cabangList.map(c=>`<option value="${esc(c.nama)}" ${c.nama===cabLok?'selected':''}>${esc(c.nama)}</option>`).join('')}
        </select></td>
        <td><button class="row-del" onclick="this.closest('tr').remove()">✕</button></td>
    </tr>`;
}
window.tambahMapRow = () => {
    const tbody = document.getElementById('mapBody');
    const div   = document.createElement('tbody');
    div.innerHTML = mapRow(_mapIdx, '', '', STATE.cabang || []);
    tbody.appendChild(div.firstElementChild);
};
window.simpanMap = async () => {
    const rows  = document.querySelectorAll('#mapBody tr');
    const items = Array.from(rows).map(r => ({
        operator_sid  : r.querySelector('.map-op')?.value.trim() || '',
        cabang_lokal  : r.querySelector('.map-cab')?.value || '',
    })).filter(r => r.operator_sid && r.cabang_lokal);
    try {
        await apiPost('/sid/cabang-map', { items });
        toast('Mapping disimpan');
    } catch(err) { toast(err.message,'err'); }
};

/* ── HELPERS ──────────────────────────────────────────────── */
function resultBadge(r) {
    return `<div class="note ${r.gagal>0?'note-y':'note-b'}">
        <span>
            ✅ <strong>${r.berhasil}</strong> nota berhasil &nbsp;|&nbsp;
            ⏭ <strong>${r.dilewati}</strong> dilewati &nbsp;|&nbsp;
            ${r.gagal>0?`❌ <strong style="color:var(--neg);">${r.gagal}</strong> gagal`:'✓ 0 gagal'}
        </span>
        ${r.pesan?.length ? `<div style="margin-top:6px;font-size:11px;color:var(--ink3);">${r.pesan.map(p=>`• ${esc(p)}`).join('<br>')}</div>` : ''}
    </div>`;
}

function fmtTglWaktu(dt) {
    if (!dt) return '–';
    try {
        const d = new Date(dt);
        return d.toLocaleDateString('id-ID') + ' ' + d.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});
    } catch(e) { return dt; }
}

function firstDayOfMonth() {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`;
}
