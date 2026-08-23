<?php

use App\Services\IdentityEventProcessor;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

Schedule::command('identity-events:purge-quarantine')
    ->dailyAt('03:25')
    ->withoutOverlapping();
Schedule::call(fn () => app(IdentityEventProcessor::class)->pruneReceipts(
    (int) config('services.boma_identity.events.receipt_retention_days', 90),
))->name('identity-events:prune-receipts')->dailyAt('03:30')->withoutOverlapping();
