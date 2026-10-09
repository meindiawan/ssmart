/* =============================================================
   api.js — HTTP Fetch Wrapper ke Laravel API
   Semua request ke backend melewati fungsi-fungsi ini.
   Base URL diambil dari APP_CONFIG yang di-inject Blade.
   ============================================================= */

const API_BASE = window.APP_CONFIG?.apiBase || 'http://localhost:8000/api';
const CSRF_TOKEN = window.APP_CONFIG?.csrfToken || '';

/**
 * Fungsi fetch utama — semua request API melewati sini
 * @param {string} endpoint - Endpoint relatif, misal '/dashboard'
 * @param {object} options  - Fetch options (method, body, dll)
 * @returns {Promise<any>}  - Response JSON
 * @throws {Error}          - Jika response tidak OK atau network error
 */
async function apiFetch(endpoint, options = {}) {
    const url = API_BASE + endpoint;

    const defaultHeaders = {
        'Content-Type'  : 'application/json',
        'Accept'        : 'application/json',
        'X-CSRF-TOKEN'  : CSRF_TOKEN,
        'X-Requested-With': 'XMLHttpRequest',
    };

    const config = {
        ...options,
        headers: { ...defaultHeaders, ...(options.headers || {}) },
    };

    // Serialize body ke JSON jika berupa object
    if (config.body && typeof config.body === 'object') {
        config.body = JSON.stringify(config.body);
    }

    const res = await fetch(url, config);

    // Sesi login habis / belum login → kembali ke halaman login
    if (res.status === 401) {
        window.location.href = '/login';
        throw new Error('Sesi login berakhir. Silakan login lagi.');
    }

    // Handle error response dari Laravel (validasi, 404, 500, dll)
    if (!res.ok) {
        let errMsg = `HTTP ${res.status}`;
        try {
            const errData = await res.json();
            // Laravel ValidationException → tampilkan pesan validasi
            if (errData.errors) {
                const msgs = Object.values(errData.errors).flat();
                errMsg = msgs.join(' | ');
            } else {
                errMsg = errData.message || errMsg;
            }
        } catch (_) { /* ignore parse error */ }
        throw new Error(errMsg);
    }

    return res.json();
}

/* ── SHORTHAND METHODS ────────────────────────────────────── */

/** GET request */
async function apiGet(endpoint) {
    return apiFetch(endpoint, { method: 'GET' });
}

/** POST request dengan JSON body */
async function apiPost(endpoint, body) {
    return apiFetch(endpoint, { method: 'POST', body });
}

/** PUT request dengan JSON body */
async function apiPut(endpoint, body) {
    return apiFetch(endpoint, { method: 'PUT', body });
}

/** DELETE request */
async function apiDel(endpoint) {
    return apiFetch(endpoint, { method: 'DELETE' });
}

/* ── HELPER: Build query string dari object ───────────────── */
/**
 * Buat query string dari object
 * @example buildQuery({ cabang: 'Pusat', page: 2 }) → "?cabang=Pusat&page=2"
 */
function buildQuery(params = {}) {
    const q = Object.entries(params)
        .filter(([, v]) => v !== null && v !== undefined && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
    return q ? '?' + q : '';
}
