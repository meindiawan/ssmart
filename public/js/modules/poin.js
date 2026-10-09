/* =============================================================
   poin.js — Rekap Poin Member (data lama per cabang)
   Menggabungkan poin member dari 7 file rekap kasir per cabang
   (Pusat, Bae, Pasar, Ugm, Padurenan/Durenan, Putri 1, Putri 2).
   Nama yang SAMA PERSIS (case-insensitive + rapikan spasi) di
   beberapa cabang otomatis DIJUMLAHKAN. Klik baris → rincian per
   cabang. Ada katalog hadiah (Silver/Gold) & tombol Tukar Poin.

   CATATAN: ini TERPISAH dari poin Kasir POS (`pelanggan.poin`,
   poin baru real-time yang langsung memotong Rupiah saat checkout).
   ============================================================= */

/** Format angka poin: 12345 → "12.345" (tanpa "Rp") */
function nf(n) {
    return Math.round(Number(n) || 0).toLocaleString('id-ID');
}

window._poinFilter      = window._poinFilter      || { search: '', sort: 'poin_desc' };
window._poinCabangList  = window._poinCabangList  || [];
window._poinHadiahCache = window._poinHadiahCache || [];

/* ── DAFTAR REKAP ──────────────────────────────────────────── */
async function renderPoin() {
    const el = document.getElementById('poin-list');
    // Token "giliran render" — HARUS baris pertama sebelum await apapun,
    // dipakai smartSearch (helpers.js) buat tahu render mana yg paling
    // baru. Kalau ada pencarian lebih baru menyusul sebelum request ini
    // selesai, hasil basi dari request ini tidak boleh menimpa tampilan.
    const _tok = beginSearchRender('srchPoin');
    // Baris/tabel LAMA tetap ditampilkan selama nunggu hasil baru (tidak
    // langsung diganti loadingHTML) — supaya tidak kerasa "ngerefresh"
    // tiap kali ngetik. Loading penuh cuma dipakai pas pertama kali dibuka.
    if (!el.innerHTML.trim()) el.innerHTML = loadingHTML;
    try {
        const f   = window._poinFilter;
        const res = await apiGet('/poin' + buildQuery({ search: f.search, sort: f.sort }));
        if (!isSearchStillCurrent('srchPoin', _tok)) return; // sudah ada pencarian lebih baru, buang hasil ini
        const list = res.data || [];
        const rk   = res.ringkasan || {};
        window._poinCabangList = rk.daftar_cabang || [];

        const sortBtn = (val, label) => `<button class="btn btn-sm ${f.sort === val ? 'btn-p' : 'btn-g'}" onclick="setPoinSort('${val}')">${label}</button>`;

        el.innerHTML = `
        <div class="box" style="margin-bottom:14px;">
            <div class="box-bd" style="display:flex;gap:24px;flex-wrap:wrap;">
                <div><div class="meta">Total Member</div><div style="font-family:var(--F-m);font-size:20px;font-weight:600;">${nf(rk.total_member || 0)}</div></div>
                <div><div class="meta">Total Poin Beredar (tersedia)</div><div class="laba-pos" style="font-size:20px;font-weight:600;">${nf(rk.total_poin_beredar || 0)}</div></div>
                <div><div class="meta">Total Poin Pernah Ditukar</div><div style="font-size:20px;font-weight:600;">${nf(rk.total_poin_pernah_ditukar || 0)}</div></div>
                <div><div class="meta">Cabang Tercatat</div><div style="font-size:20px;font-weight:600;">${(rk.daftar_cabang || []).length}</div></div>
            </div>
        </div>

        <div class="box">
            <div class="box-hd">
                <h3>🎁 Rekap Poin Member</h3>
                <div style="display:flex;gap:8px;">
                    <button class="btn btn-g btn-sm" onclick="bukaKelolaHadiah()">🎁 Kelola Hadiah</button>
                    <button class="btn btn-p btn-sm" onclick="bukaImportPoin()">⬆ Import Excel</button>
                </div>
            </div>
            <div class="box-bd">
                <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px;">
                    <span class="meta" style="margin-right:2px;">Urutkan:</span>
                    ${sortBtn('poin_desc', 'Poin Terbanyak')}
                    ${sortBtn('poin_asc', 'Poin Tersedikit')}
                    ${sortBtn('nama', 'Nama A-Z')}
                    <input class="finput" id="srchPoin" style="max-width:240px;margin-left:auto;" placeholder="Cari nama member…" value="${esc(f.search)}" oninput="smartSearch('srchPoin', this.value, v => { window._poinFilter.search = v; }, renderPoin)">
                </div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblPoin">
                    <thead><tr><th>Nama Member</th><th>Kontak</th><th class="r">Jumlah Cabang</th><th class="r">Poin Ditukar</th><th class="r">Poin Tersedia</th></tr></thead>
                    <tbody>${list.map(m => `<tr class="row-click" onclick="bukaDetailPoin('${esc(m.nama).replace(/'/g, "\\'")}')" title="Klik untuk lihat rincian per cabang">
                        <td><strong>${esc(m.nama)}</strong>${m.alamat_beragam ? ' <span title="Alamat berbeda-beda antar cabang — kemungkinan 2 orang berbeda dengan nama sama, cek sebelum tukar poin" style="cursor:help;">⚠️</span>' : ''}${m.id_member ? `<div style="font-size:10px;color:var(--ink3);">${esc(m.id_member)}</div>` : ''}</td>
                        <td style="font-size:12px;">${esc(m.telp || m.alamat || '–')}</td>
                        <td class="r">${m.jumlah_cabang} cabang</td>
                        <td class="r" style="color:var(--ink3);">${m.total_poin_ditukar ? nf(m.total_poin_ditukar) : '–'}</td>
                        <td class="r" style="font-weight:600;">${nf(m.total_poin_tersedia)}</td>
                    </tr>`).join('')}</tbody>
                </table>`
                : `<div class="empty"><div class="ico">🎁</div><strong>Belum ada data poin member.</strong><br>Klik <em>Import Excel</em> untuk memasukkan file rekap poin per cabang.</div>`}
            </div>
        </div>`;
    } catch (err) {
        if (!isSearchStillCurrent('srchPoin', _tok)) return;
        el.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}
window.setPoinSort = (sort) => { window._poinFilter.sort = sort; renderPoin(); };

/* ── DETAIL 1 MEMBER (rincian per cabang + riwayat tukar) ────── */
window.bukaDetailPoin = async (nama) => {
    openM(`<div class="mhd"><h3>🎁 ${esc(nama)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" id="poinDetailBody"><div class="loading-state"><div class="loading-spinner"></div><p>Memuat rincian…</p></div></div>`);
    await muatDetailPoin(nama);
};

async function muatDetailPoin(nama) {
    const body = document.getElementById('poinDetailBody');
    if (!body) return;
    try {
        const res = await apiGet('/poin/' + encodeURIComponent(nama));
        const cabang  = res.cabang || [];
        const riwayat = res.riwayat_tukar || [];

        body.innerHTML = `
        ${res.alamat_beragam ? `<div class="note note-y" style="margin-bottom:12px;"><span>⚠️</span><span>Alamat berbeda-beda antar cabang untuk nama <strong>${esc(nama)}</strong> — kemungkinan ini <strong>2 orang berbeda</strong> yang kebetulan namanya sama persis (bukan 1 orang). Cek dulu alamat/telp per cabang di bawah sebelum menukar poin.</span></div>` : ''}
        <div class="box" style="margin-bottom:12px;">
            <div class="box-bd" style="display:flex;gap:20px;flex-wrap:wrap;align-items:center;">
                <div><div class="meta">Poin Diperoleh</div><div style="font-size:18px;font-weight:600;">${nf(res.total_poin_diperoleh)}</div></div>
                <div><div class="meta">Poin Ditukar</div><div style="font-size:18px;font-weight:600;color:var(--ink3);">${nf(res.total_poin_ditukar)}</div></div>
                <div><div class="meta">Poin Tersedia</div><div class="laba-pos" style="font-size:18px;font-weight:700;">${nf(res.total_poin_tersedia)}</div></div>
                <button class="btn btn-p" style="margin-left:auto;" onclick="bukaTukarPoin('${esc(nama).replace(/'/g, "\\'")}', ${res.total_poin_tersedia})">🎁 Tukar Poin</button>
            </div>
        </div>

        <h4 style="margin:0 0 6px;font-size:13px;color:var(--ink2);">Poin per Cabang</h4>
        <div class="tscroll" style="max-height:180px;margin-bottom:14px;">
        <table><thead><tr><th>Cabang</th><th>Alamat</th><th>Telp / ID Member</th><th class="r">Poin</th></tr></thead>
        <tbody>${cabang.map(c => `<tr>
            <td><strong>${esc(c.cabang)}</strong></td>
            <td style="font-size:12px;">${esc(c.alamat || '–')}</td>
            <td style="font-size:12px;">${esc(c.telp || c.id_member || '–')}</td>
            <td class="r">${nf(c.poin)}</td>
        </tr>`).join('')}</tbody></table></div>

        <h4 style="margin:0 0 6px;font-size:13px;color:var(--ink2);">Riwayat Tukar Poin</h4>
        ${riwayat.length ? `
        <div class="tscroll" style="max-height:220px;">
        <table><thead><tr><th>Tanggal</th><th>Hadiah</th><th>Tier</th><th class="r">Poin</th><th>Cabang</th><th></th></tr></thead>
        <tbody>${riwayat.map(r => `<tr>
            <td style="font-size:12px;">${fmtTgl(r.tgl)}</td>
            <td style="font-size:12px;">${esc(r.nama_hadiah)}${r.keterangan ? `<div style="font-size:11px;color:var(--ink3);">${esc(r.keterangan)}</div>` : ''}</td>
            <td style="font-size:12px;">${esc(r.tier)}</td>
            <td class="r">${nf(r.poin_dipakai)}</td>
            <td style="font-size:12px;">${esc(r.cabang || '–')}</td>
            <td><button class="row-del" title="Batalkan penukaran" onclick="batalkanTukarPoin(${r.id}, '${esc(nama).replace(/'/g, "\\'")}')">✕</button></td>
        </tr>`).join('')}</tbody></table></div>`
        : '<div class="empty"><div class="ico">📭</div><strong>Belum pernah tukar poin.</strong></div>'}
        `;
    } catch (err) {
        body.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

window.batalkanTukarPoin = async (id, nama) => {
    if (!(await confirmDialog('Batalkan penukaran ini? Poin akan dikembalikan.'))) return;
    try {
        await apiDel('/poin/tukar/' + id);
        toast('Penukaran dibatalkan, poin dikembalikan', 'y');
        await muatDetailPoin(nama);
        await renderPoin();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── TUKAR POIN ────────────────────────────────────────────── */
window.bukaTukarPoin = async (nama, sisaPoin) => {
    try {
        if (!window._poinHadiahCache.length) {
            window._poinHadiahCache = await apiGet('/poin/hadiah');
        }
    } catch (err) { toast(err.message, 'err'); return; }

    const hadiahAktif = window._poinHadiahCache.filter(h => h.aktif);
    const cabangOptsPoin = window._poinCabangList.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');

    openM(`
    <div class="mhd"><h3>🎁 Tukar Poin — ${esc(nama)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b" style="margin-bottom:10px;"><span>ℹ️</span><span>Poin tersedia saat ini: <strong>${nf(sisaPoin)}</strong></span></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <div class="fgroup" style="flex:1;min-width:140px;">
                <label class="flabel">Tier Member</label>
                <select class="fselect" id="tpTier" onchange="renderPoinHadiahOptions(${sisaPoin})">
                    <option value="Silver">Silver</option>
                    <option value="Gold">Gold</option>
                </select>
            </div>
            <div class="fgroup" style="flex:1;min-width:140px;">
                <label class="flabel">Tanggal</label>
                <input class="finput" type="date" id="tpTgl" value="${today()}" required>
            </div>
            <div class="fgroup" style="flex:1;min-width:140px;">
                <label class="flabel">Cabang (opsional)</label>
                <select class="fselect" id="tpCabang"><option value="">–</option>${cabangOptsPoin}</select>
            </div>
        </div>
        <div class="fgroup" style="margin-top:10px;">
            <label class="flabel">Pilih Hadiah</label>
            <div id="tpHadiahList"></div>
        </div>
        <div class="fgroup" style="margin-top:10px;">
            <label class="flabel">Keterangan (opsional)</label>
            <input class="finput" id="tpKet" placeholder="Mis: diambil langsung / dititip cabang">
        </div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" onclick="simpanTukarPoin('${esc(nama).replace(/'/g, "\\'")}', ${sisaPoin})">Tukar Sekarang</button>
    </div>`);

    window._poinHadiahAktifSementara = hadiahAktif;
    renderPoinHadiahOptions(sisaPoin);
};

// Render ulang daftar radio hadiah tiap kali tier berubah (biaya poin beda per tier)
window.renderPoinHadiahOptions = (sisaPoin) => {
    const wrap = document.getElementById('tpHadiahList');
    if (!wrap) return;
    const tier = document.getElementById('tpTier').value;
    const hadiah = window._poinHadiahAktifSementara || [];

    wrap.innerHTML = hadiah.length ? `
    <div class="tscroll" style="max-height:240px;border:1px solid var(--bd,#e5e5ea);border-radius:8px;">
    <table><tbody>${hadiah.map((h, i) => {
        const biaya = tier === 'Gold' ? (h.poin_gold ?? h.poin_silver) : h.poin_silver;
        const cukup = sisaPoin >= biaya;
        return `<tr style="${cukup ? '' : 'opacity:.45;'}">
            <td style="width:24px;"><input type="radio" name="tpHadiahPilih" value="${h.id}" data-biaya="${biaya}" ${cukup ? '' : 'disabled'} ${i === 0 && cukup ? 'checked' : ''}></td>
            <td style="font-size:20px;width:32px;">${esc(h.emoji || '🎁')}</td>
            <td>
                <div style="font-weight:500;">${esc(h.nama)}</div>
                <div style="font-size:11px;color:var(--ink3);">${esc(h.kategori || '')}</div>
            </td>
            <td class="r" style="font-weight:600;white-space:nowrap;">${nf(biaya)} poin${cukup ? '' : ' <span style="color:var(--red);font-weight:400;">(poin kurang)</span>'}</td>
        </tr>`;
    }).join('')}</tbody></table></div>`
    : '<div class="empty"><div class="ico">🎁</div><strong>Belum ada katalog hadiah.</strong><br>Tambah dulu lewat "Kelola Hadiah".</div>';
};

window.simpanTukarPoin = async (nama, sisaPoin) => {
    const dipilih = document.querySelector('input[name="tpHadiahPilih"]:checked');
    if (!dipilih) { toast('Pilih hadiah terlebih dahulu', 'err'); return; }
    try {
        const res = await apiPost('/poin/tukar', {
            nama_member: nama,
            tier: document.getElementById('tpTier').value,
            hadiah_id: Number(dipilih.value),
            tgl: document.getElementById('tpTgl').value,
            cabang: document.getElementById('tpCabang').value || null,
            keterangan: document.getElementById('tpKet').value.trim() || null,
        });
        toast(`Poin berhasil ditukar. Sisa poin: ${nf(res.sisa_poin)}`);
        await muatDetailPoin(nama);
        await renderPoin();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── KELOLA HADIAH (CRUD katalog) ─────────────────────────────── */
window.bukaKelolaHadiah = async () => {
    openM(`<div class="mhd"><h3>🎁 Kelola Katalog Hadiah</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd" id="hadiahBody"><div class="loading-state"><div class="loading-spinner"></div><p>Memuat katalog…</p></div></div>`);
    await muatKelolaHadiah();
};

async function muatKelolaHadiah() {
    const body = document.getElementById('hadiahBody');
    if (!body) return;
    try {
        const list = await apiGet('/poin/hadiah');
        window._poinHadiahCache = list; // refresh cache dipakai modal Tukar Poin

        body.innerHTML = `
        <div class="tscroll" style="max-height:320px;margin-bottom:14px;">
        <table><thead><tr><th></th><th>Nama Hadiah</th><th>Kategori</th><th class="r">Poin Silver</th><th class="r">Poin Gold</th><th>Aktif</th><th></th></tr></thead>
        <tbody>${list.map(h => `<tr>
            <td style="font-size:18px;">${esc(h.emoji || '🎁')}</td>
            <td><strong>${esc(h.nama)}</strong></td>
            <td style="font-size:12px;">${esc(h.kategori || '–')}</td>
            <td class="r">${nf(h.poin_silver)}</td>
            <td class="r">${h.poin_gold != null ? nf(h.poin_gold) : '–'}</td>
            <td>${h.aktif ? '✅' : '—'}</td>
            <td style="white-space:nowrap;">
                <button class="btn btn-g btn-sm" onclick="editHadiahPoin(${h.id})">✎</button>
                <button class="row-del" onclick="hapusHadiahPoin(${h.id})">✕</button>
            </td>
        </tr>`).join('')}</tbody></table></div>

        <form id="fHadiahBaru" style="display:flex;gap:8px;flex-wrap:wrap;align-items:end;padding:10px;background:var(--bg2,#f7f7f9);border-radius:8px;">
            <div class="fgroup" style="width:60px;"><label class="flabel">Emoji</label><input class="finput" id="hEmoji" placeholder="🎁" maxlength="4"></div>
            <div class="fgroup" style="flex:2;min-width:160px;"><label class="flabel">Nama Hadiah</label><input class="finput" id="hNama" required placeholder="Mis: Setrika"></div>
            <div class="fgroup" style="flex:1;min-width:120px;"><label class="flabel">Kategori</label><input class="finput" id="hKategori" placeholder="Mis: Elektronik"></div>
            <div class="fgroup" style="width:110px;"><label class="flabel">Poin Silver</label><input class="finput" type="number" id="hSilver" min="0" required></div>
            <div class="fgroup" style="width:110px;"><label class="flabel">Poin Gold</label><input class="finput" type="number" id="hGold" min="0" placeholder="opsional"></div>
            <button class="btn btn-p" type="submit">+ Tambah</button>
        </form>`;

        document.getElementById('fHadiahBaru').onsubmit = async (e) => {
            e.preventDefault();
            const nama = document.getElementById('hNama').value.trim();
            const silver = Number(document.getElementById('hSilver').value);
            if (!nama || !silver) { toast('Nama & Poin Silver wajib diisi', 'err'); return; }
            try {
                await apiPost('/poin/hadiah', {
                    nama, kategori: document.getElementById('hKategori').value.trim() || null,
                    poin_silver: silver,
                    poin_gold: document.getElementById('hGold').value ? Number(document.getElementById('hGold').value) : null,
                    emoji: document.getElementById('hEmoji').value.trim() || '🎁',
                });
                toast('Hadiah ditambahkan');
                await muatKelolaHadiah();
            } catch (err) { toast(err.message, 'err'); }
        };
    } catch (err) {
        body.innerHTML = `<div class="note note-y"><span>⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

window.editHadiahPoin = async (id) => {
    const h = window._poinHadiahCache.find(x => x.id === id);
    if (!h) return;
    openM(`
    <div class="mhd"><h3>✎ Ubah Hadiah</h3><button class="mclose" onclick="bukaKelolaHadiah()">×</button></div>
    <div class="mbd">
        <div style="display:flex;gap:10px;flex-wrap:wrap;">
            <div class="fgroup" style="width:70px;"><label class="flabel">Emoji</label><input class="finput" id="ehEmoji" value="${esc(h.emoji || '')}" maxlength="4"></div>
            <div class="fgroup" style="flex:1;min-width:180px;"><label class="flabel">Nama Hadiah</label><input class="finput" id="ehNama" value="${esc(h.nama)}"></div>
        </div>
        <div class="fgroup" style="margin-top:10px;"><label class="flabel">Kategori</label><input class="finput" id="ehKategori" value="${esc(h.kategori || '')}"></div>
        <div style="display:flex;gap:10px;margin-top:10px;">
            <div class="fgroup" style="flex:1;"><label class="flabel">Poin Silver</label><input class="finput" type="number" id="ehSilver" min="0" value="${h.poin_silver}"></div>
            <div class="fgroup" style="flex:1;"><label class="flabel">Poin Gold</label><input class="finput" type="number" id="ehGold" min="0" value="${h.poin_gold ?? ''}"></div>
        </div>
        <div class="fgroup" style="margin-top:10px;"><label class="flabel"><input type="checkbox" id="ehAktif" ${h.aktif ? 'checked' : ''}> Aktif (tampil di pilihan tukar poin)</label></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="bukaKelolaHadiah()">Batal</button>
        <button class="btn btn-p" onclick="simpanEditHadiah(${id})">Simpan</button>
    </div>`);
};

window.simpanEditHadiah = async (id) => {
    try {
        await apiPut('/poin/hadiah/' + id, {
            nama: document.getElementById('ehNama').value.trim(),
            kategori: document.getElementById('ehKategori').value.trim() || null,
            poin_silver: Number(document.getElementById('ehSilver').value) || 0,
            poin_gold: document.getElementById('ehGold').value ? Number(document.getElementById('ehGold').value) : null,
            emoji: document.getElementById('ehEmoji').value.trim() || '🎁',
            aktif: document.getElementById('ehAktif').checked,
        });
        toast('Hadiah diperbarui');
        await bukaKelolaHadiah();
    } catch (err) { toast(err.message, 'err'); }
};

window.hapusHadiahPoin = async (id) => {
    if (!(await confirmDialog('Hapus hadiah ini dari katalog?'))) return;
    try {
        await apiDel('/poin/hadiah/' + id);
        toast('Hadiah dihapus', 'y');
        await muatKelolaHadiah();
    } catch (err) { toast(err.message, 'err'); }
};

/* ── IMPORT EXCEL (multi-sheet, 1 sheet = 1 cabang) ───────────── */
// Header kolom di file rekap bervariasi antar cabang (mis. "NAMA MEMBER" vs
// "NAMA_MEMBER", "TELP" vs "ID_MEMBER") — dicocokkan lewat alias, bukan posisi
// tetap, supaya semua sheet tetap kebaca walau formatnya sedikit beda.
const POIN_HEADER_ALIAS = {
    nama:      ['namamember', 'nama'],
    alamat:    ['alamat', 'alamatmember'],
    telp:      ['telp', 'notelp', 'telepon'],
    id_member: ['idmember', 'kodemember'],
    poin:      ['point', 'poin'],
};

function mapAoaPoin(aoa, cabang) {
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let headerIdx = -1, col = {};
    for (let r = 0; r < aoa.length; r++) {
        const cells = (aoa[r] || []).map(norm);
        const iNama = cells.findIndex(c => POIN_HEADER_ALIAS.nama.includes(c));
        const iPoin = cells.findIndex(c => POIN_HEADER_ALIAS.poin.includes(c));
        if (iNama >= 0 && iPoin >= 0) {
            headerIdx = r;
            for (const [field, aliases] of Object.entries(POIN_HEADER_ALIAS)) {
                col[field] = cells.findIndex(c => aliases.includes(c));
            }
            break;
        }
    }
    if (headerIdx === -1) return []; // sheet ini bukan format rekap poin (mis. sheet "REKAP" kosong)

    const rows = [];
    for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const nama = String(row[col.nama] ?? '').trim();
        if (!nama) continue;
        rows.push({
            cabang,
            nama,
            alamat: col.alamat >= 0 ? String(row[col.alamat] ?? '').trim() : '',
            telp: col.telp >= 0 ? String(row[col.telp] ?? '').trim() : '',
            id_member: col.id_member >= 0 ? String(row[col.id_member] ?? '').trim() : '',
            poin: col.poin >= 0 ? (Number(row[col.poin]) || 0) : 0,
        });
    }
    return rows;
}

window.bukaImportPoin = () => {
    openM(`
    <div class="mhd"><h3>⬆ Import Excel Poin Member</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="note note-b"><span>ℹ️</span><span>Upload 1 file Excel yang punya <strong>1 sheet per cabang</strong> (mis. PUSAT, BAE, PASAR, UGM, PADURENAN, PUTRI 1, PUTRI 2). Nama sheet otomatis jadi nama cabang. Import akan MENGGANTI seluruh data poin cabang yang ada di file — pastikan file sudah lengkap sebelum upload.</span></div>
        <div class="fgroup" style="margin-top:10px;"><input type="file" id="fPoinExcel" accept=".xlsx,.xls" onchange="bacaFilePoinExcel(this.files[0])"></div>
        <div id="poinImportPreview" style="margin-top:10px;"></div>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-p" id="btnDoImportPoin" onclick="jalankanImportPoin()" disabled>Import Sekarang</button>
    </div>`);
};

window.bacaFilePoinExcel = async (file) => {
    if (!file) return;
    const prev = document.getElementById('poinImportPreview');
    prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';
    try {
        if (typeof XLSX === 'undefined') throw new Error('Library XLSX belum dimuat.');
        const buf = await file.arrayBuffer();
        const wb  = XLSX.read(buf, { type: 'array' });

        let items = [];
        const perCabang = [];
        for (const sheetName of wb.SheetNames) {
            const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
            const rows = mapAoaPoin(aoa, sheetName.trim());
            if (rows.length) { items = items.concat(rows); perCabang.push({ cabang: sheetName.trim(), jumlah: rows.length }); }
        }

        window._poinImportItems = items;
        if (!items.length) {
            prev.innerHTML = '<div class="note note-y"><span>⚠️ Tidak ada baris valid ditemukan. Pastikan tiap sheet punya kolom nama & point.</span></div>';
            document.getElementById('btnDoImportPoin').disabled = true;
            return;
        }

        prev.innerHTML = `
        <div class="note note-b"><span>✅ Ditemukan <strong>${items.length}</strong> baris dari <strong>${perCabang.length}</strong> sheet cabang:</span></div>
        <ul style="margin:8px 0 0 18px;font-size:13px;">${perCabang.map(c => `<li>${esc(c.cabang)} — ${c.jumlah} member</li>`).join('')}</ul>`;
        document.getElementById('btnDoImportPoin').disabled = false;
    } catch (err) {
        prev.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
    }
};

window.jalankanImportPoin = async () => {
    const items = window._poinImportItems || [];
    if (!items.length) return;
    const btn = document.getElementById('btnDoImportPoin');
    btn.disabled = true; btn.textContent = 'Memproses…';
    try {
        const res = await apiPost('/poin/import', { items });
        toast(`Import selesai: ${res.total_baris} baris, ${res.cabang_diproses.length} cabang`);
        closeM();
        await renderPoin();
    } catch (err) {
        toast(err.message, 'err');
        btn.disabled = false; btn.textContent = 'Import Sekarang';
    }
};
