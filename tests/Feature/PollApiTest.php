<?php

use App\Models\Poll;
use App\Models\PollOption;
use App\Models\PollQuestion;
use App\Models\PollSession;
use App\Models\User;

it('creates a poll with questions and options', function () {
    $user = User::factory()->create();

    $payload = [
        'title' => 'Quick check',
        'description' => 'Weekly warmup',
        'questions' => [
            [
                'question_text' => 'What is 2 + 2?',
                'options' => ['3', '4', '5'],
            ],
        ],
    ];

    $response = $this->actingAs($user)->postJson('/api/polls', $payload);

    $response->assertCreated();
    $this->assertDatabaseHas('polls', ['title' => 'Quick check', 'user_id' => $user->id]);
    $this->assertDatabaseHas('poll_questions', ['question_text' => 'What is 2 + 2?']);
    $this->assertDatabaseHas('poll_options', ['option_text' => '4']);
});

it('prevents editing polls with active sessions', function () {
    $user = User::factory()->create();

    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Active poll',
        'description' => null,
    ]);

    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);

    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Option A',
        'order_index' => 0,
    ]);

    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'ABC12345',
        'status' => 'active',
        'current_question_id' => $question->id,
        'locked' => false,
        'started_at' => now(),
    ]);

    $payload = [
        'title' => 'Updated poll',
        'description' => null,
        'questions' => [
            [
                'question_text' => 'New question',
                'options' => ['Yes', 'No'],
            ],
        ],
    ];

    $response = $this->actingAs($user)->putJson("/api/polls/{$poll->id}", $payload);

    $response->assertStatus(409);
});

it('stores a session name when provided', function () {
    $user = User::factory()->create();

    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Named poll',
        'description' => null,
    ]);

    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);

    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Option A',
        'order_index' => 0,
    ]);

    $response = $this->actingAs($user)->postJson("/api/polls/{$poll->id}/sessions", [
        'name' => 'Lesson 2B',
    ]);

    $response->assertOk();
    $this->assertDatabaseHas('poll_sessions', [
        'poll_id' => $poll->id,
        'name' => 'Lesson 2B',
    ]);
});

it('lists sessions for the authenticated user', function () {
    $user = User::factory()->create();

    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Listed poll',
        'description' => null,
    ]);

    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'LIST1234',
        'name' => 'Session A',
        'status' => 'closed',
        'current_question_id' => null,
        'locked' => false,
        'started_at' => now(),
        'ended_at' => now(),
    ]);

    $response = $this->actingAs($user)->getJson('/api/sessions');

    $response->assertOk();
    $response->assertJsonFragment([
        'code' => 'LIST1234',
        'name' => 'Session A',
        'status' => 'closed',
    ]);
});

it('rejects deleting an active session', function () {
    $user = User::factory()->create();

    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Delete poll',
        'description' => null,
    ]);

    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);

    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Option A',
        'order_index' => 0,
    ]);

    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'DEL12345',
        'status' => 'active',
        'current_question_id' => $question->id,
        'locked' => false,
        'started_at' => now(),
    ]);

    $response = $this->actingAs($user)->deleteJson("/api/sessions/{$session->id}");

    $response->assertStatus(409);
});

it('deletes a closed session', function () {
    $user = User::factory()->create();

    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Delete closed poll',
        'description' => null,
    ]);

    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);

    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Option A',
        'order_index' => 0,
    ]);

    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'DEL54321',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now(),
        'ended_at' => now(),
    ]);

    $response = $this->actingAs($user)->deleteJson("/api/sessions/{$session->id}");

    $response->assertOk();
    $this->assertDatabaseMissing('poll_sessions', ['id' => $session->id]);
});

it('rejects duplicate votes per question', function () {
    $poll = Poll::create([
        'user_id' => User::factory()->create()->id,
        'title' => 'Test poll',
        'description' => null,
    ]);

    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);

    $option = PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Option A',
        'order_index' => 0,
    ]);

    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'ABC12345',
        'status' => 'active',
        'current_question_id' => $question->id,
        'locked' => false,
        'started_at' => now(),
    ]);

    $payload = [
        'question_id' => $question->id,
        'option_id' => $option->id,
    ];

    $cookieName = "enkat_r_{$session->id}";
    $join = $this->postJson('/api/join', ['code' => $session->code]);
    $join->assertOk()->assertCookie($cookieName);

    $token = 'student-test-token';

    $first = $this->withCredentials()
        ->withCookie($cookieName, $token)
        ->postJson("/api/sessions/{$session->id}/vote", $payload);
    $first->assertOk();

    $second = $this->withCredentials()
        ->withCookie($cookieName, $token)
        ->postJson("/api/sessions/{$session->id}/vote", $payload);
    $second->assertStatus(409);
});

it('accepts lowercase join codes and returns closed sessions', function () {
    $poll = Poll::create([
        'user_id' => User::factory()->create()->id,
        'title' => 'Closed poll',
        'description' => null,
    ]);

    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);

    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Option A',
        'order_index' => 0,
    ]);

    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'ABC12345',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now(),
        'ended_at' => now(),
    ]);

    $response = $this->postJson('/api/join', ['code' => 'abc12345']);

    $response->assertOk();
    $response->assertJson([
        'session_id' => $session->id,
        'status' => 'closed',
    ]);
});
