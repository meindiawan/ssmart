/* =============================================================
   laba-rugi-lengkap.js — Laporan Laba Rugi LENGKAP + Download PDF/Excel
   Menu: Laporan ▸ Laba Rugi Lengkap   (container: #lp-lrx)
   Data : GET /api/laporan/laba-rugi-lengkap  (LabaRugiLengkapController)

   Cara kerja (supaya layar, PDF, dan Excel PASTI sama angkanya):
     data API ──► lrxModel()  ──► daftar "blok" (kpi / note / statement / table / group)
                                   ├─► lrxHtml()   → tampil di layar
                                   ├─► lrxPdf()    → file PDF (jsPDF + autoTable)
                                   └─► lrxXlsx()   → file Excel (SheetJS)
   Mau ubah isi laporan? Cukup ubah lrxModel(); ketiga keluaran ikut berubah.
   ============================================================= */

/* ── STATE FILTER ─────────────────────────────────────────── */
window._lrx = window._lrx || {
    preset: 'bulan', dari: '', sampai: '', cabang: null, shift: '',
    rincianCabang: true, rekapPeriode: true, data: null,
};

const LRX_BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const LRX_HARI  = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/* ── FORMAT ───────────────────────────────────────────────── */
// Tanggal lokal (BUKAN toISOString → itu UTC dan salah sehari di WIB sebelum jam 07:00)
function lrxIso(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function lrxParse(s) { const [y, m, d] = String(s).slice(0, 10).split('-').map(Number); return new Date(y, m - 1, d); }
function lrxNum(v) { return Math.round(Number(v) || 0).toLocaleString('id-ID'); }
function lrxRp(v) { const n = Math.round(Number(v) || 0); return (n < 0 ? '-Rp ' : 'Rp ') + Math.abs(n).toLocaleString('id-ID'); }
function lrxPct(v) { return (Number(v) || 0).toFixed(1).replace('.', ',') + '%'; }
function lrxTglPanjang(s) { const d = lrxParse(s); return `${d.getDate()} ${LRX_BULAN[d.getMonth()]} ${d.getFullYear()}`; }
function lrxTglPendek(s) { const d = lrxParse(s); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }
// sel angka: t = teks tampil, v = nilai mentah (untuk Excel), neg = merah
const lrxN = v => ({ n: 1, t: lrxNum(v), v: Math.round(Number(v) || 0), neg: (Number(v) || 0) < -0.5 });
const lrxP = v => ({ n: 1, t: lrxPct(v), v: Math.round((Number(v) || 0) * 10) / 10, neg: (Number(v) || 0) < 0 });
const lrxI = v => ({ n: 1, t: lrxNum(v), v: Number(v) || 0, neg: false });
const lrxMargin = (laba, dasar) => dasar > 0 ? laba / dasar * 100 : 0;

function lrxLabelPeriode(f, meta) {
    if (f.dari && f.sampai) return f.dari === f.sampai ? lrxTglPanjang(f.dari) : `${lrxTglPanjang(f.dari)} s/d ${lrxTglPanjang(f.sampai)}`;
    if (f.dari)   return `sejak ${lrxTglPanjang(f.dari)}`;
    if (f.sampai) return `sampai ${lrxTglPanjang(f.sampai)}`;
    if (meta && meta.awal_data) return `Semua data (${lrxTglPanjang(meta.awal_data)} s/d ${lrxTglPanjang(meta.akhir_data)})`;
    return 'Semua data';
}
function lrxLabelBaris(key, granularitas) {
    if (granularitas === 'harian') { const d = lrxParse(key); return `${lrxTglPendek(key)} (${LRX_HARI[d.getDay()]})`; }
    const [y, m] = key.split('-').map(Number); return `${LRX_BULAN[m - 1]} ${y}`;
}

/* ── PRESET PERIODE ───────────────────────────────────────── */
function lrxHitungPreset(p) {
    const now = new Date(), y = now.getFullYear(), m = now.getMonth();
    switch (p) {
        case 'hari':   return [lrxIso(now), lrxIso(now)];
        case 'kemarin': { const k = new Date(y, m, now.getDate() - 1); return [lrxIso(k), lrxIso(k)]; }
        case '7hari':  return [lrxIso(new Date(y, m, now.getDate() - 6)), lrxIso(now)];
        case 'bulan':  return [lrxIso(new Date(y, m, 1)), lrxIso(new Date(y, m + 1, 0))];
        case 'bulanlalu': return [lrxIso(new Date(y, m - 1, 1)), lrxIso(new Date(y, m, 0))];
        case 'tahun':  return [`${y}-01-01`, `${y}-12-31`];
        default:       return ['', ''];   // semua
    }
}

/* ═════════════════════════════════════════════════════════════
   MODEL LAPORAN  (data API → blok-blok)
   ═════════════════════════════════════════════════════════════ */
function lrxStatementRows(lr) {
    const pb = lr.pendapatan;
    const pct = v => lrxP(lrxMargin(v, pb));
    const rows = [{ k: 'grp', c: ['PENDAPATAN'] }];
    (lr.pendapatan_detail || []).forEach(p => rows.push({ k: 'ind', c: [p.nama, lrxN(p.nilai), pct(p.nilai)] }));
    if (!(lr.pendapatan_detail || []).length) rows.push({ k: 'ind', c: ['(belum ada pendapatan)', lrxN(0), lrxP(0)] });
    rows.push({ k: 'sub', c: ['Total Pendapatan (DPP)', lrxN(lr.pendapatan), lrxP(100)] });
    rows.push({ c: ['(-) Harga Pokok Penjualan (HPP)', lrxN(lr.hpp), pct(lr.hpp)] });
    rows.push({ k: 'total', c: ['LABA KOTOR', lrxN(lr.laba_kotor), pct(lr.laba_kotor)] });
    rows.push({ k: 'grp', c: ['BIAYA OPERASIONAL'] });
    (lr.beban_detail || []).forEach(b => rows.push({ k: 'ind', c: [b.nama, lrxN(b.nilai), pct(b.nilai)] }));
    if (!(lr.beban_detail || []).length) rows.push({ k: 'ind', c: ['(belum ada biaya operasional tercatat)', lrxN(0), lrxP(0)] });
    rows.push({ k: 'sub', c: ['Total Biaya Operasional', lrxN(lr.beban), pct(lr.beban)] });
    rows.push({ k: 'total', c: [lr.laba_bersih >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH', lrxN(lr.laba_bersih), pct(lr.laba_bersih)] });
    return rows;
}
function lrxStatement(judul, sub, lr) {
    return { type: 'table', title: judul, sub, head: ['Keterangan', 'Jumlah (Rp)', '% dari Pendapatan'], align: 'lrr', widths: [0, 42, 36], narrow: true, rows: lrxStatementRows(lr) };
}
function lrxKpiLengkap(lr) {
    return {
        type: 'kpi', items: [
            { label: 'Pendapatan (DPP)', value: lrxRp(lr.pendapatan), sub: 'Penjualan tanpa PPN', tone: 'blue' },
            { label: 'HPP (Modal Barang)', value: lrxRp(lr.hpp), sub: 'Modal barang yang terjual', tone: 'red' },
            { label: 'Laba Kotor', value: lrxRp(lr.laba_kotor), sub: `Margin ${lrxPct(lrxMargin(lr.laba_kotor, lr.pendapatan))}`, tone: lr.laba_kotor >= 0 ? 'green' : 'red' },
            { label: 'Biaya Operasional', value: lrxRp(lr.beban), sub: 'Gaji, sewa, listrik, dll', tone: 'red' },
            { label: lr.laba_bersih >= 0 ? 'Laba Bersih' : 'Rugi Bersih', value: lrxRp(lr.laba_bersih), sub: `Margin ${lrxPct(lrxMargin(lr.laba_bersih, lr.pendapatan))}`, tone: lr.laba_bersih >= 0 ? 'green' : 'red' },
        ],
    };
}

// Tabel "Rincian shift & kasir" untuk 1 atau banyak cabang
function lrxTabelShiftKasir(judul, sub, cabangList, totalRow) {
    const rows = [];
    cabangList.forEach(c => {
        const pk = c.penjualan_kasir || {};
        if (!(c.shift || []).length) return;
        rows.push({ k: 'grp', c: [`Cabang ${c.cabang}`] });
        (c.shift || []).forEach(s => {
            rows.push({ k: 'sub', c: [`Shift ${s.shift}`, lrxI(s.struk), lrxN(s.dpp), lrxN(s.hpp), lrxN(s.laba), lrxP(lrxMargin(s.laba, s.dpp))] });
            (s.kasir || []).forEach(k => rows.push({ k: 'ind', c: [`Kasir ${k.kasir}`, lrxI(k.struk), lrxN(k.dpp), lrxN(k.hpp), lrxN(k.laba), lrxP(lrxMargin(k.laba, k.dpp))] }));
        });
        if (cabangList.length > 1 || c.non_kasir) {
            rows.push({ k: 'total', c: [`Total penjualan kasir ${c.cabang}`, lrxI(pk.struk), lrxN(pk.dpp), lrxN(pk.hpp), lrxN(pk.laba), lrxP(lrxMargin(pk.laba, pk.dpp))] });
        }
        const nk = c.non_kasir;
        if (nk && (Math.abs(nk.pendapatan) > 0.5 || Math.abs(nk.hpp) > 0.5)) {
            rows.push({ c: ['Di luar kasir (retur, jasa, sewa, selisih stok)', '', lrxN(nk.pendapatan), lrxN(nk.hpp), lrxN(nk.laba), ''] });
            rows.push({ k: 'total', c: [`LABA KOTOR CABANG ${String(c.cabang).toUpperCase()}`, '', lrxN(c.pendapatan), lrxN(c.hpp), lrxN(c.laba_kotor), lrxP(lrxMargin(c.laba_kotor, c.pendapatan))] });
        }
    });
    if (!rows.length) return null;
    return { type: 'table', title: judul, sub, head: ['Cabang / Shift / Kasir', 'Struk', 'Pendapatan (DPP)', 'HPP', 'Laba Kotor', 'Margin'], align: 'lrrrrr', widths: [0, 18, 34, 34, 34, 20], rows, foot: totalRow || null };
}

// Tabel rekap harian / bulanan
function lrxTabelPeriode(judul, sub, periode, gran, tanpaBiaya) {
    if (!periode || !periode.length) return null;
    const hasShift = n => periode.some(p => p.shift && p.shift[n]);
    const shifts = ['Pagi', 'Siang', 'Sehari'].filter(hasShift);
    const label = gran === 'harian' ? 'Tanggal' : 'Bulan';
    const head = [label, 'Pendapatan', 'HPP', 'Laba Kotor'];
    if (!tanpaBiaya) head.push('Biaya Ops.', 'Laba Bersih');
    shifts.forEach(s => head.push(`Laba Kotor ${s}`));
    const sum = { pendapatan: 0, hpp: 0, laba_kotor: 0, beban: 0, laba_bersih: 0 }; const sumSh = {}; shifts.forEach(s => sumSh[s] = 0);
    const rows = periode.map(p => {
        ['pendapatan', 'hpp', 'laba_kotor', 'beban', 'laba_bersih'].forEach(k => sum[k] += p[k]);
        const c = [lrxLabelBaris(p.periode, gran), lrxN(p.pendapatan), lrxN(p.hpp), lrxN(p.laba_kotor)];
        if (!tanpaBiaya) c.push(lrxN(p.beban), lrxN(p.laba_bersih));
        shifts.forEach(s => { const z = (p.shift || {})[s]; sumSh[s] += z ? z.laba : 0; c.push(z ? lrxN(z.laba) : '-'); });
        return { c };
    });
    const foot = ['TOTAL', lrxN(sum.pendapatan), lrxN(sum.hpp), lrxN(sum.laba_kotor)];
    if (!tanpaBiaya) foot.push(lrxN(sum.beban), lrxN(sum.laba_bersih));
    shifts.forEach(s => foot.push(lrxN(sumSh[s])));
    return { type: 'table', title: judul, sub, head, align: 'l' + 'r'.repeat(head.length - 1), rows, foot: { c: foot } };
}

function lrxCatatan(d, modeShift) {
    const items = [
        'Pendapatan (DPP) = nilai penjualan setelah diskon dan sudah dikurangi PPN. PPN Keluaran dicatat terpisah di Neraca, bukan sebagai pendapatan.',
        'HPP = harga pokok barang yang terjual, diambil dari Kartu HPP (rata-rata bergerak per cabang).',
        'Laba Kotor = Pendapatan - HPP.  Laba Bersih = Laba Kotor - Biaya Operasional (gaji, listrik & air, sewa, penyusutan, dan biaya lain).',
        'Shift: akun kasir berakhiran 1 = Pagi, akun lain = Siang, akun ADM dan PSR = Sehari. Penjualan lama/manual tanpa kasir masuk "(tanpa shift)".',
        'Hanya PENJUALAN yang tercatat per kasir dan shift. Biaya operasional tidak punya shift, jadi LABA BERSIH hanya dihitung per cabang dan total; per shift yang ditampilkan adalah LABA KOTOR.',
        'Semua angka dihitung otomatis dari jurnal dan sama dengan menu Laporan > Laba Rugi untuk filter yang sama.',
    ];
    const w = d.peringatan || {};
    if (!modeShift && w.barang_tanpa_modal && w.barang_tanpa_modal.length)
        items.push(`PERHATIAN: ${w.barang_tanpa_modal.length} barang sudah terjual tetapi Harga Modal-nya masih 0, sehingga HPP terhitung terlalu kecil dan laba terlihat lebih besar dari kenyataan. Isi Harga Modal di Master > Barang.`);
    if (!modeShift && w.barang_tidak_terdeteksi && w.barang_tidak_terdeteksi.jumlah_kode > 0)
        items.push(`PERHATIAN: ${w.barang_tidak_terdeteksi.jumlah_kode} kode barang (omzet ${lrxRp(w.barang_tidak_terdeteksi.omzet)}) ada di Riwayat Penjualan tetapi belum terdaftar di Master Barang, sehingga tidak ikut dihitung di laporan ini.`);
    return { type: 'list', title: 'Catatan dan Cara Membaca Laporan', items };
}

function lrxModel(d, f, opt) {
    const meta = d.meta || {};
    const gran = meta.granularitas || 'harian';
    const cabLabel = f.cabang || 'Semua Cabang';
    const m = {
        judul: 'Laporan Laba Rugi Lengkap',
        info: [`Periode : ${lrxLabelPeriode(f, meta)}`, `Cabang  : ${cabLabel}`, `Tampilan: ${f.shift ? 'Khusus Shift ' + f.shift + ' (penjualan, HPP, laba kotor)' : 'Lengkap - semua shift dan biaya operasional'}`],
        blocks: [],
        fileName: `Laba-Rugi-Lengkap_${(f.cabang || 'Semua-Cabang').replace(/\s+/g, '-')}${f.shift ? '_Shift-' + f.shift : ''}_${f.dari || 'awal'}_${f.sampai || 'akhir'}`,
    };
    const B = m.blocks;
    const T = d.total || {};
    const semua = (d.per_cabang || []);

    /* ════ MODE SHIFT: hanya shift terpilih ════ */
    if (f.shift) {
        const ps = (d.per_shift || []).find(s => s.shift === f.shift);
        if (!ps) {
            B.push({ type: 'note', tone: 'warn', lines: [`Tidak ada penjualan pada Shift ${f.shift} untuk periode dan cabang yang dipilih.`] });
            B.push(lrxCatatan(d, true));
            return m;
        }
        B.push({ type: 'kpi', items: [
            { label: `Pendapatan Shift ${f.shift}`, value: lrxRp(ps.dpp), sub: 'Penjualan tanpa PPN', tone: 'blue' },
            { label: 'HPP', value: lrxRp(ps.hpp), sub: 'Modal barang terjual', tone: 'red' },
            { label: 'Laba Kotor', value: lrxRp(ps.laba), sub: `Margin ${lrxPct(lrxMargin(ps.laba, ps.dpp))}`, tone: ps.laba >= 0 ? 'green' : 'red' },
            { label: 'Jumlah Struk', value: lrxNum(ps.struk), sub: 'Transaksi pada shift ini', tone: 'blue' },
            { label: 'Rata-rata / Struk', value: lrxRp(ps.struk ? ps.dpp / ps.struk : 0), sub: 'Pendapatan per struk', tone: 'blue' },
        ] });
        const kons = ps.per_cabang || [];
        const best = kons.slice().sort((a, b) => b.laba - a.laba)[0];
        B.push({ type: 'note', tone: 'info', lines: [
            `Pada Shift ${f.shift}, ${f.cabang ? f.cabang : 'seluruh cabang'} mencatat pendapatan ${lrxRp(ps.dpp)} dengan HPP ${lrxRp(ps.hpp)}, sehingga LABA KOTOR ${lrxRp(ps.laba)} (${lrxPct(lrxMargin(ps.laba, ps.dpp))} dari pendapatan) dari ${lrxNum(ps.struk)} struk.`,
            best && kons.length > 1 ? `Cabang dengan laba kotor tertinggi di shift ini: ${best.cabang} (${lrxRp(best.laba)}).` : null,
            'Biaya operasional tidak dibagi per shift, jadi laba bersih tidak ditampilkan di tampilan ini. Pilih "Semua Shift" untuk laporan laba bersih.',
        ].filter(Boolean) });
        B.push({ type: 'table', title: `Shift ${f.shift} - per Cabang`, sub: 'Urut sesuai daftar cabang', head: ['Cabang', 'Struk', 'Pendapatan (DPP)', 'HPP', 'Laba Kotor', 'Margin', 'Kontribusi Laba'],
            align: 'lrrrrrr', rows: kons.map(c => ({ c: [c.cabang, lrxI(c.struk), lrxN(c.dpp), lrxN(c.hpp), lrxN(c.laba), lrxP(lrxMargin(c.laba, c.dpp)), lrxP(lrxMargin(c.laba, ps.laba))] })),
            foot: { c: ['TOTAL', lrxI(ps.struk), lrxN(ps.dpp), lrxN(ps.hpp), lrxN(ps.laba), lrxP(lrxMargin(ps.laba, ps.dpp)), lrxP(100)] } });
        const kasirRows = [];
        semua.forEach(c => { const s = (c.shift || []).find(x => x.shift === f.shift); if (!s) return;
            kasirRows.push({ k: 'grp', c: [`Cabang ${c.cabang}`] });
            (s.kasir || []).forEach(k => kasirRows.push({ k: 'ind', c: [`Kasir ${k.kasir}`, lrxI(k.struk), lrxN(k.dpp), lrxN(k.hpp), lrxN(k.laba), lrxP(lrxMargin(k.laba, k.dpp))] })); });
        if (kasirRows.length) B.push({ type: 'table', title: `Shift ${f.shift} - per Kasir`, sub: '', head: ['Cabang / Kasir', 'Struk', 'Pendapatan (DPP)', 'HPP', 'Laba Kotor', 'Margin'], align: 'lrrrrr', rows: kasirRows });
        if (opt.rekapPeriode) {
            const per = (d.periode || []).filter(p => p.shift && p.shift[f.shift]).map(p => { const z = p.shift[f.shift];
                return { periode: p.periode, pendapatan: z.dpp, hpp: z.hpp, laba_kotor: z.laba, beban: 0, laba_bersih: z.laba, shift: {} }; });
            const t = lrxTabelPeriode(`Rekap ${gran === 'harian' ? 'Harian' : 'Bulanan'} - Shift ${f.shift}`, '', per, gran, true);
            if (t) { t.head[1] = 'Pendapatan'; B.push(t); }
        }
        B.push(lrxCatatan(d, true));
        return m;
    }

    /* ════ MODE LENGKAP ════ */
    B.push(lrxKpiLengkap(T));

    // Kesimpulan dalam bahasa sederhana
    const urutBersih = semua.slice().sort((a, b) => b.laba_bersih - a.laba_bersih);
    const shiftBest = (d.per_shift || []).filter(s => s.shift !== '(tanpa shift)').sort((a, b) => b.laba - a.laba)[0];
    const lines = [
        `Pada periode ini ${f.cabang ? 'cabang ' + f.cabang : 'seluruh cabang'} mencatat pendapatan ${lrxRp(T.pendapatan)} dengan harga pokok barang ${lrxRp(T.hpp)}, sehingga LABA KOTOR ${lrxRp(T.laba_kotor)} (${lrxPct(lrxMargin(T.laba_kotor, T.pendapatan))} dari pendapatan).`,
        `Setelah dikurangi biaya operasional ${lrxRp(T.beban)}, hasil akhirnya adalah ${T.laba_bersih >= 0 ? 'LABA BERSIH' : 'RUGI BERSIH'} ${lrxRp(Math.abs(T.laba_bersih))} (margin bersih ${lrxPct(lrxMargin(T.laba_bersih, T.pendapatan))}).`,
    ];
    if (urutBersih.length > 1) {
        lines.push(`Cabang paling menguntungkan: ${urutBersih[0].cabang} (laba bersih ${lrxRp(urutBersih[0].laba_bersih)}). Cabang paling lemah: ${urutBersih[urutBersih.length - 1].cabang} (${lrxRp(urutBersih[urutBersih.length - 1].laba_bersih)}).`);
        const rugi = urutBersih.filter(c => c.laba_bersih < 0).map(c => c.cabang);
        if (rugi.length) lines.push(`Cabang yang masih RUGI bersih: ${rugi.join(', ')}.`);
    }
    if (shiftBest && (d.per_shift || []).length > 1) lines.push(`Shift dengan laba kotor tertinggi: ${shiftBest.shift} (${lrxRp(shiftBest.laba)}).`);
    B.push({ type: 'note', tone: 'info', title: 'Kesimpulan', lines });

    // Perbandingan cabang
    if (semua.length > 1) {
        B.push({ type: 'table', title: 'Perbandingan Antar Cabang', sub: 'Laba bersih = laba kotor dikurangi biaya operasional cabang tersebut',
            head: ['Cabang', 'Pendapatan (DPP)', 'HPP', 'Laba Kotor', 'Biaya Ops.', 'Laba Bersih', 'Margin Bersih'], align: 'lrrrrrr',
            rows: semua.map(c => ({ c: [c.cabang, lrxN(c.pendapatan), lrxN(c.hpp), lrxN(c.laba_kotor), lrxN(c.beban), lrxN(c.laba_bersih), lrxP(c.margin_bersih)] })),
            foot: { c: ['TOTAL', lrxN(T.pendapatan), lrxN(T.hpp), lrxN(T.laba_kotor), lrxN(T.beban), lrxN(T.laba_bersih), lrxP(T.margin_bersih)] } });
    }

    B.push(lrxStatement('Laba Rugi Gabungan', `${cabLabel} - ${lrxLabelPeriode(f, meta)}`, T));


    // Ringkasan per shift (semua cabang) + rekonsiliasi
    const ps = d.per_shift || [];
    if (ps.length) {
        const pk = T.penjualan_kasir || {}, nk = T.non_kasir || {};
        const rows = ps.map(s => ({ c: [`Shift ${s.shift}`, lrxI(s.struk), lrxN(s.dpp), lrxN(s.hpp), lrxN(s.laba), lrxP(lrxMargin(s.laba, s.dpp))] }));
        rows.push({ k: 'sub', c: ['Subtotal penjualan kasir', lrxI(pk.struk), lrxN(pk.dpp), lrxN(pk.hpp), lrxN(pk.laba), lrxP(lrxMargin(pk.laba, pk.dpp))] });
        if (Math.abs(nk.pendapatan || 0) > 0.5 || Math.abs(nk.hpp || 0) > 0.5)
            rows.push({ c: ['Di luar kasir (retur, jasa, sewa, selisih stok)', '', lrxN(nk.pendapatan), lrxN(nk.hpp), lrxN(nk.laba), ''] });
        rows.push({ k: 'total', c: ['TOTAL LABA KOTOR USAHA', '', lrxN(T.pendapatan), lrxN(T.hpp), lrxN(T.laba_kotor), lrxP(lrxMargin(T.laba_kotor, T.pendapatan))] });
        B.push({ type: 'table', title: 'Hasil per Shift - Semua Cabang', sub: 'Laba kotor per shift (biaya operasional tidak dibagi per shift)', head: ['Shift', 'Struk', 'Pendapatan (DPP)', 'HPP', 'Laba Kotor', 'Margin'], align: 'lrrrrr', rows });
    }
    const tShift = lrxTabelShiftKasir('Rincian Hasil per Cabang, Shift, dan Kasir', 'Setiap kasir dengan jumlah struk, pendapatan, HPP, dan laba kotor', semua);
    if (tShift) B.push(tShift);

    if (opt.rekapPeriode) {
        const t = lrxTabelPeriode(`Rekap ${gran === 'harian' ? 'Harian' : 'Bulanan'} - ${cabLabel}`,
            gran === 'harian' ? 'Biaya yang dibayar sekali sebulan (mis. gaji) tampil pada tanggal pencatatannya' : 'Rentang panjang dirangkum per bulan', d.periode, gran, false);
        if (t) B.push(t);
    }

    // Rincian per cabang
    if (opt.rincianCabang && semua.length) {
        semua.forEach(c => {
            const blocks = [lrxKpiLengkap(c), lrxStatement(`Laba Rugi ${c.cabang}`, lrxLabelPeriode(f, meta), c)];
            const ts = lrxTabelShiftKasir(`Hasil per Shift dan Kasir - ${c.cabang}`, '', [c]);
            if (ts) blocks.push(ts);
            if (opt.rekapPeriode) { const tp = lrxTabelPeriode(`Rekap ${gran === 'harian' ? 'Harian' : 'Bulanan'} - ${c.cabang}`, '', c.periode, gran, false); if (tp) blocks.push(tp); }
            B.push({ type: 'group', title: `Cabang ${c.cabang}`, summary: `${c.laba_bersih >= 0 ? 'Laba bersih' : 'Rugi bersih'} ${lrxRp(c.laba_bersih)}`, tone: c.laba_bersih >= 0 ? 'green' : 'red', open: semua.length === 1, blocks });
        });
    }
    B.push(lrxCatatan(d, false));
    return m;
}

/* ═════════════════════════════════════════════════════════════
   RENDER LAYAR
   ═════════════════════════════════════════════════════════════ */
function lrxCell(c) { return (c && c.n) ? `<span class="${c.neg ? 'laba-neg' : ''}">${esc(c.t)}</span>` : esc(c == null ? '' : c); }

function lrxHtml(blocks) {
    return blocks.map(b => {
        if (b.type === 'kpi') return `<div class="kpi-grid">${b.items.map(i => `<div class="kpi ${i.tone || ''}"><div class="kpi-label">${esc(i.label)}</div><div class="kpi-val ${i.tone === 'red' ? 'neg' : i.tone === 'green' ? 'pos' : ''}" style="font-size:19px;">${esc(i.value)}</div><div class="kpi-sub">${esc(i.sub || '')}</div></div>`).join('')}</div>`;
        if (b.type === 'note') return `<div class="note ${b.tone === 'warn' ? 'note-y' : 'note-b'}" style="margin-bottom:16px;"><span class="note-ico">${b.tone === 'warn' ? '⚠️' : '💡'}</span><span>${b.title ? `<strong>${esc(b.title)}</strong><br>` : ''}${b.lines.map(esc).join('<br>')}</span></div>`;
        if (b.type === 'list') return `<div class="box" style="margin-bottom:16px;"><div class="box-hd"><h3>${esc(b.title)}</h3></div><div class="box-bd" style="font-size:12.5px;line-height:1.7;"><ul style="margin:0;padding-left:18px;">${b.items.map(i => `<li>${esc(i)}</li>`).join('')}</ul></div></div>`;
        if (b.type === 'group') return `<details class="lrx-det" ${b.open ? 'open' : ''}><summary><strong>${esc(b.title)}</strong><span class="${b.tone === 'red' ? 'laba-neg' : 'laba-pos'}">${esc(b.summary)}</span></summary><div class="lrx-det-bd">${lrxHtml(b.blocks)}</div></details>`;
        if (b.type === 'table') {
            const al = i => (b.align[i] === 'r' ? ' class="r"' : '');
            const body = b.rows.map(r => {
                if (r.k === 'grp') return `<tr class="lrx-grp"><td colspan="${b.head.length}">${esc(r.c[0])}</td></tr>`;
                return `<tr class="${r.k ? 'lrx-' + r.k : ''}">${r.c.map((c, i) => `<td${al(i)}>${lrxCell(c)}</td>`).join('')}</tr>`;
            }).join('');
            const foot = b.foot ? `<tfoot><tr>${b.foot.c.map((c, i) => `<td${al(i)}>${lrxCell(c)}</td>`).join('')}</tr></tfoot>` : '';
            return `<div class="box" style="margin-bottom:16px;"><div class="box-hd"><h3 style="font-family:var(--F-d);">${esc(b.title)}</h3><div class="meta">${esc(b.sub || '')}</div></div><div class="box-bd pad0 tscroll"><table class="lrx-tbl"><thead><tr>${b.head.map((h, i) => `<th${al(i)}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${body}</tbody>${foot}</table></div></div>`;
        }
        return '';
    }).join('');
}

function lrxToolbar() {
    const f = window._lrx;
    const pb = (k, t) => `<button class="btn btn-sm ${f.preset === k ? 'btn-p' : 'btn-g'}" onclick="lrxPreset('${k}')">${t}</button>`;
    const sb = (k, t) => `<button class="btn btn-sm ${f.shift === k ? 'btn-p' : 'btn-g'}" onclick="lrxSetShift('${k}')">${t}</button>`;
    const cabs = (typeof STATE !== 'undefined' && STATE.cabang) ? STATE.cabang : [];
    return `
    <div class="box" style="margin-bottom:16px;"><div class="box-bd" style="display:flex;flex-direction:column;gap:12px;">
      <div class="export-bar no-print" style="margin:0;flex-wrap:wrap;gap:8px;"><span class="lbl">Periode:</span>
        ${pb('hari', 'Hari Ini')}${pb('kemarin', 'Kemarin')}${pb('7hari', '7 Hari')}${pb('bulan', 'Bulan Ini')}${pb('bulanlalu', 'Bulan Lalu')}${pb('tahun', 'Tahun Ini')}${pb('semua', 'Semua')}
        <span style="color:var(--ink3);font-size:12px;margin-left:6px;">atau tanggal bebas:</span>
        <input class="finput" type="date" value="${f.dari}" onchange="lrxSetTgl('dari', this.value)" style="width:150px;padding:6px 8px;">
        <span style="color:var(--ink3);">s/d</span>
        <input class="finput" type="date" value="${f.sampai}" onchange="lrxSetTgl('sampai', this.value)" style="width:150px;padding:6px 8px;"></div>
      <div class="export-bar no-print" style="margin:0;flex-wrap:wrap;gap:8px;"><span class="lbl">Cabang:</span>
        <select class="finput" style="width:200px;padding:6px 8px;" onchange="lrxSetCabang(this.value)">
          <option value="">Semua Cabang</option>${cabs.map(c => `<option value="${esc(c.nama)}" ${f.cabang === c.nama ? 'selected' : ''}>${esc(c.nama)}</option>`).join('')}
        </select>
        <span class="lbl" style="margin-left:10px;">Shift:</span>${sb('', 'Semua Shift')}${sb('Pagi', 'Pagi')}${sb('Siang', 'Siang')}${sb('Sehari', 'Sehari')}</div>
      <div class="export-bar no-print" style="margin:0;flex-wrap:wrap;gap:8px;"><span class="lbl">Isi laporan:</span>
        <label style="font-size:12.5px;"><input type="checkbox" ${f.rincianCabang ? 'checked' : ''} onchange="lrxToggle('rincianCabang', this.checked)"> Rincian tiap cabang</label>
        <label style="font-size:12.5px;"><input type="checkbox" ${f.rekapPeriode ? 'checked' : ''} onchange="lrxToggle('rekapPeriode', this.checked)"> Rekap harian/bulanan</label>
        <span style="flex:1"></span>
        <button class="btn btn-p" id="lrxBtnPdf" onclick="lrxDownloadPdf(this)">⬇️ Download PDF</button>
        <button class="btn btn-g" onclick="lrxDownloadXlsx()">📊 Download Excel</button></div>
    </div></div>`;
}

async function renderLabaRugiLengkap() {
    const el = document.getElementById('lp-lrx');
    if (!el) return;
    const f = window._lrx;
    if (f.cabang === null) f.cabang = (typeof getCabang === 'function' ? getCabang() : '') || '';
    if (!f.dari && !f.sampai && f.preset !== 'semua' && f.preset !== 'custom') [f.dari, f.sampai] = lrxHitungPreset(f.preset);
    el.innerHTML = lrxToolbar() + `<div id="lrxBody">${loadingHTML}</div>`;
    const body = document.getElementById('lrxBody');
    try {
        const d = await apiGet('/laporan/laba-rugi-lengkap' + buildQuery({ cabang: f.cabang, dari: f.dari, sampai: f.sampai }));
        f.data = d;
        const model = lrxModel(d, f, f);
        const ada = (d.per_cabang || []).length;
        body.innerHTML = ada || f.shift
            ? `<div class="lrx-head"><h2>${esc(model.judul)}</h2>${model.info.map(i => `<div>${esc(i)}</div>`).join('')}</div>` + lrxHtml(model.blocks)
            : `<div class="empty"><div class="ico">📑</div><strong>Belum ada transaksi pada periode ini.</strong><br>Coba ubah rentang tanggal atau cabang.</div>`;
    } catch (err) {
        body.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── HANDLER FILTER ───────────────────────────────────────── */
window.lrxPreset = (p) => { const f = window._lrx; f.preset = p; [f.dari, f.sampai] = lrxHitungPreset(p); renderLabaRugiLengkap(); };
window.lrxSetTgl = (field, val) => {
    const f = window._lrx; f[field] = val; f.preset = 'custom';
    if (f.dari && f.sampai && f.dari > f.sampai) [f.dari, f.sampai] = [f.sampai, f.dari];
    renderLabaRugiLengkap();
};
window.lrxSetCabang = (v) => { window._lrx.cabang = v; renderLabaRugiLengkap(); };
window.lrxSetShift = (v) => { window._lrx.shift = v; renderLabaRugiLengkap(); };
window.lrxToggle = (k, v) => { window._lrx[k] = v; renderLabaRugiLengkap(); };
window.renderLabaRugiLengkap = renderLabaRugiLengkap;

/* ═════════════════════════════════════════════════════════════
   DOWNLOAD PDF  (jsPDF + jspdf-autotable, dimuat saat dibutuhkan)
   ═════════════════════════════════════════════════════════════ */
let _lrxLibPromise = null;
function lrxMuatLib() {
    if (window.jspdf && window.jspdf.jsPDF && (window.jspdf.jsPDF.API || {}).autoTable) return Promise.resolve();
    if (_lrxLibPromise) return _lrxLibPromise;
    const muat = src => new Promise((ok, gagal) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => gagal(new Error('Gagal memuat ' + src)); document.head.appendChild(s); });
    _lrxLibPromise = muat('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
        .then(() => muat('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'))
        .catch(e => { _lrxLibPromise = null; throw e; });
    return _lrxLibPromise;
}

// jsPDF memakai font bawaan (Latin-1): ganti simbol khusus & buang yang tak didukung
function lrxSafe(s) {
    return String(s == null ? '' : s).replace(/[–—−]/g, '-').replace(/[▸►→]/g, '>').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[^\x20-\x7E\xA0-\xFF\n]/g, '');
}

function lrxBuatPdf(model) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
    const ML = 12, MR = 12, MT = 18, MB = 14, CW = PW - ML - MR;
    const HIJAU = [26, 92, 56], MERAH = [185, 28, 28], TEKS = [33, 37, 41], ABU = [108, 117, 125];
    const TONE = { green: [26, 92, 56], red: MERAH, blue: [37, 99, 235] };
    let y = 0;

    /* header halaman pertama */
    doc.setFillColor(...HIJAU); doc.rect(0, 0, PW, 30, 'F');
    doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('TOKO SUMINI', ML, 9);
    doc.setFontSize(19); doc.text(lrxSafe(model.judul), ML, 18);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
    doc.text(lrxSafe(model.info[0].replace(/^Periode : /, 'Periode: ') + '   |   ' + model.info[1].replace(/^Cabang  : /, 'Cabang: ')), ML, 24.5);
    doc.setFontSize(8); doc.text(lrxSafe(model.info[2].replace(/^Tampilan: /, 'Tampilan: ')), ML, 28.2);
    y = 36;

    const butuh = (tinggi) => { if (y + tinggi > PH - MB) { doc.addPage(); y = MT; } };
    const warnaSel = (c) => (c && c.neg) ? MERAH : TEKS;

    function gambar(blocks, tingkat) {
        blocks.forEach(b => {
            if (b.type === 'kpi') {
                butuh(24);
                const n = b.items.length, gap = 3, w = (CW - gap * (n - 1)) / n;
                b.items.forEach((it, i) => {
                    const x = ML + i * (w + gap), warna = TONE[it.tone] || TEKS;
                    doc.setFillColor(248, 250, 249); doc.setDrawColor(222, 228, 224); doc.roundedRect(x, y, w, 21, 1.8, 1.8, 'FD');
                    doc.setFillColor(...warna); doc.rect(x, y + 1.5, 1.4, 18, 'F');
                    doc.setTextColor(...ABU); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(lrxSafe(it.label).toUpperCase(), x + 4, y + 5.5);
                    doc.setTextColor(...warna); doc.setFontSize(it.value.length > 17 ? 11 : 13); doc.text(lrxSafe(it.value), x + 4, y + 12.5);
                    doc.setTextColor(...ABU); doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text(lrxSafe(it.sub || ''), x + 4, y + 17.5);
                });
                y += 26;
            } else if (b.type === 'note' || b.type === 'list') {
                const baris = b.type === 'note' ? b.lines : b.items.map(t => '- ' + t);
                const lebar = CW - 10;
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
                const potong = baris.map(t => doc.splitTextToSize(lrxSafe(t), lebar));
                let tinggi = 6 + potong.reduce((a, p) => a + p.length * 4.1 + 1.6, 0) + ((b.title) ? 6 : 0);
                butuh(Math.min(tinggi, 60));
                const warn = b.tone === 'warn';
                if (b.type === 'list') { // judul list sebagai heading
                    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...HIJAU); doc.text(lrxSafe(b.title), ML, y + 4); y += 8;
                    doc.setDrawColor(222, 228, 224);
                }
                doc.setFillColor(...(warn ? [255, 247, 230] : [238, 245, 240])); doc.setDrawColor(...(warn ? [230, 190, 120] : [190, 215, 198]));
                let ty = y;
                if (b.type === 'note') doc.roundedRect(ML, y, CW, tinggi - 0, 1.8, 1.8, 'FD');
                ty = y + 5.5;
                if (b.title && b.type === 'note') { doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...HIJAU); doc.text(lrxSafe(b.title), ML + 5, ty); ty += 6; }
                doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(...TEKS);
                potong.forEach(p => {
                    if (ty + p.length * 4.1 > PH - MB) { doc.addPage(); ty = MT; }
                    doc.text(p, ML + 5, ty); ty += p.length * 4.1 + 1.6;
                });
                y = ty + 4;
            } else if (b.type === 'group') {
                doc.addPage(); y = MT;
                doc.setFillColor(...(b.tone === 'red' ? [253, 236, 236] : [231, 240, 234])); doc.rect(ML, y, CW, 10, 'F');
                doc.setFillColor(...(b.tone === 'red' ? MERAH : HIJAU)); doc.rect(ML, y, 1.8, 10, 'F');
                doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(...(b.tone === 'red' ? MERAH : HIJAU)); doc.text(lrxSafe(b.title.toUpperCase()), ML + 5, y + 6.9);
                doc.setFontSize(10); doc.text(lrxSafe(b.summary), PW - MR - 3, y + 6.9, { align: 'right' });
                y += 15;
                gambar(b.blocks, tingkat + 1);
            } else if (b.type === 'table') {
                // tabel pendek dijaga utuh dalam satu halaman; tabel panjang boleh menyambung
                const perkiraan = 11 + (b.narrow ? 5.6 : 7.2) * (b.rows.length + 1 + (b.foot ? 1 : 0));
                butuh(perkiraan <= PH - MT - MB ? perkiraan : 34);
                doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...HIJAU); doc.text(lrxSafe(b.title), ML, y + 3.5);
                if (b.sub) { doc.setFont('helvetica', 'italic'); doc.setFontSize(8); doc.setTextColor(...ABU); doc.text(lrxSafe(b.sub), ML, y + 8); }
                y += b.sub ? 11 : 7;
                const n = b.head.length;
                const sel = (c, i, r) => {
                    const num = c && c.n, teks = num ? c.t : (c == null ? '' : c);
                    const st = { halign: b.align[i] === 'r' ? 'right' : 'left', textColor: warnaSel(c) };
                    if (r.k === 'ind' && i === 0) { const p = b.narrow ? 1.15 : 1.7; st.cellPadding = { top: p, bottom: p, left: 6, right: p }; }
                    return { content: lrxSafe(teks), styles: st };
                };
                const body = b.rows.map(r => {
                    if (r.k === 'grp') return [{ content: lrxSafe(r.c[0]), colSpan: n, styles: { fontStyle: 'bold', fillColor: [231, 240, 234], textColor: HIJAU } }];
                    const cells = r.c.map((c, i) => sel(c, i, r));
                    if (r.k === 'sub') cells.forEach(c => { c.styles.fontStyle = 'bold'; c.styles.fillColor = [244, 247, 245]; });
                    if (r.k === 'total') cells.forEach(c => { c.styles.fontStyle = 'bold'; c.styles.fillColor = [226, 238, 230]; });
                    return cells;
                });
                const colStyles = {};
                (b.widths || []).forEach((w, i) => { if (w) colStyles[i] = { cellWidth: w }; });
                const opsi = {
                    startY: y, head: [b.head.map((h, i) => ({ content: lrxSafe(h), styles: { halign: b.align[i] === 'r' ? 'right' : 'left' } }))], body,
                    margin: { top: MT, left: ML, right: MR, bottom: MB }, theme: 'grid', rowPageBreak: 'avoid', showHead: 'everyPage',
                    styles: { font: 'helvetica', fontSize: 8.6, cellPadding: 1.7, lineColor: [222, 228, 224], lineWidth: 0.1, textColor: TEKS, overflow: 'linebreak' },
                    headStyles: { fillColor: HIJAU, textColor: 255, fontStyle: 'bold', lineColor: HIJAU },
                    footStyles: { fillColor: [26, 92, 56], textColor: 255, fontStyle: 'bold' },
                    alternateRowStyles: { fillColor: [252, 253, 252] }, columnStyles: colStyles,
                };
                if (b.narrow) { opsi.tableWidth = 200; opsi.styles.cellPadding = 1.15; opsi.styles.fontSize = 8.4; }
                if (b.foot) opsi.foot = [b.foot.c.map((c, i) => ({ content: lrxSafe(c && c.n ? c.t : c), styles: { halign: b.align[i] === 'r' ? 'right' : 'left', textColor: (c && c.neg) ? [255, 190, 190] : 255 } }))];
                doc.autoTable(opsi);
                y = doc.lastAutoTable.finalY + 8;
            }
        });
    }
    gambar(model.blocks, 0);

    /* header ringkas (hal. 2+) dan footer semua halaman */
    const total = doc.getNumberOfPages();
    const stempel = new Date().toLocaleString('id-ID', { dateStyle: 'long', timeStyle: 'short' });
    for (let i = 1; i <= total; i++) {
        doc.setPage(i);
        if (i > 1) {
            doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.setTextColor(...HIJAU); doc.text('TOKO SUMINI - ' + lrxSafe(model.judul), ML, 9);
            doc.setFont('helvetica', 'normal'); doc.setTextColor(...ABU); doc.text(lrxSafe(model.info[0].replace(/^Periode : /, '') + '  |  ' + model.info[1].replace(/^Cabang  : /, '')), PW - MR, 9, { align: 'right' });
            doc.setDrawColor(...HIJAU); doc.setLineWidth(0.4); doc.line(ML, 11.5, PW - MR, 11.5);
        }
        doc.setDrawColor(222, 228, 224); doc.setLineWidth(0.2); doc.line(ML, PH - 10, PW - MR, PH - 10);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(...ABU);
        doc.text(lrxSafe('Dicetak ' + stempel + '  |  Dihitung otomatis dari jurnal Toko Sumini'), ML, PH - 6);
        doc.text(`Halaman ${i} dari ${total}`, PW - MR, PH - 6, { align: 'right' });
    }
    return doc;
}

window.lrxDownloadPdf = async (btn) => {
    const f = window._lrx;
    if (!f.data) { toast('Data laporan belum siap', 'err'); return; }
    const asal = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = '⏳ Menyusun PDF…'; }
    try {
        await lrxMuatLib();
        const model = lrxModel(f.data, f, f);
        const doc = lrxBuatPdf(model);
        doc.save(model.fileName + '.pdf');
        toast('PDF berhasil dibuat');
    } catch (e) {
        toast('Gagal membuat PDF: ' + e.message, 'err');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = asal; }
    }
};

/* ═════════════════════════════════════════════════════════════
   DOWNLOAD EXCEL  (SheetJS — sudah dimuat aplikasi)
   ═════════════════════════════════════════════════════════════ */
window.lrxDownloadXlsx = () => {
    const f = window._lrx;
    if (!f.data) { toast('Data laporan belum siap', 'err'); return; }
    if (typeof XLSX === 'undefined') { toast('Pustaka Excel belum termuat', 'err'); return; }
    const model = lrxModel(f.data, f, f);
    const aoa = [['TOKO SUMINI'], [model.judul], ...model.info.map(i => [i]), []];
    const val = c => (c && c.n) ? c.v : (c == null ? '' : c);
    const tulis = (blocks) => blocks.forEach(b => {
        if (b.type === 'kpi') { aoa.push(b.items.map(i => i.label)); aoa.push(b.items.map(i => i.value)); aoa.push([]); }
        else if (b.type === 'note') { if (b.title) aoa.push([b.title]); b.lines.forEach(l => aoa.push([l])); aoa.push([]); }
        else if (b.type === 'list') { aoa.push([b.title]); b.items.forEach(l => aoa.push([l])); aoa.push([]); }
        else if (b.type === 'group') { aoa.push([b.title.toUpperCase(), b.summary]); aoa.push([]); tulis(b.blocks); }
        else if (b.type === 'table') {
            aoa.push([b.title]); if (b.sub) aoa.push([b.sub]);
            aoa.push(b.head);
            b.rows.forEach(r => aoa.push(r.c.map(val)));
            if (b.foot) aoa.push(b.foot.c.map(val));
            aoa.push([]);
        }
    });
    tulis(model.blocks);
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = [{ wch: 46 }, ...Array(9).fill({ wch: 18 })];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Laba Rugi Lengkap');
    XLSX.writeFile(wb, model.fileName + '.xlsx');
};
