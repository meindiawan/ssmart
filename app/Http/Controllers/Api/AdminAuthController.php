<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AdminAuthController extends Controller
{
    // POST /api/admin/login
    // Body: { username, password }
    public function login(Request $request)
    {
        $data = $request->validate([
            'username' => 'required|string',
            'password' => 'required|string',
        ]);

        $user = User::where('username', $data['username'])
            ->where('role', 'admin')
            ->first();

        if (!$user || !Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'username' => ['Username atau password salah.'],
            ]);
        }

        // 1 admin = 1 sesi aktif di HP. Hapus baris ini kalau admin boleh
        // login di beberapa perangkat sekaligus.
        $user->tokens()->delete();

        $token = $user->createToken('admin-mobile')->plainTextToken;

        return response()->json([
            'token'    => $token,
            'username' => $user->username,
            'name'     => $user->name,
        ]);
    }

    // GET /api/admin/me  (butuh header Authorization: Bearer <token>)
    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'username' => $user->username,
            'name'     => $user->name,
            'role'     => $user->role,
        ]);
    }

    // POST /api/admin/logout
    public function logout(Request $request)
    {
        $request->user()->currentAccessToken()->delete();

        return response()->json(['message' => 'Berhasil logout']);
    }

    // POST /api/admin/change-password
    // Body: { oldPassword, newPassword }
    public function changePassword(Request $request)
    {
        $data = $request->validate([
            'oldPassword' => 'required|string',
            'newPassword' => 'required|string|min:6',
        ]);

        $user = $request->user();

        if (!Hash::check($data['oldPassword'], $user->password)) {
            throw ValidationException::withMessages([
                'oldPassword' => ['Password lama salah.'],
            ]);
        }

        // Password otomatis di-hash lewat cast 'hashed' di model User.
        $user->update(['password' => $data['newPassword']]);

        return response()->json(['message' => 'Password berhasil diubah']);
    }
}
