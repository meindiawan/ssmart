<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Masuk — Toko Sumini</title>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --tinta:#0D2818; --daun:#1A5C38; --daun2:#2D7A50;
  --emas:#C8973A; --emas2:#E0B25C; --kertas:#F7F4EE; --putih:#fff;
  --ink:#1C2B24; --ink2:#4A6356; --ink3:#8BA398; --brd:#DDD8CC;
  --red:#C0392B; --red-s:#FAEAE8; --grn-s:#E3F4EB;
  --F-d:'Playfair Display',Georgia,serif;
  --F-b:'Plus Jakarta Sans',system-ui,sans-serif;
}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{font-family:var(--F-b);font-size:14px;color:var(--ink);background:var(--kertas);display:grid;grid-template-columns:1.1fr 1fr;min-height:100vh}

/* ── Panel kiri: merek ── */
.brand{position:relative;overflow:hidden;background:
  radial-gradient(1200px 600px at 10% -10%,rgba(45,122,80,.55),transparent 60%),
  radial-gradient(800px 500px at 110% 110%,rgba(200,151,58,.22),transparent 55%),
  var(--tinta);
  color:#fff;display:flex;flex-direction:column;justify-content:space-between;padding:48px 56px}
.brand::before{content:"";position:absolute;inset:0;opacity:.07;
  background-image:linear-gradient(rgba(255,255,255,.9) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.9) 1px,transparent 1px);
  background-size:44px 44px;mask-image:radial-gradient(circle at 30% 40%,#000,transparent 75%);-webkit-mask-image:radial-gradient(circle at 30% 40%,#000,transparent 75%)}
.brand>*{position:relative}
.logo{display:flex;align-items:center;gap:14px}
.logo-mark{width:48px;height:48px;border-radius:13px;background:var(--emas);color:var(--tinta);display:grid;place-items:center;font:700 20px var(--F-d);box-shadow:0 8px 28px rgba(200,151,58,.35)}
.logo-name{font:700 20px var(--F-d);letter-spacing:-.2px}
.logo-sub{font-size:11px;color:var(--emas);letter-spacing:.14em;text-transform:uppercase;font-weight:600;margin-top:2px}
.hero h1{font:700 44px/1.12 var(--F-d);letter-spacing:-.8px;max-width:460px}
.hero h1 em{font-style:normal;color:var(--emas2)}
.hero p{margin-top:16px;color:rgba(255,255,255,.66);line-height:1.7;max-width:430px;font-size:15px}
.chips{display:flex;gap:10px;flex-wrap:wrap;margin-top:28px}
.chip{border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.05);border-radius:999px;padding:7px 14px;font-size:12px;color:rgba(255,255,255,.8);backdrop-filter:blur(4px)}
.foot{font-size:12px;color:rgba(255,255,255,.4)}

/* ── Panel kanan: form ── */
.panel{display:flex;align-items:center;justify-content:center;padding:40px 24px}
.card{width:100%;max-width:390px;animation:rise .55s cubic-bezier(.2,.8,.2,1) both}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.mlogo{display:none}
.card h2{font:700 30px var(--F-d);letter-spacing:-.5px;color:var(--tinta)}
.card .lead{margin:6px 0 28px;color:var(--ink2)}
.field{margin-bottom:16px}
.field label{display:block;font-size:12px;font-weight:600;color:var(--ink2);margin-bottom:6px;letter-spacing:.02em}
.inp{position:relative}
.inp svg.ic{position:absolute;left:14px;top:50%;transform:translateY(-50%);width:18px;height:18px;stroke:var(--ink3);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;pointer-events:none;transition:stroke .2s}
.inp input{width:100%;height:48px;border:1.5px solid var(--brd);border-radius:12px;background:var(--putih);padding:0 46px 0 44px;font:500 15px var(--F-b);color:var(--ink);outline:none;transition:border-color .2s,box-shadow .2s}
.inp input::placeholder{color:#b3beb7;font-weight:400}
.inp input:focus{border-color:var(--daun2);box-shadow:0 0 0 4px rgba(45,122,80,.14)}
.inp:focus-within svg.ic{stroke:var(--daun2)}
.eye{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:9px;display:grid;place-items:center;background:none;border:none;cursor:pointer;color:var(--ink3)}
.eye:hover{background:var(--grn-s);color:var(--daun)}
.eye svg{width:19px;height:19px;stroke:currentColor;fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.err{display:flex;gap:10px;align-items:flex-start;background:var(--red-s);border:1px solid #f0c9c4;color:var(--red);border-radius:11px;padding:11px 14px;font-size:13px;font-weight:500;margin-bottom:16px}
.err svg{flex:none;width:18px;height:18px;margin-top:1px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.info{background:var(--grn-s);border:1px solid #bfe3cf;color:var(--daun);border-radius:11px;padding:11px 14px;font-size:13px;font-weight:500;margin-bottom:16px}
.shake{animation:shake .4s}
@keyframes shake{20%,60%{transform:translateX(-6px)}40%,80%{transform:translateX(6px)}}
.btn{width:100%;height:50px;border:none;border-radius:12px;cursor:pointer;margin-top:6px;
  background:linear-gradient(180deg,var(--daun2),var(--daun));color:#fff;font:700 15px var(--F-b);letter-spacing:.02em;
  box-shadow:0 8px 20px rgba(26,92,56,.28),inset 0 1px 0 rgba(255,255,255,.18);transition:transform .15s,box-shadow .2s,filter .2s;display:flex;align-items:center;justify-content:center;gap:10px}
.btn:hover{transform:translateY(-1px);box-shadow:0 12px 26px rgba(26,92,56,.34),inset 0 1px 0 rgba(255,255,255,.18);filter:brightness(1.05)}
.btn:active{transform:translateY(0)}
.btn[disabled]{opacity:.75;cursor:wait;transform:none}
.spin{width:18px;height:18px;border:2.5px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:sp .7s linear infinite;display:none}
.btn.load .spin{display:block}
@keyframes sp{to{transform:rotate(360deg)}}
.note{margin-top:26px;text-align:center;font-size:12px;color:var(--ink3);display:flex;align-items:center;justify-content:center;gap:6px}
.note svg{width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}

@media (max-width:860px){
  body{grid-template-columns:1fr;background:
    radial-gradient(700px 360px at 0% -5%,rgba(45,122,80,.35),transparent 60%),var(--kertas)}
  .brand{display:none}
  .mlogo{display:flex;align-items:center;gap:12px;margin-bottom:30px}
  .mlogo .logo-mark{width:44px;height:44px;font-size:18px}
  .mlogo .logo-name{color:var(--tinta)}
}
@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style>
</head>
<body>

<section class="brand" aria-hidden="true">
  <div class="logo">
    <div class="logo-mark">TS</div>
    <div><div class="logo-name">Toko Sumini</div><div class="logo-sub">Akuntansi Multi-Cabang</div></div>
  </div>
  <div class="hero">
    <h1>Pembukuan toko, <em>rapi</em> dan terpantau setiap hari.</h1>
    <p>Kasir, stok, HPP, jurnal, dan laporan keuangan semua cabang dalam satu tempat.</p>
    <div class="chips">
      <span class="chip">Kasir POS</span><span class="chip">Stok &amp; HPP</span><span class="chip">Jurnal &amp; Laba Rugi</span><span class="chip">Multi Cabang</span>
    </div>
  </div>
  <div class="foot">© {{ date('Y') }} Toko Sumini</div>
</section>

<main class="panel">
  <div class="card">
    <div class="mlogo">
      <div class="logo-mark">TS</div>
      <div><div class="logo-name">Toko Sumini</div><div class="logo-sub" style="color:var(--emas)">Akuntansi Multi-Cabang</div></div>
    </div>

    <h2>Selamat datang</h2>
    <p class="lead">Masuk untuk membuka aplikasi akuntansi.</p>

    @if (session('info'))
      <div class="info">{{ session('info') }}</div>
    @endif
    @if ($errors->any())
      <div class="err" id="errBox" role="alert">
        <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.01"/></svg>
        <span>{{ $errors->first() }}</span>
      </div>
    @endif

    <form method="POST" action="{{ route('login.post') }}" id="f" novalidate>
      @csrf
      <div class="field">
        <label for="username">Username</label>
        <div class="inp">
          <svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>
          <input id="username" name="username" type="text" value="{{ old('username') }}" placeholder="Masukkan username" autocomplete="username" autocapitalize="off" spellcheck="false" required autofocus>
        </div>
      </div>
      <div class="field">
        <label for="password">Password</label>
        <div class="inp">
          <svg class="ic" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
          <input id="password" name="password" type="password" placeholder="Masukkan password" autocomplete="current-password" required>
          <button type="button" class="eye" id="eye" aria-label="Tampilkan password" title="Tampilkan / sembunyikan password">
            <svg viewBox="0 0 24 24" id="eyeIc"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
      <button class="btn" id="btn" type="submit"><span class="spin"></span><span id="btnTxt">Masuk</span></button>
    </form>

    <div class="note">
      <svg viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>
      Akses khusus pengelola toko
    </div>
  </div>
</main>

<script>
(function () {
  var pw = document.getElementById('password'), eye = document.getElementById('eye'), ic = document.getElementById('eyeIc');
  var open = '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
  var shut = '<path d="M3 3l18 18"/><path d="M10.6 5.1A10.6 10.6 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.7 8.5 2 12 2 12s3.6 7 10 7c1.7 0 3.2-.4 4.5-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>';
  eye.addEventListener('click', function () {
    var show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    ic.innerHTML = show ? shut : open;
    eye.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    pw.focus();
  });
  var f = document.getElementById('f'), btn = document.getElementById('btn');
  f.addEventListener('submit', function (e) {
    if (!f.username.value.trim() || !f.password.value) { e.preventDefault(); (f.username.value.trim() ? pw : f.username).focus(); return; }
    btn.classList.add('load'); btn.disabled = true; document.getElementById('btnTxt').textContent = 'Memeriksa…';
  });
  var eb = document.getElementById('errBox');
  if (eb) { eb.classList.add('shake'); if (document.getElementById('username').value) pw.focus(); }
  // kalau halaman dibuka dari cache setelah tombol "Back", kembalikan tombol seperti semula
  window.addEventListener('pageshow', function () { btn.classList.remove('load'); btn.disabled = false; document.getElementById('btnTxt').textContent = 'Masuk'; });
})();
</script>
</body>
</html>
