/* =============================================================
   pos.js — KASIR POS (menu baru): Penjualan & Pembelian
   ─────────────────────────────────────────────────────────────
   Alur meniru aplikasi kasir desktop:
     1) Buka menu Kasir POS → wajib "Login Shift" (isi kas awal)
        kalau cabang tsb belum ada shift yang sedang berjalan.
     2) Setelah login shift → masuk ke Riwayat Transaksi (hanya
        menampilkan transaksi pada shift yang sedang berjalan).
     3) Klik "+ Tambah" → masuk layar Kasir: grid seperti kasir
        desktop. Ketik nama/kode barang di baris kuning paling
        bawah → muncul saran barang yang cocok → Enter memilih →
        baris baru otomatis siap diisi lagi (scan barcode ATAU
        ketik). Scan barcode (cocok persis dgn barcode Master
        Barang) langsung menambah ke daftar TANPA perlu Enter.
     4) F8 → layar Bayar ("Kembali Rp"): ketik uang yang diberikan
        pembeli, Enter pertama = simpan transaksi, lalu ditanya
        cetak struk (Ya/Tidak) → Enter/klik Yes = cetak. Setelah
        itu kembali ke layar Kasir kosong siap transaksi baru.
   Tetap menulis ke trx_jual/trx_beli lewat PosController (mewarisi
   helper TransaksiController) sehingga OTOMATIS masuk Jurnal &
   semua laporan yang sudah ada — tanpa mengubah cara kerja modul
   Transaksi lama. Tiap nota ditautkan ke shift yg sedang aktif.
   ============================================================= */

window._posState = window._posState || {
    jenis: 'jual',        // 'jual' | 'beli'
    view: 'loading',      // 'loading' | 'shiftlogin' | 'riwayat' | 'kasir'
    shiftChecked: false,
    shift: null,          // shift aktif { id, no_referensi, cabang, kasir, nomor_shift, kas_awal, waktu_mulai }
    cart: [],             // [{kode, nama, ppn, satuanOpts, satuan, qty, harga, diskon, diskonPct, dikenal}]
    stokMap: {},          // {kode_barang: qty tersedia di cabang terpilih}
    lastNota: null,       // hasil simpan terakhir dari server → { nota, items, pelanggan_nama }
    riwayat: { mode: 'shift', dari: today(), sampai: today(), perPage: 50 },
    held: [],             // transaksi yang "ditahan" (F9) supaya bisa lanjut layani pembeli lain
    entry: { term: '', qty: 1, matches: [], activeIdx: -1 },
    editingNota: null,     // no_nota yang sedang diedit (null = transaksi baru)
    editingData: null,     // { nota, items, pelanggan_nama } dari nota yang sedang diedit
};

/* ── HELPER HARGA & SATUAN ────────────────────────────────────── */

function posFmtSatuan(b) {
    const opts = [{ val: (b && b.satuan1) || 'PCS', isi: 1 }];
    if (b && b.satuan2 && Number(b.isi) > 1) opts.push({ val: b.satuan2, isi: Number(b.isi) });
    return opts;
}

function posHargaDasar(b, jenis, tipeHarga) {
    if (!b) return 0;
    if (jenis === 'beli') return Number(b.modal) || 0;
    // Harga jual mengikuti cabang shift yang sedang berjalan (harga khusus cabang kalau ada)
    const h = hargaBarangCabang(b, (window._posState && window._posState.shift && window._posState.shift.cabang) || '');
    if (tipeHarga === 'Grosir') return Number(h.harga_grosir) > 0 ? Number(h.harga_grosir) : (Number(h.harga_jual) || 0);
    return Number(h.harga_jual) || 0;
}

function posRp(n) { return Number(n || 0).toLocaleString('id-ID'); }

/* ── ENTRY POINT (dipanggil nav.js saat tab "Kasir POS" dibuka) ── */
async function renderPos() {
    const root = document.getElementById('pos-root');
    if (!root) return;
    const S = window._posState;

    if (!S.shiftChecked) {
        root.innerHTML = loadingHTML;
        await posCheckShift();
    }

    if (!S.shift) {
        root.innerHTML = posShiftLoginHTML();
        wireShiftLoginEvents();
        return;
    }

    root.innerHTML = posShellHTML();
    posBindShortcuts();
    if (S.view === 'kasir') {
        document.getElementById('posBody').innerHTML = posKasirGridHTML();
        wirePosGridEvents();
        await posRefreshStok();
        posRenderGridRows();
    } else {
        S.view = 'riwayat';
        await renderPosRiwayat(1);
    }
}

/* ═══════════════════════════════════════════════════════════════
 * SHIFT: cek shift aktif, login (kas awal), tutup (kas akhir)
 * ═══════════════════════════════════════════════════════════════ */

async function posCheckShift() {
    const S = window._posState;
    S.shiftChecked = true;
    const cab = localStorage.getItem('pos_cabang') || (STATE.cabang[0] ? STATE.cabang[0].nama : '');
    if (!cab) { S.shift = null; return; }
    try {
        const res = await apiGet('/pos/shift/aktif' + buildQuery({ cabang: cab }));
        S.shift = res.shift || null;
        if (S.shift) S.view = 'riwayat';
    } catch (e) { S.shift = null; }
}

function posShiftLoginHTML() {
    const lastKasir = localStorage.getItem('pos_kasir_terakhir') || '';
    const lastCab = localStorage.getItem('pos_cabang') || '';
    return `
    <div class="pos-shift-wrap">
      <div class="pos-shift-card">
        <div class="pos-shift-hd">
            <div class="pos-shift-ic">🔐</div>
            <div>
                <h3>Login Shift Kasir</h3>
                <p>Isi kas awal untuk memulai sesi kasir baru. Selama shift berjalan, Riwayat Transaksi hanya menampilkan transaksi pada shift ini.</p>
            </div>
        </div>
        <div class="box-bd">
            <div class="fgrid">
                <div class="fgroup">
                    <label class="flabel">Cabang</label>
                    <select class="fselect" id="shf_cabang">${cabangOpts(lastCab)}</select>
                </div>
                <div class="fgroup">
                    <label class="flabel">Nama Kasir <span style="color:var(--red);">*wajib</span></label>
                    <input class="finput" id="shf_kasir" placeholder="Nama kasir yang bertugas" value="${esc(lastKasir)}" autocomplete="off">
                </div>
                <div class="fgroup">
                    <label class="flabel">Kas Awal Shift (Rp)</label>
                    <input class="finput" type="number" min="0" id="shf_kasAwal" placeholder="0" value="0">
                    <span class="fhint">Uang tunai di laci kasir sebelum transaksi pertama.</span>
                </div>
            </div>
            <button class="btn btn-p btn-lg" id="shfBtnLogin" onclick="posLoginShift()" style="width:100%;margin-top:6px;">🔓 Mulai Shift & Masuk Kasir</button>
        </div>
      </div>
    </div>`;
}

function wireShiftLoginEvents() {
    const kasir = document.getElementById('shf_kasir');
    if (kasir) {
        kasir.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); posLoginShift(); } });
        kasir.focus();
    }
    const kasAwal = document.getElementById('shf_kasAwal');
    if (kasAwal) kasAwal.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); posLoginShift(); } });
}

window.posLoginShift = async () => {
    const cabang = document.getElementById('shf_cabang').value;
    const kasir = document.getElementById('shf_kasir').value.trim();
    const kasAwal = Number(document.getElementById('shf_kasAwal').value || 0);
    if (!cabang) { toast('Pilih cabang dulu', 'err'); return; }
    if (!kasir) { toast('Nama kasir wajib diisi', 'err'); return; }

    const btn = document.getElementById('shfBtnLogin');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Memulai shift…'; }
    try {
        const res = await apiPost('/pos/shift/buka', { cabang, kasir, kas_awal: kasAwal });
        window._posState.shift = res.shift;
        window._posState.view = 'riwayat';
        localStorage.setItem('pos_cabang', cabang);
        localStorage.setItem('pos_kasir_terakhir', kasir);
        toast(`Shift dimulai — ${res.shift.no_referensi}`, 'ok');
        await renderPos();
    } catch (err) {
        toast(err.message, 'err');
        if (btn) { btn.disabled = false; btn.textContent = '🔓 Mulai Shift & Masuk Kasir'; }
    }
};

window.posBukaTutupShift = () => {
    const S = window._posState;
    if (!S.shift) return;
    openM(`
    <div class="mhd"><h3>🔒 Tutup Shift — ${esc(S.shift.no_referensi)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        <div class="fgrid">
            <div class="fgroup"><label class="flabel">Kasir</label><div class="finput" style="background:var(--kertas);">${esc(S.shift.kasir)}</div></div>
            <div class="fgroup"><label class="flabel">Kas Awal</label><div class="finput" style="background:var(--kertas);">${R(S.shift.kas_awal)}</div></div>
            <div class="fgroup">
                <label class="flabel">Kas Akhir (Rp) <span style="font-weight:400;color:var(--ink3);">(opsional)</span></label>
                <input class="finput" type="number" min="0" id="shf_kasAkhir" placeholder="Hitung fisik uang di laci kasir">
            </div>
            <div class="fgroup">
                <label class="flabel">Catatan <span style="font-weight:400;color:var(--ink3);">(opsional)</span></label>
                <input class="finput" id="shf_catatanTutup" placeholder="Selisih kas, dll">
            </div>
        </div>
        <p style="font-size:12px;color:var(--ink3);">Setelah shift ditutup, Anda akan kembali ke layar Login Shift untuk memulai sesi baru.</p>
    </div>
    <div class="mft">
        <button class="btn btn-g" onclick="closeM()">Batal</button>
        <button class="btn btn-d" onclick="posTutupShiftKonfirmasi()">🔒 Tutup Shift</button>
    </div>`);
};

window.posTutupShiftKonfirmasi = async () => {
    const S = window._posState;
    const kasAkhir = document.getElementById('shf_kasAkhir').value;
    const catatan = document.getElementById('shf_catatanTutup').value.trim() || null;
    try {
        await apiPost(`/pos/shift/${S.shift.id}/tutup`, { kas_akhir: kasAkhir === '' ? null : Number(kasAkhir), catatan });
        toast('Shift ditutup', 'ok');
        closeM();
        S.shift = null;
        S.shiftChecked = false;
        S.cart = [];
        S.view = 'loading';
        await renderPos();
    } catch (err) { toast(err.message, 'err'); }
};

/* ═══════════════════════════════════════════════════════════════
 * SHELL: toggle Jual/Beli + hero shift info + switch Kasir/Riwayat
 * ═══════════════════════════════════════════════════════════════ */
function posShellHTML() {
    const S = window._posState;
    const isJ = S.jenis === 'jual';
    return `
    <div class="pos-toggle" ${S.editingNota ? 'style="opacity:.5;pointer-events:none;"' : ''}>
        <button class="${isJ ? 'on jual' : ''}" onclick="posSetJenis('jual')"><span class="ic">🛒</span> Kasir Penjualan</button>
        <button class="${!isJ ? 'on beli' : ''}" onclick="posSetJenis('beli')"><span class="ic">📦</span> Kasir Pembelian</button>
    </div>

    <div class="pos-hero">
        <div>
            <div class="pos-hero-title">${isJ ? '🛒 Kasir Penjualan' : '📦 Kasir Pembelian'} <span class="badge-nota" id="posNotaBadge">${S.editingNota ? '✎ Edit ' + esc(S.editingNota) : (S.lastNota ? esc(S.lastNota.nota.no_nota) : 'Nota Baru')}</span></div>
            <div class="pos-hero-sub">Shift ${esc(S.shift.no_referensi)} · Kasir <strong>${esc(S.shift.kasir)}</strong> · ${esc(S.shift.cabang)} · Kas awal ${R(S.shift.kas_awal)}</div>
        </div>
        <div class="pos-hero-actions">
            <button class="${S.view === 'riwayat' ? 'active' : ''}" onclick="posSetView('riwayat')">🕘 Riwayat</button>
            <button class="${S.view === 'kasir' ? 'active' : ''}" onclick="posSetView('kasir')">🧾 Kasir</button>
            ${S.view === 'kasir' && S.held.length && !S.editingNota ? `<button onclick="posBukaDitahan()">🅿️ Ditahan (${S.held.length})</button>` : ''}
            <button onclick="posBukaTutupShift()">🔒 Tutup Shift</button>
        </div>
    </div>

    <div id="posBody">${loadingHTML}</div>`;
}

window.posSetJenis = async (jenis) => {
    const S = window._posState;
    if (jenis === S.jenis) return;
    if (S.cart.length) {
        const ok = await confirmDialog('Ganti jenis kasir akan mengosongkan keranjang saat ini. Lanjutkan?', { okText: 'Ya, Ganti', danger: false });
        if (!ok) return;
    }
    S.jenis = jenis;
    S.cart = [];
    S.lastNota = null;
    await renderPos();
};

window.posSetView = async (view) => {
    window._posState.view = view;
    await renderPos();
};

/* ═══════════════════════════════════════════════════════════════
 * KASIR: header transaksi + grid barang ala kasir desktop
 * ═══════════════════════════════════════════════════════════════ */
function posKasirGridHTML() {
    const S = window._posState;
    const isJ = S.jenis === 'jual';
    const ED = S.editingData ? S.editingData.nota : null;
    const cabangValue = ED ? ED.cabang : S.shift.cabang;
    return `
    <div class="pos-single">

        ${S.editingNota ? `
        <div class="note note-y" style="align-items:center;">
            <span class="note-ico">✎</span>
            <span>Mengedit transaksi <strong>${esc(S.editingNota)}</strong> — ubah barang/qty/satuan/harga di bawah, lalu Simpan Perubahan. Nomor nota tidak berubah.</span>
            <button class="btn btn-g btn-sm" style="margin-left:auto;flex-shrink:0;" onclick="posBatalEdit()">← Batal Edit</button>
        </div>` : ''}

        <div class="box">
          <div class="box-hd"><h3>Detail Transaksi</h3></div>
          <div class="box-bd">
            <div class="fgrid">
              <div class="fgroup">
                <label class="flabel">Tanggal</label>
                <input class="finput" type="date" id="pos_tgl" value="${ED ? esc(ED.tgl) : today()}">
              </div>
              <div class="fgroup">
                <label class="flabel">Cabang</label>
                <select class="fselect" id="pos_cab" disabled>${cabangOpts(cabangValue)}</select>
              </div>
              ${isJ ? `
              <div class="fgroup">
                <label class="flabel">Pelanggan <span style="font-weight:400;color:var(--ink3);">(opsional)</span> <span class="fkey">F3</span></label>
                <input class="finput" id="pos_pelanggan" list="dl_pos_pelanggan" placeholder="Kosongkan untuk pelanggan Umum" autocomplete="off" value="${ED ? esc(ED.pelanggan || '') : ''}">
                ${pelangganDatalist('dl_pos_pelanggan')}
                <span class="fhint" id="pos_pelangganHint"></span>
              </div>
              <div class="fgroup">
                <label class="flabel">Tipe Harga</label>
                <select class="fselect" id="pos_tipeHarga" onchange="posOnTipeHargaChange()">
                    <option value="Ecer" ${!ED || ED.tipe_harga === 'Ecer' ? 'selected' : ''}>Eceran</option>
                    <option value="Grosir" ${ED && ED.tipe_harga === 'Grosir' ? 'selected' : ''}>Grosir</option>
                </select>
              </div>` : `
              <div class="fgroup">
                <label class="flabel">Supplier <span style="color:var(--red);">*wajib</span> <span class="fkey">F3</span></label>
                <select class="fselect" id="pos_supplier">${supplierOpts(ED ? ED.supplier : '')}</select>
                ${!(STATE.supplier && STATE.supplier.length) ? `<span class="fhint" style="color:var(--ylw,#b8860b);">⚠️ Belum ada data Master Supplier — tambahkan dulu di menu Kontak/Supplier.</span>` : ''}
              </div>`}
              <div class="fgroup">
                <label class="flabel">Metode Bayar <span style="color:var(--red);">*wajib</span></label>
                <select class="fselect" id="pos_bayar" onchange="posOnBayarChange()">
                    <option value="Tunai" ${!ED || ED.bayar === 'Tunai' ? 'selected' : ''}>Tunai</option>
                    <option value="Kredit" ${ED && ED.bayar === 'Kredit' ? 'selected' : ''}>Kredit</option>
                </select>
              </div>
              <div class="fgroup" id="pos_kodeKasWrap">
                <label class="flabel">Kode Kas <span style="color:var(--red);">*wajib</span> <span class="fkey">F12</span></label>
                <select class="fselect" id="pos_kodeKas">${kasOpts(ED ? (ED.kode_kas || '') : (S.lastKodeKas || ''))}</select>
              </div>
              <div class="fgroup">
                <label class="flabel">Kasir</label>
                <input class="finput" id="pos_kasir" value="${esc(S.shift.kasir)}" readonly style="background:var(--kertas);">
              </div>
              <div class="fgroup">
                <label class="flabel">Catatan <span style="font-weight:400;color:var(--ink3);">(opsional)</span> <span class="fkey">F1</span></label>
                <input class="finput" id="pos_catatan" placeholder="Catatan tambahan" value="${ED ? esc(ED.catatan || '') : ''}">
              </div>
            </div>
          </div>
        </div>

        <div class="box pos-grid-box">
          <div class="box-hd"><h3>Daftar Barang</h3><div class="meta">${S.cart.length} item</div></div>
          <div class="box-bd pad0 pos-grid-scroll">
            <table class="pos-grid-table">
              <thead><tr>
                <th>Nama Barang</th><th style="width:80px;">Satuan</th><th class="r" style="width:80px;">Qty</th>
                <th class="r" style="width:110px;">Harga</th><th class="r" style="width:80px;">Disc.%</th>
                <th class="r" style="width:100px;">Disc.Rp</th><th class="r" style="width:120px;">Subtotal</th><th style="width:36px;"></th>
              </tr></thead>
              <tbody id="posGridBody"></tbody>
            </table>
          </div>
          <div class="pos-grid-footer">
            <div class="pos-summary" id="posSummary"></div>
            <div class="pos-grid-actions">
                ${S.editingNota ? '' : '<button class="btn btn-g" onclick="posTahan()">🅿️ Tahan (F9)</button>'}
                <button class="btn btn-p btn-lg" id="posBtnBayar" onclick="posBukaPembayaran()">${S.editingNota ? '💾 Simpan Perubahan (F8)' : '💰 Bayar (F8)'}</button>
            </div>
          </div>
        </div>

    </div>
    <div class="pos-shortcut-bar">
      <span><b>F1</b> Catatan</span><span><b>F2</b> Fokus Cari Barang</span>
      <span><b>F3 / F11</b> ${isJ ? 'Pelanggan' : 'Supplier'}</span>
      <span><b>F5</b> Refresh Stok</span><span><b>F8</b> Bayar</span>
      <span><b>F9</b> Tahan Transaksi</span><span><b>F12</b> Kode Kas</span>
      <span><b>Enter</b> Pilih Barang</span>
    </div>`;
}

/* ── EVENT WIRING (dipanggil sekali setelah posKasirGridHTML dipasang) ── */
function wirePosGridEvents() {
    const S = window._posState;
    const isJ = S.jenis === 'jual';
    const cabInput = document.getElementById('pos_cab');
    if (cabInput) cabInput.addEventListener('change', async () => { await posRefreshStok(); posRenderGridRows(); });

    if (isJ) {
        const pelInput = document.getElementById('pos_pelanggan');
        const hint = document.getElementById('pos_pelangganHint');
        pelInput.addEventListener('input', () => {
            const p = getPelanggan(pelInput.value.trim());
            if (p) { hint.textContent = `${p.nama} — Poin saat ini: ${p.poin || 0}`; hint.style.color = 'var(--daun)'; }
            else if (pelInput.value.trim()) { hint.textContent = 'Kode tidak cocok — akan dianggap pelanggan Umum jika tidak dilengkapi'; hint.style.color = '#b8860b'; }
            else { hint.textContent = ''; }
        });
    }
    posOnBayarChange();
}

window.posOnTipeHargaChange = () => posRenderGridRows();
window.posOnBayarChange = () => {
    const wrap = document.getElementById('pos_kodeKasWrap');
    const isTunai = document.getElementById('pos_bayar').value === 'Tunai';
    if (wrap) wrap.style.display = isTunai ? '' : 'none';
};

/* ── KEYBOARD SHORTCUTS (meniru kasir desktop: F1..F12) ──────────── */
window._posShortcutsBound = window._posShortcutsBound || false;
function posBindShortcuts() {
    if (window._posShortcutsBound) return;
    window._posShortcutsBound = true;
    document.addEventListener('keydown', (e) => {
        const root = document.getElementById('pos-root');
        if (!root || !root.offsetParent) return;
        const S = window._posState;
        if (S.view !== 'kasir') return;
        const focusSel = (id) => { const el = document.getElementById(id); if (el) { e.preventDefault(); el.focus(); if (el.select) el.select(); } };
        switch (e.key) {
            case 'F1': focusSel('pos_catatan'); break;
            case 'F2': focusSel('posEntryNama'); break;
            case 'F3':
            case 'F11': focusSel(S.jenis === 'jual' ? 'pos_pelanggan' : 'pos_supplier'); break;
            case 'F5': e.preventDefault(); posRefreshStok().then(() => { posRenderGridRows(); toast('Stok diperbarui', 'ok'); }); break;
            case 'F8': e.preventDefault(); posBukaPembayaran(); break;
            case 'F9': e.preventDefault(); posTahan(); break;
            case 'F12': focusSel('pos_kodeKas'); break;
        }
    });
}

/* ── TAHAN / LANJUTKAN TRANSAKSI (F9) ────────────────────────────── */
window.posTahan = async () => {
    const S = window._posState;
    if (!S.cart.length) { toast('Keranjang masih kosong, tidak ada yang ditahan', 'err'); return; }
    S.held.push({
        key: Date.now(), jenis: S.jenis, cart: S.cart,
        label: (S.jenis === 'jual' ? (document.getElementById('pos_pelanggan')?.value || 'Umum') : (document.getElementById('pos_supplier')?.value || '-')),
        fields: {
            tgl: document.getElementById('pos_tgl')?.value, pelanggan: document.getElementById('pos_pelanggan')?.value,
            tipeHarga: document.getElementById('pos_tipeHarga')?.value, supplier: document.getElementById('pos_supplier')?.value,
            bayar: document.getElementById('pos_bayar')?.value, kodeKas: document.getElementById('pos_kodeKas')?.value,
            catatan: document.getElementById('pos_catatan')?.value,
        },
    });
    S.cart = [];
    toast(`Transaksi ditahan (${S.held.length} nota parkir)`, 'ok');
    await renderPos();
};

window.posBukaDitahan = () => {
    const S = window._posState;
    openM(`
    <div class="mhd"><h3>🅿️ Transaksi Ditahan</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
      ${S.held.length ? `<div class="pos-held-list">${S.held.map(h => `
        <div class="pos-held-row">
            <div>
                <div class="pos-held-jenis">${h.jenis === 'jual' ? '🛒 Penjualan' : '📦 Pembelian'} · ${esc(h.label || '-')}</div>
                <div class="pos-held-meta">${h.cart.length} item · ${new Date(h.key).toLocaleTimeString('id-ID')}</div>
            </div>
            <div style="display:flex;gap:6px;">
                <button class="btn btn-p btn-sm" onclick="posResumeHeld(${h.key})">↩️ Lanjutkan</button>
                <button class="row-del" onclick="posHapusDitahan(${h.key})">✕</button>
            </div>
        </div>`).join('')}</div>`
      : `<div class="empty"><div class="ico">🅿️</div><strong>Tidak ada transaksi yang ditahan.</strong></div>`}
    </div>`);
};

window.posResumeHeld = async (key) => {
    const S = window._posState;
    const idx = S.held.findIndex(h => h.key === key);
    if (idx < 0) return;
    const h = S.held[idx];
    if (S.cart.length) {
        const ok = await confirmDialog('Keranjang saat ini belum kosong. Menahan transaksi ini lalu melanjutkan yang dipilih?', { okText: 'Ya, Lanjutkan', danger: false });
        if (!ok) { closeM(); return; }
        S.held.push({ key: Date.now(), jenis: S.jenis, cart: S.cart, label: 'Otomatis ditahan', fields: {} });
    }
    S.jenis = h.jenis;
    S.cart = h.cart;
    S.held.splice(idx, 1);
    closeM();
    await renderPos();
    const f = h.fields || {};
    Object.entries({
        pos_tgl: f.tgl, pos_pelanggan: f.pelanggan, pos_tipeHarga: f.tipeHarga,
        pos_supplier: f.supplier, pos_bayar: f.bayar, pos_kodeKas: f.kodeKas, pos_catatan: f.catatan,
    }).forEach(([id, val]) => { const el = document.getElementById(id); if (el && val !== undefined) el.value = val; });
    posOnBayarChange();
    posRenderGridRows();
    toast('Transaksi dilanjutkan', 'ok');
};

window.posHapusDitahan = (key) => {
    const S = window._posState;
    S.held = S.held.filter(h => h.key !== key);
    posBukaDitahan();
    renderPos();
};

/* ── STOK: ambil daftar stok per cabang sekali, dipakai sbg preview ── */
async function posRefreshStok() {
    const S = window._posState;
    const cab = document.getElementById('pos_cab')?.value || S.shift.cabang;
    try {
        const list = await apiGet('/stok' + buildQuery({ cabang: cab }));
        const map = {};
        (Array.isArray(list) ? list : []).forEach(s => { map[s.kode_barang] = Number(s.qty) || 0; });
        S.stokMap = map;
    } catch (e) { S.stokMap = {}; }
}

/* ═══════════════════════════════════════════════════════════════
 * GRID BARANG: baris keranjang (editable) + 1 baris entri (kuning)
 * ═══════════════════════════════════════════════════════════════ */
function posRenderGridRows() {
    const S = window._posState;
    const body = document.getElementById('posGridBody');
    if (!body) return;

    const rows = S.cart.map((it, i) => {
        const subtotal = Math.max(it.qty * it.harga - it.diskon, 0);
        return `<tr class="pos-grid-row">
            <td>
                <div class="pos-cart-item-name">${esc(it.nama)}${!it.dikenal ? ' <span class="badge badge-warn">Tidak dikenal</span>' : ''}</div>
                <div class="pos-cart-item-sub">${esc(it.kode)}</div>
            </td>
            <td>${it.satuanOpts.length > 1 ? `<select class="pos-sat-select" onchange="posUpdateItem(${i},'satuan',this.value)">
                    ${it.satuanOpts.map(o => `<option value="${esc(o.val)}" ${o.val === it.satuan ? 'selected' : ''}>${esc(o.val)}</option>`).join('')}
                </select>` : `<span class="pos-sat-fixed">${esc(it.satuan)}</span>`}</td>
            <td class="r"><input class="pos-qty-input" type="number" min="0.01" step="0.01" value="${it.qty}" onchange="posUpdateItem(${i},'qty',this.value)"></td>
            <td class="r"><input class="pos-harga-input" type="number" min="0" value="${Math.round(it.harga)}" onchange="posUpdateItem(${i},'harga',this.value)"></td>
            <td class="r"><input class="pos-disc-input" type="number" min="0" max="100" value="${it.diskonPct || 0}" onchange="posUpdateItem(${i},'diskonPct',this.value)"></td>
            <td class="r"><input class="pos-disc-input" type="number" min="0" value="${Math.round(it.diskon)}" onchange="posUpdateItem(${i},'diskon',this.value)"></td>
            <td class="r pos-line-total">${R(subtotal)}</td>
            <td><button class="row-del" title="Hapus" onclick="posRemoveItem(${i})">✕</button></td>
        </tr>`;
    }).join('');

    const entry = `<tr class="pos-grid-entry-row">
        <td class="pos-entry-cell">
            <input class="pos-entry-input" id="posEntryNama" placeholder="🔍 Scan barcode, atau ketik kode / nama barang…" autocomplete="off" value="${esc(S.entry.term)}">
            <div class="pos-entry-dropdown" id="posEntryDropdown"></div>
        </td>
        <td><span class="pos-sat-fixed pos-entry-hint" id="posEntrySatHint">Stok: – Rak:</span></td>
        <td class="r"><input class="pos-qty-input" type="number" id="posEntryQty" min="0.01" step="0.01" value="${S.entry.qty}"></td>
        <td class="r" colspan="4"><span class="pos-entry-msg" id="posEntryMsg">Scan Barcode, atau ketik kode atau nama barang...!!!</span></td>
        <td></td>
    </tr>`;

    body.innerHTML = (S.cart.length ? rows : '') + entry;

    if (!S.cart.length) {
        body.insertAdjacentHTML('afterbegin', `<tr class="pos-grid-empty-row"><td colspan="8"><div class="pos-cart-empty"><div class="ico">🛍️</div><strong>Keranjang masih kosong.</strong><div style="font-size:12px;margin-top:4px;">Scan barcode atau ketik nama/kode barang di baris kuning di bawah.</div></div></td></tr>`);
    }

    posRenderSummary();
    wirePosEntryRow();
}

/* ── BARIS ENTRI (kuning): cari barang, dropdown saran, tambah otomatis ── */
function posSearchBarang(term) {
    const t = String(term || '').trim().toLowerCase();
    if (!t) return [];
    const list = STATE.barang || [];
    const starts = [], contains = [];
    list.forEach(b => {
        const nama = String(b.nama || '').toLowerCase();
        const kode = String(b.kode || '').toLowerCase();
        if (nama.startsWith(t) || kode.startsWith(t)) starts.push(b);
        else if (nama.includes(t) || kode.includes(t) || String(b.barcode || '').includes(t)) contains.push(b);
    });
    return [...starts, ...contains].slice(0, 8);
}

function posMatchBarcodeExact(term) {
    const t = String(term || '').trim();
    if (!t) return null;
    return (STATE.barang || []).find(b => b.barcode === t || b.barcode2 === t || b.barcode3 === t) || null;
}

function wirePosEntryRow() {
    const S = window._posState;
    const namaInput = document.getElementById('posEntryNama');
    const qtyInput = document.getElementById('posEntryQty');
    const dropdown = document.getElementById('posEntryDropdown');
    const msg = document.getElementById('posEntryMsg');
    const satHint = document.getElementById('posEntrySatHint');
    if (!namaInput) return;

    const renderDropdown = () => {
        const matches = S.entry.matches;
        if (!matches.length) { dropdown.innerHTML = ''; dropdown.classList.remove('on'); return; }
        dropdown.innerHTML = matches.map((b, i) => `
            <div class="pos-entry-opt ${i === S.entry.activeIdx ? 'active' : ''}" onmousedown="event.preventDefault();posEntryPick(${i})">
                <span class="nm">${esc(b.nama)}</span>
                <span class="kd">${esc(b.kode)}${b.barcode ? ' · ' + esc(b.barcode) : ''}</span>
                <span class="hg">${R(posHargaDasar(b, S.jenis, document.getElementById('pos_tipeHarga')?.value || 'Ecer'))}</span>
            </div>`).join('');
        dropdown.classList.add('on');
    };

    const showPreview = (autoAdd) => {
        const term = namaInput.value;
        S.entry.term = term;
        const trimmed = term.trim();
        if (!trimmed) {
            S.entry.matches = []; S.entry.activeIdx = -1;
            renderDropdown();
            msg.textContent = 'Scan Barcode, atau ketik kode atau nama barang...!!!'; msg.style.color = '';
            satHint.textContent = 'Stok: – Rak:';
            return;
        }

        // Scan barcode (cocok PERSIS dgn barcode/barcode2/barcode3) → langsung tambah, tanpa Enter
        if (autoAdd) {
            const bc = posMatchBarcodeExact(trimmed);
            if (bc) { posEntryAddBarang(bc); return; }
        }

        S.entry.matches = posSearchBarang(trimmed);
        S.entry.activeIdx = S.entry.matches.length ? 0 : -1;
        renderDropdown();

        if (S.entry.matches.length) {
            msg.textContent = `${S.entry.matches.length} barang cocok — ↑↓ pilih, Enter tambah`;
            msg.style.color = 'var(--daun)';
        } else {
            const exact = getBarang(trimmed);
            if (exact) { msg.textContent = `✓ ${exact.nama} — tekan Enter untuk tambah`; msg.style.color = 'var(--daun)'; }
            else { msg.textContent = '⚠️ Tidak ditemukan di Master Barang — Enter untuk tetap tambah manual'; msg.style.color = '#b8860b'; }
        }
        const stok = S.stokMap[(S.entry.matches[0] || {}).kode] ?? null;
        satHint.textContent = stok !== null ? `Stok: ${Number(stok).toLocaleString('id-ID')} Rak:` : 'Stok: – Rak:';
    };

    namaInput.addEventListener('input', () => showPreview(true));
    namaInput.addEventListener('keydown', e => {
        if (e.key === 'ArrowDown') { e.preventDefault(); if (S.entry.matches.length) { S.entry.activeIdx = (S.entry.activeIdx + 1) % S.entry.matches.length; renderDropdown(); } }
        else if (e.key === 'ArrowUp') { e.preventDefault(); if (S.entry.matches.length) { S.entry.activeIdx = (S.entry.activeIdx - 1 + S.entry.matches.length) % S.entry.matches.length; renderDropdown(); } }
        else if (e.key === 'Escape') { S.entry.matches = []; S.entry.activeIdx = -1; renderDropdown(); }
        else if (e.key === 'Enter') {
            e.preventDefault();
            if (S.entry.activeIdx >= 0 && S.entry.matches[S.entry.activeIdx]) { posEntryAddBarang(S.entry.matches[S.entry.activeIdx]); return; }
            const exact = getBarang(namaInput.value.trim());
            if (exact) { posEntryAddBarang(exact); return; }
            if (namaInput.value.trim()) posEntryAddUnknown(namaInput.value.trim());
        }
    });
    qtyInput.addEventListener('change', () => { S.entry.qty = Math.max(0.01, Number(qtyInput.value) || 1); });
    qtyInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); namaInput.focus(); } });

    // Fokuskan otomatis ke baris entri supaya kasir bisa langsung scan/ketik
    if (S.entry._justFocus) { namaInput.focus(); S.entry._justFocus = false; }
}

async function posEntryAddBarang(b) {
    const S = window._posState;
    const tipeHarga = document.getElementById('pos_tipeHarga')?.value || 'Ecer';
    const harga = posHargaDasar(b, S.jenis, tipeHarga);
    const satuanOpts = posFmtSatuan(b);
    const qty = Math.max(0.01, Number(document.getElementById('posEntryQty')?.value) || S.entry.qty || 1);

    const existingIdx = S.cart.findIndex(it => it.kode === b.kode && it.satuan === satuanOpts[0].val);
    if (existingIdx >= 0) {
        S.cart[existingIdx].qty += qty;
    } else {
        S.cart.push({ kode: b.kode, nama: b.nama, ppn: b.ppn, satuanOpts, satuan: satuanOpts[0].val, qty, harga, diskon: 0, diskonPct: 0, dikenal: true });
    }
    posResetEntry();
    posRenderGridRows();
}

async function posEntryAddUnknown(kode) {
    const ok = await confirmDialog(`Kode/barcode "${kode}" tidak ditemukan di Master Barang.\n\nTetap tambahkan ke keranjang? Nanti akan ditandai "tidak dikenal" (harga & satuan diisi manual).`, { okText: 'Tetap Tambah', danger: false });
    if (!ok) return;
    const S = window._posState;
    const qty = Math.max(0.01, Number(document.getElementById('posEntryQty')?.value) || S.entry.qty || 1);
    S.cart.push({ kode, nama: kode, ppn: null, satuanOpts: [{ val: 'PCS', isi: 1 }], satuan: 'PCS', qty, harga: 0, diskon: 0, diskonPct: 0, dikenal: false });
    posResetEntry();
    posRenderGridRows();
}

function posResetEntry() {
    const S = window._posState;
    S.entry = { term: '', qty: 1, matches: [], activeIdx: -1, _justFocus: true };
}

window.posEntryPick = (i) => {
    const S = window._posState;
    const b = S.entry.matches[i];
    if (b) posEntryAddBarang(b);
};

/* ── UBAH / HAPUS ITEM KERANJANG ─────────────────────────────────── */
window.posUpdateItem = (idx, field, val) => {
    const S = window._posState;
    const it = S.cart[idx];
    if (!it) return;

    if (field === 'satuan') {
        const opt = it.satuanOpts.find(o => o.val === val);
        const b = getBarang(it.kode);
        const tipeHarga = document.getElementById('pos_tipeHarga')?.value || 'Ecer';
        const hargaDasar = b ? posHargaDasar(b, S.jenis, tipeHarga) : (it.harga / ((it.satuanOpts.find(o => o.val === it.satuan) || {}).isi || 1));
        it.satuan = val;
        it.harga = Math.round(hargaDasar * (opt ? opt.isi : 1));
    } else if (field === 'qty') {
        it.qty = Math.max(0.01, Number(val) || 0.01);
        it.diskon = Math.round(it.qty * it.harga * (it.diskonPct || 0) / 100);
    } else if (field === 'harga') {
        it.harga = Math.max(0, Number(val) || 0);
        it.diskon = Math.round(it.qty * it.harga * (it.diskonPct || 0) / 100);
    } else if (field === 'diskonPct') {
        it.diskonPct = Math.max(0, Math.min(100, Number(val) || 0));
        it.diskon = Math.round(it.qty * it.harga * it.diskonPct / 100);
    } else if (field === 'diskon') {
        it.diskon = Math.max(0, Number(val) || 0);
        const dasar = it.qty * it.harga;
        it.diskonPct = dasar > 0 ? Math.round((it.diskon / dasar) * 10000) / 100 : 0;
    }
    posRenderGridRows();
};

window.posRemoveItem = (idx) => {
    window._posState.cart.splice(idx, 1);
    posRenderGridRows();
};

/* ── HITUNG TOTAL & RINGKASAN SINGKAT DI BAWAH GRID ──────────────── */
function posCalcTotals() {
    const S = window._posState;
    const subtotal = S.cart.reduce((s, it) => s + it.qty * it.harga, 0);
    const diskonItem = S.cart.reduce((s, it) => s + Number(it.diskon || 0), 0);
    const total = Math.max(subtotal - diskonItem, 0);
    return { subtotal, diskonItem, total, qty: S.cart.reduce((s, it) => s + Number(it.qty || 0), 0) };
}

function posRenderSummary() {
    const wrap = document.getElementById('posSummary');
    if (!wrap) return;
    const t = posCalcTotals();
    wrap.innerHTML = `
    <div class="pos-summary-row"><span>Subtotal</span><span>${R(t.subtotal)}</span></div>
    <div class="pos-summary-row"><span>Diskon</span><span>${R(t.diskonItem)}</span></div>
    <div class="pos-summary-row total"><span>GRAND TOTAL</span><span class="val">${R(t.total)}</span></div>`;
}

/* ═══════════════════════════════════════════════════════════════
 * F8 — BAYAR ("Kembali Rp"): input uang, simpan, tanya cetak struk
 * ═══════════════════════════════════════════════════════════════ */
window.posBukaPembayaran = async () => {
    const S = window._posState;
    if (!S.cart.length) { toast('Daftar barang masih kosong', 'err'); return; }
    const tgl = document.getElementById('pos_tgl').value;
    if (!tgl) { toast('Tanggal wajib diisi', 'err'); return; }
    const bayar = document.getElementById('pos_bayar').value;
    const kodeKas = document.getElementById('pos_kodeKas')?.value || '';
    if (bayar === 'Tunai' && !kodeKas) { toast('Kode Kas wajib dipilih untuk pembayaran Tunai (F12)', 'err'); return; }
    if (S.jenis === 'beli' && !document.getElementById('pos_supplier').value) { toast('Supplier wajib dipilih untuk transaksi pembelian', 'err'); return; }

    // Mode edit nota lama: tidak perlu tanya "uang diterima" lagi (itu sudah
    // terjadi saat transaksi pertama kali dibuat) — langsung simpan perubahan.
    if (S.editingNota) {
        const ok = await confirmDialog(`Simpan perubahan pada nota ${S.editingNota}?`, { okText: 'Ya, Simpan', danger: false });
        if (ok) posSimpanEditNota();
        return;
    }

    const t = posCalcTotals();
    openM(`
    <div class="pos-pay-overlay">
      <div class="pos-pay-title">Kembali Rp</div>
      <div class="pos-pay-total-box">
        <div class="pos-pay-total-lbl">TOTAL BELANJA (Rp)</div>
        <div class="pos-pay-total-val">${posRp(t.total)}</div>
      </div>
      <div class="pos-pay-grid">
        <div class="pos-pay-bayar-box">
            <div class="pos-pay-lbl">JUMLAH BAYAR</div>
            <input type="number" min="0" class="pos-pay-input" id="posBayarInput" value="${bayar === 'Tunai' ? t.total : ''}" ${bayar !== 'Tunai' ? 'disabled placeholder="Kredit"' : ''}>
        </div>
        <div class="pos-pay-qty-box">
            <div class="pos-pay-lbl">JUMLAH QTY</div>
            <div class="pos-pay-qty-val">${t.qty}</div>
        </div>
      </div>
      <div class="pos-pay-kembali-box">
        <div class="pos-pay-lbl">JUMLAH KEMBALI</div>
        <div class="pos-pay-kembali-val" id="posKembaliVal">${posRp(Math.max((bayar === 'Tunai' ? t.total : 0) - t.total, 0))}</div>
      </div>
      <div class="pos-pay-actions">
        <button class="btn btn-g" onclick="posClosePembayaran()">← Batal (Esc)</button>
        <button class="btn btn-p btn-lg" onclick="posSimpanTransaksi()">💾 Simpan & Cetak (Enter)</button>
      </div>
    </div>`);

    const bayarInput = document.getElementById('posBayarInput');
    const updateKembali = () => {
        const nilai = Number(bayarInput.value) || 0;
        document.getElementById('posKembaliVal').textContent = posRp(Math.max(nilai - t.total, 0));
    };
    if (bayarInput) {
        bayarInput.addEventListener('input', updateKembali);
        bayarInput.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); posSimpanTransaksi(); } });
        setTimeout(() => { bayarInput.focus(); bayarInput.select(); }, 50);
    } else {
        setTimeout(() => document.querySelector('.pos-pay-actions .btn-p')?.focus(), 50);
    }
    document.addEventListener('keydown', posPayEscHandler);
};

function posPayEscHandler(e) {
    if (e.key === 'Escape') posClosePembayaran();
}
window.posClosePembayaran = () => {
    document.removeEventListener('keydown', posPayEscHandler);
    closeM();
};

window.posSimpanTransaksi = async () => {
    const S = window._posState;
    const isJ = S.jenis === 'jual';
    const bayar = document.getElementById('pos_bayar').value;
    const bayarInput = document.getElementById('posBayarInput');
    const t = posCalcTotals();

    if (bayar === 'Tunai') {
        const nilaiBayar = Number(bayarInput.value) || 0;
        if (nilaiBayar < t.total) { toast('Uang bayar kurang dari total belanja', 'err'); return; }
    }

    const tgl = document.getElementById('pos_tgl').value;
    const kodeKas = document.getElementById('pos_kodeKas')?.value || '';
    const catatan = document.getElementById('pos_catatan').value.trim() || null;
    const items = S.cart.map(it => ({ kode_barang: it.kode, qty: it.qty, harga: it.harga, satuan: it.satuan, diskon: it.diskon }));

    const payload = {
        tgl, cabang: S.shift.cabang, bayar, kasir: S.shift.kasir, catatan,
        kode_kas: bayar === 'Tunai' ? kodeKas : null,
        shift_id: S.shift.id,
        items,
    };
    if (isJ) {
        const pel = getPelanggan((document.getElementById('pos_pelanggan').value || '').trim());
        payload.pelanggan = pel ? pel.kode : null;
        payload.tipe_harga = document.getElementById('pos_tipeHarga').value;
        payload.poin_dipakai = 0;
    } else {
        payload.supplier = document.getElementById('pos_supplier').value;
    }

    const btn = document.querySelector('.pos-pay-actions .btn-p');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
    try {
        const res = await apiPost(isJ ? '/pos/jual' : '/pos/beli', payload);
        S.lastNota = res;
        if (payload.kode_kas) S.lastKodeKas = payload.kode_kas;
        document.removeEventListener('keydown', posPayEscHandler);
        closeM();
        await loadMasterData();

        const cetak = await confirmDialog('Cetak Struk Penjualan?', { title: 'Konfirmasi', okText: 'Yes', cancelText: 'No', danger: false });
        if (cetak) posCetakStruk();

        toast(`Transaksi tersimpan — ${res.nota.no_nota}`, 'ok');
        S.cart = [];
        S.lastNota_display = res.nota.no_nota;
        posResetEntry();
        await renderPos(); // kembali ke layar Kasir, grid kosong siap nota baru
        document.getElementById('posNotaBadge') && (document.getElementById('posNotaBadge').textContent = res.nota.no_nota + ' ✓ tersimpan');
    } catch (err) {
        toast(err.message, 'err');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan & Cetak (Enter)'; }
    }
};

/* ── CETAK STRUK (jendela baru, format 80mm, print/PDF) ──────────── */
function posFmtTglPanjang(d) {
    if (!d) return '-';
    const dt = new Date(d);
    const bln = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return `${String(dt.getDate()).padStart(2, '0')} ${bln[dt.getMonth()]} ${dt.getFullYear()}`;
}

window.posCetakStruk = () => {
    const data = window._posState.lastNota;
    if (!data) return;
    const n = data.nota;
    const items = data.items || [];
    const isJ = n.jenis === 'Jual';
    const namaFile = `Struk-${n.no_nota}`;
    const kasAkun = n.kode_kas ? (STATE.coa || []).find(c => c.kode === n.kode_kas) : null;

    const pw = window.open('', '_blank', 'width=460,height=720');
    if (!pw) { toast('Popup diblokir browser. Izinkan popup untuk mencetak struk.', 'err'); return; }

    const itemsHTML = items.map(it => `
        <div class="row" style="margin-bottom:2px;"><span style="font-weight:600;">${esc(it.nama_barang || it.kode_barang)}</span></div>
        <div class="row"><span>${Number(it.qty_asal ?? it.qty).toLocaleString('id-ID')} ${esc(it.satuan || '')} x ${posRp(it.harga_asal ?? it.harga)}${Number(it.diskon) > 0 ? ' - disc ' + posRp(it.diskon) : ''}</span><span>${posRp(it.qty * it.harga - it.diskon)}</span></div>
    `).join('');

    pw.document.write(`<!DOCTYPE html>
<html lang="id"><head><meta charset="UTF-8"><title>Struk - ${n.no_nota}</title>
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
  .total-box{margin:8px 0 2px;padding:7px 6px;border-radius:6px;background:repeating-linear-gradient(135deg,#f7f7f4,#f7f7f4 6px,#f0f0eb 6px,#f0f0eb 12px);border-top:1.5px solid #111;border-bottom:3px double #111;}
  .total-box .row{font-weight:800;font-size:14px;} .total-box .row span:first-child{color:#111;letter-spacing:.5px;}
  .poin-box{background:#e3f4eb;color:#1a7a4a;border-radius:6px;padding:6px 8px;font-size:10px;font-weight:700;margin-top:8px;}
  .footnote{font-size:9.5px;color:#333;font-weight:600;margin-top:10px;} .footnote.center{text-align:center;}
  .thanks{text-align:center;font-size:10.5px;font-weight:700;margin-top:10px;letter-spacing:.5px;}
  @media print {
    .toolbar{display:none !important;} html,body{background:#fff;} .sheet-wrap{padding:0;} #struk{box-shadow:none;width:100%;}
    /* Printer thermal sering "menghilangkan" teks tipis (font-weight normal /
       abu-abu terang) — paksa semua teks di struk jadi hitam pekat & agak
       tebal supaya pasti kelihatan di hasil cetak. */
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
    <div class="doctitle">${isJ ? 'STRUK PENJUALAN' : 'NOTA PEMBELIAN'}</div>
    <div class="noslip">No. ${esc(n.no_nota)}</div>
    <div class="divider"></div>
    <div class="row"><span>Tanggal</span><span>${posFmtTglPanjang(n.tgl)}</span></div>
    <div class="row"><span>Cabang</span><span>${esc(n.cabang)}</span></div>
    ${isJ
        ? `<div class="row"><span>Pelanggan</span><span>${esc(data.pelanggan_nama || 'Umum')}</span></div><div class="row"><span>Tipe Harga</span><span>${esc(n.tipe_harga || '-')}</span></div>`
        : `<div class="row"><span>Supplier</span><span>${esc(n.supplier || '-')}</span></div>`}
    ${n.kasir ? `<div class="row"><span>Kasir</span><span>${esc(n.kasir)}</span></div>` : ''}
    <div class="divider"></div>
    ${itemsHTML}
    <div class="divider"></div>
    <div class="row"><span>Subtotal</span><span>${posRp(n.subtotal)}</span></div>
    ${Number(n.diskon) > 0 ? `<div class="row"><span>Diskon</span><span>-${posRp(n.diskon)}</span></div>` : ''}
    <div class="total-box"><div class="row"><span>TOTAL</span><span>Rp ${posRp(n.total)}</span></div></div>
    <div class="row"><span>Metode Bayar</span><span>${esc(n.bayar)}</span></div>
    ${n.bayar === 'Tunai' ? `<div class="row"><span>Kode Kas</span><span>${kasAkun ? esc(kasAkun.kode + ' - ' + kasAkun.nama) : esc(n.kode_kas || '-')}</span></div>` : ''}
    ${isJ && n.pelanggan ? `<div class="poin-box">🎁 Poin didapat: +${n.poin_didapat}${n.poin_dipakai ? ` · Poin dipakai: -${n.poin_dipakai}` : ''}</div>` : ''}
    ${n.catatan ? `<div class="footnote">Ket: ${esc(n.catatan)}</div>` : ''}
    <div class="footnote center">Dicetak: ${new Date().toLocaleString('id-ID')}</div>
    <div class="thanks">— Terima kasih atas kunjungan Anda —</div>
  </div></div>
  <script>
    document.getElementById('btnPdf').onclick = function () {
      const btn = this; btn.disabled = true; btn.textContent = '⏳ Menyiapkan…';
      const el = document.getElementById('struk');
      html2pdf().set({
        margin: 0, filename: '${namaFile}.pdf',
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

/* ═══════════════════════════════════════════════════════════════
 * RIWAYAT TRANSAKSI — "Shift Ini" (default, sesuai shift aktif)
 * atau "Cari Nota Lain" (rentang tanggal bebas, lintas shift)
 * ═══════════════════════════════════════════════════════════════ */
async function renderPosRiwayat(page = 1) {
    const body = document.getElementById('posBody');
    if (!body) return;
    body.innerHTML = loadingHTML;
    const S = window._posState;
    const RV = S.riwayat;
    try {
        const search = window._posRiwayatSearch || '';
        const q = RV.mode === 'shift'
            ? buildQuery({ jenis: S.jenis, shift_id: S.shift.id, page, per_page: RV.perPage, search })
            : buildQuery({ jenis: S.jenis, dari: RV.dari, sampai: RV.sampai, page, per_page: RV.perPage, search });
        const res = await apiGet('/pos/nota' + q);
        const list = res.data || [];
        const meta = res.meta || {};
        const summary = res.summary || {};

        body.innerHTML = `
        <div class="box">
            <div class="box-bd" style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;">
                <div style="display:flex;gap:6px;">
                    <button class="btn btn-sm ${RV.mode === 'shift' ? 'btn-p' : 'btn-g'}" onclick="posSetRiwayatMode('shift')">🕐 Shift Ini</button>
                    <button class="btn btn-sm ${RV.mode === 'semua' ? 'btn-p' : 'btn-g'}" onclick="posSetRiwayatMode('semua')">🔎 Cari Nota Lain</button>
                </div>
                ${RV.mode === 'semua' ? `
                <div class="fgroup" style="margin:0;"><label class="flabel">Dari</label><input class="finput" type="date" value="${RV.dari}" onchange="posSetRiwayatTanggal('dari',this.value)"></div>
                <div class="fgroup" style="margin:0;"><label class="flabel">Sampai</label><input class="finput" type="date" value="${RV.sampai}" onchange="posSetRiwayatTanggal('sampai',this.value)"></div>
                ` : `<span class="pos-riwayat-note">hanya menampilkan transaksi pada shift yang sedang berjalan</span>`}
                <div class="fgroup" style="margin:0;min-width:180px;">
                    <label class="flabel">Cari</label>
                    <input class="finput" id="srchPosNota" placeholder="🔍 No. nota, pelanggan, kasir…" value="${esc(window._posRiwayatSearch || '')}"
                        oninput="smartSearch('srchPosNota', this.value, v => { window._posRiwayatSearch = v; }, () => renderPosRiwayat(1))">
                </div>
                <span class="pos-riwayat-summary" style="margin-left:auto;">${summary.jumlah || 0} nota · Total ${R(summary.total_nominal || 0)}</span>
            </div>
        </div>
        <div class="box">
            <div class="box-bd" style="display:flex;justify-content:flex-end;">
                <button class="btn btn-p" onclick="posSetView('kasir')">+ Tambah Transaksi</button>
            </div>
            <div class="box-bd pad0 tscroll">
            ${list.length ? `
            <table>
                <thead><tr><th>No. Nota</th><th>Tanggal</th><th>Jam</th><th>${S.jenis === 'jual' ? 'Pelanggan' : 'Supplier'}</th><th class="r">Item</th><th class="r">Total</th><th>Bayar</th><th>Kasir</th><th>Status</th><th></th></tr></thead>
                <tbody>${list.map(n => `<tr class="trx-nota-row" onclick="posEditNotaFull('${esc(n.no_nota)}')" style="cursor:pointer;">
                    <td style="font-family:var(--F-m);font-size:12px;">${esc(n.no_nota)}</td>
                    <td>${fmtTgl(n.tgl)}</td>
                    <td>${n.created_at ? esc(String(n.created_at).slice(11, 19)) : '-'}</td>
                    <td>${esc(n.jenis === 'Jual' ? (n.pelanggan || 'Umum') : (n.supplier || '-'))}</td>
                    <td class="r">${n.jumlah_item}</td>
                    <td class="r">${R(n.total)}</td>
                    <td>${esc(n.bayar)}</td>
                    <td>${esc(n.kasir || '-')}</td>
                    <td><span class="badge badge-in">SUDAH DIKIRIM</span></td>
                    <td style="white-space:nowrap;">
                        <button class="row-del" title="Lihat / edit barang" onclick="event.stopPropagation();posEditNotaFull('${esc(n.no_nota)}')">✎</button>
                        <button class="row-del" title="Cetak ulang" onclick="event.stopPropagation();posCetakUlang('${esc(n.no_nota)}')">🖨️</button>
                        <button class="row-del" title="Batalkan transaksi" onclick="event.stopPropagation();posHapusNota('${esc(n.no_nota)}')">✕</button>
                    </td>
                </tr>`).join('')}</tbody>
            </table>
            ${paginationHTML(meta, 'renderPosRiwayat')}`
            : `<div class="empty"><div class="ico">🧾</div><strong>${RV.mode === 'shift' ? 'Belum ada transaksi pada shift ini.' : 'Belum ada transaksi pada rentang ini.'}</strong></div>`}
            </div>
        </div>`;
    } catch (err) {
        body.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

window.posSetRiwayatMode = (mode) => {
    const RV = window._posState.riwayat;
    RV.mode = mode;
    if (mode === 'semua' && !RV.dari) { RV.dari = today(); RV.sampai = today(); }
    renderPosRiwayat(1);
};

window.posSetRiwayatTanggal = (field, val) => {
    window._posState.riwayat[field] = val;
    renderPosRiwayat(1);
};

window.posCetakUlang = async (noNota) => {
    try {
        const data = await apiGet('/pos/nota/' + encodeURIComponent(noNota));
        window._posState.lastNota = data;
        posCetakStruk();
    } catch (err) { toast(err.message, 'err'); }
};

window.posHapusNota = async (noNota) => {
    const ok = await confirmDialog(`Batalkan transaksi ${noNota}?\n\nStok & poin pelanggan akan dikembalikan, dan seluruh baris transaksi terkait akan dihapus dari Jurnal.`, { okText: 'Ya, Batalkan', danger: true });
    if (!ok) return;
    try {
        await apiDel('/pos/nota/' + encodeURIComponent(noNota));
        toast('Transaksi dibatalkan — stok & poin dikembalikan', 'ok');
        await loadMasterData();
        renderPosRiwayat(1);
    } catch (err) { toast(err.message, 'err'); }
};

/* ═══════════════════════════════════════════════════════════════
 * EDIT NOTA (PENUH) — dipakai dari tombol ✎/klik baris di Riwayat
 * Kasir POS ATAUPUN dari menu Transaksi > Penjualan/Pembelian lama
 * (baris yang ditandai badge 🧾). Nota lama dimuat lagi ke layar
 * Kasir sebagai keranjang yang bisa diubah bebas — ganti qty,
 * satuan (PCS↔KARTON), harga, diskon, hapus barang, tambah barang
 * baru (scan/ketik seperti biasa) — lalu "Simpan Perubahan" akan
 * menimpa nota yang SAMA (nomor nota tidak berubah) dan menawarkan
 * cetak ulang struk dengan data terbaru.
 * ═══════════════════════════════════════════════════════════════ */
window.posEditNotaFull = async (noNota) => {
    // Kalau dipanggil dari tab lain (mis. Transaksi > Penjualan lama),
    // pindah dulu ke tab Kasir POS supaya grid & shortcut-nya aktif.
    if (typeof activeTab !== 'undefined' && activeTab !== 'pos' && typeof setTab === 'function') {
        await setTab('pos');
    }
    const S = window._posState;
    if (!S.shift) { toast('Login shift dulu di Kasir POS sebelum mengedit transaksi', 'err'); return; }

    try {
        const data = await apiGet('/pos/nota/' + encodeURIComponent(noNota));
        const n = data.nota;
        S.jenis = n.jenis === 'Jual' ? 'jual' : 'beli';
        S.editingNota = noNota;
        S.editingData = data;
        S.cart = (data.items || []).map(it => {
            const b = getBarang(it.kode_barang);
            const satuanOpts = b ? posFmtSatuan(b) : [{ val: it.satuan || 'PCS', isi: 1 }];
            const qty = Number(it.qty_asal ?? it.qty) || 0.01;
            const harga = Number(it.harga_asal ?? it.harga) || 0;
            const diskon = Number(it.diskon || 0);
            const dasar = qty * harga;
            return {
                kode: it.kode_barang, nama: it.nama_barang || it.kode_barang, ppn: b ? b.ppn : null,
                satuanOpts, satuan: it.satuan || satuanOpts[0].val,
                qty, harga, diskon,
                diskonPct: dasar > 0 ? Math.round((diskon / dasar) * 10000) / 100 : 0,
                dikenal: !it.tidak_dikenal,
            };
        });
        S.view = 'kasir';
        posResetEntry();
        await renderPos();
        toast(`Mengedit transaksi ${noNota} — ubah lalu Simpan Perubahan (F8)`, 'ok');
    } catch (err) { toast(err.message, 'err'); }
};

/* ── BATALKAN EDIT: kembali ke Riwayat tanpa menyimpan perubahan ──── */
window.posBatalEdit = async () => {
    const S = window._posState;
    if (S.cart.length) {
        const ok = await confirmDialog('Batalkan edit? Perubahan yang belum disimpan akan hilang (nota aslinya tidak berubah).', { okText: 'Ya, Batalkan', danger: false });
        if (!ok) return;
    }
    S.editingNota = null;
    S.editingData = null;
    S.cart = [];
    S.view = 'riwayat';
    await renderPos();
};

/* ── SIMPAN PERUBAHAN NOTA: timpa nota yang sama (bukan bikin baru) ── */
window.posSimpanEditNota = async () => {
    const S = window._posState;
    const isJ = S.jenis === 'jual';
    const bayar = document.getElementById('pos_bayar').value;
    const kodeKas = document.getElementById('pos_kodeKas')?.value || '';
    const cabang = document.getElementById('pos_cab').value;
    const tgl = document.getElementById('pos_tgl').value;
    const catatan = document.getElementById('pos_catatan').value.trim() || null;
    const items = S.cart.map(it => ({ kode_barang: it.kode, qty: it.qty, harga: it.harga, satuan: it.satuan, diskon: it.diskon }));

    const payload = { tgl, cabang, bayar, kasir: S.shift.kasir, catatan, kode_kas: bayar === 'Tunai' ? kodeKas : null, items };
    if (isJ) {
        const pel = getPelanggan((document.getElementById('pos_pelanggan').value || '').trim());
        payload.pelanggan = pel ? pel.kode : null;
        payload.tipe_harga = document.getElementById('pos_tipeHarga').value;
        payload.poin_dipakai = 0;
    } else {
        payload.supplier = document.getElementById('pos_supplier').value;
    }

    const btn = document.getElementById('posBtnBayar');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyimpan…'; }
    try {
        const res = await apiPut(`/pos/${isJ ? 'jual' : 'beli'}/${encodeURIComponent(S.editingNota)}`, payload);
        S.lastNota = res;
        toast(`Perubahan tersimpan — ${res.nota.no_nota}`, 'ok');
        await loadMasterData();

        const cetak = await confirmDialog('Cetak ulang struk dengan data terbaru?', { title: 'Konfirmasi', okText: 'Yes', cancelText: 'No', danger: false });
        if (cetak) posCetakStruk();

        S.cart = [];
        S.editingNota = null;
        S.editingData = null;
        S.view = 'riwayat';
        await renderPos();
    } catch (err) {
        toast(err.message, 'err');
        if (btn) { btn.disabled = false; btn.textContent = '💾 Simpan Perubahan (F8)'; }
    }
};

