/* =============================================================
   hutang.js — Hutang Pembelian (bayar / lunasi PER NOTA)
   Daftar nota pembelian Kredit + status Belum / Sebagian / Lunas.
   - 💳 Bayar: bayar sebagian (cicil) atau lunas, per nota
   - Centang beberapa nota → Lunasi sekaligus
   - Setiap pembayaran otomatis masuk Jurnal (Dr Hutang Usaha / Cr Kas)
   ============================================================= */

window._hutangFilter = window._hutangFilter || { status: 'aktif', supplier: '', cabang: '', dari: '', sampai: '', search: '' };
window._hutangData = [];

const _hpStatusBadge = s => ({
    Belum    : '<span class="badge badge-noppn" style="background:#fde8e8;color:#b42318;">⏳ Belum Lunas</span>',
    Sebagian : '<span class="badge badge-noppn" style="background:#fff4d6;color:#a15c00;">◐ Sebagian</span>',
    Lunas    : '<span class="badge badge-ppn">✅ Lunas</span>',
}[s] || esc(s));

const _hpPpnBadge = (st, ov) => `<span class="badge ${st === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}" title="${ov ? 'Di-override khusus transaksi ini' : 'Ikut status di Master Barang'}">${esc(st)}${ov ? ' ✎' : ''}</span>`;

async function renderHutang() {
    const el = document.getElementById('hutang-list');
    const f  = window._hutangFilter;
    const stBtn = (val, label) => `<button class="btn btn-sm ${f.status === val ? 'btn-p' : 'btn-g'}" onclick="setHutangStatus('${val}')">${label}</button>`;
    el.innerHTML = `
    <div id="hpRingkas" class="box" style="margin-bottom:14px;"><div class="box-bd">${loadingHTML}</div></div>
    <div class="box">
        <div class="box-hd" style="flex-wrap:wrap;gap:8px;">
            <h3>Nota Pembelian Kredit</h3>
            <div style="display:flex;gap:6px;flex-wrap:wrap;">
                ${stBtn('aktif', '⏳ Belum Lunas')}${stBtn('belum', 'Belum Bayar')}${stBtn('sebagian', 'Sebagian')}${stBtn('lunas', '✅ Lunas')}${stBtn('semua', 'Semua')}
            </div>
        </div>
        <div class="box-bd" style="padding-bottom:0;">
            <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:10px;">
                <div class="fgroup" style="min-width:170px;"><label class="flabel">Supplier</label>
                    <select class="fselect" id="hpSup" onchange="hutangSetFilter('supplier', this.value)">
                        <option value="">Semua supplier</option>
                        <option value="Umum" ${f.supplier === 'Umum' ? 'selected' : ''}>(Tanpa supplier / Umum)</option>
                        ${(STATE.supplier || []).map(s => `<option value="${esc(s.nama)}" ${f.supplier === s.nama ? 'selected' : ''}>${esc(s.nama)}</option>`).join('')}
                    </select></div>
                <div class="fgroup" style="min-width:140px;"><label class="flabel">Cabang</label>
                    <select class="fselect" id="hpCab" onchange="hutangSetFilter('cabang', this.value)">
                        <option value="">Semua cabang</option>
                        ${(STATE.cabang || []).map(c => `<option value="${esc(c.nama)}" ${f.cabang === c.nama ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}
                    </select></div>
                <div class="fgroup"><label class="flabel">Dari tgl nota</label><input class="finput" type="date" id="hpDari" value="${f.dari}" onchange="hutangSetFilter('dari', this.value)"></div>
                <div class="fgroup"><label class="flabel">Sampai</label><input class="finput" type="date" id="hpSampai" value="${f.sampai}" onchange="hutangSetFilter('sampai', this.value)"></div>
                <div class="fgroup" style="flex:1;min-width:180px;"><label class="flabel">Cari no. nota / supplier</label>
                    <input class="finput" id="hpCari" placeholder="mis. TXB-… atau nama supplier" value="${esc(f.search)}" oninput="hutangCariDebounce(this.value)"></div>
                <button class="btn btn-g btn-sm" onclick="hutangReset()">↺ Reset</button>
            </div>
            <div id="hpBulk" style="display:none;align-items:center;gap:10px;padding:8px 12px;background:var(--grn-s,#e8f6ee);border-radius:8px;margin-bottom:10px;font-size:13px;"></div>
        </div>
        <div class="box-bd pad0 tscroll" id="hpBody">${loadingHTML}</div>
    </div>`;
    await muatHutang();
}
window.renderHutang = renderHutang;

async function muatHutang() {
    const f = window._hutangFilter;
    const body = document.getElementById('hpBody');
    const ring = document.getElementById('hpRingkas');
    if (!body) return;
    try {
        const res = await apiGet('/hutang' + buildQuery(f));
        const list = res.data || [];
        const rk = res.ringkasan || {};
        const kp = rk.ppn || {}, np = rk.non_ppn || {};
        window._hutangData = list;

        ring.innerHTML = `<div class="box-bd" style="display:flex;gap:28px;flex-wrap:wrap;">
            <div><div class="meta">Total Nota Kredit</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${R(rk.total || 0)}</div></div>
            <div><div class="meta">Sudah Dibayar</div><div class="laba-pos" style="font-size:20px;font-weight:600;">${R(rk.dibayar || 0)}</div></div>
            <div><div class="meta">Sisa Hutang</div><div class="laba-neg" style="font-size:20px;font-weight:600;">${R(rk.sisa || 0)}</div></div>
            <div><div class="meta">Belum bayar</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${rk.nota_belum || 0} nota</div></div>
            <div><div class="meta">Sebagian</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${rk.nota_sebagian || 0} nota</div></div>
            <div><div class="meta">Lunas</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${rk.nota_lunas || 0} nota</div></div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px;padding:0 14px 14px;">
            <div style="border:1px solid var(--line,#e3e6ea);border-radius:10px;padding:10px 14px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span class="badge badge-ppn">Kena PPN</span><span class="meta">barang berPPN</span></div>
                <div style="display:flex;gap:18px;flex-wrap:wrap;">
                    <div><div class="meta">Total</div><div style="font-family:var(--F-m);font-weight:600;">${R(kp.total || 0)}</div></div>
                    <div><div class="meta">Dibayar</div><div class="laba-pos" style="font-weight:600;">${R(kp.dibayar || 0)}</div></div>
                    <div><div class="meta">Sisa hutang</div><div class="laba-neg" style="font-weight:700;">${R(kp.sisa || 0)}</div></div>
                </div>
                <div class="meta" style="margin-top:6px;">di dalam sisa ini ada PPN Masukan ± <strong>${R(kp.ppn_masukan_sisa || 0)}</strong> · DPP ± ${R((kp.sisa || 0) - (kp.ppn_masukan_sisa || 0))}</div>
            </div>
            <div style="border:1px solid var(--line,#e3e6ea);border-radius:10px;padding:10px 14px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;"><span class="badge badge-noppn">Non-PPN</span><span class="meta">tanpa PPN (mis. rokok / beli di toko non-PKP)</span></div>
                <div style="display:flex;gap:18px;flex-wrap:wrap;">
                    <div><div class="meta">Total</div><div style="font-family:var(--F-m);font-weight:600;">${R(np.total || 0)}</div></div>
                    <div><div class="meta">Dibayar</div><div class="laba-pos" style="font-weight:600;">${R(np.dibayar || 0)}</div></div>
                    <div><div class="meta">Sisa hutang</div><div class="laba-neg" style="font-weight:700;">${R(np.sisa || 0)}</div></div>
                </div>
            </div>
        </div>
        ${res.migrasi_ada === false ? `<div class="note note-y" style="margin:0 14px 14px;"><span>⚠️ Tabel pelunasan belum ada. Jalankan <code>php artisan migrate</code> di server, lalu muat ulang halaman ini.</span></div>` : ''}`;

        if (!list.length) {
            body.innerHTML = `<div class="empty-state" style="padding:30px;text-align:center;color:var(--ink3);">Tidak ada nota pada filter ini.${f.status === 'aktif' ? ' 🎉 Semua hutang sudah lunas.' : ''}</div>`;
            hutangHitungPilih();
            return;
        }
        body.innerHTML = `
        <table id="tblHutang">
            <thead><tr>
                <th style="width:28px;"><input type="checkbox" id="hpChkAll" onclick="hutangPilihSemua(this.checked)" title="Pilih semua nota yang belum lunas di daftar ini"></th>
                <th>No. Nota</th><th>Tgl Nota</th><th class="r">Umur</th><th>Supplier</th><th>Cabang</th>
                <th class="r">Total</th><th class="r">Dibayar</th><th class="r">Sisa</th><th class="r" title="Sisa hutang untuk barang Kena PPN (sudah termasuk PPN Masukan)">Sisa Kena PPN</th><th class="r" title="Sisa hutang untuk barang Non-PPN">Sisa Non-PPN</th><th>Status</th><th></th>
            </tr></thead>
            <tbody>${list.map((n, i) => `
            <tr class="row-click" onclick="hutangDetail(${i})" title="Klik untuk lihat rincian barang & riwayat pembayaran">
                <td onclick="event.stopPropagation()">${n.status !== 'Lunas' ? `<input type="checkbox" class="hpChk" value="${i}" onclick="event.stopPropagation();hutangHitungPilih()">` : ''}</td>
                <td style="font-family:var(--F-m);font-size:11px;">${esc(n.no_nota)}</td>
                <td>${fmtTgl(n.tgl)}</td>
                <td class="r" style="${n.status !== 'Lunas' && n.umur > 30 ? 'color:var(--red);font-weight:600;' : 'color:var(--ink3);'}">${n.status !== 'Lunas' ? n.umur + ' hr' : '–'}</td>
                <td>${n.supplier ? esc(n.supplier) : '<span style="color:var(--ink3);">(Umum)</span>'}</td>
                <td style="font-size:12px;">${esc(n.cabang)}</td>
                <td class="r">${R(n.total)}</td>
                <td class="r laba-pos">${n.dibayar ? R(n.dibayar) : '–'}</td>
                <td class="r ${n.sisa ? 'laba-neg' : ''}" style="font-weight:600;">${n.sisa ? R(n.sisa) : '–'}</td>
                <td class="r" style="font-size:12px;">${n.sisa_ppn ? R(n.sisa_ppn) : '–'}</td>
                <td class="r" style="font-size:12px;">${n.sisa_non ? R(n.sisa_non) : '–'}</td>
                <td>${_hpStatusBadge(n.status)}</td>
                <td onclick="event.stopPropagation()" style="white-space:nowrap;">
                    ${n.status !== 'Lunas' ? `<button class="btn btn-p btn-sm" onclick="hutangBayar(${i})">💳 Bayar</button>` : ''}
                </td>
            </tr>`).join('')}</tbody>
        </table>
        ${res.dibatasi ? `<div class="note note-y" style="margin:10px 14px;"><span>ℹ️ Ditampilkan 500 nota pertama dari ${res.dibatasi}. Persempit dengan filter supplier/tanggal.</span></div>` : ''}`;
        hutangHitungPilih();
    } catch (err) {
        body.innerHTML = `<div class="note note-y" style="margin:14px;"><span>⚠️ Gagal memuat: ${esc(err.message)}</span></div>`;
    }
}

/* ── FILTER ─────────────────────────────────────────────── */
window.setHutangStatus = st => { window._hutangFilter.status = st; renderHutang(); };
window.hutangSetFilter = (k, v) => { window._hutangFilter[k] = v; muatHutang(); };
let _hpTimer = null;
window.hutangCariDebounce = v => {
    window._hutangFilter.search = v.trim();
    clearTimeout(_hpTimer);
    _hpTimer = setTimeout(muatHutang, 350);
};
window.hutangReset = () => {
    window._hutangFilter = { status: 'aktif', supplier: '', cabang: '', dari: '', sampai: '', search: '' };
    renderHutang();
};
/** Dipanggil dari Kontak ▸ Supplier: buka menu Hutang Pembelian untuk supplier itu. */
window.bukaHutangSupplier = async nama => {
    window._hutangFilter = { status: 'aktif', supplier: nama, cabang: '', dari: '', sampai: '', search: '' };
    if (typeof closeM === 'function') closeM();
    await setTab('hutang');
};

/* ── PILIH BANYAK NOTA ──────────────────────────────────── */
function _hpDipilih() {
    return [...document.querySelectorAll('.hpChk:checked')].map(c => window._hutangData[parseInt(c.value)]).filter(Boolean);
}
window.hutangPilihSemua = on => { document.querySelectorAll('.hpChk').forEach(c => { c.checked = on; }); hutangHitungPilih(); };
window.hutangHitungPilih = () => {
    const bar = document.getElementById('hpBulk');
    if (!bar) return;
    const pilih = _hpDipilih();
    if (!pilih.length) { bar.style.display = 'none'; return; }
    const total = pilih.reduce((a, n) => a + n.sisa, 0);
    bar.style.display = 'flex';
    bar.innerHTML = `<span><strong>${pilih.length}</strong> nota dipilih · sisa hutang <strong>${R(total)}</strong></span>
        <button class="btn btn-p btn-sm" onclick="hutangBayarBanyak()">✅ Lunasi ${pilih.length} nota sekaligus</button>
        <button class="btn btn-g btn-sm" onclick="hutangPilihSemua(false);document.getElementById('hpChkAll').checked=false;">Batal pilih</button>`;
};

/* ── BAYAR 1 NOTA ───────────────────────────────────────── */
window.hutangBayar = i => {
    const n = window._hutangData[i];
    if (!n) return;
    openM(`
    <div class="mhd"><h3>💳 Bayar Hutang — ${esc(n.no_nota)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div style="display:flex;gap:18px;flex-wrap:wrap;padding:10px 12px;background:var(--bg2,#f7f7f9);border-radius:8px;margin-bottom:12px;">
            <div><div class="meta">Supplier</div><div>${n.supplier ? esc(n.supplier) : '(Umum)'}</div></div>
            <div><div class="meta">Total Nota</div><div style="font-family:var(--F-m);">${R(n.total)}</div></div>
            <div><div class="meta">Sudah Dibayar</div><div class="laba-pos">${R(n.dibayar)}</div></div>
            <div><div class="meta">Sisa Hutang</div><div class="laba-neg" style="font-weight:700;">${R(n.sisa)}</div></div>
        </div>
        <div class="fgrid col2">
            <div class="fgroup"><label class="flabel">Tanggal Bayar *</label><input class="finput" type="date" id="hbTgl" value="${today()}"></div>
            <div class="fgroup"><label class="flabel">Dibayar dari Kas/Bank *</label><select class="fselect" id="hbKas">${kasOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Jumlah Bayar (Rp) *</label>
                <input class="finput" type="number" id="hbNom" min="1" max="${n.sisa}" value="${n.sisa}">
                <span class="fhint"><a href="#" onclick="document.getElementById('hbNom').value=${n.sisa};return false;">Isi sisa penuh (lunas)</a> · kurangi angkanya untuk bayar sebagian / cicil</span></div>
            <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="hbKet" placeholder="mis. transfer BCA / bayar ke sales"></div>
        </div>
        <div class="meta" style="margin-bottom:8px;">Sisa: <span class="badge badge-ppn">Kena PPN</span> <strong>${R(n.sisa_ppn || 0)}</strong> &nbsp;·&nbsp; <span class="badge badge-noppn">Non-PPN</span> <strong>${R(n.sisa_non || 0)}</strong> — cicilan dibagi proporsional ke kedua porsi ini.</div>
        <div class="note note-b" style="margin-top:10px;"><span>ℹ️ Otomatis dijurnal: Dr Hutang Usaha, Cr Kas/Bank yang dipilih (cabang ${esc(n.cabang)}).</span></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="hbOk" onclick="hutangSimpanBayar(${i})">Simpan Pembayaran</button>
    </div>`);
};

window.hutangSimpanBayar = async i => {
    const n = window._hutangData[i];
    const nominal = parseFloat(document.getElementById('hbNom').value) || 0;
    const kas = document.getElementById('hbKas').value;
    if (nominal <= 0) { toast('Isi jumlah bayar', 'err'); return; }
    if (!kas) { toast('Pilih akun Kas/Bank', 'err'); return; }
    const btn = document.getElementById('hbOk'); btn.disabled = true;
    try {
        const res = await apiPost('/hutang/bayar', {
            no_nota: n.no_nota, tgl: document.getElementById('hbTgl').value, nominal, kode_kas: kas,
            keterangan: document.getElementById('hbKet').value.trim() || null,
        });
        toast('✅ ' + (res.message || 'Tersimpan'));
        closeM();
        await muatHutang();
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
};

/* ── LUNASI BANYAK NOTA ─────────────────────────────────── */
window.hutangBayarBanyak = () => {
    const pilih = _hpDipilih();
    if (!pilih.length) return;
    const total = pilih.reduce((a, n) => a + n.sisa, 0);
    window._hpBanyak = pilih.map(n => n.no_nota);
    openM(`
    <div class="mhd"><h3>✅ Lunasi ${pilih.length} Nota Sekaligus</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="tscroll" style="max-height:200px;overflow-y:auto;margin-bottom:10px;">
            <table><thead><tr><th>No. Nota</th><th>Supplier</th><th class="r">Sisa</th></tr></thead>
            <tbody>${pilih.map(n => `<tr><td style="font-family:var(--F-m);font-size:11px;">${esc(n.no_nota)}</td><td>${n.supplier ? esc(n.supplier) : '(Umum)'}</td><td class="r">${R(n.sisa)}</td></tr>`).join('')}
            <tr><td colspan="2"><strong>Total dibayar</strong></td><td class="r"><strong>${R(total)}</strong></td></tr></tbody></table>
        </div>
        <div class="fgrid col2">
            <div class="fgroup"><label class="flabel">Tanggal Bayar *</label><input class="finput" type="date" id="hbTgl" value="${today()}"></div>
            <div class="fgroup"><label class="flabel">Dibayar dari Kas/Bank *</label><select class="fselect" id="hbKas">${kasOpts()}</select></div>
            <div class="fgroup" style="grid-column:1/-1;"><label class="flabel">Keterangan</label><input class="finput" id="hbKet" placeholder="opsional"></div>
        </div>
        <div class="note note-y" style="margin-top:10px;"><span>⚠️ Setiap nota dilunasi sebesar sisanya. Salah input? Buka rincian nota lalu batalkan pembayarannya.</span></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="hbOk" onclick="hutangSimpanBanyak()">Lunasi Semua</button>
    </div>`);
};

window.hutangSimpanBanyak = async () => {
    const kas = document.getElementById('hbKas').value;
    if (!kas) { toast('Pilih akun Kas/Bank', 'err'); return; }
    const btn = document.getElementById('hbOk'); btn.disabled = true;
    try {
        const res = await apiPost('/hutang/bayar-banyak', {
            notas: window._hpBanyak || [], tgl: document.getElementById('hbTgl').value, kode_kas: kas,
            keterangan: document.getElementById('hbKet').value.trim() || null,
        });
        toast('✅ ' + (res.message || 'Tersimpan'));
        closeM();
        await muatHutang();
    } catch (err) { toast(err.message, 'err'); btn.disabled = false; }
};

/* ── RINCIAN NOTA + RIWAYAT BAYAR ───────────────────────── */
window.hutangDetail = async i => {
    const n = window._hutangData[i];
    if (!n) return;
    openM(`<div class="mhd"><h3>🧾 ${esc(n.no_nota)}</h3><button class="mclose" onclick="closeM()">×</button></div><div class="mbd">${loadingHTML}</div>`);
    try {
        const res = await apiGet('/hutang/detail?no_nota=' + encodeURIComponent(n.no_nota));
        const bayar = res.pembayaran || [];
        document.querySelector('.mbd').innerHTML = `
        <div style="display:flex;gap:18px;flex-wrap:wrap;margin-bottom:10px;">
            <div><div class="meta">Supplier</div>${n.supplier ? esc(n.supplier) : '(Umum)'}</div>
            <div><div class="meta">Tgl Nota</div>${fmtTgl(n.tgl)}</div>
            <div><div class="meta">Cabang</div>${esc(n.cabang)}</div>
            <div><div class="meta">Status</div>${_hpStatusBadge(n.status)}</div>
            <div><div class="meta">Sisa</div><span class="${n.sisa ? 'laba-neg' : ''}" style="font-weight:700;">${n.sisa ? R(n.sisa) : 'Lunas'}</span></div>
        </div>
        <h4 style="margin:10px 0 6px;">Barang (${(res.barang || []).length})</h4>
        <div class="tscroll" style="max-height:200px;overflow-y:auto;"><table>
            <thead><tr><th>Barang</th><th>PPN</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Subtotal</th></tr></thead>
            <tbody>${(res.barang || []).map(b => `<tr><td>${esc(b.nama)}</td><td>${_hpPpnBadge(b.ppn, b.override)}</td><td class="r">${b.qty} ${esc(b.satuan || '')}</td><td class="r">${R(b.harga)}</td><td class="r">${R(b.subtotal)}</td></tr>`).join('')}
            <tr><td colspan="4"><strong>Total</strong></td><td class="r"><strong>${R(n.total)}</strong></td></tr></tbody></table></div>
        <h4 style="margin:14px 0 6px;">Rincian PPN / Non-PPN</h4>
        <table><thead><tr><th></th><th class="r">Total</th><th class="r">Dibayar</th><th class="r">Sisa</th></tr></thead><tbody>
            <tr><td><span class="badge badge-ppn">Kena PPN</span> <span class="meta">(DPP ${R(n.dpp_ppn)} + PPN Masukan ${R(n.ppn_masukan)})</span></td><td class="r">${R(n.total_ppn)}</td><td class="r">${R(n.dibayar_ppn)}</td><td class="r ${n.sisa_ppn ? 'laba-neg' : ''}">${R(n.sisa_ppn)}</td></tr>
            <tr><td><span class="badge badge-noppn">Non-PPN</span></td><td class="r">${R(n.total_non)}</td><td class="r">${R(n.dibayar_non)}</td><td class="r ${n.sisa_non ? 'laba-neg' : ''}">${R(n.sisa_non)}</td></tr>
        </tbody></table>
        <div class="meta" style="margin-top:6px;">Salah status PPN di satu baris (mis. barang berPPN dibeli di toko tanpa PPN)? Ubah di Transaksi ▸ Pembelian (kolom PPN baris tsb → Non-PPN); saldo di sini ikut berubah otomatis.</div>
        <h4 style="margin:14px 0 6px;">Riwayat Pembayaran</h4>
        ${bayar.length ? `<table><thead><tr><th>Tgl</th><th>No. Bayar</th><th>Kas</th><th>Keterangan</th><th class="r">Nominal</th><th class="r">Porsi PPN</th><th class="r">Porsi Non-PPN</th><th></th></tr></thead>
            <tbody>${bayar.map(b => `<tr><td>${fmtTgl(b.tgl)}</td><td style="font-family:var(--F-m);font-size:11px;">${esc(b.no_bayar)}</td><td>${esc(b.kode_kas)}</td><td>${esc(b.keterangan || '')}</td>
                <td class="r">${R(b.nominal)}</td><td class="r" style="font-size:12px;">${b.porsi_ppn != null ? R(b.porsi_ppn) : '<span class="meta" title="Pembayaran lama — dibagi proporsional otomatis">auto</span>'}</td><td class="r" style="font-size:12px;">${b.porsi_non_ppn != null ? R(b.porsi_non_ppn) : '<span class="meta">auto</span>'}</td><td><button class="row-del" title="Batalkan pembayaran ini" onclick="hutangBatalBayar(${b.id})">✕</button></td></tr>`).join('')}</tbody></table>`
            : '<div style="color:var(--ink3);font-size:13px;">Belum ada pembayaran.</div>'}`;
    } catch (err) {
        document.querySelector('.mbd').innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

window.hutangBatalBayar = async id => {
    const ok = await confirmDialog('Batalkan pembayaran ini? Nota akan kembali berhutang dan jurnal pembayarannya ikut hilang.', { title: 'Batalkan Pembayaran', okText: 'Ya, batalkan' });
    if (!ok) return;
    try {
        const res = await apiDel('/hutang/bayar/' + id);
        toast(res.message || 'Dibatalkan');
        closeM();
        await muatHutang();
    } catch (err) { toast(err.message, 'err'); }
};
