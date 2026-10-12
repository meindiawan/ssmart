/* =============================================================
   aset.js — Aset Tetap (Fixed Assets)
   Daftar aset, form tambah/edit, nonaktifkan (dijual/dihapus),
   dan drill-down Jadwal Penyusutan per aset. Perolehan &
   penyusutan bulanan otomatis masuk Jurnal — lihat
   App\Services\AsetPenyusutanService (backend) untuk mesin hitungnya.
   ============================================================= */

const ASET_KATEGORI = ['Kendaraan', 'Peralatan Toko', 'Elektronik', 'Perabotan', 'Bangunan', 'Lainnya'];

window._asetFilter = window._asetFilter || { status: '', cabang: '', search: '' };

async function renderAset() {
    const el = document.getElementById('aset-body');
    el.innerHTML = loadingHTML;
    try {
        const f = window._asetFilter;
        const [sum, res] = await Promise.all([
            apiGet('/aset/summary' + buildQuery({ cabang: f.cabang })),
            apiGet('/aset' + buildQuery({ status: f.status, cabang: f.cabang, search: f.search })),
        ]);
        const list = res.data || [];

        el.innerHTML = `
        <div class="box" style="margin-bottom:14px;">
            <div class="box-bd" style="display:flex;gap:24px;flex-wrap:wrap;">
                <div><div class="meta">Jumlah Aset</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${sum.jumlah_aset || 0}</div></div>
                <div><div class="meta">Aset Aktif</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${sum.jumlah_aktif || 0}</div></div>
                <div><div class="meta">Total Nilai Perolehan</div><div style="font-size:20px;font-weight:600;">${R(sum.total_nilai_perolehan || 0)}</div></div>
                <div><div class="meta">Akumulasi Penyusutan</div><div class="laba-neg" style="font-size:20px;font-weight:600;">${R(sum.total_akumulasi || 0)}</div></div>
                <div><div class="meta">Nilai Buku Saat Ini</div><div class="laba-pos" style="font-size:20px;font-weight:600;">${R(sum.total_nilai_buku || 0)}</div></div>
            </div>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>Daftar Aset Tetap</h3>
                <button class="btn btn-p btn-sm" onclick="bukaFormAset()">+ Tambah Aset</button>
            </div>
            <div class="box-bd">
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
                    <select class="fselect" style="max-width:160px;" onchange="window._asetFilter.status=this.value;renderAset();">
                        <option value="" ${!f.status ? 'selected' : ''}>Semua Status</option>
                        <option value="Aktif" ${f.status === 'Aktif' ? 'selected' : ''}>Aktif</option>
                        <option value="Dijual" ${f.status === 'Dijual' ? 'selected' : ''}>Dijual</option>
                        <option value="Dihapus" ${f.status === 'Dihapus' ? 'selected' : ''}>Dihapus</option>
                    </select>
                    <select class="fselect" style="max-width:200px;" onchange="window._asetFilter.cabang=this.value;renderAset();">
                        <option value="">Semua Cabang</option>
                        ${STATE.cabang.map(c => `<option value="${esc(c.nama)}" ${f.cabang === c.nama ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}
                    </select>
                    <input class="finput" id="srchAset" style="max-width:220px;margin-left:auto;" placeholder="Cari nama/kode…" value="${esc(f.search)}" oninput="smartSearch('srchAset', this.value, v => { window._asetFilter.search = v; }, renderAset)">
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblAset">
                    <thead><tr>
                        <th>Kode</th><th>Nama</th><th>Kategori</th><th>Cabang</th>
                        <th>Tgl Perolehan</th><th class="r">Nilai Perolehan</th>
                        <th class="r">Akm. Penyusutan</th><th class="r">Nilai Buku</th>
                        <th>Status</th><th></th>
                    </tr></thead>
                    <tbody>${list.map(a => `
                    <tr>
                        <td style="font-family:var(--F-m);font-size:12px;">${esc(a.kode)}</td>
                        <td><strong class="row-click" onclick="bukaJadwalAset(${a.id})" title="Klik untuk lihat jadwal penyusutan">${esc(a.nama)}</strong></td>
                        <td>${esc(a.kategori)}</td>
                        <td>${esc(a.cabang || '–')}</td>
                        <td>${fmtTgl(a.tgl_perolehan)}</td>
                        <td class="r">${R(a.nilai_perolehan)}</td>
                        <td class="r laba-neg">${R(a.akumulasi_penyusutan)}</td>
                        <td class="r" style="font-weight:600;">${R(a.nilai_buku)}</td>
                        <td><span class="badge ${a.status === 'Aktif' ? 'badge-info' : 'badge-warn'}">${esc(a.status)}</span></td>
                        <td style="white-space:nowrap;">
                            <button class="btn btn-g btn-sm" onclick="bukaJadwalAset(${a.id})" title="Jadwal Penyusutan">📅</button>
                            ${a.status === 'Aktif' ? `
                            <button class="btn btn-g btn-sm" onclick="bukaFormAset(${a.id})" title="Edit">✎</button>
                            <button class="btn btn-g btn-sm" onclick="bukaNonaktifkanAset(${a.id})" title="Dijual/Dihapus">🗃️</button>
                            ` : `
                            <button class="btn btn-g btn-sm" onclick="aktifkanAset(${a.id})" title="Aktifkan Kembali">↺</button>
                            `}
                            <button class="row-del" onclick="hapusAset(${a.id})" title="Hapus">✕</button>
                        </td>
                    </tr>`).join('')}</tbody>
                </table>`
                : `<div class="empty"><div class="ico">🏢</div><strong>Belum ada aset tetap.</strong><br>Klik "+ Tambah Aset" untuk mendaftarkan kendaraan, peralatan toko, elektronik, dsb.</div>`}
            </div>
        </div>`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── FORM TAMBAH / EDIT ───────────────────────────────────── */
window.bukaFormAset = async (id = null) => {
    let a = null;
    if (id) {
        try { a = (await apiGet('/aset')).data.find(x => x.id === id); } catch (_) {}
    }
    const isEdit = !!a;

    openM(`
    <div class="mhd"><h3>${isEdit ? '✎ Edit Aset' : '+ Tambah Aset Tetap'}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <form id="fAset">
            <div class="fgrid">
                <div class="fgroup" style="grid-column:1/-1;">
                    <label class="flabel">Nama Aset</label>
                    <input class="finput" id="atNama" required placeholder="Motor Honda Beat Toko Pusat" value="${esc(a?.nama || '')}">
                </div>
                <div class="fgroup">
                    <label class="flabel">Kategori</label>
                    <select class="fselect" id="atKategori">
                        ${ASET_KATEGORI.map(k => `<option value="${k}" ${a?.kategori === k ? 'selected' : ''}>${k}</option>`).join('')}
                    </select>
                </div>
                <div class="fgroup">
                    <label class="flabel">Cabang</label>
                    <select class="fselect" id="atCabang">${cabangOpts(a?.cabang || '')}</select>
                </div>
                <div class="fgroup">
                    <label class="flabel">Tanggal Perolehan</label>
                    <input class="finput" type="date" id="atTgl" required value="${a?.tgl_perolehan || today()}">
                </div>
                <div class="fgroup">
                    <label class="flabel">Umur Manfaat (bulan)</label>
                    <input class="finput" type="number" min="1" id="atUmur" required placeholder="48" value="${a?.umur_manfaat_bulan || ''}">
                </div>
                <div class="fgroup">
                    <label class="flabel">Nilai Perolehan (Rp)</label>
                    <input class="finput" inputmode="numeric" id="atNilai" required placeholder="0" oninput="onMoneyInput(this)" value="${a ? fmtRibuan(a.nilai_perolehan) : ''}">
                </div>
                <div class="fgroup">
                    <label class="flabel">Nilai Residu (Rp)</label>
                    <input class="finput" inputmode="numeric" id="atResidu" placeholder="0" oninput="onMoneyInput(this)" value="${a ? fmtRibuan(a.nilai_residu) : ''}">
                </div>
                <div class="fgroup">
                    <label class="flabel">Dibayar Dengan</label>
                    <select class="fselect" id="atBayar" onchange="document.getElementById('atKasWrap').style.display = this.value==='Tunai' ? '' : 'none';">
                        <option value="Tunai" ${(!a || a?.bayar === 'Tunai') ? 'selected' : ''}>Tunai</option>
                        <option value="Kredit" ${a?.bayar === 'Kredit' ? 'selected' : ''}>Kredit (Hutang Usaha)</option>
                    </select>
                </div>
                <div class="fgroup" id="atKasWrap" style="display:${a?.bayar === 'Kredit' ? 'none' : ''};">
                    <label class="flabel">Kode Kas</label>
                    <select class="fselect" id="atKodeKas">${kasOpts(a?.kode_kas || '')}</select>
                </div>
                <div class="fgroup" style="grid-column:1/-1;">
                    <label class="flabel">Keterangan (opsional)</label>
                    <textarea class="finput" id="atKet" rows="2" placeholder="Nomor rangka/plat, lokasi, dsb.">${esc(a?.keterangan || '')}</textarea>
                </div>
            </div>
            <div class="note note-b" style="margin:10px 0;"><span>ℹ️</span><span>Penyusutan dihitung otomatis metode garis lurus, mulai bulan berikutnya setelah tanggal perolehan, dan langsung masuk Jurnal (akun 1201/1202/6106) setiap bulan.</span></div>
            <button class="btn btn-p" type="submit">${isEdit ? 'Simpan Perubahan' : '+ Simpan Aset'}</button>
        </form>
    </div>`);

    document.getElementById('fAset').onsubmit = async e => {
        e.preventDefault();
        const bayar = document.getElementById('atBayar').value;
        try {
            const payload = {
                nama              : document.getElementById('atNama').value.trim(),
                kategori          : document.getElementById('atKategori').value,
                cabang            : document.getElementById('atCabang').value || null,
                tgl_perolehan     : document.getElementById('atTgl').value,
                nilai_perolehan   : parseRibuan(document.getElementById('atNilai').value),
                nilai_residu      : parseRibuan(document.getElementById('atResidu').value),
                umur_manfaat_bulan: parseInt(document.getElementById('atUmur').value, 10),
                bayar,
                kode_kas          : bayar === 'Tunai' ? (document.getElementById('atKodeKas').value || null) : null,
                keterangan        : document.getElementById('atKet').value.trim() || null,
            };
            if (isEdit) await apiPut('/aset/' + a.id, payload);
            else await apiPost('/aset', payload);
            toast(isEdit ? 'Aset diperbarui' : 'Aset ditambahkan');
            closeM();
            await renderAset();
        } catch (err) { toast(err.message, 'err'); }
    };
};

/* ── HAPUS ─────────────────────────────────────────────────── */
window.hapusAset = async id => {
    if (!(await confirmDialog('Hapus aset ini? Jurnal perolehan & penyusutannya akan ikut hilang dari pembukuan.'))) return;
    try {
        await apiDel('/aset/' + id);
        toast('Aset dihapus', 'y');
        await renderAset();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── NONAKTIFKAN (Dijual / Dihapus) ───────────────────────────── */
window.bukaNonaktifkanAset = (id) => {
    openM(`
    <div class="mhd"><h3>🗃️ Nonaktifkan Aset</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <form id="fAtStop">
            <div class="note note-y" style="margin-bottom:10px;"><span>⚠️</span><span>Penyusutan akan berhenti dihitung setelah tanggal yang dipilih. Aset tetap tercatat di riwayat & Jurnal (tidak dihapus).</span></div>
            <div class="fgrid">
                <div class="fgroup">
                    <label class="flabel">Status Baru</label>
                    <select class="fselect" id="atStatus">
                        <option value="Dijual">Dijual</option>
                        <option value="Dihapus">Dihapus / Rusak</option>
                    </select>
                </div>
                <div class="fgroup">
                    <label class="flabel">Tanggal</label>
                    <input class="finput" type="date" id="atTglStop" required value="${today()}">
                </div>
                <div class="fgroup" style="grid-column:1/-1;">
                    <label class="flabel">Keterangan (opsional)</label>
                    <input class="finput" id="atKetStop" placeholder="Dijual ke ..., harga jual Rp ...">
                </div>
            </div>
            <button class="btn btn-p" type="submit">Simpan</button>
        </form>
    </div>`);

    document.getElementById('fAtStop').onsubmit = async e => {
        e.preventDefault();
        try {
            await apiPost(`/aset/${id}/nonaktifkan`, {
                status    : document.getElementById('atStatus').value,
                tgl_stop  : document.getElementById('atTglStop').value,
                keterangan: document.getElementById('atKetStop').value.trim() || null,
            });
            toast('Status aset diperbarui', 'y');
            closeM();
            await renderAset();
        } catch (err) { toast(err.message, 'err'); }
    };
};

window.aktifkanAset = async id => {
    if (!(await confirmDialog('Aktifkan kembali aset ini? Penyusutan akan lanjut dihitung dari bulan berjalan.', { okText: 'Aktifkan', danger: false }))) return;
    try {
        await apiPost(`/aset/${id}/aktifkan`, {});
        toast('Aset diaktifkan kembali');
        await renderAset();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── JADWAL PENYUSUTAN (drill-down) ───────────────────────────── */
window.bukaJadwalAset = async (id) => {
    openM(`<div class="mhd"><h3>📅 Jadwal Penyusutan</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" id="asetJadwalBody"><div class="loading-state"><div class="loading-spinner"></div><p>Memuat jadwal…</p></div></div>`);

    try {
        const res = await apiGet(`/aset/${id}/jadwal`);
        const { aset, jadwal, ringkasan } = res;
        const body = document.getElementById('asetJadwalBody');
        if (!body) return;

        body.innerHTML = `
        <div class="note note-b" style="margin-bottom:10px;">
            <span>ℹ️</span><span><strong>${esc(aset.nama)}</strong> (${esc(aset.kode)}) — ${esc(aset.kategori)}${aset.cabang ? ' · ' + esc(aset.cabang) : ''}<br>
            Perolehan ${fmtTgl(aset.tgl_perolehan)} sebesar ${R(aset.nilai_perolehan)}, umur manfaat ${aset.umur_manfaat_bulan} bulan, nilai residu ${R(aset.nilai_residu)}.</span>
        </div>
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:14px;">
            <div><div class="meta">Sudah Disusutkan</div><div style="font-weight:600;">${ringkasan.bulan_berjalan} bulan</div></div>
            <div><div class="meta">Akumulasi Penyusutan</div><div class="laba-neg" style="font-weight:600;">${R(ringkasan.akumulasi_penyusutan)}</div></div>
            <div><div class="meta">Nilai Buku Saat Ini</div><div class="laba-pos" style="font-weight:600;">${R(ringkasan.nilai_buku)}</div></div>
            ${ringkasan.selesai_disusutkan ? '<div><div class="meta">Status</div><div style="font-weight:600;">✓ Selesai disusutkan</div></div>' : ''}
        </div>
        ${jadwal.length ? `
        <div class="tscroll" style="max-height:360px;overflow-y:auto;">
        <table>
            <thead><tr><th>Periode</th><th class="r">Penyusutan</th><th class="r">Akumulasi</th><th class="r">Nilai Buku</th><th></th></tr></thead>
            <tbody>${jadwal.map(j => `
            <tr>
                <td>${monthLabel(j.periode)}</td>
                <td class="r">${R(j.nilai)}</td>
                <td class="r">${R(j.akumulasi)}</td>
                <td class="r">${R(j.nilai_buku)}</td>
                <td><button class="btn btn-g btn-sm" onclick="bukaBentukanRef('PYST-${aset.id}-${j.periode.replace('-','')}')" title="Lihat di Jurnal">📓</button></td>
            </tr>`).join('')}</tbody>
        </table>
        </div>`
        : '<div class="empty"><div class="ico">📅</div>Belum ada bulan penyusutan berjalan (baru mulai bulan depan setelah tanggal perolehan).</div>'}
        `;
    } catch (err) {
        const body = document.getElementById('asetJadwalBody');
        if (body) body.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};
