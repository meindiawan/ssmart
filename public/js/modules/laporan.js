/* =============================================================
   laporan.js — Laporan Keuangan
   4 laporan: Neraca Saldo, Laba Rugi, Neraca, Rekap PPN
   Semua data dari endpoint /api/laporan/*
   Semua angka dihitung OTOMATIS dari jurnal double-entry
   ============================================================= */

/* ── FILTER PERIODE ───────────────────────────────────────────
   Dipakai bareng oleh Neraca Saldo, Laba Rugi & Rekap PPN — ketiganya
   laporan PERIODE (rentang dari–sampai). Neraca (balance sheet) PAKAI
   FILTER TERPISAH (_lapFilterNeraca) karena sifatnya beda: bukan
   rentang, tapi kumulatif dari awal sampai 1 tanggal cutoff ("per
   tanggal ..."), jadi cuma butuh 1 tanggal, bukan 2.
   ─────────────────────────────────────────────────────────────── */
window._lapFilter = window._lapFilter || { dari: '', sampai: '' };
window._lapFilterNeraca = window._lapFilterNeraca || { sampai: '' }; // '' = per hari ini

function lapAwalBulan() { return today().slice(0, 8) + '01'; }
function lapAwalTahun() { return today().slice(0, 4) + '-01-01'; }
function lapAkhirBulan() {
    const d = new Date(today() + 'T00:00:00');
    return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
}
function lapAkhirTahun() { return today().slice(0, 4) + '-12-31'; }

/** Label ringkas periode yang lagi aktif — dipakai di subjudul tiap laporan. */
function lapPeriodeLabel(f) {
    if (!f.dari && !f.sampai) return 'Semua (All Time)';
    if (f.dari && f.sampai)   return `${fmtTgl(f.dari)} – ${fmtTgl(f.sampai)}`;
    if (f.sampai)             return `s/d ${fmtTgl(f.sampai)}`;
    return `sejak ${fmtTgl(f.dari)}`;
}

/**
 * Filter bar rentang tanggal (Neraca Saldo/Laba Rugi/Rekap PPN) — preset
 * Bulan Ini/Tahun Ini/Semua + 2 input tanggal custom. `reRenderFn` = nama
 * fungsi global (string) yang dipanggil ulang tiap filter berubah, mis.
 * 'renderLabaRugi'.
 */
function lapFilterBar(reRenderFn) {
    const f = window._lapFilter;
    const isBulan = f.dari === lapAwalBulan() && f.sampai === today();
    const isTahun = f.dari === lapAwalTahun() && f.sampai === today();
    const isSemua = !f.dari && !f.sampai;
    return `
    <div class="export-bar no-print" style="flex-wrap:wrap;gap:8px;">
        <span class="lbl">Periode:</span>
        <button class="btn btn-sm ${isBulan ? 'btn-p' : 'btn-g'}" onclick="lapSetPreset('bulan','${reRenderFn}')">Bulan Ini</button>
        <button class="btn btn-sm ${isTahun ? 'btn-p' : 'btn-g'}" onclick="lapSetPreset('tahun','${reRenderFn}')">Tahun Ini</button>
        <button class="btn btn-sm ${isSemua ? 'btn-p' : 'btn-g'}" onclick="lapSetPreset('semua','${reRenderFn}')">Semua (All Time)</button>
        <span style="color:var(--ink3);font-size:12px;margin-left:4px;">atau rentang custom:</span>
        <input class="finput" type="date" value="${f.dari}" onchange="lapSetTgl('dari', this.value, '${reRenderFn}')" style="width:150px;padding:6px 8px;">
        <span style="color:var(--ink3);">–</span>
        <input class="finput" type="date" value="${f.sampai}" onchange="lapSetTgl('sampai', this.value, '${reRenderFn}')" style="width:150px;padding:6px 8px;">
    </div>`;
}
window.lapSetPreset = (preset, fn) => {
    const f = window._lapFilter;
    if (preset === 'bulan')      { f.dari = lapAwalBulan(); f.sampai = today(); }
    else if (preset === 'tahun') { f.dari = lapAwalTahun(); f.sampai = today(); }
    else                         { f.dari = ''; f.sampai = ''; }
    window[fn]();
};
window.lapSetTgl = (field, val, fn) => {
    window._lapFilter[field] = val;
    window[fn]();
};

/**
 * Filter bar khusus Neraca — 1 tanggal cutoff ("per tanggal ..."), BUKAN
 * rentang, karena Neraca selalu kumulatif dari awal sampai tanggal itu.
 */
function lapFilterBarNeraca() {
    const f = window._lapFilterNeraca;
    const isHariIni     = !f.sampai || f.sampai === today();
    const isAkhirBulan  = f.sampai === lapAkhirBulan();
    const isAkhirTahun  = f.sampai === lapAkhirTahun();
    return `
    <div class="export-bar no-print" style="flex-wrap:wrap;gap:8px;">
        <span class="lbl">Neraca per tanggal:</span>
        <button class="btn btn-sm ${isHariIni ? 'btn-p' : 'btn-g'}" onclick="lapSetPresetNeraca('hari')">Hari Ini</button>
        <button class="btn btn-sm ${isAkhirBulan ? 'btn-p' : 'btn-g'}" onclick="lapSetPresetNeraca('bulan')">Akhir Bulan Ini</button>
        <button class="btn btn-sm ${isAkhirTahun ? 'btn-p' : 'btn-g'}" onclick="lapSetPresetNeraca('tahun')">Akhir Tahun Ini</button>
        <span style="color:var(--ink3);font-size:12px;margin-left:4px;">atau pilih tanggal:</span>
        <input class="finput" type="date" value="${f.sampai || today()}" onchange="lapSetTglNeraca(this.value)" style="width:150px;padding:6px 8px;">
    </div>`;
}
window.lapSetPresetNeraca = (preset) => {
    const f = window._lapFilterNeraca;
    if (preset === 'hari')       f.sampai = today();
    else if (preset === 'bulan') f.sampai = lapAkhirBulan();
    else if (preset === 'tahun') f.sampai = lapAkhirTahun();
    renderNeraca();
};
// Tombol "🔧 Perbaiki HPP dari Nota SID" di peringatan Laba Rugi — menarik
// ulang HPP asli per baris dari nota SID (bukan menebak dari Harga Modal),
// lalu mengisi Harga Modal Master Barang yang masih 0 dari rata-ratanya.
// Dipanggil berulang otomatis sampai tidak ada nota tersisa (dibatasi per
// 100 nota/panggilan di backend supaya tidak timeout).
window.perbaikiHppDariNota = async (btn) => {
    const asal = btn.textContent;
    btn.disabled = true;
    let totalBaris = 0, totalBarang = 0, totalGagal = 0;
    try {
        while (true) {
            btn.textContent = '⏳ Memproses…';
            const res = await apiPost('/sid/perbaiki-hpp', { limit: 100 });
            totalBaris  += res.baris_diperbaiki || 0;
            totalBarang += res.barang_modal_terisi || 0;
            totalGagal  += res.gagal || 0;
            if (!res.nota_diperbaiki || res.tersisa <= 0) break;
        }
        alert(`Selesai.\nBaris HPP diperbaiki: ${totalBaris}\nHarga Modal barang terisi otomatis: ${totalBarang}` + (totalGagal ? `\nGagal: ${totalGagal} nota (cek koneksi SID)` : ''));
        if (window.renderLabaRugi) window.renderLabaRugi();
    } catch (e) {
        alert('Gagal memperbaiki HPP: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = asal;
    }
};

// Tombol "📦 Isi dari rata-rata Harga Beli" — untuk barang yang HPP-nya
// tidak bisa ditarik dari nota SID (mis. transaksi masuk lewat Import
// Excel, yang memang tidak membawa data HPP sama sekali), fallback-nya:
// hitung rata-rata harga per unit dari riwayat Pembelian (trx_beli) barang
// tsb, lalu isi ke Harga Modal Master — TIDAK menimpa Harga Modal yang
// sudah diisi manual (overwrite: false). Barang yang tidak punya riwayat
// Pembelian sama sekali tetap harus diisi manual di Master ▸ Barang.
window.isiModalDariBeli = async (btn) => {
    const asal = btn.textContent;
    btn.disabled = true;
    btn.textContent = '⏳ Memproses…';
    try {
        const res = await apiPost('/master/barang/isi-modal-otomatis', { overwrite: false });
        let pesan = `${res.jumlah_diupdate} barang terisi Harga Modal dari rata-rata Harga Beli.`;
        if (res.perlu_input_manual && res.perlu_input_manual.length) {
            pesan += `\n\n${res.perlu_input_manual.length} barang lain sudah terjual tapi TIDAK PUNYA riwayat Pembelian sama sekali — ini harus diisi manual di Master ▸ Barang:\n`
                + res.perlu_input_manual.slice(0, 15).map(b => `- ${b.kode} – ${b.nama} (terjual ${b.qty_terjual})`).join('\n')
                + (res.perlu_input_manual.length > 15 ? `\n… dan ${res.perlu_input_manual.length - 15} lainnya` : '');
        }
        alert(pesan);
        if (window.renderLabaRugi) window.renderLabaRugi();
    } catch (e) {
        alert('Gagal mengisi Harga Modal: ' + e.message);
    } finally {
        btn.disabled = false;
        btn.textContent = asal;
    }
};

window.lapSetTglNeraca = (val) => {
    window._lapFilterNeraca.sampai = val;
    renderNeraca();
};

/* ── DRILL-DOWN / AUDIT TRAIL (klik & telusuri semua angka) ──
   Setiap angka di Neraca Saldo, Laba Rugi & Neraca bisa diklik untuk
   melihat rincian transaksi + cara perhitungannya (drill-down 2 level):
     Level 1 (lapLihatAkun)   — semua baris jurnal akun ini pada
                                 periode/cabang yang sama persis dengan
                                 yang tampil di laporan (dari GET
                                 /laporan/akun-trace, yaitu MESIN JURNAL
                                 YANG SAMA dipakai laporan itu sendiri —
                                 jadi angkanya DIJAMIN sinkron).
     Level 2 (bukaBentukanRef) — bentukan jurnal lengkap 1 transaksi
                                 (semua pasangan debit-kredit-nya), dari
                                 GET /laporan/bentukan-ref.
   Juga dipakai formula modal client-side (tanpa fetch) untuk baris
   ringkasan seperti "Total Pendapatan", "Laba Kotor", "LABA BERSIH",
   dst — lihat lapFormula().
   ─────────────────────────────────────────────────────────────── */
window._lapTraceLast = null; // simpan parameter terakhir supaya tombol "← Kembali" di bentukan-ref bisa balik ke level 1 tanpa perlu klik ulang dari tabel

/** Setel/tutup footer modal (#mbox .mft) dengan tombol yang diberikan */
function lapSetModalFooter(innerHtml) {
    let mft = document.querySelector('#mbox .mft');
    if (!mft) {
        mft = document.createElement('div');
        mft.className = 'mft';
        document.getElementById('mbox').appendChild(mft);
    }
    mft.innerHTML = innerHtml;
}

/** Level 1: rincian semua mutasi 1 akun pada periode & cabang laporan aktif */
window.lapLihatAkun = async (kode, nama, dari, sampai, periodeLabel) => {
    const cab = getCabang();
    window._lapTraceLast = { kode, nama, dari: dari || '', sampai: sampai || '', periodeLabel: periodeLabel || '' };
    openM(`<div class="mhd"><h3>🔎 Rincian Akun — ${esc(kode)} ${esc(nama)}</h3><button class="mclose" onclick="closeM()">×</button></div>
        <div class="mbd">${loadingHTML}</div>`);
    lapSetModalFooter('<button class="btn btn-g" onclick="closeM()">Tutup</button>');
    try {
        const res  = await apiGet('/laporan/akun-trace' + buildQuery({ kode_akun: kode, cabang: cab, dari, sampai }));
        const rows = res.data || [];
        const akun = res.akun || {};
        const normalLabel = akun.normal === 'K' ? 'Kredit' : 'Debit';
        const formula = akun.normal === 'K'
            ? 'Saldo = Total Kredit − Total Debit (saldo normal akun ini: Kredit)'
            : 'Saldo = Total Debit − Total Kredit (saldo normal akun ini: Debit)';

        document.querySelector('#mbox .mbd').innerHTML = `
        <div style="font-size:12px;color:var(--ink3);margin-bottom:8px;">
            ${cab || 'Semua cabang'} · ${esc(periodeLabel || '')} · ${res.jml_transaksi} baris jurnal
        </div>
        <div class="note note-b" style="margin-bottom:12px;">
            <span class="note-ico">🧮</span>
            <span><strong>Cara perhitungan:</strong> ${formula}.<br>
            Total Debit <strong>${R(res.total_D)}</strong> − Total Kredit <strong>${R(res.total_K)}</strong>
            → <strong>Saldo ${normalLabel}: ${R(Math.abs(res.saldo))}</strong>.
            Angka ini otomatis sinkron dengan laporan — dihitung dari mesin jurnal yang sama persis (bukan hitungan terpisah).</span>
        </div>
        ${rows.length ? `
        <table style="width:100%;">
            <thead><tr>
                <th style="text-align:left;">Tanggal</th>
                <th style="text-align:left;">Referensi</th>
                <th style="text-align:left;">Keterangan</th>
                <th class="r">Debit</th>
                <th class="r">Kredit</th>
                <th class="r">Kumulatif</th>
            </tr></thead>
            <tbody>
                ${rows.map(x => `<tr class="row-click" onclick="bukaBentukanRef('${esc(x.ref)}')" title="Klik untuk lihat bentukan jurnal lengkap transaksi ini">
                    <td style="font-size:12px;padding:4px 6px;white-space:nowrap;">${fmtTgl(x.tgl)}</td>
                    <td style="font-size:11px;padding:4px 6px;white-space:nowrap;"><span class="badge badge-noppn">${esc(x.ref)}</span></td>
                    <td style="font-size:12px;color:var(--ink2);padding:4px 6px;">${esc(x.ket)}</td>
                    <td class="r laba-pos" style="padding:4px 6px;">${x.D ? R(x.D) : ''}</td>
                    <td class="r laba-neg" style="padding:4px 6px;">${x.K ? R(x.K) : ''}</td>
                    <td class="r" style="padding:4px 6px;font-weight:600;">${R(x.kumulatif)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                <tr style="font-weight:700;border-top:1px solid var(--brd);">
                    <td colspan="3" style="padding:6px;">Total (${rows.length} baris)</td>
                    <td class="r" style="padding:6px;">${R(res.total_D)}</td>
                    <td class="r" style="padding:6px;">${R(res.total_K)}</td>
                    <td class="r" style="padding:6px;">${R(res.saldo)}</td>
                </tr>
            </tfoot>
        </table>
        <div style="font-size:11px;color:var(--ink3);margin-top:8px;">💡 Klik salah satu baris untuk melihat bentukan jurnal lengkap (semua pasangan debit-kredit) dari transaksi tersebut.</div>`
        : '<div class="empty"><div class="ico">📭</div><strong>Tidak ada mutasi akun ini pada periode/cabang yang sedang dipilih.</strong></div>'}`;
    } catch (err) {
        document.querySelector('#mbox .mbd').innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};

/** Level 2: bentukan jurnal lengkap (semua debit-kredit) dari 1 referensi transaksi */
window.bukaBentukanRef = async (ref) => {
    const cab  = getCabang();
    const back = window._lapTraceLast;
    openM(`<div class="mhd"><h3>📓 Bentukan Jurnal — ${esc(ref)}</h3><button class="mclose" onclick="closeM()">×</button></div>
        <div class="mbd">${loadingHTML}</div>`);
    lapSetModalFooter('<button class="btn btn-g" onclick="closeM()">Tutup</button>');
    try {
        const res  = await apiGet('/laporan/bentukan-ref' + buildQuery({ ref, cabang: cab }));
        const rows = res.data || [];
        document.querySelector('#mbox .mbd').innerHTML = rows.length ? `
        <div style="font-size:12px;color:var(--ink3);margin-bottom:10px;">${fmtTgl(rows[0].tgl)} · ${esc(rows[0].cab || '')}</div>
        <table style="width:100%;">
            <thead><tr><th style="text-align:left;">Akun</th><th style="text-align:left;">Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th></tr></thead>
            <tbody>
                ${rows.map(x => `<tr>
                    <td style="font-size:13px;padding:4px 6px;"><span style="font-family:var(--F-m);color:var(--ink3);font-size:11px;">${esc(x.akun)}</span><br>${esc(x.nama_akun || x.akun)}</td>
                    <td style="font-size:12px;color:var(--ink2);padding:4px 6px;">${esc(x.ket)}</td>
                    <td class="r laba-pos" style="padding:4px 6px;">${x.D ? R(x.D) : ''}</td>
                    <td class="r laba-neg" style="padding:4px 6px;">${x.K ? R(x.K) : ''}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot><tr style="font-weight:600;border-top:1px solid var(--brd);"><td colspan="2" style="padding:6px;">Total</td><td class="r" style="padding:6px;">${R(res.total_D)}</td><td class="r" style="padding:6px;">${R(res.total_K)}</td></tr></tfoot>
        </table>
        <div class="note ${res.seimbang ? 'note-g' : 'note-y'}" style="margin-top:10px;">
            <span>${res.seimbang ? '✓' : '⚠️'}</span>
            <span>${res.seimbang ? 'Baris ini seimbang (Debit = Kredit) — bukti transaksi ini valid & tersinkronisasi dengan benar.' : `Selisih Debit-Kredit: ${R(Math.abs(res.total_D - res.total_K))} — periksa transaksi ${esc(ref)}.`}</span>
        </div>`
        : '<div class="empty"><div class="ico">📭</div><strong>Referensi tidak ditemukan.</strong></div>';

        lapSetModalFooter(
            (back ? `<button class="btn btn-g" onclick="lapLihatAkun('${esc(back.kode)}','${esc(back.nama).replace(/'/g,"\\'")}','${back.dari}','${back.sampai}','${esc(back.periodeLabel).replace(/'/g,"\\'")}')">← Kembali ke Rincian Akun</button>` : '') +
            '<button class="btn btn-p" onclick="closeM()">Tutup</button>'
        );
    } catch (err) {
        document.querySelector('#mbox .mbd').innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};

/** Modal formula client-side (tanpa fetch) — untuk baris RINGKASAN/HASIL
 * HITUNGAN (mis. "Total Pendapatan", "Laba Kotor", "LABA BERSIH", "Total
 * Aset") yang nilainya adalah gabungan/selisih dari baris-baris lain yang
 * sudah ada di memori (tidak perlu tanya server lagi). `parts` = array
 * {label, nilai, op} dengan op '+' atau '−'; `hasil` = {label, nilai}.
 */
window.lapFormula = (judul, penjelasan, parts, hasil) => {
    const partsHtml = parts.map(p => `
        <tr>
            <td style="padding:5px 6px;">${p.op === '−' ? '(−) ' : ''}${esc(p.label)}</td>
            <td class="r" style="padding:5px 6px;${p.op === '−' ? 'color:var(--red);' : ''}">${p.op === '−' ? '(' : ''}${R(p.nilai)}${p.op === '−' ? ')' : ''}</td>
        </tr>`).join('');
    openM(`<div class="mhd"><h3>🧮 ${esc(judul)}</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
        ${penjelasan ? `<div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span><span>${penjelasan}</span></div>` : ''}
        <table style="width:100%;">
            <tbody>${partsHtml}</tbody>
            <tfoot>
                <tr style="font-weight:700;border-top:2px solid var(--brd);background:rgba(26,92,56,.05);">
                    <td style="padding:8px 6px;">${esc(hasil.label)}</td>
                    <td class="r" style="padding:8px 6px;">${R(hasil.nilai)}</td>
                </tr>
            </tfoot>
        </table>
        <div style="font-size:11px;color:var(--ink3);margin-top:10px;">💡 Setiap komponen di atas juga bisa ditelusuri sendiri — tutup modal ini lalu klik baris komponennya langsung di laporan.</div>
    </div>
    <div class="mft"><button class="btn btn-g" onclick="closeM()">Tutup</button></div>`);
};

/* ── NERACA SALDO ─────────────────────────────────────────── */
async function renderNeracaSaldo() {
    const el = document.getElementById('lp-saldo');
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const f   = window._lapFilter;
        const res  = await apiGet('/laporan/neraca-saldo' + buildQuery({ cabang: cab, dari: f.dari, sampai: f.sampai }));
        const list = res.data || [];

        const periodeLabel = lapPeriodeLabel(f);
        el.innerHTML = `
        ${lapExportBar('lp-saldo','Neraca Saldo','tblNS')}
        ${lapFilterBar('renderNeracaSaldo')}
        <div class="note note-b" style="margin-bottom:0;">
            <span class="note-ico">🖱️</span>
            <span>Klik baris akun manapun untuk melihat rincian transaksi &amp; cara perhitungan angka Debit/Kreditnya.</span>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3>Neraca Saldo</h3>
                <div class="meta">${cab || 'Semua cabang'} · ${periodeLabel} · ${list.length} akun aktif</div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblNS">
                    <thead><tr>
                        <th>Kode</th><th>Nama Akun</th><th>Kategori</th>
                        <th class="r">Debit</th><th class="r">Kredit</th>
                    </tr></thead>
                    <tbody>
                        ${list.map(r => `<tr class="row-click" title="Klik untuk lihat rincian &amp; cara perhitungan"
                            onclick="lapLihatAkun('${esc(r.kode)}','${esc(r.nama).replace(/'/g,"\\'")}','${f.dari||''}','${f.sampai||''}','${esc(periodeLabel).replace(/'/g,"\\'")}')">
                            <td style="font-family:var(--F-m);font-size:12px;color:var(--ink3);">${r.kode}</td>
                            <td>${esc(r.nama)}</td>
                            <td><span class="badge badge-noppn" style="font-size:10px;">${r.kat}</span></td>
                            <td class="r">${r.D ? R(r.D) : '<span style="color:var(--ink3);">–</span>'}</td>
                            <td class="r">${r.K ? R(r.K) : '<span style="color:var(--ink3);">–</span>'}</td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td colspan="3">Total</td>
                            <td>${R(res.total_D)}</td>
                            <td>${R(res.total_K)}</td>
                        </tr>
                    </tfoot>
                </table>
                <div style="padding:12px 16px;">
                    ${res.seimbang
                        ? `<div class="note note-g" style="margin:0;"><span>✓</span> Neraca saldo seimbang — ${R(res.total_D)}</div>`
                        : `<div class="note note-y" style="margin:0;"><span>⚠️</span> Debit (${R(res.total_D)}) ≠ Kredit (${R(res.total_K)}). Selisih: ${R(Math.abs(res.total_D - res.total_K))}.</div>`
                    }
                </div>`
                : '<div class="empty"><div class="ico">⚖️</div><strong>Belum ada data.</strong></div>'}
            </div>
        </div>`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── LAPORAN LABA RUGI ────────────────────────────────────── */
async function renderLabaRugi() {
    const el = document.getElementById('lp-labarugi');
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const f   = window._lapFilter;
        window._lrShift = window._lrShift || '';
        window._lrKasir = window._lrKasir || '';
        const [r, rekap] = await Promise.all([
            apiGet('/laporan/laba-rugi' + buildQuery({ cabang: cab, dari: f.dari, sampai: f.sampai, shift: window._lrShift, kasir: window._lrKasir })),
            // rekap kinerja per shift & kasir (sumber sama dgn Analisis Data ▸ Kasir & Shift)
            apiGet('/analisis/kasir' + buildQuery({ cabang: cab, dari: f.dari, sampai: f.sampai })).catch(() => null),
        ]);
        window._lrData = r; // dipakai lapFormula() untuk baris ringkasan tanpa fetch ulang
        const pk = !!r.per_kasir_shift; // mode per Shift/Kasir (hanya Penjualan & HPP)
        // Baris akun bisa diklik utk rincian — HANYA di mode keseluruhan (rincian akun
        // tidak mengenal shift, jadi di mode per shift klik dimatikan supaya tidak menyesatkan).
        const klikAkun = (kode, nama, tip) => pk ? '' :
            `class="row-click" title="${tip}" onclick="lapLihatAkun('${esc(kode)}','${esc(nama).replace(/'/g,"\\'")}',${dfArg})"`;
        const periodeLabel = lapPeriodeLabel(f);
        const dfArg = `'${f.dari||''}','${f.sampai||''}','${esc(periodeLabel).replace(/'/g,"\\'")}'`;

        el.innerHTML = `
        ${lapExportBar('lp-labarugi','Laporan Laba Rugi','tblLR')}
        ${lapFilterBar('renderLabaRugi')}
        ${lrFilterShiftBar(rekap)}
        ${pk ? `
        <div class="note note-y" style="margin-bottom:12px;">
            <span class="note-ico">🕒</span>
            <span><strong>Mode per ${window._lrKasir ? 'Kasir' : 'Shift'}:</strong> hanya <strong>Penjualan &amp; HPP</strong> yang dihitung.
            Biaya operasional, pembelian, dan transaksi lain tidak dicatat per kasir/shift, jadi
            <strong>Laba Bersih di sini = Laba Kotor penjualan</strong> ${window._lrShift ? 'shift' : 'kasir'} tsb.
            Klik rincian akun dinonaktifkan di mode ini.</span>
        </div>` : `
        <div class="note note-b" style="margin-bottom:0;">
            <span class="note-ico">🖱️</span>
            <span>Klik baris pendapatan/biaya untuk rincian transaksinya, atau baris <strong>Total/Laba</strong> untuk lihat cara perhitungannya.</span>
        </div>`}
        ${(r.barang_tidak_terdeteksi && r.barang_tidak_terdeteksi.jumlah_kode > 0) ? `
        <div class="note note-y" style="margin-bottom:12px;border-color:var(--red);">
            <span class="note-ico">🔴</span>
            <span>
                <strong>${r.barang_tidak_terdeteksi.jumlah_kode} kode barang</strong> (total omzet <strong>${R(r.barang_tidak_terdeteksi.omzet)}</strong>)
                sudah tercatat di Riwayat Penjualan tapi <strong>belum terdaftar sama sekali</strong> di Master Barang —
                baris ini <strong>tidak ikut dihitung</strong> di Pendapatan/Laba Rugi di bawah ini, makanya total di
                Riwayat Penjualan bisa terlihat lebih besar daripada Pendapatan di sini.
                Buka <strong>Transaksi ▸ Sinkronisasi Data ▸ 🧩 Barang Tidak Terdeteksi</strong>, klik <strong>🔗 Cocokkan Otomatis</strong> dulu
                (kalau kodenya ternyata barcode barang yang sudah ada), lalu masukkan sisanya ke Master Barang.
            </span>
        </div>` : ''}
        ${(r.barang_tanpa_modal && r.barang_tanpa_modal.length) ? `
        <div class="note note-y" style="margin-bottom:12px;">
            <span class="note-ico">⚠️</span>
            <span>
                <strong>${r.barang_tanpa_modal.length} barang</strong> sudah terjual tapi <strong>Harga Modal</strong>-nya
                masih kosong/0 di Master Barang — sehingga HPP barang ini terhitung Rp 0 dan
                <strong>Laba Kotor/Bersih di bawah ini jadi lebih besar dari kenyataan</strong>.
                Isi Harga Modal barang-barang berikut di menu Master ▸ Barang, atau klik tombol di bawah untuk
                mengambil HPP asli dari nota penjualan SID (kalau barang tsb pernah tersinkron dari SID):
                <div style="margin-top:6px;font-size:12px;max-height:120px;overflow-y:auto;">
                    ${r.barang_tanpa_modal.slice(0,15).map(b => `${esc(b.kode)} – ${esc(b.nama)} (terjual ${b.qty_terjual.toLocaleString('id-ID')}, omzet ${R(b.omzet)})`).join('<br>')}
                    ${r.barang_tanpa_modal.length > 15 ? `<br>… dan ${r.barang_tanpa_modal.length - 15} lainnya` : ''}
                </div>
                <button class="btn btn-sm" style="margin-top:8px;" onclick="perbaikiHppDariNota(this)">🔧 Perbaiki HPP dari Nota SID</button>
                <button class="btn btn-sm" style="margin-top:8px;margin-left:6px;" onclick="isiModalDariBeli(this)">📦 Isi dari rata-rata Harga Beli</button>
            </span>
        </div>` : ''}
        <div class="box">
            <div class="box-hd">
                <h3 style="font-family:var(--F-d);">Laporan Laba Rugi</h3>
                <div class="meta">${cab || 'Semua cabang'} — ${lapPeriodeLabel(f)}${window._lrShift ? ' — Shift ' + esc(window._lrShift) : ''}${window._lrKasir ? ' — Kasir ' + esc(window._lrKasir) : ''}</div>
            </div>
            <div class="box-bd pad0 tscroll">
                <table id="tblLR">
                    <tbody>
                        <!-- Bagian Pendapatan -->
                        <tr style="background:var(--kertas);">
                            <td colspan="2" style="font-weight:700;padding:12px 14px;
                                text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:var(--daun);">
                                Pendapatan
                            </td>
                        </tr>
                        ${(r.pendapatan_detail || []).map(p => `
                        <tr ${klikAkun(p.kode, p.nama, 'Klik untuk lihat rincian transaksi')}>
                            <td style="padding-left:28px;">${esc(p.nama)}</td>
                            <td class="r">${R(p.nilai)}</td>
                        </tr>`).join('')}
                        <tr class="row-click" style="background:rgba(26,92,56,.04);font-weight:700;" title="Klik untuk lihat cara perhitungan"
                            onclick="lapFormula('Total Pendapatan (DPP)','Jumlah semua akun berkategori Pendapatan (sudah bersih dari PPN Keluaran — PPN dicatat terpisah di akun 2102, bukan di Pendapatan).', ${esc(JSON.stringify((r.pendapatan_detail||[]).map(p=>({label:p.nama,nilai:p.nilai,op:'+'}))))}, {label:'Total Pendapatan (DPP)', nilai:r.pendapatan})">
                            <td style="padding:10px 14px;">Total Pendapatan (DPP)</td>
                            <td class="r">${R(r.pendapatan)}</td>
                        </tr>

                        <!-- HPP -->
                        <tr ${klikAkun('5101', 'Harga Pokok Penjualan', 'Klik untuk lihat rincian transaksi (akun 5101)')}>
                            <td style="padding-left:28px;color:var(--red);">
                                Harga Pokok Penjualan (HPP)
                                ${r.hpp === 0 ? '<span style="font-size:11px;color:var(--ylw);"> ⚠ Isi harga modal di Master Barang</span>' : ''}
                            </td>
                            <td class="r">(${R(r.hpp)})</td>
                        </tr>

                        <!-- Laba Kotor -->
                        <tr class="row-click" style="background:rgba(26,92,56,.06);font-weight:700;border-top:2px solid var(--brd);" title="Klik untuk lihat cara perhitungan"
                            onclick="lapFormula('Laba Kotor','Laba Kotor = Total Pendapatan (DPP) dikurangi Harga Pokok Penjualan (HPP).', [{label:'Total Pendapatan (DPP)',nilai:${r.pendapatan},op:'+'},{label:'Harga Pokok Penjualan (HPP)',nilai:${r.hpp},op:'−'}], {label:'Laba Kotor', nilai:${r.laba_kotor}})">
                            <td style="padding:12px 14px;">Laba Kotor</td>
                            <td class="r laba-pos">${R(r.laba_kotor)}</td>
                        </tr>

                        <!-- Biaya Operasional -->
                        <tr style="background:var(--kertas);">
                            <td colspan="2" style="font-weight:700;padding:12px 14px;
                                text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:var(--daun);">
                                Biaya Operasional
                            </td>
                        </tr>
                        ${(r.beban_detail || []).map(b => `
                        <tr ${klikAkun(b.kode, b.nama, 'Klik untuk lihat rincian transaksi')}>
                            <td style="padding-left:28px;">${esc(b.nama)}</td>
                            <td class="r">(${R(b.nilai)})</td>
                        </tr>`).join('')}
                        ${!(r.beban_detail || []).length
                            ? `<tr><td style="padding-left:28px;color:var(--ink3);">${pk ? 'Biaya operasional tidak dibagi per kasir/shift (tidak dihitung di mode ini).' : 'Belum ada biaya operasional tercatat.'}</td><td></td></tr>`
                            : ''}
                        <tr class="row-click" style="background:rgba(26,92,56,.04);font-weight:700;" title="Klik untuk lihat cara perhitungan"
                            onclick="lapFormula('Total Biaya Operasional','Jumlah semua akun berkategori Beban (di luar akun HPP 5101).', ${esc(JSON.stringify((r.beban_detail||[]).map(b=>({label:b.nama,nilai:b.nilai,op:'+'}))))}, {label:'Total Biaya Operasional', nilai:r.beban})">
                            <td style="padding:10px 14px;">Total Biaya Operasional</td>
                            <td class="r laba-neg">(${R(r.beban)})</td>
                        </tr>
                    </tbody>
                    <tfoot>
                        <tr class="row-click" title="Klik untuk lihat cara perhitungan"
                            onclick="lapFormula('LABA BERSIH','LABA BERSIH = Laba Kotor dikurangi Total Biaya Operasional.', [{label:'Laba Kotor',nilai:${r.laba_kotor},op:'+'},{label:'Total Biaya Operasional',nilai:${r.beban},op:'−'}], {label:'LABA BERSIH', nilai:${r.laba_bersih}})">
                            <td>LABA BERSIH</td>
                            <td class="${r.laba_bersih >= 0 ? 'laba-pos' : 'laba-neg'}">${R(r.laba_bersih)}</td>
                        </tr>
                    </tfoot>
                </table>
            </div>
        </div>
        ${lrRekapKinerja(rekap)}`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── Laba Rugi per Shift / Kasir: filter & rekap kinerja ──────────────── */
const LR_SHIFT_URUT = ['Pagi', 'Siang', 'Sehari', '(tanpa shift)'];

// Daftar kasir unik (gabungan semua cabang) dari hasil /analisis/kasir
function lrDaftarKasir(rekap) {
    const map = {};
    ((rekap && rekap.per_cabang) || []).forEach(c => (c.shift || []).forEach(sh => (sh.kasir || []).forEach(k => {
        const key = k.kasir;
        if (!map[key]) map[key] = { kasir: key, shift: sh.shift, cabang: c.cabang };
    })));
    return Object.values(map).sort((a, b) => a.kasir.localeCompare(b.kasir));
}

function lrFilterShiftBar(rekap) {
    const sh = window._lrShift || '', ks = window._lrKasir || '';
    const kasirList = lrDaftarKasir(rekap);
    const btn = (val, label) =>
        `<button class="btn btn-sm ${(!ks && sh === val) ? 'btn-p' : 'btn-g'}" onclick="lrSetShift('${val}')">${label}</button>`;
    return `
    <div class="export-bar no-print" style="flex-wrap:wrap;gap:8px;">
        <span class="lbl">Tampilan:</span>
        ${btn('', 'Semua Shift')}
        ${btn('Pagi', 'Pagi')}
        ${btn('Siang', 'Siang')}
        ${btn('Sehari', 'Sehari')}
        <span style="color:var(--ink3);font-size:12px;margin-left:4px;">atau per kasir:</span>
        <select class="finput" style="width:190px;padding:6px 8px;" onchange="lrSetKasir(this.value)">
            <option value="">— semua kasir —</option>
            ${kasirList.map(k => `<option value="${esc(k.kasir)}" ${ks === k.kasir ? 'selected' : ''}>${esc(k.kasir)} (${esc(k.shift)})</option>`).join('')}
        </select>
    </div>`;
}
window.lrSetShift = (val) => { window._lrShift = val; window._lrKasir = ''; renderLabaRugi(); };
window.lrSetKasir = (val) => { window._lrKasir = val; window._lrShift = ''; renderLabaRugi(); };

function lrBaris(label, z, opts = {}) {
    const margin = z.dpp > 0 ? (z.laba / z.dpp * 100) : 0;
    const klik = opts.onclick ? `class="row-click" title="Klik untuk tampilkan Laba Rugi ${esc(label)}" onclick="${opts.onclick}"` : '';
    return `<tr ${klik} ${opts.bold ? 'style="font-weight:700;background:rgba(26,92,56,.04);"' : ''}>
        <td style="${opts.indent ? 'padding-left:28px;' : ''}">${opts.html || esc(label)}</td>
        <td class="r">${(z.struk || 0).toLocaleString('id-ID')}</td>
        <td class="r">${R(z.dpp)}</td>
        <td class="r" style="color:var(--red);">(${R(z.hpp)})</td>
        <td class="r ${z.laba >= 0 ? 'laba-pos' : 'laba-neg'}">${R(z.laba)}</td>
        <td class="r">${margin.toFixed(1)}%</td>
    </tr>`;
}

// Tabel perbandingan kinerja: per Shift, lalu per Kasir (dikelompokkan per cabang)
function lrRekapKinerja(rekap) {
    if (!rekap || !rekap.ada_kolom) {
        return `<div class="note note-y" style="margin-top:12px;"><span class="note-ico">ℹ️</span>
            <span>Rekap per shift belum tersedia — kolom kasir/shift di data Penjualan belum ada (jalankan <code>php artisan migrate</code>).</span></div>`;
    }
    const perShift = rekap.per_shift || [];
    if (!perShift.length) return '';
    const head = `<thead><tr><th>Nama</th><th class="r">Struk</th><th class="r">Pendapatan (DPP)</th><th class="r">HPP</th><th class="r">Laba Kotor</th><th class="r">Margin</th></tr></thead>`;

    const barisShift = LR_SHIFT_URUT.map(n => perShift.find(x => x.shift === n)).filter(Boolean)
        .map(x => lrBaris(x.shift, x.total, {
            onclick: x.shift === '(tanpa shift)' ? '' : `lrSetShift('${x.shift}')`,
            html: `<strong>${esc(x.shift)}</strong>`,
        })).join('');

    const barisCabang = (rekap.per_cabang || []).map(c => {
        const kasirRows = [];
        (c.shift || []).forEach(sh => (sh.kasir || []).forEach(k => kasirRows.push({ kasir: k.kasir, shift: sh.shift, z: k })));
        return `<tr style="background:var(--kertas);"><td colspan="6" style="font-weight:700;padding:8px 14px;font-size:12px;color:var(--daun);">
                    ${esc(c.cabang)} — total ${R(c.total.laba)} laba kotor</td></tr>
                ${kasirRows.map(k => lrBaris(k.kasir, k.z, {
                    indent: true,
                    onclick: k.kasir === '(tanpa kasir)' ? '' : `lrSetKasir('${esc(k.kasir).replace(/'/g, "\\'")}')`,
                    html: `${esc(k.kasir)} <span class="badge badge-noppn" style="font-size:10px;">${esc(k.shift)}</span>`,
                })).join('')}`;
    }).join('');

    return `
    <div class="box" style="margin-top:14px;">
        <div class="box-hd">
            <h3 style="font-family:var(--F-d);">Kinerja per Shift &amp; Kasir</h3>
            <div class="meta">Klik baris untuk membuka Laba Rugi shift/kasir tsb · hanya Penjualan &amp; HPP</div>
        </div>
        <div class="box-bd pad0 tscroll">
            <table id="tblLRShift">
                ${head}
                <tbody>
                    <tr style="background:var(--kertas);"><td colspan="6" style="font-weight:700;padding:8px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--daun);">Per Shift (gabungan semua cabang yang dipilih)</td></tr>
                    ${barisShift}
                    ${lrBaris('TOTAL', rekap.total, { bold: true })}
                    <tr style="background:var(--kertas);"><td colspan="6" style="font-weight:700;padding:8px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--daun);">Per Kasir, per Cabang</td></tr>
                    ${barisCabang}
                </tbody>
            </table>
        </div>
    </div>`;
}

/* ── NERACA (BALANCE SHEET) ───────────────────────────────── */
async function renderNeraca() {
    const el = document.getElementById('lp-neraca');
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const f   = window._lapFilterNeraca;
        const r   = await apiGet('/laporan/neraca' + buildQuery({ cabang: cab, sampai: f.sampai }));
        window._neracaData = r;
        const cutoffLabel = `Kumulatif s/d ${fmtTgl(f.sampai || today())}`;
        const dfArgN = `null,'${f.sampai||''}','${esc(cutoffLabel).replace(/'/g,"\\'")}'`;

        el.innerHTML = `
        ${lapExportBar('lp-neraca','Neraca','tblNeraca')}
        ${lapFilterBarNeraca()}
        <div class="note note-b" style="margin-bottom:0;">
            <span class="note-ico">🖱️</span>
            <span>Klik baris akun untuk rincian transaksinya, atau baris <strong>Total</strong> untuk lihat cara perhitungannya.</span>
        </div>
        <div class="box">
            <div class="box-hd">
                <h3 style="font-family:var(--F-d);">Neraca (Balance Sheet)</h3>
                <div class="meta">${cab || 'Semua cabang'} · per ${fmtTgl(f.sampai || today())} (kumulatif sejak awal)</div>
            </div>
            <div class="box-bd pad0 tscroll">
                <table id="tblNeraca">
                    <tbody>
                        <!-- ASET -->
                        <tr style="background:var(--kertas);">
                            <td colspan="2" style="font-weight:700;padding:12px 14px;border-top:2px solid var(--brd);
                                text-transform:uppercase;font-size:11px;color:var(--daun);">ASET</td>
                        </tr>
                        ${(r.aset || []).map(x => `
                        <tr class="row-click" title="Klik untuk lihat rincian transaksi" onclick="lapLihatAkun('${esc(x.kode)}','${esc(x.nama).replace(/'/g,"\\'")}',${dfArgN})">
                            <td style="padding-left:28px;">${esc(x.nama)}</td>
                            <td class="r">${R(x.nilai)}</td>
                        </tr>`).join('')}
                        <tr class="row-click" style="background:rgba(26,92,56,.04);font-weight:700;" title="Klik untuk lihat cara perhitungan"
                            onclick="lapFormula('Total Aset','Jumlah semua akun berkategori Aset (saldo normal Debit), dihitung kumulatif sejak awal berdiri.', ${esc(JSON.stringify((r.aset||[]).map(x=>({label:x.nama,nilai:x.nilai,op:'+'}))))}, {label:'Total Aset', nilai:r.total_aset})">
                            <td style="padding:10px 14px;">Total Aset</td>
                            <td class="r">${R(r.total_aset)}</td>
                        </tr>

                        <tr><td colspan="2" style="height:8px;background:var(--kertas);"></td></tr>

                        <!-- LIABILITAS -->
                        <tr style="background:var(--kertas);">
                            <td colspan="2" style="font-weight:700;padding:12px 14px;border-top:2px solid var(--brd);
                                text-transform:uppercase;font-size:11px;color:var(--daun);">LIABILITAS</td>
                        </tr>
                        ${(r.liabilitas || []).map(x => `
                        <tr class="row-click" title="Klik untuk lihat rincian transaksi" onclick="lapLihatAkun('${esc(x.kode)}','${esc(x.nama).replace(/'/g,"\\'")}',${dfArgN})">
                            <td style="padding-left:28px;">${esc(x.nama)}</td>
                            <td class="r">${R(x.nilai)}</td>
                        </tr>`).join('')}
                        ${!(r.liabilitas || []).length
                            ? '<tr><td style="padding-left:28px;color:var(--ink3);">Tidak ada liabilitas.</td><td></td></tr>'
                            : ''}
                        <tr class="row-click" style="background:rgba(26,92,56,.04);font-weight:700;" title="Klik untuk lihat cara perhitungan"
                            onclick="lapFormula('Total Liabilitas','Jumlah semua akun berkategori Liabilitas (saldo normal Kredit), dihitung kumulatif sejak awal berdiri.', ${esc(JSON.stringify((r.liabilitas||[]).map(x=>({label:x.nama,nilai:x.nilai,op:'+'}))))}, {label:'Total Liabilitas', nilai:r.total_liabilitas})">
                            <td style="padding:10px 14px;">Total Liabilitas</td>
                            <td class="r">${R(r.total_liabilitas)}</td>
                        </tr>

                        <tr><td colspan="2" style="height:8px;background:var(--kertas);"></td></tr>

                        <!-- MODAL -->
                        <tr style="background:var(--kertas);">
                            <td colspan="2" style="font-weight:700;padding:12px 14px;border-top:2px solid var(--brd);
                                text-transform:uppercase;font-size:11px;color:var(--daun);">MODAL</td>
                        </tr>
                        ${(r.modal || []).map(x => `
                        <tr class="row-click" title="Klik untuk lihat rincian transaksi" onclick="lapLihatAkun('${esc(x.kode)}','${esc(x.nama).replace(/'/g,"\\'")}',${dfArgN})">
                            <td style="padding-left:28px;">${esc(x.nama)}</td>
                            <td class="r">${R(x.nilai)}</td>
                        </tr>`).join('')}
                        <tr class="row-click" title="Klik untuk lihat cara perhitungan (dari Laporan Laba Rugi kumulatif)"
                            onclick="lapFormula('Laba Tahun Berjalan','Sama dengan LABA BERSIH di Laporan Laba Rugi, dihitung kumulatif sejak awal berdiri sampai tanggal cutoff Neraca ini — bukan angka input manual, otomatis ditarik dari mesin jurnal yang sama. Buka tab 📈 Laba Rugi dengan periode &quot;Semua (All Time)&quot; untuk lihat rincian komponennya (Pendapatan, HPP, Biaya Operasional).', [], {label:'Laba Tahun Berjalan', nilai:r.laba_berjalan})">
                            <td style="padding-left:28px;">Laba Tahun Berjalan</td>
                            <td class="r ${r.laba_berjalan >= 0 ? 'laba-pos' : 'laba-neg'}">${R(r.laba_berjalan)}</td>
                        </tr>
                        <tr class="row-click" style="background:rgba(26,92,56,.04);font-weight:700;" title="Klik untuk lihat cara perhitungan"
                            onclick="lapFormula('Total Modal','Jumlah semua akun berkategori Modal, ditambah Laba Tahun Berjalan (hasil Laporan Laba Rugi kumulatif).', ${esc(JSON.stringify((r.modal||[]).map(x=>({label:x.nama,nilai:x.nilai,op:'+'})).concat([{label:'Laba Tahun Berjalan',nilai:r.laba_berjalan,op:'+'}])))}, {label:'Total Modal', nilai:r.total_modal})">
                            <td style="padding:10px 14px;">Total Modal</td>
                            <td class="r">${R(r.total_modal)}</td>
                        </tr>
                    </tbody>
                </table>
                <div style="padding:12px 16px;">
                    ${r.seimbang
                        ? `<div class="note note-g" style="margin:0;"><span>✓</span> Neraca seimbang — Aset = Liabilitas + Modal = ${R(r.total_aset)}</div>`
                        : `<div class="note note-y" style="margin:0;"><span>⚠️</span> Neraca belum seimbang. Selisih: ${R(Math.abs(r.total_aset - (r.total_liabilitas + r.total_modal)))}.</div>`
                    }
                </div>
            </div>
        </div>`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/* ── REKAP PPN ────────────────────────────────────────────── */
async function renderRekapPPN() {
    const el = document.getElementById('lp-ppn');
    el.innerHTML = loadingHTML;
    try {
        const cab = getCabang();
        const f   = window._lapFilter;
        const res  = await apiGet('/laporan/rekap-ppn' + buildQuery({ cabang: cab, dari: f.dari, sampai: f.sampai }));
        const list = res.data || [];
        const totK = list.reduce((s, r) => s + r.ppn_keluaran, 0);
        const totM = list.reduce((s, r) => s + r.ppn_masukan, 0);

        el.innerHTML = `
        ${lapExportBar('lp-ppn','Rekap PPN','tblPPN')}
        ${lapFilterBar('renderRekapPPN')}
        <div class="note note-b">
            <span class="note-ico">ℹ️</span>
            <span>Rekap dari barang <strong>Kena PPN</strong>, tarif <strong>${res.tarif}%</strong> · ${lapPeriodeLabel(f)}.
            Digunakan sebagai dasar pengisian SPT Masa PPN / Coretax DJP.
            Klik salah satu angka DPP/PPN di tabel untuk melihat daftar nota yang membentuknya.</span>
        </div>
        ${list.length ? `
        <!-- Summary KPI -->
        <div class="kpi-grid">
            <div class="kpi"><div class="kpi-label">Total PPN Keluaran</div><div class="kpi-val laba-neg">${R(totK)}</div><div class="kpi-sub">Dipungut dari penjualan</div></div>
            <div class="kpi green"><div class="kpi-label">Total PPN Masukan</div><div class="kpi-val pos">${R(totM)}</div><div class="kpi-sub">Dikreditkan dari pembelian</div></div>
            <div class="kpi ${(totK-totM) > 0 ? 'red' : 'green'}">
                <div class="kpi-label">${(totK-totM) > 0 ? 'Kurang Bayar (PPN Lebih)' : 'Lebih Bayar (PPN Dikreditkan)'}</div>
                <div class="kpi-val ${(totK-totM) > 0 ? 'neg' : 'pos'}">${R(Math.abs(totK-totM))}</div>
                <div class="kpi-sub">Keluaran − Masukan</div>
            </div>
        </div>` : ''}

        ${res.migrasi_saldo_awal && res.migrasi_saldo_awal.jumlah_baris > 0 ? `
        <div class="box" style="margin-bottom:14px;">
            <div class="box-hd"><h3>🔄 PPN Masukan dari Migrasi/Saldo Awal (Otomatis)</h3></div>
            <div class="box-bd" style="padding:14px 16px;">
                <div class="note note-y" style="margin-bottom:10px;">
                    <span class="note-ico">⚠️</span>
                    <span>Ini PPN Masukan hasil "Jalankan Deteksi Otomatis" di Data Master (barang yang laku tapi riwayat
                    pembelian aslinya tidak pernah tercatat di sistem ini) — <strong>sengaja TIDAK dimasukkan</strong> ke tabel
                    bulanan di bawah karena tanggalnya cuma tanggal migrasi teknis, bukan tanggal faktur pajak asli, sehingga
                    tidak akurat kalau dipakai langsung sebagai dasar SPT Masa PPN per bulan. Kalau PPN ini SUDAH pernah kamu
                    kreditkan/klaim di SPT semasa masih pakai sistem/kasir lama, jangan diklaim ulang di sini — nilainya cukup
                    dianggap catatan aset buku saja.</span>
                </div>
                <div class="kpi-grid">
                    <div class="kpi"><div class="kpi-label">Barang Tersentuh</div><div class="kpi-val">${res.migrasi_saldo_awal.jumlah_baris}</div></div>
                    <div class="kpi"><div class="kpi-label">Total DPP</div><div class="kpi-val">${R(res.migrasi_saldo_awal.total_dpp)}</div></div>
                    <div class="kpi green"><div class="kpi-label">Total PPN Masukan (migrasi)</div><div class="kpi-val pos">${R(res.migrasi_saldo_awal.total_ppn_masukan)}</div></div>
                </div>
            </div>
        </div>` : ''}

        <div class="box">
            <div class="box-hd">
                <h3>Rekap PPN per Bulan</h3>
                <div class="meta">${cab || 'Semua cabang'} · Tarif ${res.tarif}%</div>
            </div>
            <div class="box-bd pad0 tscroll">
                ${list.length ? `
                <table id="tblPPN">
                    <thead><tr>
                        <th>Bulan</th>
                        <th class="r">DPP Penjualan</th>
                        <th class="r">PPN Keluaran</th>
                        <th class="r">DPP Pembelian</th>
                        <th class="r">PPN Masukan</th>
                        <th class="r">Kurang/(Lebih) Bayar</th>
                    </tr></thead>
                    <tbody>
                        ${list.map(r => `<tr>
                            <td style="font-weight:600;">${monthLabel(r.bulan) || r.bulan}</td>
                            <td class="r" style="cursor:pointer;" title="Klik untuk lihat daftar nota penjualan" onclick="lihatRekapPpnDetail('${r.bulan}','jual','${esc(monthLabel(r.bulan) || r.bulan)}')">${R(r.dpp_jual)}</td>
                            <td class="r laba-neg" style="cursor:pointer;" title="Klik untuk lihat daftar nota penjualan" onclick="lihatRekapPpnDetail('${r.bulan}','jual','${esc(monthLabel(r.bulan) || r.bulan)}')">${R(r.ppn_keluaran)}</td>
                            <td class="r" style="cursor:pointer;" title="Klik untuk lihat daftar nota pembelian" onclick="lihatRekapPpnDetail('${r.bulan}','beli','${esc(monthLabel(r.bulan) || r.bulan)}')">${R(r.dpp_beli)}</td>
                            <td class="r laba-pos" style="cursor:pointer;" title="Klik untuk lihat daftar nota pembelian" onclick="lihatRekapPpnDetail('${r.bulan}','beli','${esc(monthLabel(r.bulan) || r.bulan)}')">${R(r.ppn_masukan)}</td>
                            <td class="r" style="font-weight:700;color:${r.kurang_bayar > 0 ? 'var(--red)' : 'var(--grn)'};">
                                ${R(r.kurang_bayar)}
                            </td>
                        </tr>`).join('')}
                    </tbody>
                    <tfoot>
                        <tr>
                            <td>Total</td>
                            <td></td>
                            <td>${R(totK)}</td>
                            <td></td>
                            <td>${R(totM)}</td>
                            <td>${R(totK - totM)}</td>
                        </tr>
                    </tfoot>
                </table>`
                : '<div class="empty"><div class="ico">🧾</div><strong>Belum ada transaksi PPN.</strong><br>Input penjualan/pembelian barang berstatus "Kena PPN" terlebih dahulu.</div>'}
            </div>
        </div>`;
    } catch (err) {
        el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
}

/** Rincian nota Penjualan/Pembelian Kena PPN yang membentuk 1 sel di Rekap PPN */
window.lihatRekapPpnDetail = async (bulan, jenis, bulanLabel) => {
    const cab = getCabang();
    const judul = jenis === 'beli' ? 'Nota Pembelian Kena PPN' : 'Nota Penjualan Kena PPN';
    openM(`<div class="mhd"><h3>🧾 ${esc(judul)} — ${esc(bulanLabel)}</h3><button class="mclose" onclick="closeM()">×</button></div>
        <div class="mbd">${loadingHTML}</div>
        <div class="mft"><button class="btn btn-g" onclick="closeM()">Tutup</button></div>`);
    try {
        const res  = await apiGet('/laporan/rekap-ppn-detail' + buildQuery({ bulan, jenis, cabang: cab }));
        const rows = res.data || [];
        document.querySelector('#mbox .mbd').innerHTML = `
        <div style="font-size:12px;color:var(--ink3);margin-bottom:10px;">${cab || 'Semua cabang'} · tarif ${res.tarif}% · ${rows.length} nota</div>
        ${rows.length ? `
        <table style="width:100%;">
            <thead><tr>
                <th style="text-align:left;">Tanggal</th><th style="text-align:left;">Nota</th><th style="text-align:left;">Barang</th>
                <th class="r">Qty</th><th class="r">DPP</th><th class="r">PPN</th>
            </tr></thead>
            <tbody>
                ${rows.map(x => `<tr class="row-click" title="Klik untuk lihat bentukan jurnal lengkap" onclick="bukaBentukanRef('${esc(x.ref)}')">
                    <td style="font-size:12px;padding:4px 6px;white-space:nowrap;">${fmtTgl(x.tgl)}</td>
                    <td style="font-size:11px;padding:4px 6px;"><span class="badge badge-noppn">${esc(x.ref)}</span></td>
                    <td style="font-size:12px;padding:4px 6px;">${esc(x.nama_barang)}</td>
                    <td class="r" style="padding:4px 6px;">${x.qty}</td>
                    <td class="r" style="padding:4px 6px;">${R(x.dpp)}</td>
                    <td class="r" style="padding:4px 6px;">${R(x.ppn_nilai)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
                <tr style="font-weight:700;border-top:1px solid var(--brd);">
                    <td colspan="4" style="padding:6px;">Total</td>
                    <td class="r" style="padding:6px;">${R(res.total_dpp)}</td>
                    <td class="r" style="padding:6px;">${R(res.total_ppn)}</td>
                </tr>
            </tfoot>
        </table>
        <div style="font-size:11px;color:var(--ink3);margin-top:8px;">💡 Klik salah satu nota untuk melihat bentukan jurnal lengkapnya.</div>`
        : '<div class="empty"><div class="ico">📭</div><strong>Tidak ada nota pada bulan ini.</strong></div>'}`;
    } catch (err) {
        document.querySelector('#mbox .mbd').innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>${esc(err.message)}</span></div>`;
    }
};
