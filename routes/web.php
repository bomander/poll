<?php

use App\Http\Controllers\AdminController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\IdentityEventController;
use App\Http\Middleware\EnsureIdentitySessionCurrent;
use App\Http\Middleware\HandleAppearance;
use App\Http\Middleware\HandleInertiaRequests;
use App\Http\Middleware\SetLocale;
use Illuminate\Cookie\Middleware\AddQueuedCookiesToResponse;
use Illuminate\Cookie\Middleware\EncryptCookies;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Foundation\Http\Middleware\ValidateCsrfToken;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::middleware(['auth', 'verified'])->group(function () {
    Route::get('dashboard', DashboardController::class)->name('dashboard');

    Route::get('polls', function () {
        return Inertia::render('polls/index');
    })->name('polls.index');

    Route::get('sessions', function () {
        return Inertia::render('sessions/index');
    })->name('sessions.index');

    Route::get('polls/{poll}/edit', function () {
        return Inertia::render('polls/edit');
    })->name('polls.edit');

    Route::get('sessions/{session}', function () {
        return Inertia::render('sessions/show');
    })->name('sessions.show');

    Route::get('admin', AdminController::class)->name('admin');
});

Route::get('join', function () {
    return Inertia::render('public/join');
})->name('public.join');

Route::get('projector/{code}', function () {
    return Inertia::render('public/projector');
})->name('public.projector');

require __DIR__.'/auth.php';

require __DIR__.'/settings.php';
Route::post('/internal/auth/events', IdentityEventController::class)
    ->withoutMiddleware([
        EncryptCookies::class,
        AddQueuedCookiesToResponse::class,
        StartSession::class,
        ShareErrorsFromSession::class,
        ValidateCsrfToken::class,
        PreventRequestForgery::class,
        EnsureIdentitySessionCurrent::class,
        HandleAppearance::class,
        SetLocale::class,
        HandleInertiaRequests::class,
    ])
    ->middleware('throttle:30,1')
    ->name('internal.auth.events');
