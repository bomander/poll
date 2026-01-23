<?php

use App\Http\Controllers\Api\AdminApiController;
use App\Http\Controllers\Api\JoinController;
use App\Http\Controllers\Api\PollController;
use App\Http\Controllers\Api\SessionController;
use App\Http\Controllers\Api\VoteController;
use Illuminate\Support\Facades\Route;

Route::middleware(['web', 'auth'])->group(function () {
    Route::get('/polls', [PollController::class, 'index']);
    Route::post('/polls', [PollController::class, 'store']);
    Route::get('/polls/{poll}', [PollController::class, 'show']);
    Route::put('/polls/{poll}', [PollController::class, 'update']);
    Route::post('/polls/{poll}/clone', [PollController::class, 'clone']);

    Route::post('/polls/{poll}/sessions', [SessionController::class, 'store']);
    Route::get('/sessions', [SessionController::class, 'index']);
    Route::get('/sessions/{session}', [SessionController::class, 'show']);
    Route::post('/sessions/{session}/close', [SessionController::class, 'close']);
    Route::post('/sessions/{session}/current-question', [SessionController::class, 'setCurrentQuestion']);
    Route::post('/sessions/{session}/lock-question', [SessionController::class, 'lockQuestion']);
    Route::get('/sessions/{session}/export', [SessionController::class, 'export']);
    Route::delete('/sessions/{session}', [SessionController::class, 'destroy']);

    // Admin routes
    Route::post('/admin/users/{user}/ban', [AdminApiController::class, 'banUser']);
    Route::post('/admin/users/{user}/unban', [AdminApiController::class, 'unbanUser']);
    Route::get('/admin/sessions/{session}', [AdminApiController::class, 'sessionDetails']);
});

Route::middleware('web')->group(function () {
    Route::post('/join', [JoinController::class, 'store']);
    Route::post('/sessions/{session}/vote', [VoteController::class, 'store']);
});
