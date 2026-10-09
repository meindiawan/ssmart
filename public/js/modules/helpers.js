/* =============================================================
   helpers.js — Fungsi-fungsi utilitas umum
   Dipakai oleh semua modul JS lainnya
   ============================================================= */

/* ── FORMAT & ESCAPE ─────────────────────────────────────── */

/** Format angka ke Rupiah: 16000 → "Rp 16.000" */
function R(n) {
    return 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
}

/**
 * Format angka jadi pemisah ribuan pakai titik, TANPA desimal/koma sama sekali —
 * mis. fmtRibuan(32400) → "32.400". Dipakai di input harga (finput uang) supaya
 * mudah dibaca saat mengetik, meniru tampilan iPos tapi tanpa ",00" di belakang.
 * @param {number|string} v
 * @returns {string}
 */
function fmtRibuan(v) {
    let str = String(v ?? '');
    // Nilai desimal dari database (mis. "16000.00" dari kolom DECIMAL) dibulatkan dulu; kalau tidak,
    // ".00" ikut terbaca sebagai 2 digit tambahan (16.000 tampil 1.600.000). Teks berformat ribuan
    // ("16.000") tidak terpengaruh karena titiknya selalu diikuti 3 digit.
    if (/^-?\d+\.\d{1,2}$/.test(str)) str = String(Math.round(Number(str)));
    const digits = str.replace(/\D/g, '');
    if (!digits) return '';
    return Number(digits).toLocaleString('id-ID');
}

/** Kebalikan fmtRibuan: "32.400" atau "32400" → 32400 (number, bulat). */
function parseRibuan(v) {
    return parseInt(String(v ?? '').replace(/\D/g, ''), 10) || 0;
}

/**
 * Dipasang di oninput sebuah <input> field harga supaya angka otomatis
 * diberi pemisah ribuan sambil diketik (kursor otomatis pindah ke akhir).
 * @param {HTMLInputElement} el
 */
function onMoneyInput(el) {
    const raw = parseRibuan(el.value);
    el.value = raw ? fmtRibuan(raw) : '';
}

/**
 * Tab vertikal ala iPos ("Data Umum", "Satuan & Harga Jual", dst) dalam satu form/modal.
 * @param {string} groupId - id pembungkus tab (elemen dgn class .itab)
 * @param {string} key     - kunci tab yang mau ditampilkan (cocok dgn data-tab & id="{groupId}-{key}")
 */
function switchItab(groupId, key) {
    const wrap = document.getElementById(groupId);
    if (!wrap) return;
    wrap.querySelectorAll(':scope > .itab-nav > button').forEach(b => b.classList.toggle('on', b.dataset.tab === key));
    wrap.querySelectorAll(':scope > .itab-panel > .itab-page').forEach(p => p.classList.toggle('on', p.id === groupId + '-' + key));
}
window.switchItab = switchItab;

/**
 * Cek ke backend apakah kombinasi jenis+cabang+isi baris ini SAMA PERSIS
 * dengan sebuah import yang sudah pernah SELESAI diproses sebelumnya
 * (lihat TransaksiController::hashImport). Kalau iya, tanya konfirmasi ke
 * pengguna lewat confirm() sebelum melanjutkan — supaya file yang tidak
 * sengaja ke-upload dua kali tidak dobel masuk jadi transaksi & stok.
 *
 * @param {'jual'|'beli'} jenis
 * @param {string} cabang
 * @param {Array<object>} rows - baris siap-hash: {tgl, kode_barang, qty, harga, satuan, diskon?, supplier?}
 * @returns {Promise<{lanjut: boolean, hash: string}>}
 */
async function cekDanKonfirmasiImportDobel(jenis, cabang, rows) {
    const res = await apiPost('/transaksi/import/cek-duplikat', { jenis, cabang, items: rows });
    if (!res.duplikat) return { lanjut: true, hash: res.hash };
    const info = res.info;
    const pesan = `⚠️ Data yang persis sama (${info.jumlah_baris} baris, total ${R(info.total_nominal)}) `
        + `sudah pernah di-import pada ${new Date(info.kapan).toLocaleString('id-ID')}.\n\n`
        + `Kalau ini bukan sengaja diimport ulang, klik Batal.\n`
        + `Tetap lanjutkan import ini sekali lagi?`;
    return { lanjut: window.confirm(pesan), hash: res.hash };
}

/** Catat "sidik jari" import ini SEKALI setelah semua chunk selesai diproses. */
async function catatImportSelesai(jenis, cabang, hash, jumlahBaris, totalNominal) {
    try {
        await apiPost('/transaksi/import/catat', {
            jenis, cabang, hash, jumlah_baris: jumlahBaris, total_nominal: totalNominal,
        });
    } catch (e) { /* non-kritis — kalau gagal dicatat, import tetap dianggap berhasil */ }
}

/** Format tanggal ISO ke dd/mm/yyyy: "2025-06-01" → "01/06/2025" */
function fmtTgl(dt, fallback) {
    if (!dt) return fallback || '-';
    return String(dt).split('T')[0].split('-').reverse().join('/');
}

/** Escape HTML untuk mencegah XSS */
function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

/**
 * Format stok jadi tampilan konversi antar satuan biar jelas — dipakai di Daftar Barang.
 * Stok selalu disimpan di DB dalam satuan dasar (satuan1, mis. PCS).
 * Kalau barang punya satuan2 (mis. KARTON/DUS) dengan faktor konversi `isi`,
 * angka ditampilkan sebagai kombinasi "X KARTON Y PCS" + keterangan totalnya.
 * @param {number} stokBase - stok dalam satuan dasar (satuan1)
 * @param {string} satuan1  - satuan dasar, mis. "PCS"
 * @param {string} satuan2  - satuan besar (opsional), mis. "KARTON"
 * @param {number} isi      - jumlah satuan1 per 1 satuan2, mis. 12
 * @returns {{main: string, sub: string|null}}
 */
function formatStok(stokBase, satuan1, satuan2, isi) {
    stokBase = Number(stokBase) || 0;
    satuan1  = satuan1 || 'PCS';
    const isiN = Number(isi) || 1;

    // Tidak ada satuan besar / isi tidak valid → tampilkan apa adanya
    if (!satuan2 || isiN <= 1) {
        return { main: `${stokBase.toLocaleString('id-ID')} ${satuan1}`, sub: null };
    }

    const besar = Math.trunc(stokBase / isiN);
    const sisa  = Math.round((stokBase - besar * isiN) * 100) / 100; // jaga2 stok pecahan

    const parts = [];
    if (besar !== 0) parts.push(`${besar.toLocaleString('id-ID')} ${satuan2}`);
    if (sisa !== 0 || besar === 0) parts.push(`${sisa.toLocaleString('id-ID')} ${satuan1}`);

    return {
        main: parts.join(' '),
        sub: `= ${stokBase.toLocaleString('id-ID')} ${satuan1} (1 ${satuan2} = ${isiN} ${satuan1})`
    };
}

/**
 * Pecah satu barang jadi daftar baris per satuan — dipakai Daftar Barang biar tampil
 * kayak sistem kasir (iPos dkk): tiap satuan (PCS, KARTON, dst) baris sendiri dengan
 * barcode & stoknya masing-masing, bukan digabung dalam satu sel.
 * @param {object} b - row barang dari API (harus punya stok_total, satuan1/2/3, barcode/2/3, isi, modal, harga_jual, harga_grosir)
 * @returns {Array<{satuan:string, barcode:string, qty:number|null, modal:number|null, hargaJual:number|null, hargaAuto:boolean, noConv:boolean}>}
 *          Urutan: satuan besar (KARTON dulu) → satuan dasar (PCS) → satuan3 (kalau ada, tanpa konversi stok).
 */
function buildUnitRows(b) {
    const stok  = Number(b.stok_total || 0);
    const isiN  = Number(b.isi) || 1;
    const isi3N = Number(b.isi3) || 1;
    const punyaSatuan2 = !!b.satuan2 && isiN > 1;
    // Satuan 3 dianggap tingkat kemasan sendiri (relatif ke satuan dasar) hanya
    // kalau Isi 3-nya sudah diisi > 1 — kalau tidak, dianggap alias tanpa konversi.
    const punyaSatuan3 = !!b.satuan3 && isi3N > 1;

    const besar3 = punyaSatuan3 ? Math.trunc(stok / isi3N) : 0;
    const sisaSetelah3 = punyaSatuan3 ? stok - besar3 * isi3N : stok;

    const besar = punyaSatuan2 ? Math.trunc(sisaSetelah3 / isiN) : 0;
    const sisa  = punyaSatuan2 ? Math.round((sisaSetelah3 - besar * isiN) * 100) / 100 : Math.round(sisaSetelah3 * 100) / 100;

    const rows = [];
    if (punyaSatuan3) {
        rows.push({
            satuan: b.satuan3,
            barcode: b.barcode3 || null,
            qty: besar3,
            modal: b.modal ? b.modal * isi3N : 0,
            hargaJual: b.harga_jual ? b.harga_jual * isi3N : 0,
            hargaAuto: true,
            noConv: false,
        });
    }
    if (punyaSatuan2) {
        rows.push({
            satuan: b.satuan2,
            barcode: b.barcode2 || null,
            qty: besar,
            modal: b.modal ? b.modal * isiN : 0,
            hargaJual: b.harga_grosir > 0 ? b.harga_grosir : (b.harga_jual ? b.harga_jual * isiN : 0),
            hargaAuto: !(b.harga_grosir > 0), // true = harga dihitung otomatis (belum diisi manual di field Harga Grosir)
            noConv: false,
        });
    }
    rows.push({
        satuan: b.satuan1 || 'PCS',
        barcode: b.barcode || null,
        qty: (punyaSatuan2 || punyaSatuan3) ? sisa : stok,
        modal: b.modal || 0,
        hargaJual: b.harga_jual || 0,
        hargaAuto: false,
        noConv: false,
    });
    if (b.satuan3 && !punyaSatuan3) {
        // Satuan3 ada namanya tapi Isi3 belum diisi (>1) — masih alias tanpa konversi.
        rows.push({
            satuan: b.satuan3,
            barcode: b.barcode3 || null,
            qty: null, modal: null, hargaJual: null, hargaAuto: false,
            noConv: true,
        });
    }
    return rows;
}

/**
 * Deteksi barang & satuannya dari sebuah kode/barcode hasil scan kasir.
 * Dipakai saat preview Import Excel (Penjualan/Pembelian) — laporan kasir biasanya
 * cuma punya kolom "Kode Barang" yang isinya barcode, tanpa kolom Satuan terpisah.
 * Barcode mana yang cocok (barcode / barcode2 / barcode3) menentukan itu transaksi
 * dalam satuan apa (mis. barcode2 cocok → berarti qty-nya dalam satuan KARTON).
 * @param {string} kodeAtauBarcode
 * @returns {{barang: object|null, satuan: string|null, viaField: string|null, isi: number}}
 *          viaField: 'kode' | 'barcode' | 'barcode2' | 'barcode3' | null (tidak ketemu)
 */
function detectSatuanBarang(kodeAtauBarcode) {
    const kb = String(kodeAtauBarcode ?? '').trim();
    if (!kb) return { barang: null, satuan: null, viaField: null, isi: 1 };

    // Kalau kode murni angka, siapkan versi tanpa leading zero juga —
    // laporan kasir lama sering menyimpan barcode TANPA angka 0 di depan
    // (mis. "89686043204"), sedangkan Master Barang menyimpannya DENGAN
    // leading zero ("089686043204"). Keduanya barang yang sama tapi tidak
    // match sebagai string persis. Kode non-angka (mis. "CUT1") tidak kena
    // efek ini karena kbNum tetap null.
    const isNumeric = /^\d+$/.test(kb);
    const kbNum = isNumeric ? String(parseInt(kb, 10)) : null;
    const sameCode = (val) => {
        if (val == null) return false;
        const v = String(val).trim();
        if (v === kb) return true;
        if (kbNum !== null && /^\d+$/.test(v) && String(parseInt(v, 10)) === kbNum) return true;
        return false;
    };

    const list = (typeof STATE !== 'undefined' && STATE.barang) ? STATE.barang : [];
    const b = list.find(x =>
        sameCode(x.kode) || sameCode(x.barcode) || sameCode(x.barcode2) || sameCode(x.barcode3)
    );
    if (!b) return { barang: null, satuan: null, viaField: null, isi: 1 };

    let viaField = 'kode', satuan = b.satuan1 || 'PCS', isi = 1;
    if (sameCode(b.barcode))  { viaField = 'barcode';  satuan = b.satuan1 || 'PCS'; isi = 1; }
    if (sameCode(b.barcode2)) { viaField = 'barcode2'; satuan = b.satuan2 || b.satuan1 || 'PCS'; isi = Number(b.isi) || 1; }
    if (sameCode(b.barcode3)) { viaField = 'barcode3'; satuan = b.satuan3 || b.satuan1 || 'PCS'; isi = Number(b.isi3) || 1; }

    return { barang: b, satuan, viaField, isi };
}

/** Tanggal hari ini format YYYY-MM-DD */
function today() {
    return new Date().toISOString().slice(0, 10);
}

/**
 * Konversi 1 sel tanggal dari file Excel (bisa berupa: serial number Excel,
 * objek Date dari SheetJS, atau teks "dd/mm/yyyy" / "yyyy-mm-dd") jadi string
 * ISO "YYYY-MM-DD" yang dipakai backend. Dipakai saat Import Penjualan/Pembelian
 * membaca kolom "Tanggal" per baris dari Template Import / hasil Export Semua.
 * Return '' kalau sel kosong/tidak bisa dibaca (biar pemanggil fallback ke
 * tanggal default di form, bukan mengirim tanggal kosong/salah ke backend).
 */
function excelTglKeISO(v) {
    if (v === null || v === undefined || v === '') return '';
    if (v instanceof Date && !isNaN(v)) return v.toISOString().slice(0, 10);
    if (typeof v === 'number') {
        // Serial date Excel (hari sejak 1899-12-30)
        const d = new Date(Math.round((v - 25569) * 86400 * 1000));
        return isNaN(d) ? '' : d.toISOString().slice(0, 10);
    }
    const s = String(v).trim();
    let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (m) return `${m[3]}-${m[2]}-${m[1]}`;
    return '';
}

/** Ambil YYYY-MM dari string tanggal */
function monthOf(t) {
    return t ? String(t).slice(0, 7) : '';
}

/** Label bulan: "2025-06" → "Jun 2025" */
function monthLabel(m) {
    if (!m) return '';
    const [y, mo] = m.split('-');
    const nm = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'];
    return (nm[parseInt(mo) - 1] || mo) + ' ' + y;
}

/* ── LOADING STATE HTML ───────────────────────────────────── */
const loadingHTML = `
    <div class="loading-state">
        <div class="loading-spinner"></div>
        <p>Memuat data…</p>
    </div>`;

/* ── TOAST NOTIFIKASI ─────────────────────────────────────── */

/**
 * Tampilkan notifikasi toast
 * @param {string} msg   - Pesan
 * @param {string} type  - 'ok' (hijau) | 'err' (merah) | 'y' (kuning)
 */
function toast(msg, type = 'ok') {
    const el = document.createElement('div');
    el.className = 'toast ' + (type === 'err' ? 'err' : type === 'y' ? '' : 'ok');
    el.innerHTML = (type === 'ok' ? '✓ ' : type === 'err' ? '✕ ' : '⚠ ') + esc(msg);
    document.getElementById('toastArea').appendChild(el);
    setTimeout(() => el.style.opacity = '0', 2800);
    setTimeout(() => el.remove(), 3200);
}

/* ── MODAL POPUP ──────────────────────────────────────────── */

/** Buka modal dengan konten HTML */
function openM(html) {
    document.getElementById('mbox').innerHTML = html;
    document.getElementById('moverlay').classList.add('on');
}

/** Tutup modal */
function closeM() {
    document.getElementById('moverlay').classList.remove('on');
}

// Klik overlay (luar modal) → tutup
document.getElementById('moverlay').addEventListener('click', e => {
    if (e.target.id === 'moverlay') closeM();
});

// Expose closeM ke inline onclick di HTML
window.closeM = closeM;

/**
 * Modal konfirmasi custom (pengganti confirm() bawaan browser yang munculnya
 * "localhost says…"). Pakai modal box yang sama (#mbox/#moverlay).
 * Pemakaian: if (!(await confirmDialog('Hapus data ini?'))) return;
 * @param {string} msg     - Pesan konfirmasi
 * @param {object} opts    - { title, okText, cancelText, danger }
 * @returns {Promise<boolean>}
 */
function confirmDialog(msg, opts = {}) {
    const {
        title      = 'Konfirmasi',
        okText     = 'Hapus',
        cancelText = 'Batal',
        danger     = true,
    } = opts;
    return new Promise(resolve => {
        const cleanup = (result) => { closeM(); resolve(result); };
        // Beri nama unik supaya tidak bentrok kalau ada beberapa confirm berurutan
        const okId = '_cfmOk_' + Date.now();
        window[okId] = () => cleanup(true);
        openM(`
        <div class="mhd"><h3>⚠️ ${esc(title)}</h3><button class="mclose" onclick="${okId}_cancel()">×</button></div>
        <div class="mbd"><p style="margin:0;line-height:1.6;white-space:pre-line;">${esc(msg)}</p></div>
        <div class="mft">
            <button class="btn btn-g" onclick="${okId}_cancel()">${esc(cancelText)}</button>
            <button class="btn ${danger ? 'btn-d' : 'btn-p'}" onclick="${okId}()">${esc(okText)}</button>
        </div>`);
        window[okId + '_cancel'] = () => cleanup(false);
    });
}
window.confirmDialog = confirmDialog;

/* ── CONNECTION STATUS INDICATOR ─────────────────────────── */

/**
 * Update indikator koneksi di topbar
 * @param {boolean} ok  - true = terhubung, false = error
 * @param {string}  txt - Teks yang ditampilkan
 */
function setConnStatus(ok, txt) {
    const wrap = document.getElementById('connStatus');
    if (!wrap) return;
    wrap.querySelector('.conn-dot').className = 'conn-dot ' + (ok ? 'ok' : 'err');
    wrap.querySelector('.conn-txt').textContent = txt;
}

/* ── HTML BUILDERS YANG DIPAKAI BANYAK MODUL ─────────────── */

/**
 * Generate <option> cabang dari STATE.cabang
 * @param {string} selected - Nama cabang yang dipilih
 */
function cabangOpts(selected = '') {
    return `<option value="">– Pilih cabang –</option>` +
        STATE.cabang.map(c =>
            `<option value="${esc(c.nama)}" ${c.nama === selected ? 'selected' : ''}>${esc(c.nama)}</option>`
        ).join('');
}

/**
 * Generate <option> supplier dari STATE.supplier — dipakai di form Pembelian
 * & Barang Masuk supaya supplier selalu dipilih dari Master Supplier.
 * @param {string} selected - Nama supplier yang dipilih
 */
function supplierOpts(selected = '') {
    return `<option value="">– Pilih supplier –</option>` +
        (STATE.supplier || []).map(s =>
            `<option value="${esc(s.nama)}" ${s.nama === selected ? 'selected' : ''}>${esc(s.nama)}</option>`
        ).join('');
}

/**
 * Generate <option> akun Kas/Bank dari STATE.coa (yang ditandai is_kas) —
 * dipakai di Kasir Penjualan/Pembelian & Transaksi supaya kasir WAJIB
 * memilih akun kas/bank tujuan setiap transaksi Tunai, sehingga saldo
 * per-akun (mis. Kas Toko A vs Kas Toko B) & perhitungan modal akurat.
 * @param {string} selected - Kode akun yang dipilih
 */
function kasOpts(selected = '') {
    const list = (STATE.coa || []).filter(c => c.is_kas);
    if (!list.length) {
        return `<option value="">– Belum ada akun Kas/Bank, tandai di Master › COA –</option>`;
    }
    // Default ke akun Kas tunai (bukan Bank) kalau belum ada yang dipilih —
    // mayoritas transaksi toko memang tunai, jadi kasir gak perlu klik ulang
    // tiap transaksi baru, tapi tetap bebas ganti ke akun lain (mis. Bank).
    if (!selected) {
        const tunai = list.find(c => c.kode === '1101')
            || list.find(c => /tunai/i.test(c.nama))
            || list.find(c => /kas/i.test(c.nama) && !/bank/i.test(c.nama));
        if (tunai) selected = tunai.kode;
    }
    return `<option value="">– Pilih Kode Kas –</option>` +
        list.map(c =>
            `<option value="${esc(c.kode)}" ${c.kode === selected ? 'selected' : ''}>${esc(c.kode)} – ${esc(c.nama)}</option>`
        ).join('');
}

/**
 * Generate <datalist> untuk autocomplete kode barang
 * @param {string} id - ID dari datalist element
 */
function barangDatalist(id) {
    return `<datalist id="${id}">${STATE.barang.map(b =>
        `<option value="${esc(b.kode)}">${esc(b.kode)} – ${esc(b.nama)}</option>`
    ).join('')}</datalist>`;
}

/**
 * Generate <datalist> untuk autocomplete kode jasa
 * @param {string} id - ID dari datalist element
 */
function jasaDatalist(id) {
    return `<datalist id="${id}">${STATE.jasa.map(j =>
        `<option value="${esc(j.kode)}">${esc(j.kode)} – ${esc(j.nama)}</option>`
    ).join('')}</datalist>`;
}

/**
 * Generate <datalist> untuk autocomplete kode pelanggan — dipakai Kasir POS
 * @param {string} id - ID dari datalist element
 */
function pelangganDatalist(id) {
    return `<datalist id="${id}">${(STATE.pelanggan || []).map(p =>
        `<option value="${esc(p.kode)}">${esc(p.kode)} – ${esc(p.nama)} (${p.poin || 0} poin)</option>`
    ).join('')}</datalist>`;
}

/**
 * Tombol export bar (Excel + Print)
 * @param {string} tableId   - ID tabel untuk diekspor
 * @param {string} filename  - Nama file output
 * @param {string} sectionId - ID section untuk print
 * @param {string} title     - Judul laporan
 */
function exportBar(tableId, filename, sectionId, title) {
    return `<div class="export-bar no-print">
        <span class="lbl">Export:</span>
        <button class="btn btn-g btn-sm" onclick="exportExcel('${tableId}','${filename}')">📊 Excel</button>
        <button class="btn btn-g btn-sm" onclick="printSection('${sectionId}','${title}')">🖨️ Print / PDF</button>
    </div>`;
}

/**
 * Export bar khusus laporan keuangan (Excel + PDF/Print)
 */
function lapExportBar(elId, title, tblId) {
    return `<div class="export-bar no-print">
        <span class="lbl">Export:</span>
        <button class="btn btn-g btn-sm" onclick="exportExcel('${tblId}','${title.replace(/\s/g,'-').toLowerCase()}')">📊 Excel</button>
        <button class="btn btn-blue btn-sm" onclick="printSection('${elId}','${title}')">📄 PDF / Print</button>
    </div>`;
}

/**
 * HTML pagination buttons
 * @param {object} meta        - Objek pagination dari Laravel (current_page, last_page, total, from, to)
 * @param {string} onPageFn    - Nama fungsi JS yang dipanggil saat ganti halaman, misal "renderBarang"
 */
function paginationHTML(meta, onPageFn) {
    if (!meta || !meta.last_page || meta.last_page <= 1) return '';
    // onPageFn bisa berupa nama fungsi biasa ("renderBarang") ATAU string
    // arrow function ("p=>renderJualBeli('jual','elId',p)", dipakai Riwayat
    // Penjualan/Pembelian). Tanpa kurung pembungkus di sini, versi arrow
    // function HANYA MENDEFINISIKAN fungsinya lalu langsung dibuang (bukan
    // memanggilnya) — itu sebabnya tombol Next/nomor halaman di Riwayat
    // Penjualan & Pembelian sebelumnya tidak berfungsi sama sekali, padahal
    // daftar lain (Master Barang, Mutasi, Kasir POS) yang pakai nama fungsi
    // biasa tidak kena masalah ini. Kurung "(...)" di bawah membuat kedua
    // format tetap benar dipanggil.
    let html = `<div class="pagination">
        <span class="page-info">${meta.from}–${meta.to} dari ${meta.total} data</span>
        <button ${meta.current_page <= 1 ? 'disabled' : ''} onclick="(${onPageFn})(${meta.current_page - 1})">‹ Prev</button>`;
    const start = Math.max(1, meta.current_page - 2);
    const end   = Math.min(meta.last_page, meta.current_page + 2);
    for (let p = start; p <= end; p++) {
        html += `<button class="${p === meta.current_page ? 'active' : ''}" onclick="(${onPageFn})(${p})">${p}</button>`;
    }
    html += `<button ${meta.current_page >= meta.last_page ? 'disabled' : ''} onclick="(${onPageFn})(${meta.current_page + 1})">Next ›</button>
    </div>`;
    return html;
}

/** Filter array sederhana di sisi klien (utk halaman yang datanya sudah
 *  lengkap di memori, mis. Jurnal Umum) — pencarian case/aksen-insensitive
 *  di beberapa kolom sekaligus. Dipakai oleh jurnal.js & master.js. */
window.clientSearch = function (list, term, fields) {
    const q = String(term || '').trim().toLowerCase();
    if (!q) return list;
    const norm = s => String(s == null ? '' : s).toLowerCase();
    return list.filter(row => fields.some(f => norm(row[f]).includes(q)));
};

/* ── PENCARIAN (SMART SEARCH) ────────────────────────────────
   Dipasang di oninput semua kotak pencarian (id="srch...") lewat pola:
     oninput="smartSearch('srchXxx', this.value, v => { ...simpan v... }, renderFn)"
   - Ketikan di-debounce (300ms) supaya tidak render ulang di setiap huruf.
   - Menekan Enter langsung memicu pencarian tanpa menunggu jeda debounce
     (didengarkan lewat delegasi keydown di bawah, otomatis berlaku utk
     SEMUA input id yang diawali "srch" tanpa perlu pasang handler manual
     di tiap-tiap kotak pencarian).
   - Fokus & posisi kursor input dikembalikan setelah render, karena renderFn
     biasanya menulis ulang seluruh HTML (termasuk elemen input itu sendiri),
     yang tanpa ini bikin fokus hilang & terasa "nge-lag" tiap kali mengetik. */
const _smartSearchTimers  = {};
const _smartSearchPending = {};
const _smartSearchSeq     = {};   // penjaga respons "basi" — lihat catatan di bawah

// Huruf pertama/kedua nyaris tidak pernah cukup buat cari nama yg berarti,
// jadi tidak usah kirim request dulu sampai minimal 2 huruf — mengurangi
// jumlah request ke server dev lokal (php artisan serve) yg cuma bisa
// proses request satu-satu.
const SMART_SEARCH_MIN_CHARS = 2;
// 450ms (naik dari 300ms): server dev lokal (php artisan serve) jauh lebih
// lambat balas dibanding server produksi beneran, jadi kasih jeda ketik
// lebih longgar supaya request beneran cuma terkirim setelah user selesai
// ngetik satu suku kata, bukan tiap kali jeda sebentar antar huruf.
const SMART_SEARCH_DELAY_MS = 450;

function smartSearch(inputId, value, setter, renderFn) {
    _smartSearchPending[inputId] = { setter, renderFn, value };
    clearTimeout(_smartSearchTimers[inputId]);

    const trimmed = String(value || '').trim();
    // Kosongkan pencarian → tetap diproses (supaya balik ke daftar penuh),
    // tapi ketikan pendek yg belum genap 2 huruf tidak perlu bikin timer/
    // request sama sekali.
    if (trimmed !== '' && trimmed.length < SMART_SEARCH_MIN_CHARS) return;

    _smartSearchTimers[inputId] = setTimeout(() => _runSmartSearch(inputId), SMART_SEARCH_DELAY_MS);
}
window.smartSearch = smartSearch;

function _runSmartSearch(inputId) {
    const pending = _smartSearchPending[inputId];
    if (!pending) return;
    clearTimeout(_smartSearchTimers[inputId]);
    delete _smartSearchPending[inputId];

    const el       = document.getElementById(inputId);
    const selStart = el ? el.selectionStart : null;
    const selEnd   = el ? el.selectionEnd   : null;

    pending.setter(pending.value);

    // renderFn (renderPoin/renderKontak, dst) dipanggil sekarang. Bagian
    // sinkronnya — termasuk beginSearchRender(inputId) yg dipanggil sbg
    // baris PERTAMA di renderFn, lihat catatan di beginSearchRender — sudah
    // selesai jalan duluan SEBELUM baris berikutnya di sini dieksekusi
    // (aturan dasar async/await: kode sinkron sebelum "await" pertama
    // jalan langsung saat fungsinya dipanggil). Jadi di titik ini,
    // _smartSearchSeq[inputId] sudah menunjuk giliran pencarian yg sedang
    // berjalan sekarang.
    const renderResult = pending.renderFn();
    const mySeq = _smartSearchSeq[inputId];

    Promise.resolve(renderResult).then(() => {
        // Kalau ada pencarian LEBIH BARU yg sudah mulai sebelum yg ini
        // kelar (server dev lokal lambat balas), jangan rebut fokus balik
        // ke hasil yg sudah basi.
        if (mySeq !== undefined && _smartSearchSeq[inputId] !== mySeq) return;
        const elBaru = document.getElementById(inputId);
        if (elBaru) {
            elBaru.focus();
            if (selStart !== null) {
                try { elBaru.setSelectionRange(selStart, selEnd); } catch (e) { /* abaikan */ }
            }
        }
    });
}

/** Dipanggil renderFn (mis. renderPoin/renderKontak) SEBELUM mulai fetch,
 *  simpan token-nya, lalu cek isSearchStillCurrent sebelum benar-benar
 *  menulis hasil ke DOM. Kalau ada pencarian lain yg sudah mulai duluan
 *  setelahnya, jangan timpa layar dgn hasil yg sudah basi. */
function beginSearchRender(inputId) {
    return (_smartSearchSeq[inputId] = (_smartSearchSeq[inputId] || 0) + 1);
}
window.beginSearchRender = beginSearchRender;

function isSearchStillCurrent(inputId, token) {
    return _smartSearchSeq[inputId] === token;
}
window.isSearchStillCurrent = isSearchStillCurrent;

document.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const el = e.target;
    if (!el || el.tagName !== 'INPUT' || !el.id || !el.id.startsWith('srch')) return;
    e.preventDefault();
    _runSmartSearch(el.id);
});

/**
 * Status kadaluarsa barang berdasarkan tanggal
 * @param {string} tglExp - Tanggal kadaluarsa (YYYY-MM-DD)
 */
function expStatus(tglExp) {
    if (!tglExp) return { lbl: '–', cls: '' };
    const diff = Math.ceil((new Date(tglExp) - new Date(today())) / 86400000);
    if (diff < 0)   return { lbl: 'Kadaluarsa', cls: 'badge-out', diff };
    if (diff <= 30) return { lbl: `Mendekati (${diff} hr)`, cls: 'badge-warn', diff };
    return { lbl: `Aman (${diff} hr)`, cls: 'badge-in', diff };
}
