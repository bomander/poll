<?php

use App\Models\Poll;
use App\Models\PollQuestion;
use App\Models\PollSession;
use App\Models\User;

function pollWithSession(User $user, string $code, DateTimeInterface $startedAt): array
{
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Läget', 'type' => 'word_cloud']);
    $question = PollQuestion::create(['poll_id' => $poll->id, 'question_text' => 'Ett ord?', 'order_index' => 0]);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => $code,
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => $startedAt,
    ]);

    return [$poll, $session];
}

it('closes sessions that were forgotten after a lesson', function () {
    $user = User::factory()->create();
    [, $old] = pollWithSession($user, 'OLD234', now()->subHours(13));
    [, $today] = pollWithSession($user, 'NEW234', now()->subHours(2));

    $this->artisan('sessions:close-stale')->assertSuccessful();

    expect($old->fresh()->status)->toBe('closed')
        ->and($old->fresh()->ended_at)->not->toBeNull()
        ->and($today->fresh()->status)->toBe('active');
});

it('starts a fresh session instead of reopening last week\'s', function () {
    $user = User::factory()->create();
    [$poll, $old] = pollWithSession($user, 'WEEK23', now()->subDays(7));

    $response = $this->actingAs($user)->postJson("/api/polls/{$poll->id}/sessions")->assertOk();

    expect($response->json('id'))->not->toBe($old->id)
        ->and($old->fresh()->status)->toBe('closed');
});

it('still points to a session that is running today', function () {
    $user = User::factory()->create();
    [$poll, $running] = pollWithSession($user, 'TODAY2', now()->subHour());

    $this->actingAs($user)->postJson("/api/polls/{$poll->id}/sessions")
        ->assertStatus(409)
        ->assertJsonPath('session_id', $running->id);
});

it('tells the teacher when a running session started', function () {
    $user = User::factory()->create();
    [$poll] = pollWithSession($user, 'TIME23', now()->subMinutes(30));

    $poll = collect($this->actingAs($user)->getJson('/api/polls')->assertOk()->json())
        ->firstWhere('id', $poll->id);

    expect($poll['active_session_id'])->not->toBeNull()
        ->and($poll['active_session_started_at'])->toMatch('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/');
});
