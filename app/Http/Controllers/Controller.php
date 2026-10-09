<?php

namespace App\Http\Controllers;

use Illuminate\Foundation\Auth\Access\AuthorizesRequests;
use Illuminate\Foundation\Validation\ValidatesRequests;
use Illuminate\Routing\Controller as BaseController;
use Illuminate\Pagination\LengthAwarePaginator;

class Controller extends BaseController
{
    use AuthorizesRequests, ValidatesRequests;

    /**
     * Bungkus hasil LengthAwarePaginator menjadi format { data, meta }
     * yang konsisten dan dipahami frontend (transaksi.js, master.js dll
     * membaca `res.data` & `res.meta`). Laravel TIDAK menaruh info
     * paginasi di dalam key "meta" saat di-response()->json() langsung —
     * itu sebabnya sebelumnya daftar transaksi selalu terlihat "cuma 30
     * data" dan tombol halaman berikutnya tidak pernah muncul.
     *
     * @param LengthAwarePaginator $p
     * @param array $extra Data tambahan di luar data/meta, misal ['summary' => [...]]
     */
    protected function paginated(LengthAwarePaginator $p, array $extra = [])
    {
        return response()->json(array_merge([
            'data' => $p->items(),
            'meta' => [
                'current_page' => $p->currentPage(),
                'last_page'    => $p->lastPage(),
                'per_page'     => $p->perPage(),
                'total'        => $p->total(),
                'from'         => $p->firstItem(),
                'to'           => $p->lastItem(),
            ],
        ], $extra));
    }
}
