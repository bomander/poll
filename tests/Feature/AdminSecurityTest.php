<?php

use App\Models\Poll;
use App\Models\PollSession;
use App\Models\User;
use Illuminate\Support\Facades\DB;

it('immediately revokes a banned teacher and closes their active sessions', function () {
    $admin = User::factory()->create(['is_admin' => true]);
    $teacher = User::factory()->create([
        'auth_subject' => 'teacher-subject',
        'remember_token' => 'remember-me',
        'identity_session_version' => 2,
    ]);
    DB::table('sessions')->insert([
        'id' => 'banned-teacher-session',
        'user_id' => $teacher->id,
        'ip_address' => '127.0.0.1',
        'user_agent' => 'test',
        'payload' => 'test-payload',
        'last_activity' => time(),
    ]);
    $poll = Poll::create(['user_id' => $teacher->id, 'title' => 'Active poll']);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'BAN12345',
        'status' => 'active',
        'locked' => false,
        'started_at' => now(),
    ]);

    $this->actingAs($admin)
        ->postJson("/api/admin/users/{$teacher->id}/ban", ['reason' => 'Test'])
        ->assertOk();

    $teacher->refresh();
    expect($teacher->is_banned)->toBeTrue()
        ->and($teacher->remember_token)->toBeNull()
        ->and($teacher->identity_session_version)->toBe(3)
        ->and($session->fresh()->status)->toBe('closed')
        ->and($session->fresh()->locked)->toBeTrue();
    $this->assertDatabaseMissing('sessions', ['id' => 'banned-teacher-session']);

    $this->actingAs($teacher)
        ->getJson('/api/polls')
        ->assertUnauthorized();
});

it('does not let a non-admin use administration endpoints', function () {
    $teacher = User::factory()->create();
    $target = User::factory()->create();

    $this->actingAs($teacher)
        ->postJson("/api/admin/users/{$target->id}/ban")
        ->assertForbidden();
});
