/* =============================================================
   slipgaji.js — Cetak Slip Gaji Karyawan (format struk 80mm)
   Dipanggil dari tabel Riwayat Pembayaran Gaji (master.js).
   Membuka jendela terpisah mirip struk kasir, dengan 2 aksi:
     - Cetak Langsung  -> window.print() browser (pilih printer)
     - Simpan PDF      -> file PDF diunduh langsung (html2pdf.js)
   ============================================================= */

function fmtTglSlip(d) {
    if (!d) return '-';
    const dt = new Date(d);
    const bln = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    return `${String(dt.getDate()).padStart(2,'0')} ${bln[dt.getMonth()]} ${dt.getFullYear()}`;
}

function rpSlip(n) {
    return Number(n||0).toLocaleString('id-ID');
}

window.cetakSlipGaji = function(gajiId) {
    const list = window._gajiListCache || [];
    const g = list.find(x => x.id === gajiId);
    if (!g) { toast('Data gaji tidak ditemukan, muat ulang halaman Penggajian.', 'err'); return; }

    const isHarian = g.tipe_gaji === 'Harian';
    const pokokBaris = isHarian
        ? `<div class="row"><span>Tarif Harian</span><span>${rpSlip(g.gaji_pokok)}</span></div>
           <div class="row"><span>Hari Hadir</span><span>x ${g.hari_hadir}</span></div>
           <div class="row sub"><span>Subtotal Pokok</span><span>${rpSlip(g.gaji_pokok * g.hari_hadir)}</span></div>`
        : `<div class="row"><span>Gaji Pokok</span><span>${rpSlip(g.gaji_pokok)}</span></div>`;

    const cabang   = g.cabang || '-';
    const noSlip   = 'SG' + String(g.id).padStart(6,'0');
    const namaFile = `Slip-Gaji-${(g.nama_karyawan||'karyawan').replace(/[^a-z0-9]+/gi,'-')}-${g.periode_selesai||''}`;

    const pw = window.open('', '_blank', 'width=460,height=720');
    if (!pw) { toast('Popup diblokir browser. Izinkan popup untuk cetak slip.', 'err'); return; }

    pw.document.write(`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<title>Slip Gaji - ${g.nama_karyawan}</title>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js"><\/script>
<style>
  @page { size: 80mm auto; margin: 0; }
  * { box-sizing: border-box; }
  html, body {
    background:#e9ebef; margin:0; padding:0;
    font-family: 'Courier New', 'Consolas', monospace;
  }

  /* ── Toolbar aksi (tidak ikut ke-print / ke-PDF) ───────────── */
  .toolbar {
    position: sticky; top:0; z-index:10;
    display:flex; gap:8px; justify-content:center;
    padding:12px; background:#1f2430; box-shadow:0 2px 8px rgba(0,0,0,.25);
  }
  .toolbar button {
    flex:1; max-width:170px; cursor:pointer; border:none; border-radius:8px;
    padding:11px 10px; font-family:'Plus Jakarta Sans',Arial,sans-serif;
    font-size:13px; font-weight:700; display:flex; align-items:center;
    justify-content:center; gap:6px; transition:transform .12s, opacity .12s;
  }
  .toolbar button:active { transform:scale(.96); }
  .btn-print { background:#3b82f6; color:#fff; }
  .btn-pdf   { background:#16a34a; color:#fff; }
  .btn-pdf[disabled] { opacity:.6; cursor:wait; }

  /* ── Struk ──────────────────────────────────────────────────── */
  .sheet-wrap { display:flex; justify-content:center; padding:18px 10px 34px; }
  #struk {
    width:76mm; background:#fff; padding:5mm 4mm 7mm;
    font-size:11.5px; line-height:1.55; color:#111;
    box-shadow:0 6px 22px rgba(0,0,0,.18);
    position:relative; overflow:hidden;
  }
  #struk::before, #struk::after {
    content:""; position:absolute; left:0; right:0; height:6px;
    background:
      radial-gradient(circle at 4px 3px, #e9ebef 3px, transparent 3.5px) repeat-x;
    background-size:12px 6px;
  }
  #struk::before { top:0; }
  #struk::after  { bottom:0; transform:rotate(180deg); }

  .center { text-align:center; }
  .bold { font-weight:700; }
  .brand { font-size:16px; letter-spacing:1px; }
  .tag { font-size:9.5px; letter-spacing:2px; color:#444; font-weight:600; margin-top:1px; }
  .addr { font-size:10px; color:#333; font-weight:600; margin-top:2px; }

  .divider { border-top:1px dashed #999; margin:7px 0; }
  .divider.solid { border-top:1.5px solid #111; }

  .doctitle {
    text-align:center; font-weight:700; font-size:12.5px;
    letter-spacing:1.5px; margin:2px 0;
  }
  .noslip { text-align:center; font-size:10px; color:#555; font-weight:600; margin-top:-2px; margin-bottom:4px; }

  .row { display:flex; justify-content:space-between; gap:6px; padding:1px 0; font-weight:700; }
  .row.sub { border-top:1px dashed #bbb; margin-top:3px; padding-top:3px; }
  .row span:first-child { color:#111; }
  .row span:last-child { text-align:right; white-space:nowrap; font-weight:700; color:#111; }

  .section-lbl {
    font-size:9.5px; font-weight:700; letter-spacing:1px; color:#555;
    margin:8px 0 3px;
  }

  .total-box {
    margin:8px 0 2px; padding:7px 6px; border-radius:6px;
    background:repeating-linear-gradient(135deg,#f7f7f4,#f7f7f4 6px,#f0f0eb 6px,#f0f0eb 12px);
    border-top:1.5px solid #111; border-bottom:3px double #111;
  }
  .total-box .row { font-weight:800; font-size:14px; }
  .total-box .row span:first-child { color:#111; letter-spacing:.5px; }

  .stamp {
    position:absolute; top:38%; left:50%; transform:translate(-50%,-50%) rotate(-18deg);
    font-size:34px; font-weight:800; color:rgba(22,163,74,.10);
    border:4px solid rgba(22,163,74,.10); border-radius:10px;
    padding:2px 14px; letter-spacing:3px; pointer-events:none;
  }

  .ttd { display:flex; justify-content:space-between; margin-top:30px; text-align:center; font-size:10.5px; font-weight:600; }
  .ttd div { width:46%; }
  .ttd .garis { margin-top:32px; border-top:1px solid #111; padding-top:3px; }

  .footnote { font-size:9.5px; color:#333; font-weight:600; margin-top:10px; }
  .footnote.center { text-align:center; }
  .thanks { text-align:center; font-size:10.5px; font-weight:700; margin-top:10px; letter-spacing:.5px; }

  @media print {
    .toolbar { display:none !important; }
    html, body { background:#fff; }
    .sheet-wrap { padding:0; }
    #struk { box-shadow:none; width:100%; }
    /* Printer thermal sering "menghilangkan" teks tipis (font-weight
       normal / abu-abu terang) — paksa semua teks jadi hitam pekat &
       agak tebal supaya pasti kelihatan di hasil cetak. */
    #struk, #struk * { color:#000 !important; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
    #struk { font-weight:600; }
    #struk .row, #struk .row span, #struk .footnote, #struk .noslip, #struk .tag, #struk .addr, #struk .section-lbl { font-weight:700 !important; }
    #struk .stamp { color:rgba(22,163,74,.35) !important; border-color:rgba(22,163,74,.35) !important; }
  }
</style>
</head>
<body>

  <div class="toolbar no-print">
    <button class="btn-print" onclick="window.print()">🖨️ Cetak Langsung</button>
    <button class="btn-pdf" id="btnPdf">⬇️ Simpan PDF</button>
  </div>

  <div class="sheet-wrap">
  <div id="struk">
    <div class="stamp">LUNAS</div>

    <div class="center bold brand">TOKO SUMINI</div>
    <div class="center tag">SISTEM AKUNTANSI MULTI-CABANG</div>
    <div class="center addr">Bacin RT 008 RW 001 Bae Kudus</div>

    <div class="divider solid"></div>
    <div class="doctitle">SLIP GAJI KARYAWAN</div>
    <div class="noslip">No. ${noSlip}</div>
    <div class="divider"></div>

    <div class="row"><span>Kode</span><span>${g.kode_karyawan || '-'}</span></div>
    <div class="row"><span>Nama</span><span>${g.nama_karyawan}</span></div>
    <div class="row"><span>Jabatan</span><span>${g.jabatan || '-'}</span></div>
    <div class="row"><span>Cabang</span><span>${cabang}</span></div>
    <div class="row"><span>Tipe Gaji</span><span>${g.tipe_gaji}</span></div>
    <div class="row"><span>Periode</span><span>${fmtTglSlip(g.periode_mulai)} s/d</span></div>
    <div class="row"><span></span><span>${fmtTglSlip(g.periode_selesai)}</span></div>

    <div class="section-lbl">REKAP KEHADIRAN</div>
    <div class="divider"></div>
    <div class="row"><span>Hari Hadir</span><span>${g.hari_hadir} hari</span></div>
    <div class="row"><span>Hari Izin/Sakit</span><span>${g.hari_izin} hari</span></div>
    <div class="row"><span>Hari Alpha</span><span>${g.hari_alpha} hari</span></div>

    <div class="section-lbl">RINCIAN GAJI</div>
    <div class="divider"></div>
    ${pokokBaris}
    <div class="row"><span>Tunjangan</span><span>${rpSlip(g.tunjangan)}</span></div>
    <div class="row"><span>Bonus</span><span>+${rpSlip(g.bonus)}</span></div>
    <div class="row"><span>Potongan</span><span>-${rpSlip(g.potongan)}</span></div>
    ${g.potongan_kasbon > 0 ? `<div class="row"><span>Potongan Kasbon</span><span>-${rpSlip(g.potongan_kasbon)}</span></div>` : ''}

    <div class="total-box">
      <div class="row"><span>TOTAL DITERIMA</span><span>Rp ${rpSlip(g.total)}</span></div>
    </div>

    ${g.keterangan ? `<div class="footnote">Ket: ${g.keterangan}</div>` : ''}
    <div class="footnote center">Dicetak: ${new Date().toLocaleString('id-ID')}</div>

    <div class="ttd">
      <div><div class="garis">Karyawan</div></div>
      <div><div class="garis">Admin / Kasir</div></div>
    </div>

    <div class="thanks">— Terima kasih atas kerja kerasnya —</div>
  </div>
  </div>

  <script>
    document.getElementById('btnPdf').onclick = function () {
      const btn = this;
      btn.disabled = true;
      btn.textContent = '⏳ Menyiapkan PDF…';
      const el = document.getElementById('struk');
      html2pdf().set({
        margin: 0,
        filename: '${namaFile}.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 3, useCORS: true, backgroundColor: '#ffffff' },
        jsPDF: { unit: 'mm', format: [80, el.scrollHeight * 0.2646 + 6], orientation: 'portrait' }
      }).from(el).save().then(() => {
        btn.disabled = false;
        btn.innerHTML = '⬇️ Simpan PDF';
      }).catch(() => {
        btn.disabled = false;
        btn.innerHTML = '⬇️ Simpan PDF';
        alert('Gagal membuat PDF, coba lagi.');
      });
    };
  <\/script>
</body>
</html>`);
    pw.document.close();
    toast('Membuka jendela slip gaji…', 'y');
};
