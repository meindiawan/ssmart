/* =============================================================
   ui-enhance.js — Peningkatan tampilan & kenyamanan pakai
   Tidak mengubah fitur/data apa pun, murni UX:
     1) Tombol ciutkan sidebar di desktop (mode ikon saja),
        pilihan diingat lewat localStorage.
     2) Backdrop gelap di belakang sidebar saat dibuka di HP,
        + tutup sidebar saat backdrop atau tombol nav diklik.
   ============================================================= */
(function () {
    const sb   = document.getElementById('sb');
    const btn  = document.getElementById('sbCollapseBtn');
    const back = document.getElementById('sbBackdrop');
    if (!sb) return;

    /* ── 1) Ciutkan / lebarkan sidebar (desktop) ─────────────── */
    const KEY = 'ts_sidebar_collapsed';
    if (localStorage.getItem(KEY) === '1') {
        sb.classList.add('collapsed');
        if (btn) btn.textContent = '»';
    }
    btn?.addEventListener('click', () => {
        const collapsed = sb.classList.toggle('collapsed');
        btn.textContent = collapsed ? '»' : '«';
        localStorage.setItem(KEY, collapsed ? '1' : '0');
    });

    /* ── 2) Backdrop mobile: ikut status .open pada #sb ──────── */
    if (back) {
        const syncBackdrop = () => back.classList.toggle('show', sb.classList.contains('open'));
        new MutationObserver(syncBackdrop).observe(sb, { attributes: true, attributeFilter: ['class'] });
        back.addEventListener('click', () => sb.classList.remove('open'));
    }

    /* Tutup sidebar mobile begitu salah satu menu dipilih (biar tak nutupi konten) */
    sb.querySelectorAll('.nb').forEach(b => b.addEventListener('click', () => {
        if (window.innerWidth <= 820) sb.classList.remove('open');
    }));
})();
