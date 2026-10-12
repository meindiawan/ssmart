/* =============================================================
   analisis.js — Render Semua Sub-modul Analisis Data
   Endpoint: GET /api/analisis/* dan /api/transaksi/jual
   ============================================================= */

/* ── BARANG TERLARIS ──────────────────────────────────────── */
async function renderAnalisisBarangLaku() {
    const el = document.getElementById('an-baranglaku');
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const q   = buildQuery({ cabang: cab, per_page: 1000 });

        // Ambil semua penjualan lalu hitung stats per barang di sini
        const res  = await apiGet('/transaksi/jual' + q);
        const list = res.data || [];

        // Agregasi per kode barang
        const brgMap = {};
        list.forEach(t => {
            const k = t.kode_barang;
            if (!brgMap[k]) brgMap[k] = {
                kode: k, nama: t.nama_barang || k, ppn: t.ppn || '',
                qty: 0, omzet: 0, hpp: 0, hargaJualMaster: Number(t.harga_jual || 0),
            };
            brgMap[k].qty   += Number(t.qty);
            brgMap[k].omzet += Number(t.qty) * Number(t.harga);
            brgMap[k].hpp   += Number(t.hpp_kartu || 0); // HPP dari Kartu HPP (hanya dari pembelian)
        });

        // Deteksi kemungkinan salah satuan: rata-rata harga jual per transaksi
        // jauh lebih tinggi dari Harga Jual di Master Barang (mis. harga per
        // DUS/KARTON kepencet padahal qty dihitung per PCS) — ini penyebab
        // paling umum margin sebuah barang "terlihat" 90%+ padahal tidak wajar.
        const ANOMALI_RASIO = 3; // harga rata-rata > 3x harga jual master dianggap janggal
        const stats = Object.values(brgMap).map(s => {
            const avgHarga = s.qty > 0 ? s.omzet / s.qty : 0;
            const anomali  = s.hargaJualMaster > 0 && avgHarga > s.hargaJualMaster * ANOMALI_RASIO;
            return {
                ...s,
                avgHarga,
                anomali,
                margin    : s.omzet - s.hpp,
                marginPct : s.omzet > 0 ? Math.round((s.omzet - s.hpp) / s.omzet * 100) : 0,
            };
        }).sort((a, b) => b.omzet - a.omzet);

        const totalOmzet = stats.reduce((s, x) => s + x.omzet, 0);
        const totalQty   = stats.reduce((s, x) => s + x.qty, 0);
        const topMargin  = [...stats].sort((a, b) => b.marginPct - a.marginPct)[0];
        const anomaliList = stats.filter(s => s.anomali);

        el.innerHTML = `
        ${exportBar('tblBrgLaku','barang-terlaris','an-baranglaku','Analisis Barang Terlaris')}
        ${stats.length ? `
        ${anomaliList.length ? `
        <div class="note note-y" style="margin-bottom:12px;">
            <span class="note-ico">⚠️</span>
            <span>
                <strong>${anomaliList.length} barang</strong> harga jual rata-rata di transaksinya jauh lebih tinggi
                (>${ANOMALI_RASIO}×) dari <strong>Harga Jual</strong> di Master Barang — kemungkinan besar
                saat transaksi dulu <strong>harga per DUS/KARTON kepencet padahal Qty dihitung per PCS</strong>
                (atau salah ketik harga), sehingga Omzet & Margin barang ini "terbaca" jauh lebih besar dari kenyataan.
                Barang ditandai <span style="color:var(--red);font-weight:700;">⚠</span> di tabel — cek & perbaiki
                transaksinya di menu Transaksi ▸ Penjualan (hapus baris yang salah, catat ulang dengan harga per PCS yang benar).
                <div style="margin-top:6px;font-size:12px;max-height:120px;overflow-y:auto;">
                    ${anomaliList.slice(0,15).map(s => `${esc(s.kode)} – ${esc(s.nama)}: rata-rata ${R(s.avgHarga)}/pcs vs Harga Jual master ${R(s.hargaJualMaster)}`).join('<br>')}
                    ${anomaliList.length > 15 ? `<br>… dan ${anomaliList.length - 15} lainnya` : ''}
                </div>
            </span>
        </div>` : ''}
        <div class="insight-grid">
            <div class="insight-card">
                <div class="insight-icon">🏆</div>
                <div class="insight-label">Barang Terlaris</div>
                <div class="insight-val">${esc(stats[0]?.nama || '–')}</div>
                <div class="insight-sub">${stats[0]?.qty || 0} unit · ${R(stats[0]?.omzet || 0)}</div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">💰</div>
                <div class="insight-label">Total Omzet</div>
                <div class="insight-val">${R(totalOmzet)}</div>
                <div class="insight-sub">${totalQty.toLocaleString('id-ID')} unit terjual</div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">📈</div>
                <div class="insight-label">Margin Tertinggi</div>
                <div class="insight-val">${esc(topMargin?.nama || '–')}</div>
                <div class="insight-sub">${topMargin?.marginPct || 0}% margin kotor</div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">📦</div>
                <div class="insight-label">Jumlah Item Terjual</div>
                <div class="insight-val">${stats.length} item</div>
                <div class="insight-sub">${STATE.barang.length} total di master</div>
            </div>
        </div>

        <div class="box" style="margin-bottom:20px;">
            <div class="box-hd"><h3>Grafik Omzet per Barang</h3><div class="meta">Top ${Math.min(stats.length,12)}</div></div>
            <div class="box-bd"><div class="chart-wrap" style="height:220px;"><canvas id="cBrgOmzet"></canvas></div></div>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>Detail Barang Terlaris</h3>
                <div class="meta">${stats.length} item · ${cab || 'Semua cabang'}</div>
            </div>
            <div class="box-bd pad0 tscroll">
                <table id="tblBrgLaku">
                    <thead><tr>
                        <th>#</th><th>Kode</th><th>Nama Barang</th><th>PPN</th>
                        <th class="r">Qty</th><th class="r">Omzet</th>
                        <th class="r">HPP</th><th class="r">Margin</th><th class="r">%</th>
                    </tr></thead>
                    <tbody>${stats.map((s, i) => `<tr>
                        <td><div style="display:flex;align-items:center;gap:6px;">
                            ${i < 3
                                ? `<div class="rank-num ${i===0?'gold':i===1?'silver':'bronze'}" style="width:20px;height:20px;font-size:10px;">${i+1}</div>`
                                : `<span style="font-size:12px;color:var(--ink3);">${i+1}</span>`}
                        </div></td>
                        <td style="font-family:var(--F-m);font-size:12px;">${esc(s.kode)}</td>
                        <td><strong class="link-barang" onclick="lihatKartuHpp('${esc(s.kode)}')" title="Klik untuk lihat riwayat masuk/keluar & HPP rata-rata barang ini">${esc(s.nama)}</strong>${s.anomali ? ` <span title="Harga rata-rata jauh di atas Harga Jual master — cek satuan/harga transaksinya" style="color:var(--red);cursor:help;">⚠</span>` : ''}</td>
                        <td><span class="badge ${s.ppn==='Kena PPN'?'badge-ppn':'badge-noppn'}">${s.ppn||'–'}</span></td>
                        <td class="r">${s.qty.toLocaleString('id-ID')}</td>
                        <td class="r">${R(s.omzet)}</td>
                        <td class="r">${s.hpp > 0 ? R(s.hpp) : '<span style="color:var(--ink3);">–</span>'}</td>
                        <td class="r ${s.margin >= 0 ? 'laba-pos' : 'laba-neg'}">${s.hpp > 0 ? R(s.margin) : '<span style="color:var(--ink3);">–</span>'}</td>
                        <td class="r" style="font-weight:700;">${s.hpp > 0 ? s.marginPct + '%' : '–'}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
        ` : '<div class="empty"><div class="ico">🛒</div><strong>Belum ada data penjualan.</strong></div>'}`;

        setTimeout(() => {
            if (stats.length) drawBarCanvas('cBrgOmzet',
                stats.slice(0, 12).map(s => s.nama),
                stats.slice(0, 12).map(s => s.omzet),
                '#1A5C38'
            );
        }, 60);

    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── PERBANDINGAN CABANG ──────────────────────────────────── */
window._cabFilter = window._cabFilter || { dari: '', sampai: '' };
window.cabSetTgl = (k, v) => { window._cabFilter[k] = v; renderAnalisisCabang(); };
window.cabResetTgl = () => { window._cabFilter = { dari: '', sampai: '' }; renderAnalisisCabang(); };

async function renderAnalisisCabang() {
    const el = document.getElementById('an-cabangcomp');
    el.innerHTML = loadingHTML;
    try {
        const f = window._cabFilter;
        const res  = await apiGet('/analisis/cabang' + buildQuery({ dari: f.dari, sampai: f.sampai }));
        const list = (res.data || []).sort((a, b) => b.omzet - a.omzet);
        const totalOmzet = list.reduce((s, c) => s + c.omzet, 0);

        el.innerHTML = `
        <div class="box" style="margin-bottom:20px;">
            <div class="box-hd"><h3>📅 Filter / Cut-off Tanggal</h3><div class="meta">${(f.dari || f.sampai) ? ((f.dari||'awal') + ' s/d ' + (f.sampai||'sekarang')) : 'Semua waktu'}</div></div>
            <div class="box-bd" style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end;">
                <div class="fgroup" style="margin:0;"><label class="flabel">Dari</label><input class="finput" type="date" value="${f.dari}" onchange="cabSetTgl('dari', this.value)"></div>
                <div class="fgroup" style="margin:0;"><label class="flabel">Sampai</label><input class="finput" type="date" value="${f.sampai}" onchange="cabSetTgl('sampai', this.value)"></div>
                <button class="btn btn-g btn-sm" style="height:38px;" onclick="cabResetTgl()">↺ Semua Waktu</button>
            </div>
        </div>
        ${exportBar('tblCabComp','perbandingan-cabang','an-cabangcomp','Perbandingan Cabang')}
        ${list.length ? `
        <div class="box" style="margin-bottom:20px;">
            <div class="box-hd"><h3>Kontribusi Omzet per Cabang</h3></div>
            <div class="box-bd"><div class="chart-wrap" style="height:200px;"><canvas id="cCabComp"></canvas></div></div>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Perbandingan Detail Cabang</h3></div>
            <div class="box-bd pad0 tscroll">
                <table id="tblCabComp">
                    <thead><tr>
                        <th>Cabang</th><th class="r">Omzet Total</th>
                        <th class="r">Omzet Bln Ini</th><th class="r">Pembelian</th>
                        <th class="r">Biaya</th><th class="r">Margin</th>
                        <th class="r">Kontribusi</th><th class="r">Jml Trx</th>
                    </tr></thead>
                    <tbody>${list.map(c => `<tr>
                        <td><strong>${esc(c.nama)}</strong></td>
                        <td class="r">${R(c.omzet)}</td>
                        <td class="r">${R(c.omzet_bulan)}</td>
                        <td class="r">${R(c.beli_total)}</td>
                        <td class="r">${R(c.biaya_total)}</td>
                        <td class="r ${c.margin >= 0 ? 'laba-pos' : 'laba-neg'}">${R(c.margin)}</td>
                        <td class="r"><strong>${totalOmzet > 0 ? Math.round(c.omzet / totalOmzet * 100) : 0}%</strong></td>
                        <td class="r">${c.trx_count}</td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
        ` : '<div class="empty"><div class="ico">🏬</div><strong>Belum ada data cabang.</strong></div>'}`;

        setTimeout(() => {
            if (list.length) drawBarCanvas('cCabComp', list.map(c => c.nama), list.map(c => c.omzet), '#C8973A');
        }, 60);

    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── TREN PENJUALAN 12 BULAN ──────────────────────────────── */
async function renderAnalisisTren() {
    const el = document.getElementById('an-tren');
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const res = await apiGet('/analisis/tren' + buildQuery({ cabang: cab }));
        const list   = res.data || [];
        const labels = list.map(m => monthLabel(m.bulan));

        el.innerHTML = `
        ${exportBar('tblTren','tren-bulanan','an-tren','Tren Penjualan')}
        <div class="row2">
            <div class="box">
                <div class="box-hd"><h3>Tren Penjualan 12 Bulan</h3></div>
                <div class="box-bd"><div class="chart-wrap" style="height:200px;"><canvas id="cTrenJual"></canvas></div></div>
            </div>
            <div class="box">
                <div class="box-hd"><h3>Tren Laba Estimasi 12 Bulan</h3></div>
                <div class="box-bd"><div class="chart-wrap" style="height:200px;"><canvas id="cTrenLaba"></canvas></div></div>
            </div>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Rincian Bulanan</h3><div class="meta">12 bulan terakhir</div></div>
            <div class="box-bd pad0 tscroll">
                <table id="tblTren">
                    <thead><tr>
                        <th>Bulan</th><th class="r">Penjualan</th><th class="r">Pembelian</th>
                        <th class="r">HPP</th><th class="r">Biaya</th><th class="r">Laba Estimasi</th>
                    </tr></thead>
                    <tbody>${list.map(m => `<tr>
                        <td style="font-weight:600;">${monthLabel(m.bulan)}</td>
                        <td class="r">${m.jual  > 0 ? R(m.jual)  : '–'}</td>
                        <td class="r">${m.beli  > 0 ? R(m.beli)  : '–'}</td>
                        <td class="r">${m.hpp   > 0 ? R(m.hpp)   : '–'}</td>
                        <td class="r">${m.biaya > 0 ? R(m.biaya) : '–'}</td>
                        <td class="r ${m.laba >= 0 ? 'laba-pos' : 'laba-neg'}">
                            ${m.jual > 0 || m.biaya > 0 ? R(m.laba) : '–'}
                        </td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>`;

        setTimeout(() => {
            drawLineCanvas('cTrenJual', labels, list.map(m => m.jual),  '#1A5C38');
            drawLineCanvas('cTrenLaba', labels, list.map(m => m.laba),  '#C8973A');
        }, 60);

    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── ANALISIS MARGIN & HPP ────────────────────────────────── */
async function renderAnalisisMargin() {
    const el = document.getElementById('an-margin');
    el.innerHTML = loadingHTML;
    try {
        const cab  = getCabang();
        const res  = await apiGet('/analisis/margin' + buildQuery({ cabang: cab }));
        const stats = res.data || [];
        const avgMargin = stats.length
            ? Math.round(stats.reduce((s, x) => s + x.margin_pct, 0) / stats.length)
            : 0;

        el.innerHTML = `
        ${exportBar('tblMargin','analisis-margin','an-margin','Analisis Margin & HPP')}
        ${stats.length ? `
        <div class="insight-grid">
            <div class="insight-card">
                <div class="insight-icon">📊</div>
                <div class="insight-label">Margin Terbaik</div>
                <div class="insight-val">${esc(stats[0]?.nama || '–')}</div>
                <div class="insight-sub">${stats[0]?.margin_pct || 0}% margin kotor</div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">⚠️</div>
                <div class="insight-label">Margin Terendah</div>
                <div class="insight-val">${esc(stats[stats.length-1]?.nama || '–')}</div>
                <div class="insight-sub">${stats[stats.length-1]?.margin_pct || 0}% margin kotor</div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">💡</div>
                <div class="insight-label">Rata-rata Margin</div>
                <div class="insight-val">${avgMargin}%</div>
                <div class="insight-sub">${stats.length} item berdata HPP</div>
            </div>
            <div class="insight-card">
                <div class="insight-icon">🔍</div>
                <div class="insight-label">Item Tanpa HPP</div>
                <div class="insight-val">${STATE.barang.filter(b => !b.modal || b.modal == 0).length} item</div>
                <div class="insight-sub">Isi harga modal di Master Barang</div>
            </div>
        </div>
        <div class="box">
            <div class="box-hd"><h3>Analisis Margin per Barang</h3><div class="meta">Item dengan data harga modal</div></div>
            <div class="box-bd pad0 tscroll">
                <table id="tblMargin">
                    <thead><tr>
                        <th>#</th><th>Nama Barang</th>
                        <th class="r">Omzet</th><th class="r">HPP</th>
                        <th class="r">Margin</th><th class="r">%</th><th>Visual</th>
                    </tr></thead>
                    <tbody>${stats.map((s, i) => `<tr>
                        <td>${i+1}</td>
                        <td><strong>${esc(s.nama)}</strong></td>
                        <td class="r">${R(s.omzet)}</td>
                        <td class="r">${R(s.hpp)}</td>
                        <td class="r ${s.margin >= 0 ? 'laba-pos' : 'laba-neg'}">${R(s.margin)}</td>
                        <td class="r" style="font-weight:700;color:${s.margin_pct>=30?'var(--grn)':s.margin_pct>=15?'var(--ylw)':'var(--red)'};">
                            ${s.margin_pct}%
                        </td>
                        <td style="min-width:100px;">
                            <div style="height:8px;background:var(--kertas);border-radius:4px;overflow:hidden;">
                                <div style="height:100%;width:${Math.min(s.margin_pct,100)}%;background:${s.margin_pct>=30?'var(--daun)':s.margin_pct>=15?'var(--emas)':'var(--red)'};border-radius:4px;"></div>
                            </div>
                        </td>
                    </tr>`).join('')}</tbody>
                </table>
            </div>
        </div>
        ` : `<div class="note note-y"><span class="note-ico">⚠️</span>
            <span>Belum ada data margin. Pastikan <strong>Harga Modal</strong> sudah diisi di Master Barang dan ada transaksi penjualan.</span>
        </div>`}`;

    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* =============================================================
   ANALISIS ▸ KASIR & SHIFT
   Penjualan & laba per shift → kasir → cabang, total per cabang, dan
   total semua cabang. Backend: GET /api/analisis/kasir?dari=&sampai=&cabang=
   (DashboardController::analisisKasir) — rumus laba sama dengan Laba Rugi:
   Laba = DPP (penjualan dikurangi PPN) − HPP (Kartu HPP).
   Filter tanggal default: hari ini s/d hari ini. Filter cabang ikut dropdown
   cabang global di header ("Semua Cabang" = semua).
   ============================================================= */
window._anKasirFilter = window._anKasirFilter || { dari: '', sampai: '' };

window.setFilterAnKasir = (dari, sampai) => {
    window._anKasirFilter = { dari, sampai };
    renderAnalisisKasir();
};
window.terapkanFilterAnKasir = () => {
    setFilterAnKasir(document.getElementById('anKasirDari').value, document.getElementById('anKasirSampai').value);
};

async function renderAnalisisKasir() {
    const el = document.getElementById('an-kasir');
    if (!window._anKasirFilter.dari) window._anKasirFilter = { dari: today(), sampai: today() };
    const f = window._anKasirFilter;
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const res = await apiGet('/analisis/kasir' + buildQuery({ cabang: cab, dari: f.dari, sampai: f.sampai }));
        const T = res.total || {};
        const lbl = (c) => c || 'Semua Cabang';
        const persen = (laba, dpp) => dpp > 0 ? ((laba / dpp) * 100).toFixed(1) + '%' : '–';
        const lc = (v) => `<span style="color:${v < 0 ? '#b91c1c' : 'inherit'};">${R(v)}</span>`;
        const tdAngka = (z) => `<td class="r">${z.struk.toLocaleString('id-ID')}</td><td class="r">${R(z.penjualan)}</td><td class="r">${R(z.dpp)}</td><td class="r">${R(z.hpp)}</td><td class="r"><strong>${lc(z.laba)}</strong></td><td class="r">${persen(z.laba, z.dpp)}</td>`;

        const kolomHead = '<th class="r">Struk</th><th class="r">Penjualan</th><th class="r">DPP</th><th class="r">HPP</th><th class="r">Laba</th><th class="r">Margin</th>';

        const barisCabang = (res.per_cabang || []).map(c => {
            const shiftRows = c.shift.map(sh => `
                <tr style="background:var(--bg2,#f5f5f2);">
                    <td colspan="1" style="padding-left:18px;"><strong>Shift ${esc(sh.shift)}</strong></td>${tdAngka(sh.total)}
                </tr>
                ${sh.kasir.map(k => `<tr>
                    <td style="padding-left:40px;font-size:12px;">👤 ${esc(k.kasir)}</td>${tdAngka(k)}
                </tr>`).join('')}`).join('');
            return `
                <tr style="background:var(--green-bg,#e8f0ea);">
                    <td><strong>🏬 ${esc(c.cabang)}</strong></td>${tdAngka(c.total)}
                </tr>${shiftRows}`;
        }).join('');

        el.innerHTML = `
        ${exportBar('tblAnKasir', 'analisis-kasir', 'an-kasir', 'Analisis Kasir & Shift')}
        <div class="box" style="margin-bottom:12px;">
            <div class="box-bd" style="display:flex;gap:10px;align-items:flex-end;flex-wrap:wrap;">
                <div class="fgroup" style="margin:0;"><label class="flabel">Dari tanggal</label><input class="finput" type="date" id="anKasirDari" value="${esc(f.dari)}"></div>
                <div class="fgroup" style="margin:0;"><label class="flabel">Sampai tanggal</label><input class="finput" type="date" id="anKasirSampai" value="${esc(f.sampai)}"></div>
                <button class="btn btn-p" onclick="terapkanFilterAnKasir()">Terapkan</button>
                <button class="btn btn-g btn-sm" onclick="setFilterAnKasir(today(), today())">Hari ini</button>
                <button class="btn btn-g btn-sm" onclick="setFilterAnKasir(today().slice(0,8)+'01', today())">Bulan ini</button>
                <span style="font-size:12px;color:var(--ink3);">Cabang: <strong>${esc(lbl(cab))}</strong> (ganti lewat dropdown cabang di atas)</span>
            </div>
        </div>
        ${res.ada_kolom === false ? `<div class="note note-y" style="margin-bottom:12px;"><span>⚠️ Kolom kasir/shift belum ada di database. Jalankan <code>php artisan migrate</code>, lalu import ulang penjualan yang membawa kolom Kasir.</span></div>` : ''}
        <div class="insight-grid">
            <div class="insight-card"><div class="insight-icon">🧾</div><div class="insight-label">Penjualan Total</div><div class="insight-val">${R(T.penjualan || 0)}</div><div class="insight-sub">${(T.struk || 0).toLocaleString('id-ID')} struk · ${(T.baris || 0).toLocaleString('id-ID')} baris</div></div>
            <div class="insight-card"><div class="insight-icon">📉</div><div class="insight-label">HPP Total</div><div class="insight-val">${R(T.hpp || 0)}</div><div class="insight-sub">${T.baris_tanpa_hpp ? `${T.baris_tanpa_hpp} baris belum punya HPP` : 'semua baris punya HPP'}</div></div>
            <div class="insight-card"><div class="insight-icon">💰</div><div class="insight-label">Laba Total</div><div class="insight-val">${lc(T.laba || 0)}</div><div class="insight-sub">Margin ${persen(T.laba || 0, T.dpp || 0)} dari DPP ${R(T.dpp || 0)}</div></div>
        </div>
        ${(res.per_shift || []).length ? `
        <div class="box" style="margin-top:12px;">
            <div class="box-hd"><h3>Total per Shift (semua cabang)</h3><div class="meta">Pagi = akun berakhiran 1 · Siang = berakhiran 2 · Sehari = akun ADM & PSR (sehari penuh)</div></div>
            <div class="box-bd pad0 tscroll"><table>
                <thead><tr><th>Shift</th>${kolomHead}</tr></thead>
                <tbody>${res.per_shift.map(s => `<tr><td><strong>${esc(s.shift)}</strong></td>${tdAngka(s.total)}</tr>`).join('')}</tbody>
            </table></div>
        </div>` : ''}
        <div class="box" style="margin-top:12px;">
            <div class="box-hd"><h3>Per Cabang ▸ Shift ▸ Kasir</h3><div class="meta">Laba = DPP (penjualan − PPN) − HPP, sama dengan Laba Rugi</div></div>
            <div class="box-bd pad0 tscroll">
                ${(res.per_cabang || []).length ? `<table id="tblAnKasir">
                    <thead><tr><th>Cabang / Shift / Kasir</th>${kolomHead}</tr></thead>
                    <tbody>${barisCabang}</tbody>
                    <tfoot><tr><td><strong>TOTAL SEMUA CABANG</strong></td>${tdAngka(T)}</tr></tfoot>
                </table>` : '<div class="empty"><div class="ico">📭</div><strong>Belum ada penjualan pada periode ini.</strong></div>'}
            </div>
        </div>`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
}
window.renderAnalisisKasir = renderAnalisisKasir;
