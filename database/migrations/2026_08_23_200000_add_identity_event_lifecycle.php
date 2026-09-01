<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            $table->timestamp('identity_disabled_at')->nullable();
            $table->timestamp('identity_status_changed_at')->nullable();
            $table->timestamp('identity_application_revoked_at')->nullable();
            $table->timestamp('identity_deleted_at')->nullable();
            $table->timestamp('identity_quarantine_until')->nullable()->index();
            $table->unsignedInteger('identity_session_version')->default(0);
        });

        Schema::create('identity_event_receipts', function (Blueprint $table): void {
            $table->id();
            $table->uuid('jti')->unique();
            $table->string('event', 64)->index();
            $table->char('subject_hash', 64);
            $table->timestamp('occurred_at');
            $table->timestamp('quarantine_until')->nullable();
            $table->timestamp('processed_at')->index();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('identity_event_receipts');

        Schema::table('users', function (Blueprint $table): void {
            $table->dropIndex(['identity_quarantine_until']);
            $table->dropColumn([
                'identity_disabled_at',
                'identity_status_changed_at',
                'identity_application_revoked_at',
                'identity_deleted_at',
                'identity_quarantine_until',
                'identity_session_version',
            ]);
        });
    }
};
