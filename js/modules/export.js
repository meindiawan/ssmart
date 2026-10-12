/* =============================================================
   export.js — Export Excel & Print / PDF
   Menggunakan library SheetJS (xlsx.full.min.js) untuk Excel.
   Print/PDF menggunakan window.print() browser native.
   ============================================================= */

/* ── EXPORT EXCEL ─────────────────────────────────────────── */

/**
 * Export tabel HTML ke file Excel (.xlsx)
 * @param {string} tableId  - ID element <table> yang akan diekspor
 * @param {string} filename - Nama file (tanpa ekstensi & tanggal)
 */
function exportExcel(tableId, filename) {
    const tbl = document.getElementById(tableId);
    if (!tbl) { toast('Tabel tidak ditemukan, buka halaman datanya dulu.', 'err'); return; }

    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.table_to_sheet(tbl);

        // Auto-width kolom
        const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
        const cols  = [];
        for (let c = range.s.c; c <= range.e.c; c++) {
            let maxW = 10;
            for (let r = range.s.r; r <= range.e.r; r++) {
                const cell = ws[XLSX.utils.encode_cell({ r, c })];
                if (cell?.v) {
                    const len = String(cell.v).length;
                    if (len > maxW) maxW = len;
                }
            }
            cols.push({ wch: Math.min(maxW + 4, 50) });
        }
        ws['!cols'] = cols;

        XLSX.utils.book_append_sheet(wb, ws, 'Data');
        XLSX.writeFile(wb, `${filename}-${today()}.xlsx`);
        toast('File Excel berhasil diunduh');

    } catch (e) {
        toast('Gagal export Excel: ' + e.message, 'err');
    }
}

// Expose ke window agar bisa dipanggil dari onclick di HTML
window.exportExcel = exportExcel;

/**
 * Export SEMUA data Penjualan/Pembelian ke Excel — beda dengan exportExcel()
 * di atas yang cuma membaca tabel HTML yang lagi tampil di layar (jadi kalau
 * datanya 1497 baris tapi per halaman cuma tampil 30, yang keexport ya cuma
 * 30 itu). Fungsi ini ambil ulang SEMUA data langsung dari server (mengikuti
 * cabang & rentang tanggal yang lagi aktif di filter Riwayat), lalu susun
 * jadi sheet baru dengan kolom "No. Referensi" (no_nota, mis. TXJ-20260811-1497)
 * supaya bisa dicocokkan ke Jurnal, dan formatnya sama persis dengan yang
 * dipakai importJualBeli() untuk Import — jadi file hasil export ini juga
 * bisa langsung dipakai ulang sebagai template import.
 * @param {string} jenis - 'jual' atau 'beli'
 */
async function exportJualBeliSemua(jenis) {
    const isJ = jenis === 'jual';
    const btn = event?.currentTarget;
    const btnTextAsal = btn?.textContent;
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyiapkan...'; }

    try {
        const f   = trxFilter(jenis);
        const cab = getCabang();
        // per_page=0 → backend TransaksiController::getJual/getBeli menganggap
        // ini "Semua" (lihat: if ($perPage <= 0 ...) $perPage = 99999;)
        const q   = buildQuery({ cabang: cab, per_page: 0, dari: f.dari, sampai: f.sampai });
        const res  = await apiGet(`/transaksi/${jenis}` + q);
        const list = res.data || [];

        if (!list.length) { toast('Tidak ada data untuk diexport pada filter saat ini', 'y'); return; }

        const rows = list.map(t => {
            const tot = Number(t.qty) * Number(t.harga) - Number(t.diskon || 0);
            const row = {
                'Tanggal':       t.tgl,
                'No. Referensi': t.no_nota || '',
                'Cabang':        t.cabang,
                'Kode Barang':   t.tidak_dikenal ? (t.kode_asli || t.kode_barang) : t.kode_barang,
                'Nama Barang':   t.nama_barang || '',
                'Qty':           Number(t.qty),
                'Satuan':        t.satuan || '',
                'Harga':         Number(t.harga),
                'Diskon':        Number(t.diskon || 0),
                'Total':         tot,
                'Bayar':         t.bayar,
            };
            if (!isJ) { row['Supplier'] = t.supplier || ''; row['Operator'] = t.operator || ''; }
            row['Keterangan'] = t.keterangan || '';
            return row;
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(rows);

        // Auto-width kolom berdasarkan isi terpanjang per kolom
        const headers = Object.keys(rows[0]);
        ws['!cols'] = headers.map(h => {
            let maxW = h.length;
            for (const r of rows) {
                const len = String(r[h] ?? '').length;
                if (len > maxW) maxW = len;
            }
            return { wch: Math.min(maxW + 2, 40) };
        });

        XLSX.utils.book_append_sheet(wb, ws, isJ ? 'Penjualan' : 'Pembelian');
        XLSX.writeFile(wb, `data-${jenis}-semua-${today()}.xlsx`);
        toast(`${list.length.toLocaleString('id-ID')} baris berhasil diexport`);

    } catch (e) {
        toast('Gagal export semua data: ' + e.message, 'err');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = btnTextAsal; }
    }
}
window.exportJualBeliSemua = exportJualBeliSemua;

/**
 * Download template kosong (+ 2 baris contoh) untuk Import Penjualan/Pembelian.
 * Kolomnya sengaja SAMA PERSIS dengan hasil exportJualBeliSemua() supaya file
 * hasil export bisa langsung dipakai ulang sebagai bahan import juga. Contoh
 * 2 baris pertama sengaja dibuat pakai No. Referensi yang SAMA supaya user
 * lihat langsung bagaimana beberapa barang bisa digabung jadi 1 nota.
 * @param {string} jenis - 'jual' atau 'beli'
 */
function downloadTemplateImport(jenis) {
    const isJ = jenis === 'jual';
    // Kolom "HPP" (khusus Penjualan) & "PPN" opsional — kosongkan kalau tidak
    // punya datanya (HPP akan otomatis dihitung dari rata-rata Kartu HPP;
    // status PPN otomatis ikut Master Barang). Diisi kalau sumbernya (mis.
    // laporan "Penjualan By Barang" dari kasir lama) sudah punya angka
    // otoritatifnya sendiri — lihat catatan di TransaksiController::importTrx.
    const contoh = isJ ? [
        { 'Tanggal': today(), 'No. Referensi': 'TXJ-CONTOH-0001', 'Cabang': (STATE.cabang?.[0]?.nama || 'KANTOR PUSAT'), 'Kode Barang': 'KODE001', 'Nama Barang': '(opsional, diabaikan — dicocokkan dari Kode Barang)', 'Qty': 2, 'Satuan': '', 'Harga': 15000, 'HPP': '(opsional — harga pokok per satuan baris ini, kosongkan utk pakai rata-rata Kartu HPP)', 'PPN': 'Kena PPN', 'Diskon': 0, 'Bayar': 'Tunai', 'Kasir': 'BAEA1', 'Shift': 'Pagi', 'Keterangan': '' },
        { 'Tanggal': today(), 'No. Referensi': 'TXJ-CONTOH-0001', 'Cabang': (STATE.cabang?.[0]?.nama || 'KANTOR PUSAT'), 'Kode Barang': 'KODE002', 'Nama Barang': '', 'Qty': 1, 'Satuan': '', 'Harga': 25000, 'HPP': '', 'PPN': 'Kena PPN', 'Diskon': 0, 'Bayar': 'Tunai', 'Kasir': 'BAEA1', 'Shift': 'Pagi', 'Keterangan': '' },
    ] : [
        { 'Tanggal': today(), 'No. Referensi': 'TXB-CONTOH-0001', 'Cabang': (STATE.cabang?.[0]?.nama || 'KANTOR PUSAT'), 'Kode Barang': 'KODE001', 'Nama Barang': '(opsional, diabaikan — dicocokkan dari Kode Barang)', 'Qty': 10, 'Satuan': '', 'Harga': 10000, 'PPN': 'Kena PPN', 'Diskon': 0, 'Bayar': 'Tunai', 'Supplier': (STATE.supplier?.[0]?.nama || 'Nama Supplier'), 'Operator': 'OFFICER', 'Keterangan': '' },
        { 'Tanggal': today(), 'No. Referensi': 'TXB-CONTOH-0001', 'Cabang': (STATE.cabang?.[0]?.nama || 'KANTOR PUSAT'), 'Kode Barang': 'KODE002', 'Nama Barang': '', 'Qty': 5, 'Satuan': '', 'Harga': 20000, 'PPN': 'Kena PPN', 'Diskon': 0, 'Bayar': 'Tunai', 'Supplier': (STATE.supplier?.[0]?.nama || 'Nama Supplier'), 'Operator': 'OFFICER', 'Keterangan': '' },
    ];

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(contoh);
    ws['!cols'] = Object.keys(contoh[0]).map(h => ({ wch: Math.max(h.length, 20) }));
    XLSX.utils.book_append_sheet(wb, ws, isJ ? 'Template Penjualan' : 'Template Pembelian');
    XLSX.writeFile(wb, `template-import-${jenis}.xlsx`);
    toast('Template diunduh — isi kolom "No. Referensi" sama untuk barang yang mau digabung 1 nota, kosongkan kalau tidak perlu (tiap baris jadi nota sendiri). Kolom "HPP"/"PPN" opsional.');
}
window.downloadTemplateImport = downloadTemplateImport;

/**
 * Download template kosong (+ contoh) untuk Import Master Barang. Kolomnya
 * mengikuti BARANG_HEADER_ALIAS di master.js — nama kolom di sini dibuat
 * ramah-baca (mis. "KODE_BARANG") tapi tetap dikenali karena parser sudah
 * menormalisasi header (huruf kecil, tanpa spasi/underscore/simbol) sebelum
 * dicocokkan.
 */
function downloadTemplateImportBarang() {
    const contoh = [{
        'KODE_BARANG': 'BRG001', 'KODE_BARCODE': '8991234567890', 'KODE_BARCODE_2': '', 'KODE_BARCODE_3': '',
        'NAMA': 'Contoh Nama Barang', 'KATEGORI': 'Makanan', 'SUB_KATEGORI': '', 'SUPPLIER': '',
        'SATUAN_1': 'PCS', 'SATUAN_2': 'KARTON', 'SATUAN_3': '', 'ISI': 12, 'ISI_3': '',
        'HARGA_TOKO_1': 10000, 'HARGA_PARTAI_1': 9000, 'HARGA_CABANG_1': 9500,
        'STOK_MIN': 5, 'STOK_MAX': 100, 'TOKO': 0, 'GUDANG': 0,
    }];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(contoh);
    ws['!cols'] = Object.keys(contoh[0]).map(h => ({ wch: Math.max(h.length, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Template Barang');
    XLSX.writeFile(wb, 'template-import-barang.xlsx');
    toast('Template diunduh — tanpa kolom HPP (HPP otomatis dari Pembelian, 0 kalau belum ada pembelian). SATUAN_2/ISI opsional.');
}
window.downloadTemplateImportBarang = downloadTemplateImportBarang;

/**
 * Download template kosong (+ contoh) untuk Import Satuan Massal — kolomnya
 * mengikuti parser di master.js: previewImportSatuanMassal().
 */
function downloadTemplateImportSatuan() {
    const contoh = [
        { 'KODE_BARANG': 'BRG001', 'SATUAN_1': 'PCS', 'SATUAN_2': 'KARTON', 'ISI': 12, 'SATUAN_3': '', 'ISI_3': '' },
        { 'KODE_BARANG': 'BRG002', 'SATUAN_1': 'PCS', 'SATUAN_2': 'DUS', 'ISI': 24, 'SATUAN_3': 'PAK', 'ISI_3': 6 },
    ];
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(contoh);
    ws['!cols'] = Object.keys(contoh[0]).map(h => ({ wch: Math.max(h.length, 14) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Template Satuan');
    XLSX.writeFile(wb, 'template-import-satuan.xlsx');
    toast('Template diunduh — kosongkan Satuan 3/Isi 3 kalau barang cuma punya 2 satuan.');
}
window.downloadTemplateImportSatuan = downloadTemplateImportSatuan;

/* ── PRINT / PDF ──────────────────────────────────────────── */

/**
 * Buka jendela print untuk section tertentu
 * Browser bisa print sebagai PDF (Save as PDF)
 * @param {string} sectionId - ID element yang akan dicetak
 * @param {string} title     - Judul dokumen
 */
function printSection(sectionId, title) {
    const el = document.getElementById(sectionId);
    if (!el) { toast('Konten tidak ditemukan', 'err'); return; }

    // Ambil URL stylesheet
    const cssLinks = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .map(l => `<link rel="stylesheet" href="${l.href}">`)
        .join('\n');

    const pw = window.open('', '_blank', 'width=960,height=700');
    if (!pw) { toast('Popup diblokir browser. Izinkan popup untuk print.', 'err'); return; }

    pw.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
    <meta charset="UTF-8">
    <title>${title} – Toko Sumini</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    ${cssLinks}
    <style>
        body { padding: 28px; background: #fff; font-size: 12px; }
        .export-bar, .no-print, .btn, .row-del,
        .conn-status, .subnav, .pagination { display: none !important; }
        .box { box-shadow: none !important; border: 1px solid #ddd !important; }
        table { font-size: 11px !important; }
        @page { margin: 18mm 14mm; size: A4; }
    </style>
</head>
<body>
    <div style="border-bottom: 2px solid #0D2818; padding-bottom: 12px; margin-bottom: 20px;">
        <h2 style="font-family: 'Playfair Display', serif; font-size: 20px; color: #0D2818; margin:0;">${title}</h2>
        <p style="color: #888; font-size: 11px; margin: 4px 0 0;">
            Toko Sumini &nbsp;·&nbsp; Dicetak: ${new Date().toLocaleString('id-ID')}
            &nbsp;·&nbsp; Cabang: ${getCabang() || 'Semua Cabang'}
        </p>
    </div>
    ${el.innerHTML}
    <script>
        window.onload = () => setTimeout(() => { window.print(); }, 500);
    <\/script>
</body>
</html>`);
    pw.document.close();
    toast('Membuka jendela cetak…', 'y');
}

window.printSection = printSection;
