/* =============================================================
   dashboard.js — Render Dashboard
   Data dari: GET /api/dashboard?cabang=...
   Konten yang dirender ke #dashWrap:
     1. Hero banner + 4 KPI card
     2. Line chart penjualan 6 bulan
     3. Top 3 barang bulan ini
     4. Bar chart penjualan per cabang
     5. Progress bar komposisi L/R
     6. Tabel 10 aktivitas terbaru
   ============================================================= */

async function renderDashboard() {
    const el = document.getElementById('dashWrap');
    el.innerHTML = loadingHTML;

    const cab = getCabang();
    const q   = buildQuery({ cabang: cab });

    try {
        const data = await apiGet('/dashboard' + q);
        const kpi    = data.kpi       || {};
        const top3   = (data.top_barang  || []).slice(0, 3);
        const recent = data.recent       || [];
        const m6     = data.chart_6bln   || [];
        const cabSls = data.cabang_sales || [];
        const maxTop = top3[0]?.total_omzet || 1;
        const selisih = kpi.pct_change;

        el.innerHTML = `
        <!-- Hero Banner -->
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
                        <button class="btn btn-sm" onclick="printSection('tab-dashboard','Dashboard')"
                            style="background:rgba(200,151,58,.8);color:var(--tinta);font-size:11.5px;">🖨️ Print</button>
                    </div>
                </div>
            </div>

            <!-- 4 KPI Card -->
            <div class="dash-kpi-row">
                <div class="dash-kpi">
                    <div class="dash-kpi-label">Kas &amp; Bank</div>
                    <div class="dash-kpi-val gold">${R(kpi.kas_bank)}</div>
                    <div class="dash-kpi-sub">Kas ${R(kpi.kas)} · Bank ${R(kpi.bank)}</div>
                </div>
                <div class="dash-kpi">
                    <div class="dash-kpi-label">Penjualan Bulan Ini</div>
                    <div class="dash-kpi-val">${R(kpi.penjualan_bulan_ini)}</div>
                    <div class="dash-kpi-sub" style="color:${selisih >= 0 ? '#4ade80' : '#f87171'};">
                        ${selisih !== null
                            ? (selisih >= 0 ? '▲' : '▼') + ' ' + Math.abs(selisih) + '% vs bulan lalu'
                            : '—'}
                    </div>
                </div>
                <div class="dash-kpi">
                    <div class="dash-kpi-label">Laba Bersih Kumulatif</div>
                    <div class="dash-kpi-val ${kpi.laba_bersih >= 0 ? 'pos' : 'neg'}">${R(kpi.laba_bersih)}</div>
                    <div class="dash-kpi-sub">Laba kotor ${R(kpi.laba_kotor)}</div>
                </div>
                <div class="dash-kpi">
                    <div class="dash-kpi-label">Piutang &amp; Hutang</div>
                    <div class="dash-kpi-val">${R(kpi.piutang)}</div>
                    <div class="dash-kpi-sub">Hutang supplier ${R(kpi.hutang)}</div>
                </div>
            </div>
        </div>

        <!-- Row: Chart 6 bulan + Top Barang -->
        <div class="row3">
            <div class="box" style="grid-column:span 2;">
                <div class="box-hd">
                    <h3>Penjualan 6 Bulan Terakhir</h3>
                    <div class="meta">Tren bulanan</div>
                </div>
                <div class="box-bd">
                    <div class="chart-wrap" style="height:180px;">
                        <canvas id="c6bln"></canvas>
                    </div>
                </div>
            </div>
            <div class="box">
                <div class="box-hd"><h3>Top Barang Bulan Ini 🏆</h3></div>
                <div class="box-bd" style="padding-top:12px;">
                    ${top3.length
                        ? top3.map((b, i) => `
                            <div class="rank-item">
                                <div class="rank-num ${i===0?'gold':i===1?'silver':'bronze'}">${i+1}</div>
                                <div class="rank-info">
                                    <div class="rank-name">${esc(b.nama)}</div>
                                    <div class="rank-sub">${b.total_qty} unit terjual</div>
                                </div>
                                <div class="rank-bar-wrap">
                                    <div class="rank-bar-fill" style="width:${Math.round(b.total_omzet/maxTop*100)}%"></div>
                                </div>
                                <div class="rank-val">${R(b.total_omzet)}</div>
                            </div>`).join('')
                        : '<div class="empty" style="padding:20px;"><div class="ico">🛒</div>Belum ada data.</div>'
                    }
                </div>
            </div>
        </div>

        <!-- Row: Chart per Cabang + Komposisi L/R -->
        <div class="row2">
            <div class="box">
                <div class="box-hd">
                    <h3>Penjualan per Cabang</h3>
                    <div class="meta">${monthLabel(today().slice(0,7))}</div>
                </div>
                <div class="box-bd">
                    <div class="chart-wrap" style="height:200px;">
                        <canvas id="cCabang"></canvas>
                    </div>
                </div>
            </div>
            <div class="box">
                <div class="box-hd"><h3>Komposisi Laba Rugi</h3><div class="meta">Kumulatif</div></div>
                <div class="box-bd">
                    ${[
                        ['Penjualan (DPP)', kpi.pendapatan, 100],
                        ['HPP', kpi.hpp, kpi.pendapatan > 0 ? Math.round(kpi.hpp / kpi.pendapatan * 100) : 0],
                        ['Biaya Operasional', kpi.beban, kpi.pendapatan > 0 ? Math.round(kpi.beban / kpi.pendapatan * 100) : 0],
                    ].map(([l, v, pct]) => `
                        <div style="margin-bottom:14px;">
                            <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                                <span style="font-size:12.5px;font-weight:600;color:var(--ink2);">${l}</span>
                                <span style="font-family:var(--F-m);font-size:12px;">${R(v)}</span>
                            </div>
                            <div style="height:8px;background:var(--kertas);border-radius:4px;overflow:hidden;">
                                <div style="height:100%;width:${pct}%;background:linear-gradient(90deg,var(--emas),#e0ad50);border-radius:4px;transition:width .8s;"></div>
                            </div>
                            <div style="font-size:11px;color:var(--ink3);margin-top:3px;">${pct}% dari penjualan</div>
                        </div>`).join('')}
                    <div style="border-top:2px solid var(--brd);padding-top:12px;display:flex;justify-content:space-between;">
                        <span style="font-weight:700;">Laba Bersih</span>
                        <span class="${kpi.laba_bersih >= 0 ? 'laba-pos' : 'laba-neg'}" style="font-size:16px;">${R(kpi.laba_bersih)}</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- Aktivitas Terbaru -->
        <div class="box">
            <div class="box-hd">
                <h3>Aktivitas Terakhir</h3>
                <div class="meta">${recent.length} transaksi terbaru</div>
            </div>
            <div class="box-bd pad0">
                ${recent.length
                    ? `<div class="tscroll"><table>
                        <thead><tr>
                            <th>Tanggal</th><th>Jenis</th><th>Cabang</th>
                            <th>Keterangan</th><th class="r">Nilai</th>
                        </tr></thead>
                        <tbody>${recent.map(r => `<tr>
                            <td>${fmtTgl(r.tgl)}</td>
                            <td><span class="badge badge-in">${esc(r.jenis)}</span></td>
                            <td>${esc(r.cabang)}</td>
                            <td>${esc(r.keterangan || '–')}</td>
                            <td class="r laba-pos">${R(r.nilai)}</td>
                        </tr>`).join('')}</tbody>
                    </table></div>`
                    : '<div class="empty"><div class="ico">📋</div><strong>Belum ada aktivitas.</strong></div>'
                }
            </div>
        </div>`;

        // Set tanggal di hero
        const hero = document.getElementById('todayHero');
        if (hero) hero.textContent = new Date().toLocaleDateString('id-ID', {
            weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
        });

        // Render charts setelah DOM update
        setTimeout(() => {
            drawLineCanvas('c6bln',
                m6.map(m => monthLabel(m.bulan)),
                m6.map(m => m.total),
                '#1A5C38'
            );
            if (cabSls.length) {
                drawBarCanvas('cCabang',
                    cabSls.map(c => c.cabang),
                    cabSls.map(c => c.total),
                    '#C8973A'
                );
            }
        }, 60);

        setConnStatus(true, 'Terhubung');

    } catch (err) {
        el.innerHTML = `
            <div class="note note-y">
                <span class="note-ico">⚠️</span>
                <span>Gagal memuat dashboard: <strong>${esc(err.message)}</strong><br>
                Pastikan server Laravel berjalan: <code>php artisan serve</code></span>
            </div>`;
        setConnStatus(false, 'Tidak terhubung');
    }
}
