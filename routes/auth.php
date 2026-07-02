<?php

use App\Http\Controllers\Auth\BomaIdentityController;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Route;

Route::middleware('guest')->group(function () {
    Route::get('auth/boma', [BomaIdentityController::class, 'redirect'])
        ->name('auth.boma');

    Route::get('auth/boma/callback', [BomaIdentityController::class, 'callback'])
        ->name('auth.boma.callback');

    Route::get('login', function () {
        return redirect()->route('auth.boma');
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
