/* =============================================================
   sinkronisasi.js — Menu "Sinkronisasi Data"
   Upload ULANG file Excel yang dipakai untuk Import Penjualan/
   Pembelian, lalu dibandingkan dengan data yang SUDAH tersimpan di
   trx_jual/trx_beli — supaya kelihatan baris mana yang:
     - tidak masuk sama sekali (kemungkinan terlewat/gagal saat
       import dulu — kode kosong, qty tidak valid, atau utk
       Penjualan: stok tidak cukup saat itu), atau
     - masuk ke Riwayat Transaksi tapi TIDAK ikut dihitung di
       Jurnal (kode barangnya tidak/tidak-lagi terdaftar di Master
       Barang — buildJurnal() di DashboardController pakai INNER
       JOIN ke tabel barang, jadi baris begini "hilang" dari
       Jurnal & semua laporan turunannya).
   Endpoint: POST /api/transaksi/jual/sinkronisasi/cek
             POST /api/transaksi/beli/sinkronisasi/cek
   (TransaksiController::cekSinkronisasiJual / cekSinkronisasiBeli)
   Menu ini TIDAK PERNAH menulis apa pun ke database — murni
   pembanding/laporan.
   ============================================================= */

window._skLastDetail = { jual: [], beli: [] };

async function renderSinkronisasi(jenis) {
    const isJ = jenis === 'jual';
    const el = document.getElementById(`sk-${jenis}`);
    if (!el) return;

    el.innerHTML = `
    <div class="box">
        <div class="box-hd"><h3>🔄 Cek Sinkronisasi Data ${isJ ? 'Penjualan' : 'Pembelian'}</h3></div>
        <div class="box-bd">
            <div class="note note-b"><span>Upload ULANG file Excel yang sama dipakai untuk Import ${isJ ? 'Penjualan' : 'Pembelian'} (laporan kasir, atau Template Import / hasil Export). Sistem akan membandingkan tiap barisnya dengan data yang sudah tersimpan, dan menunjukkan baris mana yang tidak masuk atau tidak ikut ke Jurnal. Proses ini <strong>tidak mengubah data apa pun</strong> — murni membandingkan.</span></div>
            <div class="fgrid" style="margin-top:10px;">
                <div class="fgroup">
                    <label class="flabel">File Excel</label>
                    <input type="file" id="sk_file_${jenis}" accept=".xlsx,.xls,.csv" class="finput" style="padding:6px;">
                </div>
                <div class="fgroup">
                    <label class="flabel">Cabang</label>
                    <select class="fselect" id="sk_cab_${jenis}">${cabangOpts()}</select>
                </div>
                <div class="fgroup">
                    <label class="flabel">Tanggal <span style="font-weight:400;color:var(--ink3);">(dipakai kalau file tidak punya kolom Tanggal per baris)</span></label>
                    <input class="finput" type="date" id="sk_tgl_${jenis}" value="${today()}">
                </div>
            </div>
        </div>
    </div>
    <div id="sk_result_${jenis}" style="margin-top:14px;"></div>
    `;

    const runIfReady = () => {
        if (document.getElementById(`sk_file_${jenis}`).files[0]) jalankanCekSinkronisasi(jenis);
    };
    document.getElementById(`sk_file_${jenis}`).addEventListener('change', runIfReady);
    document.getElementById(`sk_cab_${jenis}`).addEventListener('change', runIfReady);
    document.getElementById(`sk_tgl_${jenis}`).addEventListener('change', runIfReady);
}

window.jalankanCekSinkronisasi = async function (jenis) {
    const isJ = jenis === 'jual';
    const file = document.getElementById(`sk_file_${jenis}`).files[0];
    const box  = document.getElementById(`sk_result_${jenis}`);
    if (!file) return;
    box.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';

    let items;
    try {
        items = await parseFileUntukSinkronisasi(file, isJ);
    } catch (err) {
        box.innerHTML = `<div class="note note-y"><span>⚠️ Gagal baca file: ${esc(err.message)}</span></div>`;
        return;
    }
    if (!items.length) {
        box.innerHTML = `<div class="note note-y"><span>⚠️ Tidak ada baris transaksi yang terbaca dari file ini.</span></div>`;
        return;
    }

    const cabang  = document.getElementById(`sk_cab_${jenis}`).value;
    const tglForm = document.getElementById(`sk_tgl_${jenis}`).value;
    if (!cabang) { box.innerHTML = `<div class="note note-y"><span>⚠️ Pilih cabang dulu.</span></div>`; return; }

    box.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membandingkan dengan data tersimpan…</div>';
    const payload = items.map(r => ({
        tgl: r.tglRow || tglForm, kode_barang: r.kode_barang, nama: r.nama,
        qty: r.qty, harga: r.harga, satuan: r.satuan, no_nota: r.no_nota,
    }));

    try {
        const endpoint = isJ ? '/transaksi/jual/sinkronisasi/cek' : '/transaksi/beli/sinkronisasi/cek';
        const res = await apiPost(endpoint, { cabang, items: payload });
        renderHasilSinkronisasi(box, res, jenis);
    } catch (err) {
        box.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

function renderHasilSinkronisasi(box, res, jenis) {
    const { ringkasan: r, detail } = res;
    window._skLastDetail[jenis] = detail;
    const badge = (status) => {
        if (status === 'masuk_ok') return `<span class="badge badge-ppn" title="Sudah masuk & ikut dihitung di Jurnal">✅ OK</span>`;
        if (status === 'masuk_tidak_jurnal') return `<span class="badge badge-warn" title="Masuk ke Riwayat, tapi TIDAK ikut dihitung di Jurnal">🟡 Tidak di Jurnal</span>`;
        return `<span class="badge badge-out" title="Tidak ditemukan sama sekali di data tersimpan">🔴 Tidak Masuk</span>`;
    };
    const bermasalah = detail.filter(d => d.status !== 'masuk_ok');
    box.innerHTML = `
    <div class="box" style="padding:14px;">
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px;">
        <div class="box" style="flex:1;min-width:110px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;">${r.total}</div>
            <div style="font-size:11px;color:var(--ink3);">Total Baris File</div>
        </div>
        <div class="box" style="flex:1;min-width:110px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--grn);">${r.masuk_ok}</div>
            <div style="font-size:11px;color:var(--ink3);">✅ Masuk &amp; di Jurnal</div>
        </div>
        <div class="box" style="flex:1;min-width:110px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--ylw);">${r.masuk_tidak_jurnal}</div>
            <div style="font-size:11px;color:var(--ink3);">🟡 Tidak di Jurnal</div>
        </div>
        <div class="box" style="flex:1;min-width:110px;padding:10px;text-align:center;">
            <div style="font-size:20px;font-weight:700;color:var(--red);">${r.tidak_masuk}</div>
            <div style="font-size:11px;color:var(--ink3);">🔴 Tidak Masuk</div>
        </div>
    </div>
    ${bermasalah.length ? `
        <div class="note note-y" style="margin-bottom:8px;"><span>⚠️ Ditemukan <strong>${bermasalah.length}</strong> baris bermasalah — lihat kolom "Alasan" di tabel bawah. Baris "🔴 Tidak Masuk" biasanya cukup diimpor ulang lewat menu Transaksi; baris "🟡 Tidak di Jurnal" perlu kode barangnya dicek/didaftarkan di Master Barang.</span></div>
        <button class="btn btn-g btn-sm" style="margin-bottom:8px;" onclick="exportSinkronisasiExcel('${jenis}')">📤 Export Baris Bermasalah ke Excel</button>
    ` : `<div class="note note-b"><span>✅ Semua baris di file ini sudah tersimpan &amp; ikut dihitung di Jurnal. Tidak ada yang perlu diperbaiki.</span></div>`}
    <div class="tscroll" style="max-height:420px;overflow-y:auto;">
    <table><thead><tr><th>Status</th><th>Tanggal</th><th>Kode/Barcode</th><th>Nama</th><th class="r">Qty</th><th class="r">Harga</th><th>Alasan</th></tr></thead>
    <tbody>${detail.map(d => `<tr>
        <td>${badge(d.status)}</td>
        <td style="font-size:11px;">${esc(d.tgl || '–')}</td>
        <td style="font-size:11px;font-family:var(--F-m);">${esc(d.kode_barang || '–')}</td>
        <td style="font-size:12px;">${esc(d.nama || '–')}</td>
        <td class="r" style="font-size:11px;">${d.qty ?? '–'}</td>
        <td class="r" style="font-size:11px;">${d.harga != null ? R(d.harga) : '–'}</td>
        <td style="font-size:11px;color:var(--ink3);">${esc(d.alasan || '–')}</td>
    </tr>`).join('')}</tbody></table>
    </div>
    </div>`;
}

window.exportSinkronisasiExcel = (jenis) => {
    const detail = (window._skLastDetail[jenis] || []).filter(d => d.status !== 'masuk_ok');
    if (!detail.length) return;
    if (typeof XLSX === 'undefined') { toast('Library XLSX belum dimuat.', 'err'); return; }
    const rows = detail.map(d => ({
        Status: d.status === 'masuk_tidak_jurnal' ? 'Masuk tapi Tidak di Jurnal' : 'Tidak Masuk',
        Tanggal: d.tgl, 'Kode Barang': d.kode_barang, Nama: d.nama, Qty: d.qty, Harga: d.harga,
        'No. Referensi': d.no_nota, Alasan: d.alasan,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Bermasalah');
    XLSX.writeFile(wb, `Sinkronisasi_${jenis === 'jual' ? 'Penjualan' : 'Pembelian'}_${today()}.xlsx`);
};

/* =============================================================
   TAB: BARANG TIDAK TERDETEKSI
   Beda dengan "Cek Penjualan/Pembelian" di atas: TIDAK perlu upload
   ulang file. Langsung scan trx_jual/trx_beli yang SUDAH tersimpan
   untuk cari kode_barang yang tidak (lagi) terdaftar di Master
   Barang — baris seperti ini tampil di Riwayat tapi tidak ikut
   dihitung di Jurnal & Laba Rugi (INNER JOIN ke tabel barang di
   DashboardController::buildJurnal()).
   Endpoint: GET  /api/transaksi/barang-tidak-terdeteksi
             POST /api/transaksi/barang-tidak-terdeteksi/masukkan
   ============================================================= */

window._btdData = { items: [], itemsBeliSaja: [] };

async function renderBarangTidakTerdeteksi() {
    const el = document.getElementById('sk-tidakdikenal');
    if (!el) return;

    el.innerHTML = `
    <div class="box">
        <div class="box-hd"><h3>🧩 Barang Tidak Terdeteksi</h3></div>
        <div class="box-bd">
            <div class="note note-b"><span>Barang di bawah ini <strong>sudah ada transaksinya</strong> di Penjualan/Pembelian, tapi kodenya belum terdaftar di Master Barang — akibatnya baris tsb tetap tampil di Riwayat, tapi <strong>tidak ikut dihitung</strong> di Jurnal &amp; Laporan Laba Rugi (inilah biasanya penyebab total Riwayat Penjualan berbeda dengan Pendapatan di Laba Rugi). Nama/Harga Jual/Harga Modal di bawah sudah diusulkan otomatis dari data transaksinya sendiri — boleh diedit dulu kalau perlu, lalu centang barisnya dan klik "Masukkan ke Master Barang". Begitu masuk, transaksi lama <strong>otomatis</strong> ikut terhitung lagi — tidak perlu diedit satu-satu.</span></div>
            <div class="fgrid" style="margin-top:10px;">
                <div class="fgroup">
                    <label class="flabel">Cabang <span style="font-weight:400;color:var(--ink3);">(kosongkan = semua cabang)</span></label>
                    <select class="fselect" id="btd_cabang">${cabangOpts()}</select>
                </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;">
                <button class="btn btn-p btn-sm" onclick="jalankanDeteksiBarangTidakDikenal()">🔍 Deteksi Sekarang</button>
                <button class="btn btn-g btn-sm" onclick="cocokkanBarangTidakDikenal()" title="Cocokkan kode transaksi yang ternyata barcode/kode alternatif ke kode utama barang di Master, dan bersihkan tanda ⚠️">🔗 Cocokkan Otomatis</button>
            </div>
            <div class="fhint" style="margin-top:6px;">Jalankan <strong>Cocokkan Otomatis</strong> dulu setelah Master Barang diimport: kode di transaksi yang ternyata barcode/kode alternatif barang yang sudah ada dialihkan ke kode utamanya (tanpa membuat barang dobel). Yang tersisa di daftar di bawah baru benar-benar belum ada di Master.</div>
        </div>
    </div>
    <div id="btd_result" style="margin-top:14px;"></div>
    `;

    document.getElementById('btd_cabang').addEventListener('change', jalankanDeteksiBarangTidakDikenal);
    await jalankanDeteksiBarangTidakDikenal();
}
window.renderBarangTidakTerdeteksi = renderBarangTidakTerdeteksi;

window.jalankanDeteksiBarangTidakDikenal = async function () {
    const box = document.getElementById('btd_result');
    if (!box) return;
    box.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Memindai data transaksi…</div>';

    const cabang = document.getElementById('btd_cabang')?.value || '';
    try {
        const res = await apiGet('/transaksi/barang-tidak-terdeteksi' + buildQuery({ cabang }));
        window._btdData = { items: res.items || [], itemsBeliSaja: res.items_beli_saja || [] };
        renderHasilBarangTidakDikenal(box, res);
    } catch (err) {
        box.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
    }
};

function btdRowHTML(it, idx, sumber) {
    const perluBeli = sumber === 'jual' && !it.ada_riwayat_beli;
    return `
    <tr data-idx="${idx}" data-sumber="${sumber}">
        <td><input type="checkbox" class="btd-chk" checked></td>
        <td style="font-size:11px;font-family:var(--F-m);">${esc(it.kode_barang)}</td>
        <td><input class="finput btd-nama" style="min-width:170px;" value="${esc(it.nama_usulan)}"></td>
        <td class="r" style="font-size:11px;">${it.qty_terjual || 0}</td>
        <td class="r" style="font-size:11px;">${R(it.omzet || 0)}</td>
        <td><input class="finput btd-hargajual" style="width:110px;text-align:right;" value="${fmtRibuan(it.harga_jual_usulan)}" oninput="onMoneyInput(this)"></td>
        <td>
            <input class="finput btd-modal" style="width:110px;text-align:right;${perluBeli ? 'border-color:var(--ylw);' : ''}" value="${fmtRibuan(it.modal_usulan)}" oninput="onMoneyInput(this)">
            ${perluBeli ? '<div style="font-size:10px;color:var(--ylw);margin-top:2px;">⚠️ Tidak ada riwayat beli, cek manual</div>' : ''}
        </td>
        <td>
            <select class="fselect btd-ppn" style="width:100px;">
                <option value="Non-PPN">Non-PPN</option>
                <option value="Kena PPN">Kena PPN</option>
            </select>
        </td>
    </tr>`;
}

function renderHasilBarangTidakDikenal(box, res) {
    const items = res.items || [];
    const itemsBeli = res.items_beli_saja || [];

    if (!items.length && !itemsBeli.length) {
        box.innerHTML = `<div class="note note-b"><span>✅ Tidak ditemukan barang tidak terdeteksi. Semua kode barang di Riwayat Penjualan &amp; Pembelian sudah terdaftar di Master Barang, jadi Laba Rugi sudah sinkron dengan data transaksi.</span></div>`;
        return;
    }

    box.innerHTML = `
    ${items.length ? `
    <div class="note note-y" style="margin-bottom:8px;"><span>⚠️ Ditemukan <strong>${items.length}</strong> kode barang dengan total omzet <strong>${R(res.total_omzet_belum_tercatat || 0)}</strong> yang belum masuk Laba Rugi.</span></div>
    <div class="box" style="padding:14px;margin-bottom:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <label style="font-size:12px;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="btd_checkall_jual" checked onclick="btdToggleAll('jual', this.checked)"> Pilih semua (Penjualan)</label>
            <button class="btn btn-p btn-sm" onclick="btdSimpanTerpilih('jual')">✅ Masukkan ke Master Barang (Terpilih)</button>
        </div>
        <div class="tscroll" style="max-height:460px;overflow-y:auto;">
        <table id="btd_tbl_jual"><thead><tr>
            <th></th><th>Kode</th><th>Nama (usulan)</th><th class="r">Qty Terjual</th><th class="r">Omzet</th><th>Harga Jual</th><th>Harga Modal</th><th>PPN</th>
        </tr></thead>
        <tbody>${items.map((it, i) => btdRowHTML(it, i, 'jual')).join('')}</tbody></table>
        </div>
    </div>` : ''}
    ${itemsBeli.length ? `
    <div class="note note-y" style="margin-bottom:8px;"><span>⚠️ Ditemukan <strong>${itemsBeli.length}</strong> kode barang lain yang hanya muncul di Pembelian (belum pernah terjual) dan juga belum terdaftar di Master Barang.</span></div>
    <div class="box" style="padding:14px;">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <label style="font-size:12px;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="btd_checkall_beli" checked onclick="btdToggleAll('beli', this.checked)"> Pilih semua (Pembelian)</label>
            <button class="btn btn-p btn-sm" onclick="btdSimpanTerpilih('beli')">✅ Masukkan ke Master Barang (Terpilih)</button>
        </div>
        <div class="tscroll" style="max-height:300px;overflow-y:auto;">
        <table id="btd_tbl_beli"><thead><tr>
            <th></th><th>Kode</th><th>Nama (usulan)</th><th class="r">Qty Terjual</th><th class="r">Omzet</th><th>Harga Jual</th><th>Harga Modal</th><th>PPN</th>
        </tr></thead>
        <tbody>${itemsBeli.map((it, i) => btdRowHTML(it, i, 'beli')).join('')}</tbody></table>
        </div>
    </div>` : ''}
    `;
}

window.cocokkanBarangTidakDikenal = async function () {
    const ok = await confirmDialog('Cocokkan otomatis kode transaksi yang tidak terdeteksi ke Master Barang? Hanya kode yang cocok ke tepat 1 barang yang dialihkan; stok dan jurnal tidak diubah.', { okText: 'Cocokkan', danger: false });
    if (!ok) return;
    try {
        const res = await apiPost('/transaksi/barang-tidak-terdeteksi/cocokkan', {});
        toast(res.message || 'Selesai.', 'ok');
        if (res.kode_dialihkan?.length) console.info('Kode dialihkan:', res.kode_dialihkan);
        if (res.ambigu?.length) {
            toast(`${res.ambigu.length} kode ambigu (cocok ke lebih dari 1 barang) dilewati — lihat console.`, 'y');
            console.warn('Kode ambigu:', res.ambigu);
        }
        await jalankanDeteksiBarangTidakDikenal();
    } catch (err) {
        toast(err.message, 'err');
    }
};

window.btdToggleAll = function (sumber, checked) {
    document.querySelectorAll(`#btd_tbl_${sumber} .btd-chk`).forEach(c => c.checked = checked);
};

window.btdSimpanTerpilih = async function (sumber) {
    const list = sumber === 'jual' ? window._btdData.items : window._btdData.itemsBeliSaja;
    const rows = document.querySelectorAll(`#btd_tbl_${sumber} tbody tr`);
    const items = [];
    rows.forEach(row => {
        const chk = row.querySelector('.btd-chk');
        if (!chk?.checked) return;
        const idx = parseInt(row.dataset.idx, 10);
        const src = list[idx];
        if (!src) return;
        items.push({
            kode_barang: src.kode_barang,
            nama:        row.querySelector('.btd-nama').value.trim() || src.kode_barang,
            ppn:         row.querySelector('.btd-ppn').value,
            satuan1:     'PCS',
            harga_jual:  parseRibuan(row.querySelector('.btd-hargajual').value),
            modal:       parseRibuan(row.querySelector('.btd-modal').value),
        });
    });

    if (!items.length) { toast('Tidak ada baris yang dicentang.', 'err'); return; }
    const ok = await confirmDialog(`Masukkan ${items.length} barang terpilih ke Master Barang? Setelah ini, transaksi lama dengan kode tsb otomatis ikut dihitung lagi di Jurnal & Laba Rugi.`, { okText: 'Masukkan', danger: false });
    if (!ok) return;

    try {
        const res = await apiPost('/transaksi/barang-tidak-terdeteksi/masukkan', { items });
        toast(res.message || 'Selesai.', 'ok');
        if (res.gagal?.length) {
            toast(`${res.gagal.length} baris dilewati — lihat console untuk detail.`, 'err');
            console.warn('Barang dilewati:', res.gagal);
        }
        await jalankanDeteksiBarangTidakDikenal(); // refresh — barang yang berhasil akan hilang dari daftar
    } catch (err) {
        toast(err.message, 'err');
    }
};

// Parser file — mirip previewImportPenjualan/previewImportPembelian di
// transaksi.js, TAPI baris dengan qty kosong/tidak valid TETAP disertakan
// (qty diisi null) supaya kelihatan sebagai baris "Tidak Masuk" di hasil
// compare, bukan langsung dibuang diam-diam seperti di form Import biasa —
// soalnya baris itu justru salah satu penyebab paling umum data "hilang"
// yang tidak disadari.
async function parseFileUntukSinkronisasi(file, isJ) {
    if (typeof XLSX === 'undefined') throw new Error('Library XLSX belum dimuat.');
    const buf = await file.arrayBuffer();
    const wb  = XLSX.read(buf, { type: 'array' });
    const sheetName = wb.SheetNames.find(n => isJ ? /detail/i.test(n) : /pembelian|beli/i.test(n)) || wb.SheetNames[0];
    const ws  = wb.Sheets[sheetName];
    const aoa = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true });

    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
    let headerIdx = -1, col = {};
    for (let r = 0; r < aoa.length; r++) {
        const cells = (aoa[r] || []).map(norm);
        const iKode = cells.findIndex(c => c === 'kodebarang' || c === 'kode');
        const iQty  = cells.findIndex(c => c === 'qty' || c === 'jumlah');
        if (iKode >= 0 && iQty >= 0) {
            headerIdx = r;
            col = {
                kode  : iKode,
                nama  : cells.findIndex(c => c === 'namabarang' || c === 'nama'),
                qty   : iQty,
                harga : cells.findIndex(c => c === 'hargabeli' || c === 'hargasatuan' || c === 'harga'),
                satuan: cells.findIndex(c => c === 'satuan'),
                noNota: cells.findIndex(c => c.includes('referensi') || c === 'nonota' || c === 'noref'),
                tgl   : cells.findIndex(c => c === 'tanggal'),
            };
            break;
        }
    }
    if (headerIdx === -1) throw new Error('Format tidak dikenali: kolom "Kode Barang" & "QTY" tidak ditemukan.');

    const items = [];
    for (let r = headerIdx + 1; r < aoa.length; r++) {
        const row = aoa[r] || [];
        const kode = String(row[col.kode] ?? '').trim();
        const qtyRaw = row[col.qty];
        const qty = parseFloat(qtyRaw);
        // Lewati baris yang benar-benar kosong semua (biasanya baris
        // pemisah/kosong di file) — bukan baris qty tidak valid, itu
        // sengaja TETAP disertakan (lihat komentar fungsi ini di atas).
        if (!kode && (qtyRaw === '' || qtyRaw == null)) continue;
        items.push({
            kode_barang: kode,
            nama  : col.nama >= 0 ? String(row[col.nama] ?? '').trim() : '',
            qty   : (!isNaN(qty) && qty > 0) ? qty : null,
            harga : col.harga >= 0 ? (parseFloat(row[col.harga]) || 0) : 0,
            satuan: col.satuan >= 0 ? (String(row[col.satuan] ?? '').trim() || null) : null,
            no_nota: col.noNota >= 0 ? String(row[col.noNota] ?? '').trim() : '',
            tglRow: col.tgl >= 0 ? excelTglKeISO(row[col.tgl]) : '',
        });
    }
    return items;
}
