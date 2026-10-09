/* =============================================================
   app.js — Bootstrap & Inisialisasi Aplikasi
   File ini adalah yang TERAKHIR dimuat (lihat main.blade.php).
   Urutan: helpers → api → state → charts → nav → export
           → dashboard → analisis → master → transaksi
           → jurnal → laporan → app (ini)
   ============================================================= */

/* ── SET TANGGAL HARI INI DI TOPBAR ──────────────────────── */
const todayLbl = document.getElementById('todayLabel');
if (todayLbl) {
    todayLbl.textContent = new Date().toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
}

/* ── TOMBOL EXPORT ALL ────────────────────────────────────── */
document.getElementById('btnExportAll')?.addEventListener('click', () => {
    // Cari tabel mana saja yang sedang tampil
    const tbl = document.querySelector('.panel.on table[id]');
    if (!tbl) {
        toast('Buka halaman data terlebih dahulu, lalu klik Export All.', 'y');
        return;
    }
    exportExcel(tbl.id, 'tokosumini-' + activeTab);
});

/* ── TOMBOL "KE ATAS / KE BAWAH" ──────────────────────────────
   Satu widget global (bukan per-tabel) karena semua tab & tabel
   panjang (Jurnal, Riwayat Transaksi, Laporan, dll) sama-sama
   di-scroll lewat 1 wrapper: <div class="content">. ────────── */
function pageScrollTo(where) {
    const c = document.querySelector('.content');
    if (!c) return;
    c.scrollTo({ top: where === 'top' ? 0 : c.scrollHeight, behavior: 'smooth' });
}

(() => {
    const c = document.querySelector('.content');
    const up = document.getElementById('btnScrollUp');
    const down = document.getElementById('btnScrollDown');
    if (!c || !up || !down) return;

    const THRESHOLD = 140; // px jarak minimum dari ujung sebelum tombol dianggap "perlu"
    const update = () => {
        const scrollable = c.scrollHeight - c.clientHeight > 80;
        up.classList.toggle('show', scrollable && c.scrollTop > THRESHOLD);
        down.classList.toggle('show', scrollable && (c.scrollHeight - c.scrollTop - c.clientHeight) > THRESHOLD);
    };

    c.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    // Konten tiap tab di-render ulang lewat innerHTML (bukan navigasi
    // halaman), jadi tinggi halaman bisa berubah tanpa memicu event
    // 'scroll' — pantau perubahan DOM supaya tombol tetap akurat.
    new MutationObserver(() => update()).observe(c, { childList: true, subtree: true });
    // Jaring pengaman tambahan (murah) utk kasus animasi/transisi yg
    // mengubah tinggi setelah MutationObserver sempat menghitung.
    setInterval(update, 900);
    update();
})();

/* ── MAIN INIT ────────────────────────────────────────────── */
(async () => {
    // Perbarui hint splash
    const hint = document.getElementById('splashHint');

    // Step 1: load master data dari API
    if (hint) hint.textContent = 'Memuat data master…';
    const ok = await loadMasterData();

    // Step 2: sembunyikan splash, tampilkan app
    if (hint) hint.textContent = ok ? 'Siap!' : 'Periksa koneksi server…';
    await new Promise(r => setTimeout(r, ok ? 400 : 1200));

    document.getElementById('splash').classList.add('out');

    await new Promise(r => setTimeout(r, 650));
    document.getElementById('splash').style.display = 'none';
    document.getElementById('app').style.display    = 'flex';

    // Step 3: render tab awal (dashboard)
    await setTab('dashboard');

    // Step 4: tampilkan peringatan jika gagal koneksi
    if (!ok) {
        toast(
            'Tidak dapat terhubung ke API. ' +
            'Pastikan server Laravel berjalan: php artisan serve',
            'err'
        );
    }
})();
