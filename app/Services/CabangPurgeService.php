<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Dipakai bersama oleh MasterController::destroyCabang (hapus lewat menu
 * Master Cabang) dan perintah artisan `cabang:purge` (buat bersihin data
 * cabang yang master-nya sudah kadung terhapus duluan / data dummy seeder).
 */
class CabangPurgeService
{
    /**
     * Hapus permanen semua transaksi & data yang cabangnya = $nama.
     * Mengembalikan rincian jumlah baris yang terhapus per kategori.
     */
    public static function purge(string $nama): array
    {
        $ringkasan = [];

        DB::transaction(function () use ($nama, &$ringkasan) {
            // ── Transaksi / Jurnal ──────────────────────────────────
            $ringkasan['Penjualan']         = DB::table('trx_jual')->where('cabang', $nama)->delete();
            $ringkasan['Pembelian']         = DB::table('trx_beli')->where('cabang', $nama)->delete();
            $ringkasan['Jasa']              = DB::table('trx_jasa')->where('cabang', $nama)->delete();
            $ringkasan['Sewa']              = DB::table('trx_sewa')->where('cabang', $nama)->delete();
            $ringkasan['Retur']             = DB::table('trx_retur')->where('cabang', $nama)->delete();
            $ringkasan['Kasbon Karyawan']   = DB::table('trx_kasbon')->where('cabang', $nama)->delete();
            $ringkasan['Cashbon Pelanggan'] = DB::table('trx_cashbon')->where('cabang', $nama)->delete();
            $ringkasan['Biaya']             = DB::table('trx_biaya')->where('cabang', $nama)->delete();
            $ringkasan['Mutasi Barang']     = DB::table('trx_mutasi')->where('dari_cabang', $nama)->orWhere('ke_cabang', $nama)->delete();
            $ringkasan['Mutasi Kirim']      = DB::table('mutasi_kirim')->where('dari_cabang', $nama)->orWhere('ke_cabang', $nama)->delete(); // detail ikut cascade
            $ringkasan['Barang Kadaluarsa'] = DB::table('barang_kadaluarsa')->where('cabang', $nama)->delete();

            // ── Stok ─────────────────────────────────────────────────
            $ringkasan['Saldo Stok']        = DB::table('stok')->where('cabang', $nama)->delete();
            $ringkasan['Barang per Cabang'] = BarangCabangService::hapusCabang($nama);
            $ringkasan['Barang Masuk']      = DB::table('barang_masuk')->where('cabang', $nama)->delete();
            $ringkasan['Barang Keluar']     = DB::table('barang_keluar')->where('cabang', $nama)->delete();
            $ringkasan['Stok Opname']       = DB::table('stok_opname')->where('cabang', $nama)->delete(); // detail ikut cascade

            // ── Karyawan (absensi, gaji ikut cascade lewat foreign key) ──
            $ringkasan['Karyawan']          = DB::table('karyawan')->where('cabang', $nama)->delete();

            // ── Jaga-jaga kalau ternyata master cabang-nya masih ada ────
            DB::table('cabang')->where('nama', $nama)->delete();
        });

        return $ringkasan;
    }
}
