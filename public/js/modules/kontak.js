/* =============================================================
   kontak.js — Buku Alamat Terpadu (Kontak)
   Menyatukan Karyawan, Pelanggan, Supplier, & kontak bebas
   "Lainnya" dalam satu daftar yang bisa diklik untuk melihat
   riwayat hutang/piutang/kurang bayar masing-masing.
   ============================================================= */

window._kontakFilter = window._kontakFilter || { tipe: '', search: '' };

async function renderKontak() {
    const el = document.getElementById('kontak-list');
    const _tok = beginSearchRender('srchKontak'); // lihat catatan di helpers.js
    if (!el.innerHTML.trim()) el.innerHTML = loadingHTML;
    try {
        const f = window._kontakFilter;
        const res = await apiGet('/kontak' + buildQuery({ tipe: f.tipe, search: f.search }));
        if (!isSearchStillCurrent('srchKontak', _tok)) return;
        const list = res.data || [];
        const rk   = res.ringkasan || {};

        const tipeIcon = { Karyawan: '👤', Pelanggan: '🧑‍🤝‍🧑', Supplier: '🚚', Lainnya: '📇' };
        const tipeBtn = (val, label) => `<button class="btn btn-sm ${f.tipe === val ? 'btn-p' : 'btn-g'}" onclick="setKontakTipe('${val}')">${label}</button>`;

        el.innerHTML = `
        <div class="box" style="margin-bottom:14px;">
            <div class="box-bd" style="display:flex;gap:24px;flex-wrap:wrap;">
                <div><div class="meta">Total Kontak</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${rk.total_kontak || 0}</div></div>
                <div><div class="meta">Total Piutang</div><div class="laba-pos" style="font-size:20px;font-weight:600;">${R(rk.total_piutang || 0)}</div></div>
                <div><div class="meta">Total Hutang</div><div class="laba-neg" style="font-size:20px;font-weight:600;">${R(rk.total_hutang || 0)}</div></div>
                <div><div class="meta">Belum Lunas</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${rk.kurang_bayar || 0} kontak</div></div>
                <div><div class="meta">Total Pembelian Pelanggan</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${R(rk.total_pembelian || 0)}</div></div>
                <div><div class="meta">Total Pembelian dari Supplier</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${R(rk.total_pembelian_supplier || 0)}</div></div>
            </div>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>Daftar Kontak</h3>
                <button class="btn btn-p btn-sm" onclick="bukaTambahKontakLainnya()">+ Kontak Lainnya</button>
            </div>
            <div class="box-bd">
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
                    ${tipeBtn('', 'Semua')}
                    ${tipeBtn('Karyawan', '👤 Karyawan')}
                    ${tipeBtn('Pelanggan', '🧑‍🤝‍🧑 Pelanggan')}
                    ${tipeBtn('Supplier', '🚚 Supplier')}
                    ${tipeBtn('Lainnya', '📇 Lainnya')}
                    <input class="finput" id="srchKontak" style="max-width:220px;margin-left:auto;" placeholder="Cari nama…" value="${esc(f.search)}" oninput="smartSearch('srchKontak', this.value, v => { window._kontakFilter.search = v; }, renderKontak)">
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblKontak">
                    <thead><tr><th>Nama</th><th>Tipe</th><th>Kontak</th><th class="r">Total Pembelian</th><th class="r">Piutang</th><th class="r">Hutang</th><th class="r">Saldo</th></tr></thead>
                    <tbody>${list.map(k => `<tr class="row-click" onclick="bukaRiwayatKontak('${k.tipe}','${esc(k.nama).replace(/'/g,"\\'")}','${esc(k.kode || '').replace(/'/g,"\\'")}')" title="Klik untuk lihat riwayat">
                        <td><strong>${esc(k.nama)}</strong>${k.kode ? `<div style="font-size:10px;color:var(--ink3);">${esc(k.kode)}</div>` : ''}${k.ket ? `<div style="font-size:10px;color:var(--ink3);">${esc(k.ket)}</div>` : ''}</td>
                        <td>${tipeIcon[k.tipe] || ''} ${esc(k.tipe)}</td>
                        <td style="font-size:12px;">${esc(k.telp || k.alamat || '–')}</td>
                        <td class="r">${(k.tipe === 'Pelanggan' || k.tipe === 'Supplier') && k.total_beli ? `<strong>${R(k.total_beli)}</strong><div style="font-size:10px;color:var(--ink3);">${k.jml_nota} nota</div>` : '–'}</td>
                        <td class="r laba-pos">${k.piutang ? R(k.piutang) : '–'}</td>
                        <td class="r laba-neg">${k.hutang ? R(k.hutang) : '–'}</td>
                        <td class="r" style="font-weight:600;">
                            ${k.saldo > 0 ? `<span class="laba-pos">${R(k.saldo)}</span>` : k.saldo < 0 ? `<span class="laba-neg">${R(Math.abs(k.saldo))}</span>` : '<span style="color:var(--ink3);">Lunas</span>'}
                        </td>
                    </tr>`).join('')}</tbody>
                </table>`
                : `<div class="empty"><div class="ico">📇</div><strong>Belum ada kontak.</strong><br>Kontak otomatis muncul dari Karyawan, Pelanggan, dan Supplier.</div>`}
            </div>
        </div>`;
    } catch (err) {
        if (!isSearchStillCurrent('srchKontak', _tok)) return;
        el.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

window.setKontakTipe = (tipe) => { window._kontakFilter.tipe = tipe; renderKontak(); };

/* ── MODAL RIWAYAT KONTAK ─────────────────────────────────── */
window._kontakKodeAktif = '';
window.bukaRiwayatKontak = async (tipe, nama, kode) => {
    window._kontakKodeAktif = kode || '';
    openM(`<div class="mhd"><h3>📇 ${esc(nama)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" id="kontakRiwayatBody"><div class="loading-state"><div class="loading-spinner"></div><p>Memuat riwayat…</p></div></div>`);
    await muatRiwayatKontak(tipe, nama);
};

async function muatRiwayatKontak(tipe, nama) {
    const body = document.getElementById('kontakRiwayatBody');
    if (!body) return;
    try {
        const kodeAktif = tipe === 'Pelanggan' ? (window._kontakKodeAktif || '') : '';
        const res = await apiGet(`/kontak/${encodeURIComponent(tipe)}/${encodeURIComponent(nama)}` + (kodeAktif ? `?kode=${encodeURIComponent(kodeAktif)}` : ''));
        const riwayat = res.riwayat || [];
        const rb = res.ringkasan_beli; // Pelanggan & Supplier: total & jumlah nota/faktur pembelian
        const ringkasBeliHtml = rb ? `
        <div style="display:flex;gap:18px;flex-wrap:wrap;padding:12px;background:var(--bg2,#f7f7f9);border-radius:8px;margin-bottom:12px;">
            <div><div class="meta">Total Pembelian</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${R(rb.total_beli || 0)}</div></div>
            <div><div class="meta">${tipe === 'Supplier' ? 'Jumlah Faktur' : 'Jumlah Nota'}</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${rb.jml_nota || 0}</div></div>
            ${rb.total_kredit !== undefined ? `<div><div class="meta">Dibeli Tunai</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${R(rb.total_tunai || 0)}</div></div>
            <div><div class="meta">Dibeli Kredit (Hutang)</div><div class="laba-neg" style="font-size:20px;font-weight:600;">${R(rb.total_kredit || 0)}</div></div>` : ''}
            <div><div class="meta">Rata-rata / Nota</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${R(rb.rata_nota || 0)}</div></div>
            <div><div class="meta">Terakhir Beli</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${rb.terakhir_beli ? fmtTgl(rb.terakhir_beli) : '–'}</div></div>
        </div>` : '';
        const arahLabel = { piutang: ['Piutang (mereka berhutang)', 'laba-pos'], bayar_piutang: ['Bayar Piutang', 'laba-pos'], hutang: ['Hutang (kita berhutang)', 'laba-neg'], bayar_hutang: ['Bayar Hutang', 'laba-neg'], catatan: ['Catatan', ''], beli: ['Pembelian', ''] };

        body.innerHTML = `
        <div class="note note-b" style="margin-bottom:10px;"><span>ℹ️</span><span>Tipe: <strong>${esc(tipe)}</strong> · Riwayat otomatis dari transaksi ditambah catatan manual, terbaru di atas. Klik baris <strong>Pembelian</strong> (Supplier) atau <strong>Penjualan</strong> (Pelanggan) untuk lihat faktur/nota, toko & barangnya.</span></div>
        ${ringkasBeliHtml}
        ${res.riwayat_dibatasi ? `<div class="note note-y" style="margin-bottom:10px;"><span>ℹ️</span><span>Kontak Umum menampung banyak transaksi: ditampilkan <strong>300 terbaru</strong> dari ${res.riwayat_dibatasi}. Ringkasan di atas tetap menghitung semuanya.</span></div>` : ''}

        <form id="fKontakCatatan" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-bottom:14px;padding:10px;background:var(--bg2,#f7f7f9);border-radius:8px;">
            <div class="fgroup" style="flex:1;min-width:120px;"><label class="flabel">Tanggal</label><input class="finput" type="date" id="kcTgl" value="${today()}" required></div>
            <div class="fgroup" style="flex:1;min-width:150px;"><label class="flabel">Jenis</label>
                <select class="fselect" id="kcJenis" onchange="document.getElementById('kcNomWrap').style.display=this.value==='Catatan'?'none':''">
                    <option value="Piutang">Piutang (mereka hutang ke kita)</option>
                    <option value="Bayar Piutang">Bayar Piutang (mereka bayar)</option>
                    <option value="Hutang">Hutang (kita hutang)</option>
                    <option value="Bayar Hutang">Bayar Hutang (kita bayar)</option>
                    <option value="Catatan">Catatan biasa (tanpa nominal)</option>
                </select>
            </div>
            <div class="fgroup" id="kcNomWrap" style="flex:1;min-width:120px;"><label class="flabel">Nominal (Rp)</label><input class="finput" type="number" id="kcNominal" min="0"></div>
            <div class="fgroup" style="flex:2;min-width:180px;"><label class="flabel">Keterangan</label><input class="finput" id="kcKet" placeholder="Mis: kurang bayar, alasan, dll"></div>
            <button class="btn btn-p" type="submit">+ Tambah</button>
        </form>

        ${riwayat.length ? `
        <div class="tscroll" style="max-height:360px;">
        <table>
            <thead><tr><th>Tanggal</th><th>Sumber</th><th>Jenis</th><th class="r">Nominal</th><th>Keterangan</th><th></th></tr></thead>
            <tbody>${riwayat.map(r => {
                const [lbl, cls] = arahLabel[r.arah] || [r.jenis, ''];
                const b = r.beli; // baris Pembelian (Supplier, tunai & kredit) — bisa diklik utk tracking
                const j = r.jual; // hanya baris Penjualan (Pelanggan) — bisa diklik utk detail nota
                const aksiKlik = j ? ` class="row-click" style="cursor:pointer;" title="Klik untuk lihat detail nota & barangnya" onclick="bukaDetailNotaJual(${esc(JSON.stringify({ no_nota: j.no_nota || '', id: j.id }))}, ${esc(JSON.stringify(tipe))}, ${esc(JSON.stringify(nama))})"` : b ? ` class="row-click" style="cursor:pointer;" title="Klik untuk lihat detail faktur, toko & akun penginput" onclick="bukaDetailNotaBeli(${esc(JSON.stringify({ no_nota: b.no_nota || '', id: b.id }))}, ${esc(JSON.stringify(tipe))}, ${esc(JSON.stringify(nama))})"` : '';
                return `<tr${aksiKlik}>
                    <td style="font-size:12px;">${fmtTgl(r.tgl)}</td>
                    <td style="font-size:12px;">${esc(r.sumber)}</td>
                    <td class="${cls}" style="font-size:12px;">${esc(lbl)}</td>
                    <td class="r ${cls}">${r.nominal !== null && r.nominal !== undefined ? R(r.nominal) : '–'}</td>
                    <td style="font-size:12px;color:var(--ink2);">${esc(r.keterangan || '–')}${j ? `<div style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap;"><span class="badge badge-pos">🧾 ${esc(j.no_nota || 'tanpa nota')}</span></div>` : ''}${b ? `<div style="margin-top:3px;display:flex;gap:4px;flex-wrap:wrap;"><span class="badge badge-pos">🧾 ${esc(b.no_nota || 'tanpa faktur')}</span>${b.operator ? `<span class="badge badge-info">👤 ${esc(b.operator)}</span>` : ''}</div>` : ''}</td>
                    <td>${r.bisa_hapus ? `<button class="row-del" onclick="hapusKontakCatatan(${r.id},'${tipe}','${nama.replace(/'/g,"\\'")}')">✕</button>` : ''}</td>
                </tr>`;
            }).join('')}</tbody>
        </table></div>`
        : '<div class="empty"><div class="ico">📭</div><strong>Belum ada riwayat.</strong></div>'}
        `;

        document.getElementById('fKontakCatatan').onsubmit = async (e) => {
            e.preventDefault();
            const jenis = document.getElementById('kcJenis').value;
            const nomEl = document.getElementById('kcNominal');
            try {
                await apiPost('/kontak/catatan', {
                    tipe, nama,
                    tgl: document.getElementById('kcTgl').value,
                    jenis,
                    nominal: jenis === 'Catatan' ? null : (Number(nomEl.value) || 0),
                    keterangan: document.getElementById('kcKet').value.trim(),
                });
                toast('Catatan disimpan');
                await muatRiwayatKontak(tipe, nama);
                await renderKontak();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        body.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── DETAIL FAKTUR PEMBELIAN (tracking dari riwayat supplier) ─────────────
   Klik baris "Pembelian" → faktur mana, toko (cabang) mana, akun/operator
   siapa yang menginput, kapan, dan semua barang di faktur itu.
   Modal cuma 1 (#mbox), jadi detail menggantikan isi riwayat; tombol "Kembali"
   memuat ulang riwayat supplier yang sama. */
window.bukaDetailNotaBeli = async (target, tipe, nama) => {
    openM(`<div class="mhd"><h3>🧾 Detail Faktur Pembelian</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" id="kontakNotaBody"><div class="loading-state"><div class="loading-spinner"></div><p>Memuat faktur…</p></div></div>
    <div class="mft"><button class="btn btn-g" onclick="bukaRiwayatKontak(${esc(JSON.stringify(tipe))}, ${esc(JSON.stringify(nama))})">← Kembali ke riwayat</button></div>`);
    const body = document.getElementById('kontakNotaBody');
    try {
        const q = target.no_nota ? `no_nota=${encodeURIComponent(target.no_nota)}` : `id=${encodeURIComponent(target.id)}`;
        const d = await apiGet('/kontak/nota-beli?' + q);
        const akun = (d.operator || []).length ? d.operator.map(o => `<span class="badge badge-info">👤 ${esc(o)}</span>`).join(' ') : '<span style="color:var(--ink3);">tidak tercatat</span>';
        const ppnBadge = (v) => `<span class="badge ${v === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}">${esc(v)}</span>`;
        const fmtWaktu = (w) => w ? new Date(String(w).replace(' ', 'T')).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' }) : '–';
        const info = (label, isi) => `<div style="min-width:150px;flex:1;"><div style="font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px;">${label}</div><div style="font-size:13px;font-weight:600;margin-top:2px;">${isi}</div></div>`;
        const noteTarget = JSON.stringify({ noNota: d.no_nota || '', ids: d.no_nota ? undefined : (d.items || []).map(i => i.id) });

        body.innerHTML = `
        <div style="display:flex;gap:14px;flex-wrap:wrap;padding:12px;background:var(--bg2,#f7f7f9);border-radius:8px;margin-bottom:12px;">
            ${info('No. Faktur', d.no_nota ? esc(d.no_nota) : '<span style="color:var(--ink3);">belum ada</span>')}
            ${info('Tanggal', fmtTgl(d.tgl))}
            ${info('Toko / Cabang', esc(d.cabang))}
            ${info('Akun Penginput', akun)}
        </div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;padding:0 12px 12px;">
            ${info('Supplier', esc(d.supplier || '–'))}
            ${info('Pembayaran', esc(d.bayar || '–'))}
            ${info('Sumber', esc(d.sumber) + (d.kasir_pos ? ` · kasir ${esc(d.kasir_pos)}` : ''))}
            ${info('Diinput', fmtWaktu(d.diinput))}
        </div>
        <div class="tscroll" style="max-height:280px;"><table>
            <thead><tr><th>Barang</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Diskon</th><th>PPN</th><th class="r">Subtotal</th></tr></thead>
            <tbody>${(d.items || []).map(i => `<tr>
                <td style="font-size:12px;">${esc(i.nama)}</td>
                <td class="r" style="font-size:12px;">${Number(i.qty).toLocaleString('id-ID')} ${esc(i.satuan || '')}</td>
                <td class="r">${R(i.harga)}</td>
                <td class="r">${i.diskon ? R(i.diskon) : '–'}</td>
                <td>${ppnBadge(i.ppn)}</td>
                <td class="r">${R(i.subtotal)}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="5" class="r"><strong>Total ${d.jumlah_baris} barang</strong></td><td class="r"><strong>${R(d.total)}</strong></td></tr></tfoot>
        </table></div>
        <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px;flex-wrap:wrap;">
            ${d.no_nota ? `<button class="btn btn-g btn-sm" onclick="bukaBentukanRef(${esc(JSON.stringify(d.no_nota))})">📓 Lihat Jurnal</button>` : ''}
            ${(d.sumber !== 'Kasir POS') ? `<button class="btn btn-g btn-sm" onclick="kontakUbahFaktur(${esc(noteTarget)}, ${esc(JSON.stringify(tipe))}, ${esc(JSON.stringify(nama))})">✏️ Ubah No. Faktur</button>` : ''}
        </div>`;
    } catch (err) {
        body.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};

// Ubah No. Faktur dari detail ini: setelah disimpan, kembali ke detail faktur
// dengan nomor baru (bukan ke halaman Transaksi).
window.kontakUbahFaktur = (target, tipe, nama) => {
    window.bukaUbahNotaBeli(target, async (res) => {
        await window.bukaDetailNotaBeli({ no_nota: res?.no_nota || target.noNota, id: (target.ids || [])[0] }, tipe, nama);
        if (typeof renderKontak === 'function') renderKontak();
    });
};

/* ── DETAIL NOTA PENJUALAN (tracking dari riwayat pelanggan) ───────────── */
window.bukaDetailNotaJual = async (target, tipe, nama) => {
    openM(`<div class="mhd"><h3>🧾 Detail Nota Penjualan</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" id="kontakNotaBody"><div class="loading-state"><div class="loading-spinner"></div><p>Memuat nota…</p></div></div>
    <div class="mft"><button class="btn btn-g" onclick="bukaRiwayatKontak(${esc(JSON.stringify(tipe))}, ${esc(JSON.stringify(nama))}, ${esc(JSON.stringify(window._kontakKodeAktif || ''))})">← Kembali ke riwayat</button></div>`);
    const body = document.getElementById('kontakNotaBody');
    try {
        const q = target.no_nota ? `no_nota=${encodeURIComponent(target.no_nota)}` : `id=${encodeURIComponent(target.id)}`;
        const d = await apiGet('/kontak/nota-jual?' + q);
        const kasir = (d.kasir || []).length ? d.kasir.map(o => `<span class="badge badge-info">👤 ${esc(o)}</span>`).join(' ') : '<span style="color:var(--ink3);">tidak tercatat</span>';
        const ppnBadge = (v) => `<span class="badge ${v === 'Kena PPN' ? 'badge-ppn' : 'badge-noppn'}">${esc(v)}</span>`;
        const info = (label, isi) => `<div style="min-width:150px;flex:1;"><div style="font-size:11px;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px;">${label}</div><div style="font-size:13px;font-weight:600;margin-top:2px;">${isi}</div></div>`;
        body.innerHTML = `
        <div style="display:flex;gap:14px;flex-wrap:wrap;padding:12px;background:var(--bg2,#f7f7f9);border-radius:8px;margin-bottom:12px;">
            ${info('No. Nota', d.no_nota ? esc(d.no_nota) : '<span style="color:var(--ink3);">belum ada</span>')}
            ${info('Tanggal', fmtTgl(d.tgl))}
            ${info('Toko / Cabang', esc(d.cabang))}
            ${info('Kasir', kasir)}
        </div>
        <div style="display:flex;gap:14px;flex-wrap:wrap;padding:0 12px 12px;">
            ${info('Pelanggan', esc(d.pelanggan || '–'))}
            ${info('Pembayaran', esc(d.bayar || '–'))}
        </div>
        <div class="tscroll" style="max-height:280px;"><table>
            <thead><tr><th>Barang</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Diskon</th><th>PPN</th><th class="r">Subtotal</th></tr></thead>
            <tbody>${(d.items || []).map(i => `<tr>
                <td style="font-size:12px;">${esc(i.nama)}</td>
                <td class="r" style="font-size:12px;">${Number(i.qty).toLocaleString('id-ID')} ${esc(i.satuan || '')}</td>
                <td class="r">${R(i.harga)}</td>
                <td class="r">${i.diskon ? R(i.diskon) : '–'}</td>
                <td>${ppnBadge(i.ppn)}</td>
                <td class="r">${R(i.subtotal)}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="5" class="r"><strong>Total ${d.jumlah_baris} barang</strong></td><td class="r"><strong>${R(d.total)}</strong></td></tr></tfoot>
        </table></div>`;
    } catch (err) {
        body.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};

window.hapusKontakCatatan = async (id, tipe, nama) => {
    if (!(await confirmDialog('Hapus catatan ini?'))) return;
    try {
        await apiDel('/kontak/catatan/' + id);
        toast('Catatan dihapus', 'y');
        await muatRiwayatKontak(tipe, nama);
        await renderKontak();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── TAMBAH KONTAK "LAINNYA" ─────────────────────────────── */
// Kontak tipe Lainnya tidak punya master tersendiri — cukup buat lewat
// catatan pertama, nama & tipe langsung tersimpan di kontak_catatan.
window.bukaTambahKontakLainnya = () => {
    openM(`
    <div class="mhd"><h3>+ Kontak Lainnya</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgroup"><label class="flabel">Nama</label><input class="finput" id="klNama" required placeholder="Nama kontak"></div>
        <div class="fgroup" style="margin-top:10px;"><label class="flabel">Catatan Awal (opsional)</label><input class="finput" id="klKet" placeholder="Mis: alasan dicatat"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="simpanKontakLainnya()">Simpan</button>
    </div>`);
};
window.simpanKontakLainnya = async () => {
    const nama = document.getElementById('klNama').value.trim();
    if (!nama) { toast('Nama wajib diisi', 'err'); return; }
    try {
        await apiPost('/kontak/catatan', {
            tipe: 'Lainnya', nama, tgl: today(), jenis: 'Catatan',
            nominal: null, keterangan: document.getElementById('klKet').value.trim() || 'Kontak baru ditambahkan',
        });
        toast('Kontak ditambahkan');
        closeM();
        await renderKontak();
    } catch (err) { toast(err.message, 'err'); }
};
