/* =====================================================================
   TOKO SUMINI — app.js
   Semua interaksi frontend, koneksi ke Laravel API
   ===================================================================== */

const API = window.APP_CONFIG?.apiBase || 'http://localhost:8000/api';
const CSRF = window.APP_CONFIG?.csrfToken || '';

/* ── HELPERS ──────────────────────────────────────────────────────────── */
const R = n => 'Rp ' + Math.round(Number(n) || 0).toLocaleString('id-ID');
const d = (dt, s) => dt ? String(dt).split('T')[0].split('-').reverse().join('/') : (s || '-');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today = () => new Date().toISOString().slice(0, 10);
const monthOf = t => t ? String(t).slice(0, 7) : '';
const monthLabel = m => { if (!m) return ''; const [y, mo] = m.split('-'); const nm = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des']; return (nm[parseInt(mo)-1] || mo) + ' ' + y; };

/* ── STATE ─────────────────────────────────────────────────────────────── */
let STATE = {
  cabang: [], coa: [], barang: [], jasa: [],
  tarif: 11,
  _cache: {}
};

/* ── API FETCH WRAPPER ────────────────────────────────────────────────── */
async function apiFetch(endpoint, options = {}) {
  const url = API + endpoint;
  const opts = {
    headers: { 'Content-Type': 'application/json', 'X-CSRF-TOKEN': CSRF, 'Accept': 'application/json' },
    ...options,
  };
  if (options.body && typeof options.body === 'object') {
    opts.body = JSON.stringify(options.body);
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiGet(endpoint) { return apiFetch(endpoint, { method: 'GET' }); }
async function apiPost(endpoint, body) { return apiFetch(endpoint, { method: 'POST', body }); }
async function apiPut(endpoint, body) { return apiFetch(endpoint, { method: 'PUT', body }); }
async function apiDel(endpoint) { return apiFetch(endpoint, { method: 'DELETE' }); }

/* ── TOAST ─────────────────────────────────────────────────────────────── */
function toast(msg, type = 'ok') {
  const el = document.createElement('div');
  el.className = 'toast ' + (type === 'err' ? 'err' : type === 'y' ? '' : 'ok');
  el.innerHTML = (type === 'ok' ? '✓ ' : type === 'err' ? '✕ ' : '⚠ ') + esc(msg);
  document.getElementById('toastArea').appendChild(el);
  setTimeout(() => el.style.opacity = '0', 2800);
  setTimeout(() => el.remove(), 3200);
}

/* ── MODAL ─────────────────────────────────────────────────────────────── */
function openM(html) { document.getElementById('mbox').innerHTML = html; document.getElementById('moverlay').classList.add('on'); }
function closeM() { document.getElementById('moverlay').classList.remove('on'); }
document.getElementById('moverlay').addEventListener('click', e => { if (e.target.id === 'moverlay') closeM(); });

/* ── CONNECTION STATUS ────────────────────────────────────────────────── */
function setConnStatus(ok, txt) {
  const dot = document.getElementById('connStatus').querySelector('.conn-dot');
  const label = document.getElementById('connStatus').querySelector('.conn-txt');
  dot.className = 'conn-dot ' + (ok ? 'ok' : 'err');
  label.textContent = txt;
}

/* ── LOADING HTML ─────────────────────────────────────────────────────── */
const loadingHTML = `<div class="loading-state"><div class="loading-spinner"></div><p>Memuat data…</p></div>`;

/* ── SMART SEARCH — pencarian mulus & bebas bug utk SEMUA halaman list ───
   Masalah klasik pencarian di halaman yang render-nya innerHTML full-reload
   (Data Barang, Data Transaksi, Jurnal, dst): setiap kali hasil di-render
   ulang, elemen <input> pencarian yang lama DIHANCURKAN dan diganti yang
   baru → fokus & posisi kursor hilang, user harus klik lagi ke kotak cari
   tiap kali mau lanjut ngetik. Ini pusat solusinya, dipakai oleh SEMUA
   modul (barang, transaksi, jurnal, kontak, stok, mutasi, karyawan, dst):

     window.smartSearch('barangSearch', this.value, val => {
         window._barangSearch = val;
         window._barangPage = 1;
     }, () => renderBarang(1));

   - Di-debounce per KEY (bukan 1 timer global) supaya pencarian di 1 tab
     tidak saling mengganggu timer tab lain kalau kebetulan render bersamaan.
   - Fokus & posisi kursor di kotak cari OTOMATIS dikembalikan sesudah hasil
     selesai di-render ulang, walau elemen <input>-nya adalah elemen DOM
     yang benar-benar baru (dicari lagi lewat `inputId`).
   - Debounce trailing-only: kalau user masih mengetik, render lama yang
     "telat" tidak akan menimpa hasil dari ketikan yang lebih baru (dijaga
     lewat token urutan permintaan per key). */
const _smartSearchTimers = {};
const _smartSearchToken = {};
window.smartSearch = function (key, value, setter, renderFn, delay = 350) {
  clearTimeout(_smartSearchTimers[key]);
  const myToken = (_smartSearchToken[key] = (_smartSearchToken[key] || 0) + 1);
  _smartSearchTimers[key] = setTimeout(async () => {
    const inputEl = document.getElementById(key);
    const hadFocus = !!inputEl && document.activeElement === inputEl;
    const selStart = inputEl ? inputEl.selectionStart : null;
    const selEnd = inputEl ? inputEl.selectionEnd : null;

    setter(value);
    await renderFn();

    // Kalau selama render ini ada ketikan BARU yang sudah menjadwalkan
    // debounce berikutnya, jangan rebut fokus balik lagi di sini — biarkan
    // permintaan terbaru yang menentukan fokus akhir (mencegah kursor
    // "melompat" kalau user mengetik cepat).
    if (myToken !== _smartSearchToken[key]) return;

    if (hadFocus) {
      const newEl = document.getElementById(key);
      if (newEl) {
        newEl.focus();
        if (typeof selStart === 'number' && newEl.setSelectionRange) {
          try { newEl.setSelectionRange(selStart, selEnd); } catch (e) { /* input type tak dukung, abaikan */ }
        }
      }
    }
  }, delay);
};

/** Filter array sederhana di sisi klien (utk halaman yang datanya sudah
 *  lengkap di memori, mis. Jurnal Umum) — pencarian case/aksen-insensitive
 *  di beberapa kolom sekaligus. */
window.clientSearch = function (list, term, fields) {
  const q = String(term || '').trim().toLowerCase();
  if (!q) return list;
  const norm = s => String(s == null ? '' : s).toLowerCase();
  return list.filter(row => fields.some(f => norm(row[f]).includes(q)));
};

/* ── NAVIGATION ───────────────────────────────────────────────────────── */
const TAB_META = {
  dashboard: { title: 'Dashboard', desc: 'Ringkasan kondisi keuangan toko' },
  analisis:  { title: 'Analisis Data', desc: 'Barang terlaris, tren, perbandingan cabang' },
  master:    { title: 'Data Master', desc: 'Kelola cabang, akun, dan daftar barang' },
  transaksi: { title: 'Transaksi', desc: 'Input penjualan, pembelian, kasbon, dan pengeluaran' },
  jurnal:    { title: 'Jurnal & Buku Besar', desc: 'Jurnal dibuat otomatis dari semua transaksi' },
  laporan:   { title: 'Laporan Keuangan', desc: 'Neraca saldo, laba rugi, neraca, dan rekap PPN' },
};

let activeTab = '';

function setTab(tab) {
  activeTab = tab;
  document.querySelectorAll('.nb').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.classList.toggle('on', p.id === 'tab-' + tab));
  document.getElementById('pgTitle').textContent = TAB_META[tab]?.title || tab;
  document.getElementById('pgDesc').textContent = TAB_META[tab]?.desc || '';
  document.getElementById('sb').classList.remove('open');
  renderTab(tab);
}

document.querySelector('.sb-nav').addEventListener('click', e => {
  const b = e.target.closest('.nb'); if (!b) return; setTab(b.dataset.tab);
});
document.getElementById('ham').addEventListener('click', () => document.getElementById('sb').classList.toggle('open'));
document.getElementById('gCabang').addEventListener('change', () => renderTab(activeTab));

function wireSnav(navId, prefix) {
  document.getElementById(navId).addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b || !b.dataset.s) return;
    document.querySelectorAll('#' + navId + ' button').forEach(x => x.classList.toggle('on', x === b));
    document.querySelectorAll('[id^="' + prefix + '-"]').forEach(el => {
      el.style.display = el.id === prefix + '-' + b.dataset.s ? '' : 'none';
    });
    renderSubTab(prefix, b.dataset.s);
  });
}
wireSnav('snAnalisis', 'an');
wireSnav('snMaster', 'ms');
wireSnav('snTrx', 'tx');
wireSnav('snJurnal', 'jr');
wireSnav('snLap', 'lp');

function getCabang() { return document.getElementById('gCabang').value; }

async function renderTab(tab) {
  const cab = getCabang();
  const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
  switch (tab) {
    case 'dashboard': await renderDashboard(); break;
    case 'analisis':  await renderAnalisisBarangLaku(); break;
    case 'master':    await renderCabang(); break;
    case 'transaksi': await renderJualBeli('jual', 'tx-jual'); break;
    case 'jurnal':    await renderJurnalUmum(); break;
    case 'laporan':   await renderNeracaSaldo(); break;
  }
}

async function renderSubTab(prefix, s) {
  switch (prefix + '-' + s) {
    case 'an-baranglaku':  await renderAnalisisBarangLaku(); break;
    case 'an-cabangcomp':  await renderAnalisisCabang(); break;
    case 'an-tren':        await renderAnalisisTren(); break;
    case 'an-margin':      await renderAnalisisMargin(); break;
    case 'ms-cabang':      await renderCabang(); break;
    case 'ms-coa':         await renderCOA(); break;
    case 'ms-barang':      await renderBarang(); break;
    case 'ms-jasa':        await renderJasaMaster(); break;
    case 'ms-pelanggan':   await renderPelanggan(); break;
    case 'ms-kadaluarsa':  await renderKadaluarsa(); break;
    case 'tx-jual':        await renderJualBeli('jual', 'tx-jual'); break;
    case 'tx-beli':        await renderJualBeli('beli', 'tx-beli'); break;
    case 'tx-jasa':        await renderTrxJasa(); break;
    case 'tx-sewa':        await renderSewa(); break;
    case 'tx-mutasi':      await renderMutasi(); break;
    case 'tx-retur':       await renderRetur(); break;
    case 'tx-kasbon':      await renderKasbon(); break;
    case 'tx-cashbon':     await renderCashbon(); break;
    case 'tx-biaya':       await renderBiaya(); break;
    case 'jr-umum':        await renderJurnalUmum(); break;
    case 'jr-besar':       await renderBukuBesar(); break;
    case 'lp-saldo':       await renderNeracaSaldo(); break;
    case 'lp-labarugi':    await renderLabaRugi(); break;
    case 'lp-neraca':      await renderNeraca(); break;
    case 'lp-ppn':         await renderRekapPPN(); break;
  }
}

/* ── CANVAS CHARTS ────────────────────────────────────────────────────── */
function drawBarCanvas(canvasId, labels, values, color = '#1A5C38') {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 400; canvas.height = canvas.offsetHeight || 180;
  const W = canvas.width, H = canvas.height;
  const pad = { t: 10, r: 10, b: 40, l: 60 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  ctx.clearRect(0, 0, W, H);
  if (!values.length) return;
  const maxV = Math.max(...values, 1);
  const bW = cW / values.length * 0.6, gap = cW / values.length * 0.4;
  ctx.strokeStyle = 'rgba(0,0,0,.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + cH - (cH / 4 * i);
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.font = '10px Plus Jakarta Sans,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(R(maxV / 4 * i).replace('Rp ', ''), pad.l - 4, y + 3);
  }
  values.forEach((v, i) => {
    const x = pad.l + i * (bW + gap) + gap / 2;
    const bH = Math.max(2, v / maxV * cH);
    const y = pad.t + cH - bH;
    const grad = ctx.createLinearGradient(0, y, 0, y + bH);
    grad.addColorStop(0, color); grad.addColorStop(1, color + '88');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(x, y, bW, bH, 4); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.font = '9px Plus Jakarta Sans,sans-serif'; ctx.textAlign = 'center';
    const lbl = labels[i] || '';
    ctx.fillText(lbl.length > 6 ? lbl.slice(0, 5) + '…' : lbl, x + bW / 2, H - pad.b + 14);
  });
}

function drawLineCanvas(canvasId, labels, values, color = '#1A5C38') {
  const canvas = document.getElementById(canvasId); if (!canvas) return;
  const ctx = canvas.getContext('2d');
  canvas.width = canvas.offsetWidth || 400; canvas.height = canvas.offsetHeight || 160;
  const W = canvas.width, H = canvas.height;
  const pad = { t: 10, r: 10, b: 36, l: 60 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  ctx.clearRect(0, 0, W, H);
  if (!values.length || values.every(v => v === 0)) return;
  const maxV = Math.max(...values, 1);
  const step = cW / (values.length - 1 || 1);
  ctx.strokeStyle = 'rgba(0,0,0,.05)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + cH - cH / 4 * i;
    ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.font = '9px Plus Jakarta Sans,sans-serif'; ctx.textAlign = 'right';
    ctx.fillText(R(maxV / 4 * i).replace('Rp ', ''), pad.l - 4, y + 3);
  }
  const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
  grad.addColorStop(0, color + '33'); grad.addColorStop(1, color + '05');
  ctx.beginPath(); ctx.moveTo(pad.l, pad.t + cH);
  values.forEach((v, i) => { const x = pad.l + i * step, y = pad.t + cH - (v / maxV * cH); ctx.lineTo(x, y); });
  ctx.lineTo(pad.l + (values.length - 1) * step, pad.t + cH); ctx.closePath(); ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath(); ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
  values.forEach((v, i) => { const x = pad.l + i * step, y = pad.t + cH - (v / maxV * cH); i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); });
  ctx.stroke();
  values.forEach((v, i) => {
    const x = pad.l + i * step, y = pad.t + cH - (v / maxV * cH);
    ctx.beginPath(); ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.stroke();
  });
  ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.font = '9px Plus Jakarta Sans,sans-serif'; ctx.textAlign = 'center';
  labels.forEach((l, i) => { ctx.fillText(l, pad.l + i * step, H - pad.b + 14); });
}

/* ── EXPORT EXCEL ─────────────────────────────────────────────────────── */
function exportTableExcel(tableId, filename) {
  const tbl = document.getElementById(tableId);
  if (!tbl) { toast('Tabel tidak ditemukan', 'err'); return; }
  try {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.table_to_sheet(tbl);
    XLSX.utils.book_append_sheet(wb, ws, 'Data');
    XLSX.writeFile(wb, filename + '-' + today() + '.xlsx');
    toast('File Excel berhasil diunduh');
  } catch (e) { toast('Gagal export: ' + e.message, 'err'); }
}

function printSection(elId, title) {
  const el = document.getElementById(elId); if (!el) return;
  const css = document.querySelector('link[href*="app.css"]')?.href || '';
  const pw = window.open('', '_blank');
  pw.document.write(`<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"><title>${title} – Toko Sumini</title>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="${css}">
    <style>body{padding:28px;background:#fff;font-size:12px;}.export-bar,.no-print,.btn,.row-del{display:none!important;}@page{margin:18mm 14mm;size:A4;}</style>
    </head><body>
    <h2 style="font-family:serif;margin-bottom:8px;">${title}</h2>
    <p style="color:#666;font-size:11px;margin-bottom:20px;">Toko Sumini · Dicetak: ${new Date().toLocaleString('id-ID')} · Cabang: ${getCabang() || 'Semua Cabang'}</p>
    ${el.innerHTML}
    <script>window.onload=()=>setTimeout(()=>window.print(),400);<\/script>
    </body></html>`);
  pw.document.close();
}

/* ── SHARED HTML BUILDERS ─────────────────────────────────────────────── */
function cabangOpts(selected = '') {
  return `<option value="">– Pilih cabang –</option>` +
    STATE.cabang.map(c => `<option value="${esc(c.nama)}" ${c.nama === selected ? 'selected' : ''}>${esc(c.nama)}</option>`).join('');
}

function barangDatalist(id) {
  return `<datalist id="${id}">${STATE.barang.map(b => `<option value="${esc(b.kode)}">${esc(b.kode)} – ${esc(b.nama)}</option>`).join('')}</datalist>`;
}

function jasaDatalist(id) {
  return `<datalist id="${id}">${STATE.jasa.map(j => `<option value="${esc(j.kode)}">${esc(j.kode)} – ${esc(j.nama)}</option>`).join('')}</datalist>`;
}

function exportBar(tableId, filename, sectionId, title) {
  return `<div class="export-bar no-print">
    <span class="lbl">Export:</span>
    <button class="btn btn-g btn-sm" onclick="exportTableExcel('${tableId}','${filename}')">📊 Excel</button>
    <button class="btn btn-g btn-sm" onclick="printSection('${sectionId}','${title}')">🖨️ Print</button>
  </div>`;
}

function paginationHTML(meta, onPageFn) {
  if (!meta || meta.last_page <= 1) return '';
  let html = `<div class="pagination"><span class="page-info">${meta.from}–${meta.to} dari ${meta.total}</span>`;
  html += `<button ${meta.current_page <= 1 ? 'disabled' : ''} onclick="${onPageFn}(${meta.current_page - 1})">‹</button>`;
  for (let p = Math.max(1, meta.current_page - 2); p <= Math.min(meta.last_page, meta.current_page + 2); p++) {
    html += `<button class="${p === meta.current_page ? 'active' : ''}" onclick="${onPageFn}(${p})">${p}</button>`;
  }
  html += `<button ${meta.current_page >= meta.last_page ? 'disabled' : ''} onclick="${onPageFn}(${meta.current_page + 1})">›</button></div>`;
  return html;
}

/* ── DASHBOARD ────────────────────────────────────────────────────────── */
async function renderDashboard() {
  const el = document.getElementById('dashWrap');
  el.innerHTML = loadingHTML;
  const cab = getCabang();
  const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
  try {
    const data = await apiGet('/dashboard' + q);
    const kpi = data.kpi;
    const selisih = kpi.pct_change;
    const top3 = (data.top_barang || []).slice(0, 3);
    const maxTop = top3[0]?.total_omzet || 1;
    const recent = data.recent || [];
    const months6 = data.chart_6bln || [];
    const cabSales = data.cabang_sales || [];

    el.innerHTML = `
      <div class="dash-hero">
        <div class="dash-hero-top">
          <div>
            <div class="dash-hero-label">Ringkasan Keuangan</div>
            <div class="dash-hero-title">Toko Sumini<br>${esc(cab || 'Semua Cabang')}</div>
            <div class="dash-hero-sub">${monthLabel(today().slice(0,7))} · ${STATE.cabang.length} cabang terdaftar</div>
          </div>
          <div class="dash-hero-right no-print">
            <div style="font-size:12px;color:rgba(255,255,255,.4);" id="todayHero"></div>
            <div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
              <button class="btn btn-sm" onclick="printSection('tab-dashboard','Dashboard')" style="background:rgba(200,151,58,.8);color:var(--tinta);font-size:11.5px;">🖨️ Print</button>
            </div>
          </div>
        </div>
        <div class="dash-kpi-row">
          <div class="dash-kpi"><div class="dash-kpi-label">Kas & Bank</div><div class="dash-kpi-val gold">${R(kpi.kas_bank)}</div><div class="dash-kpi-sub">Kas ${R(kpi.kas)} · Bank ${R(kpi.bank)}</div></div>
          <div class="dash-kpi"><div class="dash-kpi-label">Penjualan Bulan Ini</div><div class="dash-kpi-val">${R(kpi.penjualan_bulan_ini)}</div><div class="dash-kpi-sub" style="color:${selisih>=0?'#4ade80':'#f87171'};">${selisih!==null?(selisih>=0?'▲':'▼')+' '+Math.abs(selisih)+'% vs bulan lalu':'—'}</div></div>
          <div class="dash-kpi"><div class="dash-kpi-label">Laba Bersih Kumulatif</div><div class="dash-kpi-val ${kpi.laba_bersih>=0?'pos':'neg'}">${R(kpi.laba_bersih)}</div><div class="dash-kpi-sub">Laba kotor ${R(kpi.laba_kotor)}</div></div>
          <div class="dash-kpi"><div class="dash-kpi-label">Piutang & Hutang</div><div class="dash-kpi-val">${R(kpi.piutang)}</div><div class="dash-kpi-sub">Hutang supplier ${R(kpi.hutang)}</div></div>
        </div>
      </div>

      <div class="row3">
        <div class="box" style="grid-column:span 2;">
          <div class="box-hd"><h3>Penjualan 6 Bulan Terakhir</h3><div class="meta">Tren bulanan</div></div>
          <div class="box-bd"><div class="chart-wrap" style="height:180px;"><canvas id="c6bln"></canvas></div></div>
        </div>
        <div class="box">
          <div class="box-hd"><h3>Top Barang Bulan Ini 🏆</h3></div>
          <div class="box-bd" style="padding-top:12px;">
            ${top3.length ? top3.map((b, i) => `<div class="rank-item">
              <div class="rank-num ${i===0?'gold':i===1?'silver':'bronze'}">${i+1}</div>
              <div class="rank-info"><div class="rank-name">${esc(b.nama)}</div><div class="rank-sub">${b.total_qty} unit</div></div>
              <div class="rank-bar-wrap"><div class="rank-bar-fill" style="width:${Math.round(b.total_omzet/maxTop*100)}%"></div></div>
              <div class="rank-val">${R(b.total_omzet)}</div>
            </div>`).join('') : '<div class="empty" style="padding:20px;"><div class="ico">🛒</div>Belum ada data.</div>'}
          </div>
        </div>
      </div>

      <div class="row2">
        <div class="box">
          <div class="box-hd"><h3>Penjualan per Cabang</h3><div class="meta">${monthLabel(today().slice(0,7))}</div></div>
          <div class="box-bd"><div class="chart-wrap" style="height:200px;"><canvas id="cCabang"></canvas></div></div>
        </div>
        <div class="box">
          <div class="box-hd"><h3>Komposisi Laba Rugi</h3><div class="meta">Kumulatif</div></div>
          <div class="box-bd">
            ${[['Penjualan (DPP)', kpi.pendapatan, 100], ['HPP', kpi.hpp, kpi.pendapatan>0?Math.round(kpi.hpp/kpi.pendapatan*100):0], ['Biaya Operasional', kpi.beban, kpi.pendapatan>0?Math.round(kpi.beban/kpi.pendapatan*100):0]].map(([l,v,pct]) => `
              <div style="margin-bottom:14px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:5px;"><span style="font-size:12.5px;font-weight:600;color:var(--ink2);">${l}</span><span style="font-family:var(--F-m);font-size:12px;">${R(v)}</span></div>
                <div style="height:8px;background:var(--kertas);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--emas),#e0ad50);border-radius:4px;"></div></div>
                <div style="font-size:11px;color:var(--ink3);margin-top:3px;">${pct}% dari penjualan</div>
              </div>`).join('')}
            <div style="border-top:2px solid var(--brd);padding-top:12px;display:flex;justify-content:space-between;">
              <span style="font-weight:700;">Laba Bersih</span>
              <span class="${kpi.laba_bersih>=0?'laba-pos':'laba-neg'}" style="font-size:16px;">${R(kpi.laba_bersih)}</span>
            </div>
          </div>
        </div>
      </div>

      <div class="box">
        <div class="box-hd"><h3>Aktivitas Terakhir</h3></div>
        <div class="box-bd pad0">
          ${recent.length ? `<div class="tscroll"><table><thead><tr><th>Tanggal</th><th>Jenis</th><th>Cabang</th><th>Keterangan</th><th class="r">Nilai</th></tr></thead><tbody>
            ${recent.map(r => `<tr><td>${d(r.tgl)}</td><td><span class="badge badge-in">${esc(r.jenis)}</span></td><td>${esc(r.cabang)}</td><td>${esc(r.keterangan||'–')}</td><td class="r laba-pos">${R(r.nilai)}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty"><div class="ico">📋</div><strong>Belum ada aktivitas.</strong></div>'}
        </div>
      </div>`;

    document.getElementById('todayHero').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    setTimeout(() => {
      drawLineCanvas('c6bln', months6.map(m => monthLabel(m.bulan)), months6.map(m => m.total), '#1A5C38');
      if (cabSales.length) drawBarCanvas('cCabang', cabSales.map(c => c.cabang), cabSales.map(c => c.total), '#C8973A');
    }, 60);
    setConnStatus(true, 'Terhubung');
  } catch (e) {
    el.innerHTML = `<div class="note note-y"><span class="note-ico">⚠️</span><span>Gagal memuat dashboard: ${esc(e.message)}. Pastikan server Laravel berjalan di ${API}</span></div>`;
    setConnStatus(false, 'Tidak terhubung');
  }
}

/* ── ANALISIS ─────────────────────────────────────────────────────────── */
async function renderAnalisisBarangLaku() {
  const el = document.getElementById('an-baranglaku');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const data = await apiGet('/laporan/neraca-saldo' + q); // reuse jurnal data
    // Get barang stats from penjualan
    const jualRes = await apiGet(`/transaksi/jual?per_page=1000${cab ? '&cabang=' + encodeURIComponent(cab) : ''}`);
    const jualList = jualRes.data || [];
    const brgMap = {};
    jualList.forEach(t => {
      const k = t.kode_barang;
      if (!brgMap[k]) brgMap[k] = { kode: k, nama: t.nama_barang || k, ppn: t.ppn || '', qty: 0, omzet: 0, hpp: 0 };
      brgMap[k].qty += Number(t.qty);
      brgMap[k].omzet += Number(t.qty) * Number(t.harga);
      brgMap[k].hpp += Number(t.qty) * Number(t.modal || 0);
    });
    const stats = Object.values(brgMap).map(s => ({ ...s, margin: s.omzet - s.hpp, marginPct: s.omzet > 0 ? Math.round((s.omzet - s.hpp) / s.omzet * 100) : 0 })).sort((a, b) => b.omzet - a.omzet);
    const totalOmzet = stats.reduce((s, x) => s + x.omzet, 0);
    const totalQty = stats.reduce((s, x) => s + x.qty, 0);

    el.innerHTML = `
      ${exportBar('tblBrgLaku', 'barang-terlaris', 'an-baranglaku', 'Analisis Barang Terlaris')}
      ${stats.length ? `
      <div class="insight-grid">
        <div class="insight-card"><div class="insight-icon">🏆</div><div class="insight-label">Barang Terlaris</div><div class="insight-val">${esc(stats[0]?.nama||'–')}</div><div class="insight-sub">${stats[0]?.qty||0} unit · ${R(stats[0]?.omzet||0)}</div></div>
        <div class="insight-card"><div class="insight-icon">💰</div><div class="insight-label">Total Omzet</div><div class="insight-val">${R(totalOmzet)}</div><div class="insight-sub">${totalQty} unit terjual</div></div>
        <div class="insight-card"><div class="insight-icon">📈</div><div class="insight-label">Margin Tertinggi</div><div class="insight-val">${esc([...stats].sort((a,b)=>b.marginPct-a.marginPct)[0]?.nama||'–')}</div><div class="insight-sub">${[...stats].sort((a,b)=>b.marginPct-a.marginPct)[0]?.marginPct||0}%</div></div>
        <div class="insight-card"><div class="insight-icon">📦</div><div class="insight-label">Jumlah Item Terjual</div><div class="insight-val">${stats.length} item</div><div class="insight-sub">${STATE.barang.length} total di master</div></div>
      </div>
      <div class="box" style="margin-bottom:20px;"><div class="box-hd"><h3>Grafik Omzet per Barang</h3></div><div class="box-bd"><div class="chart-wrap" style="height:220px;"><canvas id="cBrgOmzet"></canvas></div></div></div>
      <div class="box"><div class="box-hd"><h3>Detail Barang Terlaris</h3><div class="meta">${stats.length} item</div></div>
        <div class="box-bd pad0 tscroll"><table id="tblBrgLaku">
          <thead><tr><th>#</th><th>Kode</th><th>Nama Barang</th><th>PPN</th><th class="r">Qty</th><th class="r">Omzet</th><th class="r">HPP</th><th class="r">Margin</th><th class="r">%</th></tr></thead>
          <tbody>${stats.map((s, i) => `<tr>
            <td><div style="display:flex;align-items:center;gap:6px;">${i<3?`<div class="rank-num ${i===0?'gold':i===1?'silver':'bronze'}" style="width:20px;height:20px;font-size:10px;">${i+1}</div>`:`<span style="font-size:12px;color:var(--ink3);">${i+1}</span>`}</div></td>
            <td style="font-family:var(--F-m);font-size:12px;">${esc(s.kode)}</td>
            <td><strong>${esc(s.nama)}</strong></td>
            <td><span class="badge ${s.ppn==='Kena PPN'?'badge-ppn':'badge-noppn'}">${s.ppn||'–'}</span></td>
            <td class="r">${s.qty.toLocaleString('id-ID')}</td>
            <td class="r">${R(s.omzet)}</td>
            <td class="r">${s.hpp>0?R(s.hpp):'<span style="color:var(--ink3);">–</span>'}</td>
            <td class="r ${s.margin>=0?'laba-pos':'laba-neg'}">${s.hpp>0?R(s.margin):'<span style="color:var(--ink3);">–</span>'}</td>
            <td class="r" style="font-weight:700;">${s.hpp>0?s.marginPct+'%':'–'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : '<div class="empty"><div class="ico">🛒</div><strong>Belum ada data penjualan.</strong></div>'}`;
    setTimeout(() => { if (stats.length) drawBarCanvas('cBrgOmzet', stats.slice(0, 12).map(s => s.nama), stats.slice(0, 12).map(s => s.omzet), '#1A5C38'); }, 60);
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

async function renderAnalisisCabang() {
  const el = document.getElementById('an-cabangcomp');
  el.innerHTML = loadingHTML;
  try {
    const res = await apiGet('/analisis/cabang');
    const list = (res.data || []).sort((a, b) => b.omzet - a.omzet);
    const totalOmzet = list.reduce((s, c) => s + c.omzet, 0);
    el.innerHTML = `
      ${exportBar('tblCabComp', 'perbandingan-cabang', 'an-cabangcomp', 'Perbandingan Cabang')}
      ${list.length ? `
      <div class="box" style="margin-bottom:20px;"><div class="box-hd"><h3>Kontribusi Omzet per Cabang</h3></div><div class="box-bd"><div class="chart-wrap" style="height:200px;"><canvas id="cCabComp"></canvas></div></div></div>
      <div class="box"><div class="box-hd"><h3>Perbandingan Detail</h3></div>
        <div class="box-bd pad0 tscroll"><table id="tblCabComp">
          <thead><tr><th>Cabang</th><th class="r">Omzet Total</th><th class="r">Omzet Bln Ini</th><th class="r">Pembelian</th><th class="r">Biaya</th><th class="r">Margin</th><th class="r">Kontribusi</th><th class="r">Jml Trx</th></tr></thead>
          <tbody>${list.map(c => `<tr>
            <td><strong>${esc(c.nama)}</strong></td>
            <td class="r">${R(c.omzet)}</td><td class="r">${R(c.omzet_bulan)}</td><td class="r">${R(c.beli_total)}</td><td class="r">${R(c.biaya_total)}</td>
            <td class="r ${c.margin>=0?'laba-pos':'laba-neg'}">${R(c.margin)}</td>
            <td class="r"><strong>${totalOmzet>0?Math.round(c.omzet/totalOmzet*100):0}%</strong></td>
            <td class="r">${c.trx_count}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : '<div class="empty"><div class="ico">🏬</div><strong>Belum ada data.</strong></div>'}`;
    setTimeout(() => { if (list.length) drawBarCanvas('cCabComp', list.map(c => c.nama), list.map(c => c.omzet), '#C8973A'); }, 60);
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

async function renderAnalisisTren() {
  const el = document.getElementById('an-tren');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/analisis/tren' + q);
    const list = res.data || [];
    const labels = list.map(m => monthLabel(m.bulan));
    el.innerHTML = `
      ${exportBar('tblTren', 'tren-bulanan', 'an-tren', 'Tren Penjualan')}
      <div class="row2">
        <div class="box"><div class="box-hd"><h3>Tren Penjualan 12 Bulan</h3></div><div class="box-bd"><div class="chart-wrap" style="height:200px;"><canvas id="cTrenJual"></canvas></div></div></div>
        <div class="box"><div class="box-hd"><h3>Tren Laba Estimasi 12 Bulan</h3></div><div class="box-bd"><div class="chart-wrap" style="height:200px;"><canvas id="cTrenLaba"></canvas></div></div></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Rincian Bulanan</h3></div>
        <div class="box-bd pad0 tscroll"><table id="tblTren">
          <thead><tr><th>Bulan</th><th class="r">Penjualan</th><th class="r">Pembelian</th><th class="r">HPP</th><th class="r">Biaya</th><th class="r">Laba Estimasi</th></tr></thead>
          <tbody>${list.map(m => `<tr>
            <td style="font-weight:600;">${monthLabel(m.bulan)}</td>
            <td class="r">${m.jual>0?R(m.jual):'–'}</td><td class="r">${m.beli>0?R(m.beli):'–'}</td>
            <td class="r">${m.hpp>0?R(m.hpp):'–'}</td><td class="r">${m.biaya>0?R(m.biaya):'–'}</td>
            <td class="r ${m.laba>=0?'laba-pos':'laba-neg'}">${m.jual>0||m.biaya>0?R(m.laba):'–'}</td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>`;
    setTimeout(() => {
      drawLineCanvas('cTrenJual', labels, list.map(m => m.jual), '#1A5C38');
      drawLineCanvas('cTrenLaba', labels, list.map(m => m.laba), '#C8973A');
    }, 60);
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

async function renderAnalisisMargin() {
  const el = document.getElementById('an-margin');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/analisis/margin' + q);
    const stats = res.data || [];
    el.innerHTML = `
      ${exportBar('tblMargin', 'analisis-margin', 'an-margin', 'Analisis Margin & HPP')}
      ${stats.length ? `
      <div class="insight-grid">
        <div class="insight-card"><div class="insight-icon">📊</div><div class="insight-label">Margin Terbaik</div><div class="insight-val">${esc(stats[0]?.nama||'–')}</div><div class="insight-sub">${stats[0]?.margin_pct||0}%</div></div>
        <div class="insight-card"><div class="insight-icon">⚠️</div><div class="insight-label">Margin Terendah</div><div class="insight-val">${esc(stats[stats.length-1]?.nama||'–')}</div><div class="insight-sub">${stats[stats.length-1]?.margin_pct||0}%</div></div>
        <div class="insight-card"><div class="insight-icon">💡</div><div class="insight-label">Rata-rata Margin</div><div class="insight-val">${stats.length?Math.round(stats.reduce((s,x)=>s+x.margin_pct,0)/stats.length):0}%</div><div class="insight-sub">${stats.length} item</div></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Analisis Margin per Barang</h3></div>
        <div class="box-bd pad0 tscroll"><table id="tblMargin">
          <thead><tr><th>#</th><th>Nama Barang</th><th class="r">Omzet</th><th class="r">HPP</th><th class="r">Margin</th><th class="r">%</th><th>Visual</th></tr></thead>
          <tbody>${stats.map((s, i) => `<tr>
            <td>${i+1}</td><td><strong>${esc(s.nama)}</strong></td>
            <td class="r">${R(s.omzet)}</td><td class="r">${R(s.hpp)}</td>
            <td class="r ${s.margin>=0?'laba-pos':'laba-neg'}">${R(s.margin)}</td>
            <td class="r" style="font-weight:700;color:${s.margin_pct>=30?'var(--grn)':s.margin_pct>=15?'var(--ylw)':'var(--red)'};">${s.margin_pct}%</td>
            <td style="min-width:100px;"><div style="height:8px;background:var(--kertas);border-radius:4px;overflow:hidden;"><div style="height:100%;width:${Math.min(s.margin_pct,100)}%;background:${s.margin_pct>=30?'var(--daun)':s.margin_pct>=15?'var(--emas)':'var(--red)'};border-radius:4px;"></div></div></td>
          </tr>`).join('')}</tbody>
        </table></div>
      </div>` : '<div class="empty"><div class="ico">💰</div><strong>Belum ada data margin.</strong>Isi harga modal di Master Barang.</div>'}`;
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── MASTER: CABANG ───────────────────────────────────────────────────── */
async function renderCabang() {
  const el = document.getElementById('ms-cabang');
  el.innerHTML = loadingHTML;
  try {
    const list = STATE.cabang;
    el.innerHTML = `
      <div class="row2">
        <div class="box"><div class="box-hd"><h3>Tambah Cabang Baru</h3></div><div class="box-bd">
          <form id="fCabang">
            <div class="fgrid">
              <div class="fgroup"><label class="flabel">Nama Cabang</label><input class="finput" id="cbNama" required placeholder="Contoh: Cabang Kudus"></div>
              <div class="fgroup"><label class="flabel">Alamat</label><input class="finput" id="cbAlamat" placeholder="Opsional"></div>
            </div>
            <button class="btn btn-p" type="submit">+ Simpan Cabang</button>
          </form>
        </div></div>
        <div class="box"><div class="box-hd"><h3>Daftar Cabang</h3><div class="meta">${list.length} cabang</div></div>
          <div class="box-bd pad0">
            ${list.length ? `<table><thead><tr><th>Nama</th><th>Alamat</th><th></th></tr></thead><tbody>
              ${list.map(c => `<tr><td><strong>${esc(c.nama)}</strong></td><td>${esc(c.alamat||'–')}</td>
                <td><button class="row-del" onclick="hapusCabang(${c.id})">✕</button></td></tr>`).join('')}
            </tbody></table>` : '<div class="empty"><div class="ico">🏬</div><strong>Belum ada cabang.</strong></div>'}
          </div>
        </div>
      </div>`;
    document.getElementById('fCabang').onsubmit = async e => {
      e.preventDefault();
      try {
        await apiPost('/master/cabang', { nama: document.getElementById('cbNama').value.trim(), alamat: document.getElementById('cbAlamat').value.trim() });
        toast('Cabang ditambahkan'); await loadMasterData(); await renderCabang();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}
window.hapusCabang = async id => {
  if (!confirm('Hapus cabang ini?')) return;
  try { await apiDel('/master/cabang/' + id); toast('Cabang dihapus', 'y'); await loadMasterData(); await renderCabang(); }
  catch (e) { toast(e.message, 'err'); }
};

/* ── MASTER: COA ──────────────────────────────────────────────────────── */
async function renderCOA() {
  const el = document.getElementById('ms-coa');
  el.innerHTML = loadingHTML;
  const list = STATE.coa;
  const cats = ['Aset', 'Liabilitas', 'Modal', 'Pendapatan', 'Beban'];
  const rows = cats.flatMap(cat => {
    const items = list.filter(c => c.kat === cat); if (!items.length) return [];
    return [`<tr class="coa-cat-hd"><td colspan="4">${cat}</td></tr>`,
      ...items.map(c => `<tr>
        <td style="font-family:var(--F-m);font-size:12px;">${c.kode}</td><td>${esc(c.nama)}</td>
        <td><span class="badge ${c.normal==='D'?'badge-info':'badge-warn'}">${c.normal==='D'?'Debit':'Kredit'}</span></td>
        <td>${c.is_default?'<span style="font-size:11px;color:var(--ink3);">standar</span>':`<button class="row-del" onclick="hapusCOA(${c.id})">✕</button>`}</td>
      </tr>`)];
  }).join('');
  el.innerHTML = `
    <div class="note note-b"><span class="note-ico">ℹ️</span><span>Akun standar sudah tersedia. Tambah akun biaya khusus sesuai kebutuhan.</span></div>
    <div class="row2">
      <div class="box"><div class="box-hd"><h3>Tambah Akun Baru</h3></div><div class="box-bd">
        <form id="fCOA">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Kode Akun</label><input class="finput" id="coaK" required placeholder="6106"></div>
            <div class="fgroup"><label class="flabel">Nama Akun</label><input class="finput" id="coaN2" required placeholder="Biaya Internet"></div>
            <div class="fgroup"><label class="flabel">Kategori</label><select class="fselect" id="coaKat"><option>Aset</option><option>Liabilitas</option><option>Modal</option><option>Pendapatan</option><option selected>Beban</option></select></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan Akun</button>
        </form>
      </div></div>
      <div class="box" style="overflow:hidden;"><div class="box-hd"><h3>Daftar Akun (COA)</h3><div class="meta">${list.length} akun</div></div>
        <div class="box-bd pad0 tscroll" style="max-height:420px;overflow-y:auto;"><table><thead><tr><th>Kode</th><th>Nama Akun</th><th>Normal</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>
    </div>`;
  document.getElementById('fCOA').onsubmit = async e => {
    e.preventDefault();
    try {
      await apiPost('/master/coa', { kode: document.getElementById('coaK').value.trim(), nama: document.getElementById('coaN2').value.trim(), kat: document.getElementById('coaKat').value });
      toast('Akun ditambahkan'); await loadMasterData(); await renderCOA();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.hapusCOA = async id => {
  if (!confirm('Hapus akun ini?')) return;
  try { await apiDel('/master/coa/' + id); toast('Akun dihapus', 'y'); await loadMasterData(); await renderCOA(); }
  catch (e) { toast(e.message, 'err'); }
};

/* ── MASTER: BARANG ───────────────────────────────────────────────────── */
let barangPage = 1;
async function renderBarang(page = 1) {
  barangPage = page;
  const el = document.getElementById('ms-barang');
  el.innerHTML = loadingHTML;
  try {
    const res = await apiGet(`/master/barang?page=${page}&per_page=30`);
    const list = res.data || [];
    const meta = res.meta || res;
    el.innerHTML = `
      <div class="note note-b"><span class="note-ico">ℹ️</span><span>Status PPN per barang menentukan DPP & PPN otomatis. Isi Harga Modal untuk analisis margin.</span></div>
      <div class="box"><div class="box-hd"><h3>Tambah Barang</h3><button class="btn btn-g btn-sm" onclick="exportTableExcel('tblBarang','master-barang')">📊 Export Excel</button></div>
        <div class="box-bd"><form id="fBarang">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Kode Barang</label><input class="finput" id="brK" required></div>
            <div class="fgroup"><label class="flabel">Nama Barang</label><input class="finput" id="brN" required></div>
            <div class="fgroup"><label class="flabel">Status PPN</label><select class="fselect" id="brP"><option>Kena PPN</option><option>Non-PPN</option></select></div>
            <div class="fgroup"><label class="flabel">Harga Modal</label><input class="finput" type="number" id="brM" min="0" placeholder="0"></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan Barang</button>
        </form></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Daftar Barang</h3><div class="meta">${meta.total||list.length} item</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblBarang"><thead><tr><th>Kode</th><th>Nama</th><th>PPN</th><th class="r">Harga Modal</th><th></th></tr></thead><tbody>
            ${list.map(b => `<tr>
              <td style="font-family:var(--F-m);font-size:12px;">${esc(b.kode)}</td><td>${esc(b.nama)}</td>
              <td><span class="badge ${b.ppn==='Kena PPN'?'badge-ppn':'badge-noppn'}">${b.ppn}</span></td>
              <td class="r">${b.modal?R(b.modal):'–'}</td>
              <td><button class="row-del" onclick="hapusBarang(${b.id})">✕</button></td>
            </tr>`).join('')}</tbody></table>
          ${paginationHTML(meta, 'renderBarang')}` : '<div class="empty"><div class="ico">📦</div><strong>Belum ada barang.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fBarang').onsubmit = async e => {
      e.preventDefault();
      try {
        await apiPost('/master/barang', { kode: document.getElementById('brK').value.trim(), nama: document.getElementById('brN').value.trim(), ppn: document.getElementById('brP').value, modal: Number(document.getElementById('brM').value)||0 });
        toast('Barang ditambahkan'); await loadMasterData(); await renderBarang();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}
window.renderBarang = renderBarang;
window.hapusBarang = async id => {
  if (!confirm('Hapus barang ini?')) return;
  try { await apiDel('/master/barang/' + id); toast('Barang dihapus', 'y'); await loadMasterData(); await renderBarang(); }
  catch (e) { toast(e.message, 'err'); }
};

/* ── MASTER: JASA ─────────────────────────────────────────────────────── */
async function renderJasaMaster() {
  const el = document.getElementById('ms-jasa');
  el.innerHTML = loadingHTML;
  const list = STATE.jasa;
  el.innerHTML = `
    <div class="box"><div class="box-hd"><h3>Tambah Jasa</h3><button class="btn btn-g btn-sm" onclick="exportTableExcel('tblJasaMaster','master-jasa')">📊 Export Excel</button></div>
      <div class="box-bd"><form id="fJasaMaster">
        <div class="fgrid">
          <div class="fgroup"><label class="flabel">Kode Jasa</label><input class="finput" id="jsK" required></div>
          <div class="fgroup"><label class="flabel">Nama Jasa</label><input class="finput" id="jsN" required></div>
          <div class="fgroup"><label class="flabel">Status PPN</label><select class="fselect" id="jsP"><option>Non-PPN</option><option>Kena PPN</option></select></div>
          <div class="fgroup"><label class="flabel">Harga Standar</label><input class="finput" type="number" id="jsH" min="0" placeholder="0"></div>
        </div>
        <button class="btn btn-p" type="submit">+ Simpan Jasa</button>
      </form></div>
    </div>
    <div class="box"><div class="box-hd"><h3>Daftar Jasa</h3><div class="meta">${list.length} jenis</div></div>
      <div class="box-bd pad0 tscroll">
        ${list.length ? `<table id="tblJasaMaster"><thead><tr><th>Kode</th><th>Nama</th><th>PPN</th><th class="r">Harga Standar</th><th></th></tr></thead><tbody>
          ${list.map(j => `<tr>
            <td style="font-family:var(--F-m);font-size:12px;">${esc(j.kode)}</td><td>${esc(j.nama)}</td>
            <td><span class="badge ${j.ppn==='Kena PPN'?'badge-ppn':'badge-noppn'}">${j.ppn}</span></td>
            <td class="r">${j.harga?R(j.harga):'–'}</td>
            <td><button class="row-del" onclick="hapusJasa(${j.id})">✕</button></td>
          </tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">🛠️</div><strong>Belum ada jasa.</strong></div>'}
      </div>
    </div>`;
  document.getElementById('fJasaMaster').onsubmit = async e => {
    e.preventDefault();
    try {
      await apiPost('/master/jasa', { kode: document.getElementById('jsK').value.trim(), nama: document.getElementById('jsN').value.trim(), ppn: document.getElementById('jsP').value, harga: Number(document.getElementById('jsH').value)||0 });
      toast('Jasa ditambahkan'); await loadMasterData(); await renderJasaMaster();
    } catch (e) { toast(e.message, 'err'); }
  };
}
window.hapusJasa = async id => {
  if (!confirm('Hapus jasa ini?')) return;
  try { await apiDel('/master/jasa/' + id); toast('Jasa dihapus', 'y'); await loadMasterData(); await renderJasaMaster(); }
  catch (e) { toast(e.message, 'err'); }
};

/* ── MASTER: PELANGGAN ────────────────────────────────────────────────── */
async function renderPelanggan() {
  const el = document.getElementById('ms-pelanggan');
  el.innerHTML = loadingHTML;
  try {
    const res = await apiGet('/master/pelanggan');
    const list = Array.isArray(res) ? res : (res.data || []);
    el.innerHTML = `
      <div class="box"><div class="box-hd"><h3>Tambah Pelanggan</h3><button class="btn btn-g btn-sm" onclick="exportTableExcel('tblPelanggan','master-pelanggan')">📊 Export Excel</button></div>
        <div class="box-bd"><form id="fPelanggan">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Kode</label><input class="finput" id="plK" required></div>
            <div class="fgroup"><label class="flabel">Nama</label><input class="finput" id="plN" required></div>
            <div class="fgroup"><label class="flabel">No. Telepon</label><input class="finput" id="plT" placeholder="Opsional"></div>
            <div class="fgroup"><label class="flabel">Alamat</label><input class="finput" id="plA" placeholder="Opsional"></div>
            <div class="fgroup"><label class="flabel">Poin</label><input class="finput" type="number" id="plP" min="0" placeholder="0"></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan Pelanggan</button>
        </form></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Daftar Pelanggan</h3><div class="meta">${list.length} pelanggan</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblPelanggan"><thead><tr><th>Kode</th><th>Nama</th><th>Telepon</th><th>Alamat</th><th class="r">Poin</th><th></th></tr></thead><tbody>
            ${list.map(p => `<tr>
              <td style="font-family:var(--F-m);font-size:12px;">${esc(p.kode)}</td><td><strong>${esc(p.nama)}</strong></td>
              <td>${esc(p.telp||'–')}</td><td>${esc(p.alamat||'–')}</td>
              <td class="r"><span class="badge badge-info">${p.poin||0} pts</span></td>
              <td><button class="row-del" onclick="hapusPelanggan(${p.id})">✕</button></td>
            </tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">🧑‍🤝‍🧑</div><strong>Belum ada pelanggan.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fPelanggan').onsubmit = async e => {
      e.preventDefault();
      try {
        await apiPost('/master/pelanggan', { kode: document.getElementById('plK').value.trim(), nama: document.getElementById('plN').value.trim(), telp: document.getElementById('plT').value.trim(), alamat: document.getElementById('plA').value.trim(), poin: Number(document.getElementById('plP').value)||0 });
        toast('Pelanggan ditambahkan'); await renderPelanggan();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}
window.hapusPelanggan = async id => {
  if (!confirm('Hapus pelanggan ini?')) return;
  try { await apiDel('/master/pelanggan/' + id); toast('Pelanggan dihapus', 'y'); await renderPelanggan(); }
  catch (e) { toast(e.message, 'err'); }
};

/* ── MASTER: KADALUARSA ───────────────────────────────────────────────── */
function expStatus(tglExp) {
  if (!tglExp) return { lbl: '–', cls: '' };
  const diff = Math.ceil((new Date(tglExp) - new Date(today())) / 86400000);
  if (diff < 0) return { lbl: 'Kadaluarsa', cls: 'badge-out', diff };
  if (diff <= 30) return { lbl: `Mendekati (${diff} hr)`, cls: 'badge-warn', diff };
  return { lbl: `Aman (${diff} hr)`, cls: 'badge-in', diff };
}
async function renderKadaluarsa() {
  const el = document.getElementById('ms-kadaluarsa');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const list = await apiGet('/master/kadaluarsa' + q);
    const expired = list.filter(x => expStatus(x.tgl_exp).diff < 0).length;
    const near = list.filter(x => { const d2 = expStatus(x.tgl_exp).diff; return d2 >= 0 && d2 <= 30; }).length;
    el.innerHTML = `
      ${exportBar('tblKadaluarsa', 'barang-kadaluarsa', 'ms-kadaluarsa', 'Barang Kadaluarsa')}
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Total Dipantau</div><div class="kpi-val">${list.length}</div></div>
        <div class="kpi red"><div class="kpi-label">Sudah Kadaluarsa</div><div class="kpi-val neg">${expired}</div></div>
        <div class="kpi"><div class="kpi-label">Mendekati (≤30 hr)</div><div class="kpi-val">${near}</div></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Catat Tanggal Kadaluarsa</h3></div><div class="box-bd">
        <form id="fKadaluarsa">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="kd_tgl" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="kd_cab" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Kode Barang</label><input class="finput" id="kd_kb" list="dl_kdl" required placeholder="Ketik kode…"></div>
            <div class="fgroup"><label class="flabel">No. Batch</label><input class="finput" id="kd_batch" placeholder="Opsional"></div>
            <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="kd_qty" value="1" min="1" required></div>
            <div class="fgroup"><label class="flabel">Tanggal Kadaluarsa</label><input class="finput" type="date" id="kd_exp" required></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan</button>
        </form>
        ${barangDatalist('dl_kdl')}
      </div></div>
      <div class="box"><div class="box-hd"><h3>Daftar Pantauan</h3><div class="meta">${list.length} item</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblKadaluarsa"><thead><tr><th>Tgl Exp</th><th>Cabang</th><th>Barang</th><th>Batch</th><th class="r">Qty</th><th>Status</th><th></th></tr></thead><tbody>
            ${[...list].sort((a,b)=>(a.tgl_exp||'').localeCompare(b.tgl_exp||'')).map(x => { const st = expStatus(x.tgl_exp); return `<tr>
              <td>${d(x.tgl_exp)}</td><td>${esc(x.cabang)}</td>
              <td>${x.nama_barang?esc(x.nama_barang):esc(x.kode_barang)}</td>
              <td>${esc(x.batch||'–')}</td><td class="r">${x.qty}</td>
              <td><span class="badge ${st.cls}">${st.lbl}</span></td>
              <td><button class="row-del" onclick="hapusKadaluarsa(${x.id})">✕</button></td>
            </tr>`; }).join('')}</tbody></table>` : '<div class="empty"><div class="ico">⏳</div><strong>Belum ada data.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fKadaluarsa').onsubmit = async e => {
      e.preventDefault();
      const kb = document.getElementById('kd_kb').value.trim();
      if (!STATE.barang.find(b => b.kode === kb)) { toast('Kode barang tidak ditemukan', 'err'); return; }
      try {
        await apiPost('/master/kadaluarsa', { tgl: document.getElementById('kd_tgl').value, cabang: document.getElementById('kd_cab').value, kode_barang: kb, batch: document.getElementById('kd_batch').value.trim(), qty: Number(document.getElementById('kd_qty').value), tgl_exp: document.getElementById('kd_exp').value });
        toast('Data kadaluarsa disimpan'); await renderKadaluarsa();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}
window.hapusKadaluarsa = async id => {
  if (!confirm('Hapus data ini?')) return;
  try { await apiDel('/master/kadaluarsa/' + id); toast('Data dihapus', 'y'); await renderKadaluarsa(); }
  catch (e) { toast(e.message, 'err'); }
};

/* ── TRANSAKSI: JUAL / BELI ───────────────────────────────────────────── */
let trxPage = { jual: 1, beli: 1 };
async function renderJualBeli(jenis, elId, page = 1) {
  trxPage[jenis] = page;
  const el = document.getElementById(elId);
  el.innerHTML = loadingHTML;
  const isJ = jenis === 'jual';
  try {
    const cab = getCabang();
    let q = `?page=${page}&per_page=30`;
    if (cab) q += `&cabang=${encodeURIComponent(cab)}`;
    const res = await apiGet(`/transaksi/${jenis}${q}`);
    const list = res.data || [];
    const meta = res.meta || res;
    const total = list.reduce((s, t) => s + t.qty * t.harga, 0);
    const endpoint = jenis;
    el.innerHTML = `
      ${exportBar(`tbl_${jenis}`, `data-${jenis}`, elId, isJ?'Data Penjualan':'Data Pembelian')}
      <div class="box"><div class="box-hd"><h3>${isJ?'Input Penjualan':'Input Pembelian'}</h3></div><div class="box-bd">
        <form id="fTrx_${jenis}">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="${jenis}_tgl" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="${jenis}_cab" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Kode Barang</label><input class="finput" id="${jenis}_kb" list="dl_${jenis}" required placeholder="Ketik kode…"></div>
            <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="${jenis}_qty" value="1" min="0.01" step="0.01" required></div>
            <div class="fgroup"><label class="flabel">Harga Satuan</label><input class="finput" type="number" id="${jenis}_hrg" min="0" required></div>
            <div class="fgroup"><label class="flabel">Metode Bayar</label><select class="fselect" id="${jenis}_bayar"><option>Tunai</option><option>Kredit</option></select></div>
          </div>
          <div id="${jenis}_prev" class="fprev"></div>
          <button class="btn btn-p" type="submit">+ Simpan ${isJ?'Penjualan':'Pembelian'}</button>
        </form>
        ${barangDatalist('dl_' + jenis)}
      </div></div>
      <div class="box"><div class="box-hd"><h3>Daftar ${isJ?'Penjualan':'Pembelian'}</h3><div class="meta">${meta.total||list.length} transaksi · Total: <strong>${R(total)}</strong></div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tbl_${jenis}"><thead><tr><th>Tanggal</th><th>Cabang</th><th>Barang</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Total</th><th>Bayar</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr>
              <td>${d(t.tgl)}</td><td>${esc(t.cabang)}</td>
              <td>${esc(t.nama_barang||t.kode_barang)} <span class="badge ${t.ppn==='Kena PPN'?'badge-ppn':'badge-noppn'}">${t.ppn||''}</span></td>
              <td class="r">${t.qty}</td><td class="r">${R(t.harga)}</td><td class="r">${R(t.qty*t.harga)}</td>
              <td>${t.bayar}</td><td><button class="row-del" onclick="hapusTrx('${endpoint}',${t.id})">✕</button></td>
            </tr>`).join('')}</tbody></table>
          ${paginationHTML(meta, `p=>renderJualBeli('${jenis}','${elId}',p)`)}` : '<div class="empty"><div class="ico">'+(isJ?'🛒':'📦')+'</div><strong>Belum ada data.</strong></div>'}
        </div>
      </div>`;
    const kbI = document.getElementById(jenis + '_kb');
    kbI.addEventListener('input', () => {
      const b = STATE.barang.find(b => b.kode === kbI.value.trim());
      document.getElementById(jenis + '_prev').textContent = b ? `${b.nama} — ${b.ppn}${b.modal?' | Modal: '+R(b.modal):''}` : kbI.value ? 'Kode tidak ditemukan.' : '';
      if (b) document.getElementById(jenis + '_hrg').value = b.modal || '';
    });
    document.getElementById('fTrx_' + jenis).onsubmit = async e => {
      e.preventDefault();
      const kb = kbI.value.trim();
      if (!STATE.barang.find(b => b.kode === kb)) { toast('Kode barang tidak ditemukan di Master', 'err'); return; }
      try {
        await apiPost(`/transaksi/${jenis}`, { tgl: document.getElementById(jenis+'_tgl').value, cabang: document.getElementById(jenis+'_cab').value, kode_barang: kb, qty: Number(document.getElementById(jenis+'_qty').value), harga: Number(document.getElementById(jenis+'_hrg').value), bayar: document.getElementById(jenis+'_bayar').value });
        toast('Transaksi disimpan'); await renderJualBeli(jenis, elId);
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

window.hapusTrx = async (jenis, id) => {
  if (!confirm('Hapus transaksi ini?')) return;
  try { await apiDel(`/transaksi/${jenis}/${id}`); toast('Transaksi dihapus', 'y'); renderSubTab('tx', jenis); }
  catch (e) { toast(e.message, 'err'); }
};

/* ── TRANSAKSI: JASA ──────────────────────────────────────────────────── */
async function renderTrxJasa() {
  const el = document.getElementById('tx-jasa');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/transaksi/jasa' + q);
    const list = res.data || [];
    const total = list.reduce((s, t) => s + t.qty * t.harga, 0);
    el.innerHTML = `
      ${exportBar('tblJasaTx', 'data-jasa', 'tx-jasa', 'Data Transaksi Jasa')}
      <div class="box"><div class="box-hd"><h3>Input Penjualan Jasa</h3></div><div class="box-bd">
        <form id="fJasaTx">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="js_tgl" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="js_cab" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Kode Jasa</label><input class="finput" id="js_kj" list="dl_jasa" required placeholder="Ketik kode…"></div>
            <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="js_qty" value="1" min="0.01" required></div>
            <div class="fgroup"><label class="flabel">Harga</label><input class="finput" type="number" id="js_hrg" min="0" required></div>
            <div class="fgroup"><label class="flabel">Metode Bayar</label><select class="fselect" id="js_bayar"><option>Tunai</option><option>Kredit</option></select></div>
          </div>
          <div id="js_prev" class="fprev"></div>
          <button class="btn btn-p" type="submit">+ Simpan Jasa</button>
        </form>
        ${jasaDatalist('dl_jasa')}
      </div></div>
      <div class="box"><div class="box-hd"><h3>Daftar Penjualan Jasa</h3><div class="meta">${list.length} transaksi · Total: <strong>${R(total)}</strong></div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblJasaTx"><thead><tr><th>Tanggal</th><th>Cabang</th><th>Jasa</th><th class="r">Qty</th><th class="r">Harga</th><th class="r">Total</th><th>Bayar</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr><td>${d(t.tgl)}</td><td>${esc(t.cabang)}</td><td>${esc(t.nama_jasa||t.kode_jasa)}</td><td class="r">${t.qty}</td><td class="r">${R(t.harga)}</td><td class="r">${R(t.qty*t.harga)}</td><td>${t.bayar}</td><td><button class="row-del" onclick="hapusTrx('jasa',${t.id})">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">🛠️</div><strong>Belum ada data.</strong></div>'}
        </div>
      </div>`;
    const kjI = document.getElementById('js_kj');
    kjI.addEventListener('input', () => {
      const j = STATE.jasa.find(j => j.kode === kjI.value.trim());
      document.getElementById('js_prev').textContent = j ? `${j.nama} — ${j.ppn}${j.harga?' | Harga standar: '+R(j.harga):''}` : kjI.value ? 'Kode tidak ditemukan.' : '';
      if (j && j.harga) document.getElementById('js_hrg').value = j.harga;
    });
    document.getElementById('fJasaTx').onsubmit = async e => {
      e.preventDefault();
      const kj = kjI.value.trim();
      if (!STATE.jasa.find(j => j.kode === kj)) { toast('Kode jasa tidak ditemukan', 'err'); return; }
      try {
        await apiPost('/transaksi/jasa', { tgl: document.getElementById('js_tgl').value, cabang: document.getElementById('js_cab').value, kode_jasa: kj, qty: Number(document.getElementById('js_qty').value), harga: Number(document.getElementById('js_hrg').value), bayar: document.getElementById('js_bayar').value });
        toast('Transaksi jasa disimpan'); await renderTrxJasa();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── TRANSAKSI: SEWA ──────────────────────────────────────────────────── */
async function renderSewa() {
  const el = document.getElementById('tx-sewa');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/transaksi/sewa' + q);
    const list = res.data || [];
    const total = list.reduce((s, t) => s + Number(t.biaya), 0);
    el.innerHTML = `
      ${exportBar('tblSewa', 'data-sewa', 'tx-sewa', 'Data Sewa')}
      <div class="box"><div class="box-hd"><h3>Input Sewa</h3></div><div class="box-bd">
        <form id="fSewa">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="sw_tgl" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="sw_cab" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Nama Penyewa</label><input class="finput" id="sw_nama" required></div>
            <div class="fgroup"><label class="flabel">Item Disewa</label><input class="finput" id="sw_item" required placeholder="Tenda, Kursi, dll"></div>
            <div class="fgroup"><label class="flabel">Tgl Mulai</label><input class="finput" type="date" id="sw_mulai" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Tgl Selesai</label><input class="finput" type="date" id="sw_selesai" required></div>
            <div class="fgroup"><label class="flabel">Biaya Sewa</label><input class="finput" type="number" id="sw_biaya" min="0" required></div>
            <div class="fgroup"><label class="flabel">Status PPN</label><select class="fselect" id="sw_ppn"><option>Non-PPN</option><option>Kena PPN</option></select></div>
            <div class="fgroup"><label class="flabel">Metode Bayar</label><select class="fselect" id="sw_bayar"><option>Tunai</option><option>Kredit</option></select></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan Sewa</button>
        </form>
      </div></div>
      <div class="box"><div class="box-hd"><h3>Daftar Sewa</h3><div class="meta">${list.length} transaksi · Total: <strong>${R(total)}</strong></div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblSewa"><thead><tr><th>Mulai</th><th>Selesai</th><th>Cabang</th><th>Penyewa</th><th>Item</th><th class="r">Biaya</th><th>Bayar</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr><td>${d(t.tgl_mulai)}</td><td>${d(t.tgl_selesai)}</td><td>${esc(t.cabang)}</td><td>${esc(t.nama_penyewa)}</td><td>${esc(t.item)}</td><td class="r">${R(t.biaya)}</td><td>${t.bayar}</td><td><button class="row-del" onclick="hapusTrx('sewa',${t.id})">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">🗝️</div><strong>Belum ada data sewa.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fSewa').onsubmit = async e => {
      e.preventDefault();
      try {
        await apiPost('/transaksi/sewa', { tgl: document.getElementById('sw_tgl').value, cabang: document.getElementById('sw_cab').value, nama_penyewa: document.getElementById('sw_nama').value.trim(), item: document.getElementById('sw_item').value.trim(), tgl_mulai: document.getElementById('sw_mulai').value, tgl_selesai: document.getElementById('sw_selesai').value, biaya: Number(document.getElementById('sw_biaya').value), ppn: document.getElementById('sw_ppn').value, bayar: document.getElementById('sw_bayar').value });
        toast('Data sewa disimpan'); await renderSewa();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── TRANSAKSI: MUTASI ────────────────────────────────────────────────── */
async function renderMutasi() {
  const el = document.getElementById('tx-mutasi');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/transaksi/mutasi' + q);
    const list = res.data || [];
    el.innerHTML = `
      <div class="note note-b"><span class="note-ico">ℹ️</span><span>Mutasi barang mencatat perpindahan stok antar cabang. Tidak memengaruhi jurnal keuangan.</span></div>
      ${exportBar('tblMutasi', 'data-mutasi', 'tx-mutasi', 'Data Mutasi Barang')}
      <div class="box"><div class="box-hd"><h3>Input Mutasi Barang</h3></div><div class="box-bd">
        <form id="fMutasi">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="mt_tgl" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Dari Cabang</label><select class="fselect" id="mt_dari" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Ke Cabang</label><select class="fselect" id="mt_ke" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Kode Barang</label><input class="finput" id="mt_kb" list="dl_mutasi" required placeholder="Ketik kode…"></div>
            <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="mt_qty" value="1" min="0.01" required></div>
            <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="mt_ket" placeholder="Opsional"></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan Mutasi</button>
        </form>
        ${barangDatalist('dl_mutasi')}
      </div></div>
      <div class="box"><div class="box-hd"><h3>Daftar Mutasi</h3><div class="meta">${list.length} mutasi</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblMutasi"><thead><tr><th>Tanggal</th><th>Dari</th><th>Ke</th><th>Barang</th><th class="r">Qty</th><th>Keterangan</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr><td>${d(t.tgl)}</td><td>${esc(t.dari_cabang)}</td><td>${esc(t.ke_cabang)}</td><td>${esc(t.nama_barang||t.kode_barang)}</td><td class="r">${t.qty}</td><td>${esc(t.keterangan||'–')}</td><td><button class="row-del" onclick="hapusTrx('mutasi',${t.id})">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">🚚</div><strong>Belum ada mutasi.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fMutasi').onsubmit = async e => {
      e.preventDefault();
      const kb = document.getElementById('mt_kb').value.trim();
      if (!STATE.barang.find(b => b.kode === kb)) { toast('Kode barang tidak ditemukan', 'err'); return; }
      const dari = document.getElementById('mt_dari').value, ke = document.getElementById('mt_ke').value;
      if (dari === ke) { toast('Cabang asal dan tujuan tidak boleh sama', 'err'); return; }
      try {
        await apiPost('/transaksi/mutasi', { tgl: document.getElementById('mt_tgl').value, dari_cabang: dari, ke_cabang: ke, kode_barang: kb, qty: Number(document.getElementById('mt_qty').value), keterangan: document.getElementById('mt_ket').value.trim() });
        toast('Mutasi disimpan'); await renderMutasi();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── TRANSAKSI: RETUR ─────────────────────────────────────────────────── */
async function renderRetur() {
  const el = document.getElementById('tx-retur');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const list = await apiGet('/transaksi/retur' + q);
    const totJ = list.filter(t => t.jenis === 'Jual').reduce((s, t) => s + t.qty * t.harga, 0);
    const totB = list.filter(t => t.jenis === 'Beli').reduce((s, t) => s + t.qty * t.harga, 0);
    el.innerHTML = `
      ${exportBar('tblRetur', 'data-retur', 'tx-retur', 'Data Retur Barang')}
      <div class="kpi-grid">
        <div class="kpi red"><div class="kpi-label">Retur Penjualan</div><div class="kpi-val neg">${R(totJ)}</div></div>
        <div class="kpi"><div class="kpi-label">Retur Pembelian</div><div class="kpi-val">${R(totB)}</div></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Input Barang Retur</h3></div><div class="box-bd">
        <form id="fRetur">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="rt_tgl" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="rt_cab" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Jenis Retur</label><select class="fselect" id="rt_jenis"><option value="Jual">Retur Penjualan</option><option value="Beli">Retur Pembelian</option></select></div>
            <div class="fgroup"><label class="flabel">Kode Barang</label><input class="finput" id="rt_kb" list="dl_retur" required placeholder="Ketik kode…"></div>
            <div class="fgroup"><label class="flabel">Qty</label><input class="finput" type="number" id="rt_qty" value="1" min="0.01" required></div>
            <div class="fgroup"><label class="flabel">Harga Satuan</label><input class="finput" type="number" id="rt_hrg" min="0" required></div>
            <div class="fgroup"><label class="flabel">Metode</label><select class="fselect" id="rt_bayar"><option>Tunai</option><option>Kredit</option></select></div>
            <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="rt_ket" placeholder="Opsional"></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan Retur</button>
        </form>
        ${barangDatalist('dl_retur')}
      </div></div>
      <div class="box"><div class="box-hd"><h3>Daftar Retur</h3><div class="meta">${list.length} retur</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblRetur"><thead><tr><th>Tanggal</th><th>Cabang</th><th>Jenis</th><th>Barang</th><th class="r">Qty</th><th class="r">Total</th><th>Ket</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr><td>${d(t.tgl)}</td><td>${esc(t.cabang)}</td><td><span class="badge ${t.jenis==='Jual'?'badge-out':'badge-in'}">Retur ${t.jenis}</span></td><td>${esc(t.nama_barang||t.kode_barang)}</td><td class="r">${t.qty}</td><td class="r">${R(t.qty*t.harga)}</td><td>${esc(t.keterangan||'–')}</td><td><button class="row-del" onclick="hapusTrx('retur',${t.id})">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">↩️</div><strong>Belum ada retur.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fRetur').onsubmit = async e => {
      e.preventDefault();
      const kb = document.getElementById('rt_kb').value.trim();
      if (!STATE.barang.find(b => b.kode === kb)) { toast('Kode barang tidak ditemukan', 'err'); return; }
      try {
        await apiPost('/transaksi/retur', { tgl: document.getElementById('rt_tgl').value, cabang: document.getElementById('rt_cab').value, jenis: document.getElementById('rt_jenis').value, kode_barang: kb, qty: Number(document.getElementById('rt_qty').value), harga: Number(document.getElementById('rt_hrg').value), bayar: document.getElementById('rt_bayar').value, keterangan: document.getElementById('rt_ket').value.trim() });
        toast('Retur disimpan'); await renderRetur();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── TRANSAKSI: KASBON ────────────────────────────────────────────────── */
async function renderKasbon() {
  const el = document.getElementById('tx-kasbon');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/transaksi/kasbon' + q);
    const list = res.data || [];
    const saldo = res.saldo || 0;
    el.innerHTML = `
      ${exportBar('tblKasbon', 'data-kasbon', 'tx-kasbon', 'Data Kasbon')}
      <div class="row2">
        <div class="box"><div class="box-hd"><h3>Input Kasbon</h3></div><div class="box-bd">
          <form id="fKasbon">
            <div class="fgrid">
              <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="kb_tgl" value="${today()}" required></div>
              <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="kb_cab" required>${cabangOpts()}</select></div>
              <div class="fgroup"><label class="flabel">Nama Karyawan</label><input class="finput" id="kb_nama" required></div>
              <div class="fgroup"><label class="flabel">Jenis</label><select class="fselect" id="kb_jenis"><option value="Diberikan">Diberikan (kasbon keluar)</option><option value="Dibayar">Dibayar / Dilunasi</option></select></div>
              <div class="fgroup"><label class="flabel">Nominal</label><input class="finput" type="number" id="kb_nom" min="0" required></div>
            </div>
            <button class="btn btn-p" type="submit">+ Simpan Kasbon</button>
          </form>
        </div></div>
        <div class="box"><div class="box-hd"><h3>Ringkasan Kasbon</h3></div><div class="box-bd">
          <div class="kpi green" style="margin-bottom:0;"><div class="kpi-label">Total Piutang Kasbon Beredar</div><div class="kpi-val ${saldo>0?'pos':''}">${R(saldo)}</div><div class="kpi-sub">${list.filter(t=>t.jenis==='Diberikan').length} diberikan · ${list.filter(t=>t.jenis==='Dibayar').length} dilunasi</div></div>
        </div></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Daftar Kasbon</h3></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblKasbon"><thead><tr><th>Tanggal</th><th>Cabang</th><th>Karyawan</th><th>Jenis</th><th class="r">Nominal</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr><td>${d(t.tgl)}</td><td>${esc(t.cabang)}</td><td>${esc(t.nama_karyawan)}</td><td><span class="badge ${t.jenis==='Diberikan'?'badge-out':'badge-in'}">${t.jenis}</span></td><td class="r">${R(t.nominal)}</td><td><button class="row-del" onclick="hapusTrx('kasbon',${t.id})">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">💵</div><strong>Belum ada kasbon.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fKasbon').onsubmit = async e => {
      e.preventDefault();
      try {
        await apiPost('/transaksi/kasbon', { tgl: document.getElementById('kb_tgl').value, cabang: document.getElementById('kb_cab').value, nama_karyawan: document.getElementById('kb_nama').value.trim(), jenis: document.getElementById('kb_jenis').value, nominal: Number(document.getElementById('kb_nom').value) });
        toast('Kasbon disimpan'); await renderKasbon();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── TRANSAKSI: CASHBON PELANGGAN ─────────────────────────────────────── */
async function renderCashbon() {
  const el = document.getElementById('tx-cashbon');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/transaksi/cashbon' + q);
    const list = res.data || [];
    const saldo = res.saldo || 0;
    el.innerHTML = `
      <div class="note note-b"><span class="note-ico">ℹ️</span><span>Cashbon Pelanggan: pinjaman/utang tunai ke pelanggan (berbeda dari Kasbon karyawan).</span></div>
      ${exportBar('tblCashbon', 'data-cashbon', 'tx-cashbon', 'Data Cashbon Pelanggan')}
      <div class="row2">
        <div class="box"><div class="box-hd"><h3>Input Cashbon Pelanggan</h3></div><div class="box-bd">
          <form id="fCashbon">
            <div class="fgrid">
              <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="cb_tgl" value="${today()}" required></div>
              <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="cb_cab" required>${cabangOpts()}</select></div>
              <div class="fgroup"><label class="flabel">Nama Pelanggan</label><input class="finput" id="cb_nama" required></div>
              <div class="fgroup"><label class="flabel">Jenis</label><select class="fselect" id="cb_jenis"><option value="Diberikan">Diberikan</option><option value="Dibayar">Dibayar</option></select></div>
              <div class="fgroup"><label class="flabel">Nominal</label><input class="finput" type="number" id="cb_nom" min="0" required></div>
            </div>
            <button class="btn btn-p" type="submit">+ Simpan Cashbon</button>
          </form>
        </div></div>
        <div class="box"><div class="box-hd"><h3>Total Piutang Cashbon</h3></div><div class="box-bd">
          <div class="kpi green" style="margin-bottom:0;"><div class="kpi-label">Total Beredar</div><div class="kpi-val pos">${R(saldo)}</div></div>
        </div></div>
      </div>
      <div class="box"><div class="box-hd"><h3>Daftar Cashbon Pelanggan</h3></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblCashbon"><thead><tr><th>Tanggal</th><th>Cabang</th><th>Pelanggan</th><th>Jenis</th><th class="r">Nominal</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr><td>${d(t.tgl)}</td><td>${esc(t.cabang)}</td><td>${esc(t.nama_pelanggan)}</td><td><span class="badge ${t.jenis==='Diberikan'?'badge-out':'badge-in'}">${t.jenis}</span></td><td class="r">${R(t.nominal)}</td><td><button class="row-del" onclick="hapusTrx('cashbon',${t.id})">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">🏷️</div><strong>Belum ada cashbon.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fCashbon').onsubmit = async e => {
      e.preventDefault();
      try {
        await apiPost('/transaksi/cashbon', { tgl: document.getElementById('cb_tgl').value, cabang: document.getElementById('cb_cab').value, nama_pelanggan: document.getElementById('cb_nama').value.trim(), jenis: document.getElementById('cb_jenis').value, nominal: Number(document.getElementById('cb_nom').value) });
        toast('Cashbon disimpan'); await renderCashbon();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── TRANSAKSI: BIAYA ─────────────────────────────────────────────────── */
async function renderBiaya() {
  const el = document.getElementById('tx-biaya');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/transaksi/biaya' + q);
    const list = res.data || [];
    const total = list.reduce((s, t) => s + Number(t.nominal), 0);
    const akunBeban = STATE.coa.filter(c => c.kat === 'Beban');
    el.innerHTML = `
      ${exportBar('tblBiaya', 'data-pengeluaran', 'tx-biaya', 'Data Pengeluaran')}
      <div class="box"><div class="box-hd"><h3>Input Pengeluaran</h3></div><div class="box-bd">
        <form id="fBiaya">
          <div class="fgrid">
            <div class="fgroup"><label class="flabel">Tanggal</label><input class="finput" type="date" id="bx_tgl" value="${today()}" required></div>
            <div class="fgroup"><label class="flabel">Cabang</label><select class="fselect" id="bx_cab" required>${cabangOpts()}</select></div>
            <div class="fgroup"><label class="flabel">Kategori Biaya</label><select class="fselect" id="bx_akun" required>${akunBeban.map(c => `<option value="${esc(c.kode)}">${esc(c.nama)}</option>`).join('')}</select></div>
            <div class="fgroup"><label class="flabel">Nominal</label><input class="finput" type="number" id="bx_nom" min="0" required></div>
            <div class="fgroup"><label class="flabel">Dibayar dari</label><select class="fselect" id="bx_bayar"><option>Kas</option><option>Bank</option></select></div>
            <div class="fgroup"><label class="flabel">Keterangan</label><input class="finput" id="bx_ket" placeholder="Opsional"></div>
          </div>
          <button class="btn btn-p" type="submit">+ Simpan Pengeluaran</button>
        </form>
      </div></div>
      <div class="box"><div class="box-hd"><h3>Daftar Pengeluaran</h3><div class="meta">${list.length} transaksi · Total: <strong>${R(total)}</strong></div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblBiaya"><thead><tr><th>Tanggal</th><th>Cabang</th><th>Kategori</th><th>Keterangan</th><th class="r">Nominal</th><th>Dari</th><th></th></tr></thead><tbody>
            ${list.map(t => `<tr><td>${d(t.tgl)}</td><td>${esc(t.cabang)}</td><td>${esc(t.nama_akun||t.kode_akun)}</td><td>${esc(t.keterangan||'–')}</td><td class="r laba-neg">${R(t.nominal)}</td><td>${t.bayar}</td><td><button class="row-del" onclick="hapusTrx('biaya',${t.id})">✕</button></td></tr>`).join('')}</tbody></table>` : '<div class="empty"><div class="ico">💸</div><strong>Belum ada pengeluaran.</strong></div>'}
        </div>
      </div>`;
    document.getElementById('fBiaya').onsubmit = async e => {
      e.preventDefault();
      try {
        await apiPost('/transaksi/biaya', { tgl: document.getElementById('bx_tgl').value, cabang: document.getElementById('bx_cab').value, kode_akun: document.getElementById('bx_akun').value, nominal: Number(document.getElementById('bx_nom').value), bayar: document.getElementById('bx_bayar').value, keterangan: document.getElementById('bx_ket').value.trim() });
        toast('Pengeluaran disimpan'); await renderBiaya();
      } catch (e) { toast(e.message, 'err'); }
    };
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── JURNAL ───────────────────────────────────────────────────────────── */
async function renderJurnalUmum() {
  const el = document.getElementById('jr-umum');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/laporan/jurnal' + q);
    const list = res.data || [];
    el.innerHTML = `
      ${exportBar('tblJurnal', 'jurnal-umum', 'jr-umum', 'Jurnal Umum')}
      <div class="note note-b"><span class="note-ico">ℹ️</span><span>Jurnal dihasilkan <strong>otomatis</strong> dari seluruh transaksi — double-entry bookkeeping.</span></div>
      <div class="box"><div class="box-hd"><h3>Jurnal Umum</h3><div class="meta">${list.length} entri · ${cab||'Semua cabang'}</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblJurnal"><thead><tr><th>Tanggal</th><th>Referensi</th><th>Akun</th><th>Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th></tr></thead>
            <tbody>${list.map(x => `<tr>
              <td>${d(x.tgl)}</td>
              <td style="font-family:var(--F-m);font-size:12px;">${esc(x.ref)}</td>
              <td><span style="font-family:var(--F-m);font-size:12px;color:var(--ink3);">${x.akun}</span> ${esc(x.nama_akun||x.akun)}</td>
              <td style="font-size:12.5px;">${esc(x.ket)}</td>
              <td class="r laba-pos">${x.D ? R(x.D) : ''}</td>
              <td class="r laba-neg">${x.K ? R(x.K) : ''}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="4">Total</td><td>${R(res.total_D)}</td><td>${R(res.total_K)}</td></tr></tfoot>
          </table>
          <div style="padding:10px 14px;font-size:12px;color:${res.seimbang?'var(--grn)':'var(--red)'};">
            ${res.seimbang ? '✓ Jurnal seimbang.' : '⚠️ Debit ≠ Kredit. Periksa data.'}
          </div>` : '<div class="empty"><div class="ico">📓</div><strong>Belum ada jurnal.</strong></div>'}
        </div>
      </div>`;
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

async function renderBukuBesar() {
  const el = document.getElementById('jr-besar');
  const coaOpts = STATE.coa.map(c => `<option value="${esc(c.kode)}">${c.kode} – ${esc(c.nama)}</option>`).join('');
  el.innerHTML = `
    <div class="box">
      <div class="box-hd"><h3>Buku Besar per Akun</h3>
        <select class="fselect" id="bbAkun" style="max-width:280px;">${coaOpts}</select>
      </div>
      <div style="padding:8px 16px;" class="no-print">
        <button class="btn btn-g btn-sm" onclick="exportTableExcel('tblBB','buku-besar')">📊 Export Excel</button>
        <button class="btn btn-g btn-sm" onclick="printSection('jr-besar','Buku Besar')">🖨️ Print</button>
      </div>
      <div class="box-bd pad0 tscroll" id="bbArea"><div class="loading-state"><div class="loading-spinner"></div></div></div>
    </div>`;
  async function drawBB() {
    const kode = document.getElementById('bbAkun').value;
    const cab = getCabang();
    let q = `?kode_akun=${encodeURIComponent(kode)}`;
    if (cab) q += `&cabang=${encodeURIComponent(cab)}`;
    const res = await apiGet('/laporan/buku-besar' + q);
    const list = res.data || [];
    document.getElementById('bbArea').innerHTML = list.length
      ? `<table id="tblBB"><thead><tr><th>Tanggal</th><th>Ref</th><th>Keterangan</th><th class="r">Debit</th><th class="r">Kredit</th><th class="r">Saldo</th></tr></thead>
          <tbody>${list.map(x => `<tr><td>${d(x.tgl)}</td><td style="font-family:var(--F-m);font-size:12px;">${x.ref}</td><td>${esc(x.ket)}</td><td class="r laba-pos">${x.D ? R(x.D) : ''}</td><td class="r laba-neg">${x.K ? R(x.K) : ''}</td><td class="r" style="font-weight:600;">${R(x.saldo)}</td></tr>`).join('')}</tbody>
          <tfoot><tr><td colspan="5">Saldo Akhir – ${esc(res.akun?.nama||kode)}</td><td>${R(res.saldo_akhir)}</td></tr></tfoot>
        </table>`
      : '<div class="empty"><div class="ico">📒</div><strong>Belum ada mutasi.</strong></div>';
  }
  document.getElementById('bbAkun').addEventListener('change', drawBB);
  drawBB();
}

/* ── LAPORAN ──────────────────────────────────────────────────────────── */
function lapExportBar(elId, title, tblId) {
  return `<div class="export-bar no-print"><span class="lbl">Export:</span>
    <button class="btn btn-g btn-sm" onclick="exportTableExcel('${tblId}','${title.replace(/\s/g,'-').toLowerCase()}')">📊 Excel</button>
    <button class="btn btn-blue btn-sm" onclick="printSection('${elId}','${title}')">📄 PDF / Print</button>
  </div>`;
}

async function renderNeracaSaldo() {
  const el = document.getElementById('lp-saldo');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/laporan/neraca-saldo' + q);
    const list = res.data || [];
    el.innerHTML = `
      ${lapExportBar('lp-saldo', 'Neraca Saldo', 'tblNS')}
      <div class="box"><div class="box-hd"><h3>Neraca Saldo</h3><div class="meta">${cab||'Semua cabang'}</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblNS"><thead><tr><th>Kode</th><th>Nama Akun</th><th class="r">Debit</th><th class="r">Kredit</th></tr></thead>
            <tbody>${list.map(r => `<tr><td style="font-family:var(--F-m);font-size:12px;color:var(--ink3);">${r.kode}</td><td>${esc(r.nama)}</td><td class="r">${r.D ? R(r.D) : ''}</td><td class="r">${r.K ? R(r.K) : ''}</td></tr>`).join('')}</tbody>
            <tfoot><tr><td colspan="2">Total</td><td>${R(res.total_D)}</td><td>${R(res.total_K)}</td></tr></tfoot>
          </table>
          <div style="padding:12px 14px;">${res.seimbang ? `<div class="note note-g"><span>✓</span> Neraca saldo seimbang — ${R(res.total_D)}</div>` : `<div class="note note-y"><span>⚠️</span> Debit (${R(res.total_D)}) ≠ Kredit (${R(res.total_K)})</div>`}</div>
          ` : '<div class="empty"><div class="ico">⚖️</div><strong>Belum ada data.</strong></div>'}
        </div>
      </div>`;
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

async function renderLabaRugi() {
  const el = document.getElementById('lp-labarugi');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const r = await apiGet('/laporan/laba-rugi' + q);
    el.innerHTML = `
      ${lapExportBar('lp-labarugi', 'Laporan Laba Rugi', 'tblLR')}
      <div class="box"><div class="box-hd"><h3 style="font-family:var(--F-d);">Laporan Laba Rugi</h3><div class="meta">${cab||'Semua cabang'} — kumulatif</div></div>
        <div class="box-bd pad0 tscroll"><table id="tblLR"><tbody>
          <tr style="background:var(--kertas);"><td colspan="2" style="font-weight:700;padding:12px 14px;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:var(--daun);">Pendapatan</td></tr>
          ${(r.pendapatan_detail||[]).map(p => `<tr><td style="padding-left:28px;">${esc(p.nama)}</td><td class="r">${R(p.nilai)}</td></tr>`).join('')}
          <tr style="background:rgba(26,92,56,.04);font-weight:700;"><td style="padding:12px 14px;">Total Pendapatan (DPP)</td><td class="r">${R(r.pendapatan)}</td></tr>
          <tr><td style="padding-left:28px;">Harga Pokok Penjualan (HPP)</td><td class="r">(${R(r.hpp)})</td></tr>
          <tr style="background:rgba(26,92,56,.04);font-weight:700;"><td style="padding:12px 14px;">Laba Kotor</td><td class="r laba-pos">${R(r.laba_kotor)}</td></tr>
          <tr style="background:var(--kertas);"><td colspan="2" style="font-weight:700;padding:12px 14px;text-transform:uppercase;font-size:11px;letter-spacing:.06em;color:var(--daun);">Biaya Operasional</td></tr>
          ${(r.beban_detail||[]).map(b => `<tr><td style="padding-left:28px;">${esc(b.nama)}</td><td class="r">(${R(b.nilai)})</td></tr>`).join('')}
          <tr style="background:rgba(26,92,56,.04);font-weight:700;"><td style="padding:12px 14px;">Total Biaya Operasional</td><td class="r laba-neg">(${R(r.beban)})</td></tr>
        </tbody><tfoot><tr><td>Laba Bersih</td><td class="${r.laba_bersih>=0?'laba-pos':'laba-neg'}">${R(r.laba_bersih)}</td></tr></tfoot></table>
      </div></div>`;
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

async function renderNeraca() {
  const el = document.getElementById('lp-neraca');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const r = await apiGet('/laporan/neraca' + q);
    el.innerHTML = `
      ${lapExportBar('lp-neraca', 'Neraca', 'tblNeraca')}
      <div class="box"><div class="box-hd"><h3 style="font-family:var(--F-d);">Neraca (Balance Sheet)</h3><div class="meta">${cab||'Semua cabang'}</div></div>
        <div class="box-bd pad0 tscroll"><table id="tblNeraca"><tbody>
          <tr style="background:var(--kertas);"><td colspan="2" style="font-weight:700;padding:12px 14px;border-top:2px solid var(--brd);text-transform:uppercase;font-size:11px;color:var(--daun);">ASET</td></tr>
          ${(r.aset||[]).map(x => `<tr><td style="padding-left:28px;">${esc(x.nama)}</td><td class="r">${R(x.nilai)}</td></tr>`).join('')}
          <tr style="background:rgba(26,92,56,.04);font-weight:700;"><td style="padding:12px 14px;">Total Aset</td><td class="r">${R(r.total_aset)}</td></tr>
          <tr><td colspan="2" style="height:6px;"></td></tr>
          <tr style="background:var(--kertas);"><td colspan="2" style="font-weight:700;padding:12px 14px;border-top:2px solid var(--brd);text-transform:uppercase;font-size:11px;color:var(--daun);">LIABILITAS</td></tr>
          ${(r.liabilitas||[]).map(x => `<tr><td style="padding-left:28px;">${esc(x.nama)}</td><td class="r">${R(x.nilai)}</td></tr>`).join('')}
          <tr style="background:rgba(26,92,56,.04);font-weight:700;"><td style="padding:12px 14px;">Total Liabilitas</td><td class="r">${R(r.total_liabilitas)}</td></tr>
          <tr><td colspan="2" style="height:6px;"></td></tr>
          <tr style="background:var(--kertas);"><td colspan="2" style="font-weight:700;padding:12px 14px;border-top:2px solid var(--brd);text-transform:uppercase;font-size:11px;color:var(--daun);">MODAL</td></tr>
          ${(r.modal||[]).map(x => `<tr><td style="padding-left:28px;">${esc(x.nama)}</td><td class="r">${R(x.nilai)}</td></tr>`).join('')}
          <tr><td style="padding-left:28px;">Laba Tahun Berjalan</td><td class="r ${r.laba_berjalan>=0?'laba-pos':'laba-neg'}">${R(r.laba_berjalan)}</td></tr>
          <tr style="background:rgba(26,92,56,.04);font-weight:700;"><td style="padding:12px 14px;">Total Modal</td><td class="r">${R(r.total_modal)}</td></tr>
        </tbody></table>
        <div style="padding:12px 14px;">${r.seimbang ? `<div class="note note-g"><span>✓</span> Neraca seimbang — ${R(r.total_aset)}</div>` : `<div class="note note-y"><span>⚠️</span> Neraca belum seimbang.</div>`}</div>
      </div></div>`;
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

async function renderRekapPPN() {
  const el = document.getElementById('lp-ppn');
  el.innerHTML = loadingHTML;
  try {
    const cab = getCabang();
    const q = cab ? `?cabang=${encodeURIComponent(cab)}` : '';
    const res = await apiGet('/laporan/rekap-ppn' + q);
    const list = res.data || [];
    const totK = list.reduce((s, r) => s + r.ppn_keluaran, 0);
    const totM = list.reduce((s, r) => s + r.ppn_masukan, 0);
    el.innerHTML = `
      ${lapExportBar('lp-ppn', 'Rekap PPN', 'tblPPN')}
      <div class="note note-b"><span class="note-ico">ℹ️</span><span>Rekap dari barang "Kena PPN", tarif <strong>${res.tarif}%</strong>. Gunakan sebagai dasar pengisian template DJP (Coretax).</span></div>
      <div class="box"><div class="box-hd"><h3>Rekap PPN per Bulan</h3><div class="meta">${cab||'Semua cabang'} · Tarif ${res.tarif}%</div></div>
        <div class="box-bd pad0 tscroll">
          ${list.length ? `<table id="tblPPN"><thead><tr><th>Bulan</th><th class="r">DPP Penjualan</th><th class="r">PPN Keluaran</th><th class="r">DPP Pembelian</th><th class="r">PPN Masukan</th><th class="r">Kurang/(Lebih) Bayar</th></tr></thead>
            <tbody>${list.map(r => `<tr>
              <td style="font-weight:600;">${monthLabel(r.bulan)||r.bulan}</td>
              <td class="r">${R(r.dpp_jual)}</td>
              <td class="r laba-neg">${R(r.ppn_keluaran)}</td>
              <td class="r">${R(r.dpp_beli)}</td>
              <td class="r laba-pos">${R(r.ppn_masukan)}</td>
              <td class="r" style="font-weight:700;color:${r.kurang_bayar>0?'var(--red)':'var(--grn)'};">${R(r.kurang_bayar)}</td>
            </tr>`).join('')}</tbody>
            <tfoot><tr><td>Total</td><td></td><td>${R(totK)}</td><td></td><td>${R(totM)}</td><td>${R(totK-totM)}</td></tr></tfoot>
          </table>` : '<div class="empty"><div class="ico">🧾</div><strong>Belum ada transaksi PPN.</strong></div>'}
        </div>
      </div>`;
  } catch (e) { el.innerHTML = `<div class="note note-y"><span>⚠️</span>${esc(e.message)}</div>`; }
}

/* ── SETTINGS ─────────────────────────────────────────────────────────── */
document.getElementById('btnEditTarif').addEventListener('click', () => {
  openM(`<div class="mhd"><h3>⚙️ Pengaturan Tarif PPN</h3><button class="mclose" onclick="closeM()">×</button></div>
    <div class="mbd">
      <div class="fgroup"><label class="flabel">Tarif PPN (%)</label><input class="finput" type="number" id="settingTarif" min="0" max="100" step="0.5" value="${STATE.tarif}"></div>
    </div>
    <div class="mft">
      <button class="btn btn-g" onclick="closeM()">Batal</button>
      <button class="btn btn-p" onclick="saveTarif()">Simpan</button>
    </div>`);
});
window.saveTarif = async () => {
  const tarif = Number(document.getElementById('settingTarif').value);
  try {
    await apiPut('/master/settings', { tarif_ppn: tarif });
    STATE.tarif = tarif;
    document.getElementById('tarifBadge').textContent = tarif + '%';
    closeM(); toast('Tarif PPN diperbarui menjadi ' + tarif + '%');
  } catch (e) { toast(e.message, 'err'); }
};

document.getElementById('btnExportAll').addEventListener('click', async () => {
  toast('Mengekspor data…', 'y');
  // Export all tables we can grab
  const tables = document.querySelectorAll('table[id]');
  if (!tables.length) { toast('Buka halaman data terlebih dahulu', 'err'); return; }
  exportTableExcel(tables[0].id, 'tokosumini-export');
});

/* ── LOAD MASTER DATA ─────────────────────────────────────────────────── */
async function loadMasterData() {
  try {
    const [cabang, coa, barang, jasa, settings] = await Promise.all([
      apiGet('/master/cabang'),
      apiGet('/master/coa'),
      apiGet('/master/barang/all'),
      apiGet('/master/jasa'),
      apiGet('/master/settings'),
    ]);
    STATE.cabang = Array.isArray(cabang) ? cabang : (cabang.data || []);
    STATE.coa    = Array.isArray(coa) ? coa : (coa.data || []);
    STATE.barang = Array.isArray(barang) ? barang : (barang.data || []);
    STATE.jasa   = Array.isArray(jasa) ? jasa : (jasa.data || []);
    STATE.tarif  = settings.tarif_ppn || 11;
    document.getElementById('tarifBadge').textContent = STATE.tarif + '%';

    // Populate cabang dropdown
    const sel = document.getElementById('gCabang');
    const cur = sel.value;
    sel.innerHTML = '<option value="">Semua Cabang</option>' + STATE.cabang.map(c => `<option value="${esc(c.nama)}">${esc(c.nama)}</option>`).join('');
    if (STATE.cabang.some(c => c.nama === cur)) sel.value = cur;

    setConnStatus(true, 'Terhubung ke server');
    return true;
  } catch (e) {
    setConnStatus(false, 'Gagal terhubung');
    return false;
  }
}

/* ── INIT ─────────────────────────────────────────────────────────────── */
document.getElementById('todayLabel').textContent = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

(async () => {
  // Splash loading animation
  await new Promise(r => setTimeout(r, 1800));
  const ok = await loadMasterData();
  document.getElementById('splash').classList.add('out');
  setTimeout(() => {
    document.getElementById('splash').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    setTab('dashboard');
    if (!ok) {
      toast('Tidak dapat terhubung ke API. Pastikan server Laravel berjalan: php artisan serve', 'err');
    }
  }, 650);
})();
