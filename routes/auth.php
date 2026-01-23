<?php

use App\Http\Controllers\Auth\BasenOAuthController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    Route::get('auth/basen', [BasenOAuthController::class, 'redirect'])
        ->name('auth.basen');

    Route::get('auth/basen/callback', [BasenOAuthController::class, 'callback'])
        ->name('auth.basen.callback');

    Route::get('login', function () {
        return redirect()->route('auth.basen');
    })->name('login');

    Route::post('login', function () {
        abort(404);
    });
});

Route::middleware('auth')->group(function () {
    Route::post('logout', function (Request $request) {
        Auth::logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/');
    })->name('logout');
});
