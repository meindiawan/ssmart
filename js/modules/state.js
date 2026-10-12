/* =============================================================
   state.js — Global State Management
   Menyimpan data master yang dipakai semua modul UI:
   cabang, barang, jasa, coa, tarif PPN.
   Diisi saat init (app.js → loadMasterData()) dan
   di-refresh setiap kali ada perubahan master data.
   ============================================================= */

/**
 * STATE — objek global yang diakses semua modul JS
 * Jangan assign ulang langsung; gunakan fungsi di bawah.
 */
const STATE = {
    cabang  : [],   // [{id, nama, alamat}, ...]
    barang  : [],   // [{id, kode, nama, ppn, modal}, ...] — katalog GABUNGAN semua cabang (harga = harga standar)
    hargaCabang: {}, // {namaCabang: {kodeBarang: [hargaJual, hargaGrosir, hargaCabang]}} — harga jual khusus tiap cabang
    jasa    : [],   // [{id, kode, nama, ppn, harga}, ...]
    coa     : [],   // [{id, kode, nama, kat, normal, is_default}, ...]
    supplier: [],   // [{id, nama, kontak, telp, alamat, keterangan}, ...]
    pelanggan: [],  // [{id, kode, nama, telp, alamat, poin}, ...] — dipakai Kasir POS
    tarif   : 11,   // Tarif PPN dalam persen (dari settings)
    stokBolehMinus: true, // Setting: apakah stok boleh sampai negatif (dari settings)
    posRpPerPoin: 10000,  // Setting: Rp berapa = 1 poin pelanggan di Kasir POS
    namaToko: 'Toko Sumini', // Setting: nama toko (dipakai header struk Kasir POS)
};

/* ── LOAD DARI API ────────────────────────────────────────── */

/**
 * Muat semua data master dari API secara paralel.
 * Dipanggil saat splash (init) dan setelah ada perubahan master.
 * @returns {Promise<boolean>} true jika berhasil, false jika gagal
 */
async function loadMasterData() {
    try {
        const [cabang, coa, barang, jasa, settings, supplier, pelanggan, hargaCabang] = await Promise.all([
            apiGet('/master/cabang'),
            apiGet('/master/coa'),
            apiGet('/master/barang/all'),
            apiGet('/master/jasa'),
            apiGet('/master/settings'),
            apiGet('/supplier'),
            apiGet('/master/pelanggan'),
            // Harga jual per cabang — kalau gagal dimuat, semua cabang tetap pakai harga standar
            apiGet('/master/barang/harga-cabang').catch(() => ({})),
        ]);

        // Normalisasi: API bisa return array langsung atau {data:[]}
        STATE.cabang  = Array.isArray(cabang)  ? cabang  : (cabang.data  || []);
        STATE.coa     = Array.isArray(coa)     ? coa     : (coa.data     || []);
        STATE.barang  = Array.isArray(barang)  ? barang  : (barang.data  || []);
        STATE.hargaCabang = (hargaCabang && !Array.isArray(hargaCabang)) ? hargaCabang : {};
        STATE.jasa    = Array.isArray(jasa)    ? jasa    : (jasa.data    || []);
        STATE.supplier= Array.isArray(supplier)? supplier: (supplier.data|| []);
        STATE.pelanggan = Array.isArray(pelanggan) ? pelanggan : (pelanggan.data || []);
        STATE.tarif   = Number(settings.tarif_ppn) || 11;
        STATE.stokBolehMinus = settings.stok_boleh_minus !== false;
        STATE.posRpPerPoin = Number(settings.pos_rp_per_poin) || 10000;
        STATE.namaToko = settings.nama_toko || 'Toko Sumini';

        // Update badge tarif di sidebar
        const badge = document.getElementById('tarifBadge');
        if (badge) badge.textContent = STATE.tarif + '%';

        // Isi ulang dropdown filter cabang di topbar
        fillCabangDropdown();

        setConnStatus(true, 'Terhubung ke server');
        return true;

    } catch (err) {
        setConnStatus(false, 'Gagal terhubung');
        console.error('[STATE] loadMasterData error:', err.message);
        return false;
    }
}

/* ── DROPDOWN CABANG ──────────────────────────────────────── */

/**
 * Isi ulang dropdown #gCabang di topbar dengan data STATE.cabang
 * Pertahankan pilihan sebelumnya jika cabang masih ada
 */
function fillCabangDropdown() {
    const sel = document.getElementById('gCabang');
    if (!sel) return;

    const prev = sel.value; // simpan pilihan sebelumnya
    sel.innerHTML =
        '<option value="">Semua Cabang</option>' +
        STATE.cabang.map(c =>
            `<option value="${esc(c.nama)}">${esc(c.nama)}</option>`
        ).join('');

    // Kembalikan pilihan sebelumnya jika masih valid
    if (STATE.cabang.some(c => c.nama === prev)) {
        sel.value = prev;
    }
}

/* ── GETTER HELPERS ───────────────────────────────────────── */

/** Cari barang dari STATE berdasarkan kode ATAU salah satu barcode (hasil scan) */
function getBarang(kode) {
    if (!kode) return null;
    const kb = String(kode).trim();
    // Toleransi perbedaan leading zero pada kode/barcode angka (lihat catatan
    // di detectSatuanBarang, helpers.js) — kode yang sama tapi beda sumber data
    // kadang tersimpan dengan/tanpa angka 0 di depan.
    const isNumeric = /^\d+$/.test(kb);
    const kbNum = isNumeric ? String(parseInt(kb, 10)) : null;
    const sameCode = (val) => {
        if (val == null) return false;
        const v = String(val).trim();
        if (v === kb) return true;
        if (kbNum !== null && /^\d+$/.test(v) && String(parseInt(v, 10)) === kbNum) return true;
        return false;
    };
    return STATE.barang.find(b =>
        sameCode(b.kode) || sameCode(b.barcode) || sameCode(b.barcode2) || sameCode(b.barcode3)
    ) || null;
}

/**
 * Harga jual sebuah barang untuk 1 cabang: harga khusus cabang itu kalau ada (> 0),
 * kalau tidak ikut harga standar di katalog gabungan. Tanpa cabang = harga standar.
 * @returns {{harga_jual:number, harga_grosir:number, harga_cabang:number}}
 */
function hargaBarangCabang(b, cabang) {
    const std = {
        harga_jual  : Number(b && b.harga_jual)   || 0,
        harga_grosir: Number(b && b.harga_grosir) || 0,
        harga_cabang: Number(b && b.harga_cabang) || 0,
    };
    if (!b || !cabang) return std;
    const h = STATE.hargaCabang && STATE.hargaCabang[cabang] && STATE.hargaCabang[cabang][b.kode];
    if (!h) return std;
    return {
        harga_jual  : Number(h[0]) > 0 ? Number(h[0]) : std.harga_jual,
        harga_grosir: Number(h[1]) > 0 ? Number(h[1]) : std.harga_grosir,
        harga_cabang: Number(h[2]) > 0 ? Number(h[2]) : std.harga_cabang,
    };
}

/** Cari jasa dari STATE berdasarkan kode */
function getJasa(kode) {
    return STATE.jasa.find(j => j.kode === kode) || null;
}

/** Cari pelanggan dari STATE berdasarkan kode — dipakai Kasir POS */
function getPelanggan(kode) {
    if (!kode) return null;
    return STATE.pelanggan.find(p => p.kode === kode) || null;
}

/** Cari nama akun COA dari STATE berdasarkan kode */
function getNamaAkun(kode) {
    const a = STATE.coa.find(c => c.kode === kode);
    return a ? a.nama : kode;
}

/** Ambil cabang yang sedang dipilih di dropdown */
function getCabang() {
    const sel = document.getElementById('gCabang');
    return sel ? sel.value : '';
}
