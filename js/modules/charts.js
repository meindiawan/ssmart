/* =============================================================
   charts.js — Canvas Chart Renderer (Bar & Line)
   Menggambar grafik dengan HTML5 Canvas (tanpa library external)
   ============================================================= */

/* ── BAR CHART ────────────────────────────────────────────── */

/**
 * Gambar bar chart di canvas element
 * @param {string}   canvasId - ID element canvas
 * @param {string[]} labels   - Label sumbu X
 * @param {number[]} values   - Nilai tiap bar
 * @param {string}   color    - Warna bar (hex), default hijau toko
 */
function drawBarCanvas(canvasId, labels, values, color = '#1A5C38') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width  = canvas.offsetWidth  || 400;
    canvas.height = canvas.offsetHeight || 180;

    const W   = canvas.width, H = canvas.height;
    const pad = { t: 10, r: 10, b: 42, l: 64 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);
    if (!values.length) return;

    const maxV = Math.max(...values, 1);
    const barW = cW / values.length * 0.6;
    const gap  = cW / values.length * 0.4;

    // Grid lines + Y labels
    ctx.strokeStyle = 'rgba(0,0,0,.06)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
        const y = pad.t + cH - (cH / 4 * i);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
        ctx.fillStyle  = 'rgba(0,0,0,.4)';
        ctx.font       = '9px Plus Jakarta Sans, sans-serif';
        ctx.textAlign  = 'right';
        ctx.fillText(R(maxV / 4 * i).replace('Rp ', ''), pad.l - 5, y + 3);
    }

    // Bars
    values.forEach((v, i) => {
        const x  = pad.l + i * (barW + gap) + gap / 2;
        const bH = Math.max(2, v / maxV * cH);
        const y  = pad.t + cH - bH;

        const grad = ctx.createLinearGradient(0, y, 0, y + bH);
        grad.addColorStop(0, color);
        grad.addColorStop(1, color + '88');

        ctx.fillStyle = grad;
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(x, y, barW, bH, [4, 4, 0, 0]);
        } else {
            ctx.rect(x, y, barW, bH);
        }
        ctx.fill();

        // X label
        ctx.fillStyle = 'rgba(0,0,0,.5)';
        ctx.font      = '9px Plus Jakarta Sans, sans-serif';
        ctx.textAlign = 'center';
        const lbl = String(labels[i] || '');
        ctx.fillText(lbl.length > 7 ? lbl.slice(0, 6) + '…' : lbl, x + barW / 2, H - pad.b + 14);
    });
}

/* ── LINE CHART ───────────────────────────────────────────── */

/**
 * Gambar line chart dengan area fill di canvas element
 * @param {string}   canvasId - ID element canvas
 * @param {string[]} labels   - Label sumbu X
 * @param {number[]} values   - Nilai tiap titik
 * @param {string}   color    - Warna line (hex), default hijau toko
 */
function drawLineCanvas(canvasId, labels, values, color = '#1A5C38') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width  = canvas.offsetWidth  || 400;
    canvas.height = canvas.offsetHeight || 160;

    const W   = canvas.width, H = canvas.height;
    const pad = { t: 10, r: 10, b: 38, l: 64 };
    const cW  = W - pad.l - pad.r;
    const cH  = H - pad.t - pad.b;

    ctx.clearRect(0, 0, W, H);
    if (!values.length || values.every(v => v === 0)) return;

    // Nilai bisa negatif (laba bersih); pakai range
    const minV  = Math.min(...values, 0);
    const maxV  = Math.max(...values, 1);
    const range = maxV - minV || 1;
    const step  = cW / (values.length - 1 || 1);

    // Posisi Y untuk nilai v
    const yOf = v => pad.t + cH - ((v - minV) / range * cH);

    // Grid lines + Y labels
    ctx.strokeStyle = 'rgba(0,0,0,.06)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= 4; i++) {
        const val = minV + (range / 4 * i);
        const y   = yOf(val);
        ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + cW, y); ctx.stroke();
        ctx.fillStyle  = 'rgba(0,0,0,.4)';
        ctx.font       = '9px Plus Jakarta Sans, sans-serif';
        ctx.textAlign  = 'right';
        ctx.fillText(R(val).replace('Rp ', ''), pad.l - 5, y + 3);
    }

    // Garis nol (jika ada nilai negatif)
    if (minV < 0) {
        const y0 = yOf(0);
        ctx.strokeStyle = 'rgba(192,57,43,.3)';
        ctx.setLineDash([4, 3]);
        ctx.beginPath(); ctx.moveTo(pad.l, y0); ctx.lineTo(pad.l + cW, y0); ctx.stroke();
        ctx.setLineDash([]);
    }

    // Area fill di bawah line
    const grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + cH);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, color + '05');

    ctx.beginPath();
    ctx.moveTo(pad.l, yOf(0));
    values.forEach((v, i) => ctx.lineTo(pad.l + i * step, yOf(v)));
    ctx.lineTo(pad.l + (values.length - 1) * step, yOf(0));
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Line
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    values.forEach((v, i) => {
        const x = pad.l + i * step, y = yOf(v);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Titik data
    values.forEach((v, i) => {
        const x = pad.l + i * step, y = yOf(v);
        ctx.beginPath();
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle   = '#fff';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth   = 2;
        ctx.stroke();
    });

    // X labels
    ctx.fillStyle  = 'rgba(0,0,0,.45)';
    ctx.font       = '9px Plus Jakarta Sans, sans-serif';
    ctx.textAlign  = 'center';
    labels.forEach((l, i) =>
        ctx.fillText(l, pad.l + i * step, H - pad.b + 14)
    );
}
