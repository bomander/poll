<?php

namespace App\Services;

use App\Models\PollSession;
use App\Models\User;
use DateTimeInterface;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use RuntimeException;

class IdentityEventProcessor
{
    /**
     * @param  array{jti: string, event: string, sub: string, occurred_at: DateTimeInterface, quarantine_until: DateTimeInterface|null}  $identityEvent
     */
    public function process(array $identityEvent): string
    {
        try {
            return DB::transaction(function () use ($identityEvent): string {
                DB::table('identity_event_receipts')->insert([
                    'jti' => $identityEvent['jti'],
                    'event' => $identityEvent['event'],
                    'subject_hash' => hash_hmac('sha256', $identityEvent['sub'], $this->subjectHashKey()),
                    'occurred_at' => $identityEvent['occurred_at'],
                    'quarantine_until' => $identityEvent['quarantine_until'],
                    'processed_at' => now(),
                ]);

                $user = User::query()
                    ->where('auth_subject', $identityEvent['sub'])
                    ->lockForUpdate()
                    ->first();

                if (! $user) {
                    return 'no-match';
                }

                $occurredAt = $identityEvent['occurred_at'];
                $event = $identityEvent['event'];
                $revokeSessions = $event === 'subject.sessions_revoked';
                $closePollSessions = false;

                if ($event === 'subject.disabled') {
                    if ($user->identity_status_changed_at === null
                        || $user->identity_status_changed_at->getTimestamp() <= $occurredAt->getTimestamp()) {
                        $user->identity_disabled_at = $occurredAt;
                        $user->identity_status_changed_at = $occurredAt;
                        $revokeSessions = true;
                        $closePollSessions = true;
                    }
                } elseif ($event === 'subject.enabled') {
                    if ($user->identity_deleted_at === null
                        && $user->identity_quarantine_until === null
                        && ($user->identity_status_changed_at === null
                            || $user->identity_status_changed_at->getTimestamp() < $occurredAt->getTimestamp())) {
                        $user->identity_disabled_at = null;
                        $user->identity_status_changed_at = $occurredAt;
                    }
                } elseif ($event === 'subject.application_revoked') {
                    if ($user->identity_application_revoked_at === null
                        || $user->identity_application_revoked_at->getTimestamp() <= $occurredAt->getTimestamp()) {
                        $user->identity_application_revoked_at = $occurredAt;
                        $revokeSessions = true;
                        $closePollSessions = true;
                    }
                } elseif ($event === 'subject.deleted') {
                    if ($user->identity_deleted_at === null
                        || $user->identity_deleted_at->getTimestamp() <= $occurredAt->getTimestamp()) {
                        $user->identity_deleted_at = $occurredAt;
                    }
                    if ($user->identity_disabled_at === null
                        || $user->identity_disabled_at->getTimestamp() < $occurredAt->getTimestamp()) {
                        $user->identity_disabled_at = $occurredAt;
                    }
                    if ($user->identity_quarantine_until === null
                        || $user->identity_quarantine_until->getTimestamp() < $identityEvent['quarantine_until']->getTimestamp()) {
                        $user->identity_quarantine_until = $identityEvent['quarantine_until'];
                    }
                    if ($user->identity_status_changed_at === null
                        || $user->identity_status_changed_at->getTimestamp() < $occurredAt->getTimestamp()) {
                        $user->identity_status_changed_at = $occurredAt;
                    }
                    $revokeSessions = true;
                    $closePollSessions = true;
                }

                if ($revokeSessions) {
                    $user->remember_token = null;
                    $user->identity_session_version = (int) $user->identity_session_version + 1;
                    DB::table((string) config('session.table', 'sessions'))
                        ->where('user_id', $user->getKey())
                        ->delete();
                }

                if ($closePollSessions) {
                    PollSession::query()
                        ->whereHas('poll', fn ($query) => $query->where('user_id', $user->getKey()))
                        ->where('status', 'active')
                        ->update([
                            'status' => 'closed',
                            'locked' => true,
                            'ended_at' => $occurredAt,
                        ]);
                }

                $user->save();

                return 'processed';
            }, 3);
        } catch (QueryException $exception) {
            if (DB::table('identity_event_receipts')->where('jti', $identityEvent['jti'])->exists()) {
                return 'duplicate';
            }

            throw $exception;
        }
    }

    public function pruneReceipts(int $days = 90): int
    {
        return DB::table('identity_event_receipts')
            ->where('processed_at', '<', now()->subDays(max(90, $days)))
            ->delete();
    }

    private function subjectHashKey(): string
    {
        $key = trim((string) config('services.boma_identity.events.subject_hash_key'));
        if ($key !== '') {
            return $key;
        }

        if (! app()->environment(['local', 'testing'])) {
            throw new RuntimeException('BOMA_AUTH_EVENT_SUBJECT_HASH_KEY is required.');
        }

        return (string) config('app.key');
    }
}
