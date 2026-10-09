/* ============================================================
   import-master.js — Import Excel/CSV untuk Data Master
   Supplier · Pelanggan · Jasa · COA

   Cara kerja (sama untuk keempatnya):
   1. Baca file (.xlsx/.xls/.csv) dengan SheetJS — isi file yang ternyata
      .xlsx tapi berekstensi .xls (mis. hasil ekspor kasir) tetap terbaca.
   2. CARI baris header yang sebenarnya (file laporan sering punya judul di
      atas), lalu petakan kolom lewat nama header (huruf kecil, tanpa spasi/
      underscore) — urutan kolom bebas.
   3. Tampilkan preview, lalu kirim ke API per 500 baris.
   Baris yang sudah ada di-update; nilai kosong di file TIDAK menghapus data lama.

   Khusus Supplier: kalau file yang dipilih adalah file Barang (ada kolom
   KODE_BARANG + SUPPLIER), nama supplier unik diambil dari kolom SUPPLIER.
   ============================================================ */

(function () {
    const CHUNK = 500;
    const norm = s => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

    /* ── Konfigurasi per jenis master ─────────────────────── */
    const CONFIGS = {
        supplier: {
            title: 'Supplier', icon: '🚚', endpoint: '/supplier/import',
            // Urutan alias = prioritas. 'supplier' sengaja di atas 'nama' supaya pada
            // file Barang yang dipakai kolom SUPPLIER, bukan NAMA (nama barang).
            fields: [
                { key: 'nama',       label: 'Nama Supplier', required: true, aliases: ['namasupplier', 'supplier', 'namapemasok', 'pemasok', 'nama'] },
                { key: 'kontak',     label: 'Kontak (PIC)',  aliases: ['kontak', 'namakontak', 'pic', 'kontakperson', 'contactperson'] },
                { key: 'telp',       label: 'Telepon', phone: true, aliases: ['telp', 'telepon', 'notelp', 'notelepon', 'nohp', 'hp', 'phone', 'telpon'] },
                { key: 'alamat',     label: 'Alamat',        aliases: ['alamat', 'address'] },
                { key: 'keterangan', label: 'Keterangan',    aliases: ['keterangan', 'catatan', 'ket', 'note'] },
            ],
            dedupe: 'nama',
            hint: 'Kolom: <strong>NAMA_SUPPLIER</strong> (wajib), KONTAK, TELP, ALAMAT, KETERANGAN. Supplier yang namanya sudah ada hanya dilengkapi datanya (nama tidak diubah, jadi riwayat Pembelian aman).<br>' +
                  '💡 Bisa juga langsung pilih <strong>file Barang</strong> (mis. <em>barangpusat.xls</em>) — semua nama unik di kolom SUPPLIER otomatis jadi daftar supplier.',
            sample: [{ NAMA_SUPPLIER: 'PT Contoh Abadi', KONTAK: 'Budi', TELP: '081234567890', ALAMAT: 'Jl. Contoh No. 1, Kudus', KETERANGAN: 'Tempo 14 hari' }],
            sheet: 'Template Supplier', file: 'template-import-supplier.xlsx',
            preview: ['nama', 'kontak', 'telp', 'alamat'],
            refresh: async () => { await renderSupplier(); },
        },
        pelanggan: {
            title: 'Pelanggan', icon: '🧑‍🤝‍🧑', endpoint: '/master/pelanggan/import',
            fields: [
                { key: 'kode',   label: 'Kode',    aliases: ['kodepelanggan', 'kodemember', 'idpelanggan', 'kode', 'idmember'] },
                { key: 'nama',   label: 'Nama', required: true, aliases: ['namapelanggan', 'namamember', 'nama', 'pelanggan', 'member'] },
                { key: 'telp',   label: 'Telepon', phone: true, aliases: ['telp', 'telepon', 'notelp', 'notelepon', 'nohp', 'hp', 'phone', 'telpon'] },
                { key: 'alamat', label: 'Alamat',  aliases: ['alamat', 'address'] },
                { key: 'poin',   label: 'Poin', num: true, aliases: ['poin', 'point', 'poinmember', 'poinawal', 'pointmember'] },
            ],
            dedupe: 'kode|nama',
            hint: 'Kolom: <strong>KODE</strong>, <strong>NAMA</strong> (wajib), TELP, ALAMAT, POIN. Kolom KODE boleh kosong — nanti dibuatkan otomatis (PLG-00001 dst), dan kalau nama sudah ada datanya diperbarui, bukan digandakan. Kode yang sudah ada = data di-update.',
            sample: [{ KODE: 'PLG001', NAMA: 'Ibu Contoh', TELP: '081234567890', ALAMAT: 'Kudus', POIN: 0 }],
            sheet: 'Template Pelanggan', file: 'template-import-pelanggan.xlsx',
            preview: ['kode', 'nama', 'telp', 'alamat', 'poin'],
            refresh: async () => { await renderPelanggan(); try { await loadMasterData(); } catch (e) { /* abaikan */ } },
        },
        jasa: {
            title: 'Jasa / Layanan', icon: '🛠️', endpoint: '/master/jasa/import',
            fields: [
                { key: 'kode',  label: 'Kode', required: true, aliases: ['kodejasa', 'kode'] },
                { key: 'nama',  label: 'Nama', required: true, aliases: ['namajasa', 'nama', 'jasa', 'layanan'] },
                { key: 'ppn',   label: 'PPN',  aliases: ['ppn', 'statusppn', 'kenappn'] },
                { key: 'harga', label: 'Harga', num: true, aliases: ['harga', 'hargajasa', 'tarif'] },
            ],
            dedupe: 'kode',
            hint: 'Kolom: <strong>KODE</strong>, <strong>NAMA</strong> (wajib), PPN (<em>Kena PPN</em> / <em>Non-PPN</em>, kosong = Non-PPN), HARGA. Kode yang sudah ada = di-update.',
            sample: [{ KODE: 'JS001', NAMA: 'Jasa Antar', PPN: 'Non-PPN', HARGA: 10000 }],
            sheet: 'Template Jasa', file: 'template-import-jasa.xlsx',
            preview: ['kode', 'nama', 'ppn', 'harga'],
            refresh: async () => { await loadMasterData(); await renderJasaMaster(); },
        },
        coa: {
            title: 'Akun (COA)', icon: '📒', endpoint: '/master/coa/import',
            fields: [
                { key: 'kode',   label: 'Kode', required: true, aliases: ['kodeakun', 'kodecoa', 'noakun', 'kode'] },
                { key: 'nama',   label: 'Nama Akun', required: true, aliases: ['namaakun', 'nama'] },
                { key: 'kat',    label: 'Kategori', aliases: ['kategori', 'kat', 'tipe', 'jenis', 'kelompok'] },
                { key: 'is_kas', label: 'Kas/Bank', aliases: ['iskas', 'kas', 'kasbank'] },
            ],
            dedupe: 'kode',
            hint: 'Kolom: <strong>KODE</strong>, <strong>NAMA</strong> (wajib), KATEGORI (Aset / Liabilitas / Modal / Pendapatan / Beban — kosong = ditebak dari angka pertama kode), KAS (isi <em>Ya</em> untuk akun Aset yang jadi pilihan Kode Kas). <strong>Akun standar tidak diubah.</strong>',
            sample: [{ KODE: '6106', NAMA: 'Beban Contoh', KATEGORI: 'Beban', KAS: '' }],
            sheet: 'Template COA', file: 'template-import-coa.xlsx',
            preview: ['kode', 'nama', 'kat', 'is_kas'],
            refresh: async () => { await loadMasterData(); await renderCOA(); },
        },
    };

    let _cur = null;      // jenis yang sedang dibuka
    let _rows = [];       // baris valid hasil parse

    /* ── Nilai sel → string / angka ───────────────────────── */
    function cellStr(v, f) {
        if (v === null || v === undefined) return '';
        if (typeof v === 'number') {
            let s = Number.isInteger(v) ? String(v) : String(v);
            // Nomor HP tersimpan sebagai angka di Excel → angka 0 di depan hilang (812… bukan 0812…)
            if (f && f.phone && /^8\d{8,11}$/.test(s)) s = '0' + s;
            return s;
        }
        return String(v).replace(/\s+/g, ' ').trim();
    }
    function cellNum(v) {
        if (typeof v === 'number') return v;
        let s = String(v ?? '').trim().replace(/[^\d.,-]/g, '');
        if (!s) return null;
        const dot = s.lastIndexOf('.'), com = s.lastIndexOf(',');
        if (dot > -1 && com > -1) {
            // dua-duanya ada: yang paling belakang = desimal
            s = dot > com ? s.replace(/,/g, '') : s.replace(/\./g, '').replace(',', '.');
        } else if (com > -1) {
            s = /^-?\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');   // 1,500,000 vs 12,5
        } else if (dot > -1 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) {
            s = s.replace(/\./g, '');   // 1.500.000
        }
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
    }

    /* ── Parse sheet → item[] ─────────────────────────────── */
    function parseAoa(aoa, cfg) {
        const need = cfg.fields.filter(f => f.required).map(f => f.key);
        let best = null;

        for (let r = 0; r < Math.min(aoa.length, 25); r++) {
            const heads = (aoa[r] || []).map(norm);
            if (!heads.some(Boolean)) continue;
            const used = new Set(), map = {};
            for (const f of cfg.fields) {
                for (const a of f.aliases) {
                    const idx = heads.findIndex((h, i) => h === a && !used.has(i));
                    if (idx > -1) { map[f.key] = idx; used.add(idx); break; }
                }
            }
            const hasNeed = need.every(k => map[k] !== undefined);
            const score = Object.keys(map).length;
            if (hasNeed && (!best || score > best.score)) best = { row: r, map, score, heads };
        }
        if (!best) return null;

        const items = [];
        for (let r = best.row + 1; r < aoa.length; r++) {
            const row = aoa[r] || [];
            const it = {};
            for (const f of cfg.fields) {
                const c = best.map[f.key];
                if (c === undefined) continue;
                it[f.key] = f.num ? cellNum(row[c]) : cellStr(row[c], f);
                if (it[f.key] === null) it[f.key] = '';
            }
            if (cfg.fields.some(f => f.required && !it[f.key])) {
                if (Object.values(it).some(v => v !== '')) it._invalid = true; else continue; // baris kosong total: abaikan
            }
            items.push(it);
        }
        return { items, map: best.map, heads: best.heads };
    }

    async function readFile(file, cfg) {
        const isCsv = /\.csv$/i.test(file.name);
        const wb = await new Promise((res, rej) => {
            const fr = new FileReader();
            fr.onerror = () => rej(new Error('Gagal membaca file'));
            fr.onload = e => { try { res(XLSX.read(e.target.result, { type: isCsv ? 'string' : 'array' })); } catch (err) { rej(err); } };
            isCsv ? fr.readAsText(file) : fr.readAsArrayBuffer(file);
        });

        for (const name of wb.SheetNames) {
            const aoa = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: true });
            const p = parseAoa(aoa, cfg);
            if (p) return p;
        }
        const first = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: true })[0] || [];
        const need = cfg.fields.filter(f => f.required).map(f => f.label).join(' + ');
        throw new Error(`Kolom wajib (${need}) tidak ditemukan. Kolom yang terbaca: ${first.filter(Boolean).slice(0, 12).join(', ') || '(kosong)'}. Pakai tombol "Download Template".`);
    }

    /* ── Gabung duplikat dalam 1 file ─────────────────────── */
    function dedupe(items, cfg) {
        const keys = cfg.dedupe.split('|');
        const seen = new Map();
        let dup = 0;
        const out = [];
        for (const it of items) {
            if (it._invalid) continue;
            const k = keys.map(kk => String(it[kk] || '').toLowerCase().trim()).find(Boolean) || '';
            const ident = k ? `${keys.find(kk => it[kk])}:${k}` : null;
            if (ident && seen.has(ident)) {
                dup++;
                const prev = seen.get(ident);
                Object.keys(it).forEach(f => { if ((prev[f] === '' || prev[f] == null) && it[f] !== '' && it[f] != null) prev[f] = it[f]; });
                continue;
            }
            if (ident) seen.set(ident, it);
            out.push(it);
        }
        return { rows: out, dup };
    }

    /* ── UI ───────────────────────────────────────────────── */
    window.bukaImportMaster = function (jenis) {
        const cfg = CONFIGS[jenis];
        if (!cfg) return;
        _cur = jenis; _rows = [];
        openM(`
        <div class="mhd"><h3>${cfg.icon} Import ${esc(cfg.title)} dari Excel</h3><button class="mclose" onclick="closeM()">×</button></div>
        <div class="mbd">
            <div class="note note-b" style="margin-bottom:12px;"><span class="note-ico">ℹ️</span>
                <span>Mendukung .xlsx / .xls / .csv. ${cfg.hint}<br>Data lama yang sudah ada di-update; sel kosong di file <strong>tidak</strong> menghapus data.</span>
            </div>
            <button class="btn btn-g btn-sm" style="margin-bottom:10px;" onclick="downloadTemplateImportMaster('${jenis}')">📄 Download Template Excel</button>
            <div class="fgroup">
                <label class="flabel">Pilih File</label>
                <input type="file" id="impMasterFile" accept=".xlsx,.xls,.csv" class="finput" style="padding:6px;">
            </div>
            <div id="impMasterPrev" style="margin-top:12px;"></div>
        </div>
        <div class="mft">
            <button class="btn btn-g" onclick="closeM()">Batal</button>
            <button class="btn btn-p" id="impMasterGo" onclick="doImportMaster()" disabled>Import Sekarang</button>
        </div>`);
        document.getElementById('impMasterFile').addEventListener('change', previewImportMaster);
    };

    window.downloadTemplateImportMaster = function (jenis) {
        const cfg = CONFIGS[jenis];
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(cfg.sample);
        ws['!cols'] = Object.keys(cfg.sample[0]).map(h => ({ wch: Math.max(h.length, 18) }));
        XLSX.utils.book_append_sheet(wb, ws, cfg.sheet);
        XLSX.writeFile(wb, cfg.file);
        toast('Template diunduh — hapus baris contoh, isi datamu, lalu import.');
    };

    window.previewImportMaster = async function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const cfg = CONFIGS[_cur];
        const prev = document.getElementById('impMasterPrev');
        const btn = document.getElementById('impMasterGo');
        btn.disabled = true;
        prev.innerHTML = '<div style="color:var(--ink3);font-size:13px;">Membaca file…</div>';
        try {
            if (typeof XLSX === 'undefined') throw new Error('Library XLSX belum dimuat (cek koneksi internet), atau simpan file sebagai .csv.');
            const parsed = await readFile(file, cfg);
            const invalid = parsed.items.filter(i => i._invalid).length;
            const { rows, dup } = dedupe(parsed.items, cfg);
            _rows = rows;

            const dariBarang = _cur === 'supplier' && parsed.heads.includes('kodebarang');
            // Nama supplier yang bentuknya seperti kode (mis. P2301001) — biasanya kode pemasok, bukan nama
            const mirip = _cur === 'supplier' ? rows.filter(r => /^[A-Za-z]\d{5,}$/.test(r.nama || '')).length : 0;

            const cols = cfg.preview.filter(k => parsed.map[k] !== undefined);
            const lbl = k => cfg.fields.find(f => f.key === k).label;
            prev.innerHTML = `
            <div class="note note-b"><span>✅ <strong>${rows.length}</strong> ${dariBarang ? 'supplier unik' : 'baris'} siap diimport${dup ? (dariBarang ? ` (dari ${rows.length + dup} baris barang)` : `, ${dup} duplikat dalam file digabung`) : ''}${invalid ? `, ${invalid} baris dilewati (data wajib kosong)` : ''}.</span></div>
            ${dariBarang ? `<div class="note note-b" style="margin-top:6px;"><span>📦 Terdeteksi <strong>file Barang</strong> — daftar diambil dari nama unik di kolom SUPPLIER.</span></div>` : ''}
            ${mirip ? `<div class="note note-y" style="margin-top:6px;"><span>⚠️ ${mirip} nama terlihat seperti kode (mis. P2301001). Tetap ikut diimport; rapikan namanya nanti di Data Master › Supplier.</span></div>` : ''}
            <div class="tscroll" style="max-height:240px;overflow-y:auto;margin-top:8px;">
            <table><thead><tr>${cols.map(k => `<th>${esc(lbl(k))}</th>`).join('')}</tr></thead>
            <tbody>${rows.slice(0, 20).map(r => `<tr>${cols.map(k => `<td style="font-size:12px;">${esc(String(r[k] ?? ''))}</td>`).join('')}</tr>`).join('')}
            ${rows.length > 20 ? `<tr><td colspan="${cols.length}" style="text-align:center;color:var(--ink3);font-size:12px;">… dan ${rows.length - 20} baris lainnya</td></tr>` : ''}
            </tbody></table></div>`;
            btn.disabled = rows.length === 0;
        } catch (err) {
            _rows = [];
            prev.innerHTML = `<div class="note note-y"><span>⚠️ ${esc(err.message)}</span></div>`;
        }
    };

    window.doImportMaster = async function () {
        const cfg = CONFIGS[_cur];
        if (!cfg || !_rows.length) return;
        const btn = document.getElementById('impMasterGo');
        const prev = document.getElementById('impMasterPrev');
        btn.disabled = true;

        const tot = { added: 0, updated: 0, skipped: 0 };
        const errors = [];
        try {
            for (let i = 0; i < _rows.length; i += CHUNK) {
                btn.textContent = `Mengimport… ${Math.min(i + CHUNK, _rows.length)}/${_rows.length}`;
                const chunk = _rows.slice(i, i + CHUNK).map(r => { const c = { ...r }; delete c._invalid; return c; });
                const res = await apiPost(cfg.endpoint, { items: chunk });
                tot.added += res.added || 0;
                tot.updated += res.updated || 0;
                tot.skipped += res.skipped || 0;
                (res.errors || []).forEach(m => errors.push(m));
            }
            toast(`Import ${cfg.title} selesai: ${tot.added} baru, ${tot.updated} diperbarui` + (tot.skipped ? `, ${tot.skipped} dilewati` : ''));
            prev.innerHTML = `
            <div class="note note-b"><span>✅ Selesai — <strong>${tot.added}</strong> ditambah, <strong>${tot.updated}</strong> diperbarui${tot.skipped ? `, <strong>${tot.skipped}</strong> dilewati` : ''}.</span></div>
            ${errors.length ? `<div class="note note-y" style="margin-top:6px;"><span>${errors.slice(0, 10).map(esc).join('<br>')}${errors.length > 10 ? '<br>…' : ''}</span></div>` : ''}`;
            btn.textContent = 'Selesai';
            try { await cfg.refresh(); } catch (e) { console.warn('Refresh setelah import gagal:', e); }
        } catch (err) {
            toast('Gagal import: ' + err.message, 'err');
            btn.textContent = 'Import Sekarang';
            btn.disabled = false;
        }
    };
})();
