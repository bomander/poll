<?php

use App\Models\Poll;
use App\Models\PollOption;
use App\Models\PollQuestion;
use App\Models\PollResponse;
use App\Models\PollSession;
use App\Models\User;
use Illuminate\Database\QueryException;

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

it('preserves historical results by preventing edits after a closed session', function () {
    $user = User::factory()->create();
    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Historical poll',
        'description' => null,
    ]);
    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Original question',
        'order_index' => 0,
    ]);
    $option = PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Original option',
        'order_index' => 0,
    ]);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'HIST1234',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now()->subMinute(),
        'ended_at' => now(),
    ]);
    PollResponse::create([
        'session_id' => $session->id,
        'question_id' => $question->id,
        'option_id' => $option->id,
        'respondent_key' => hash('sha256', 'historical-voter'),
    ]);

    $response = $this->actingAs($user)->putJson("/api/polls/{$poll->id}", [
        'title' => 'Changed poll',
        'description' => null,
        'questions' => [[
            'question_text' => 'Changed question',
            'options' => ['Yes', 'No'],
        ]],
    ]);

    $response->assertStatus(409);
    $this->assertDatabaseHas('responses', ['session_id' => $session->id]);
    expect($question->fresh()->question_text)->toBe('Original question');
});

it('rejects blank or duplicate answer options', function () {
    $user = User::factory()->create();

    $this->actingAs($user)->postJson('/api/polls', [
        'title' => 'Duplicate options',
        'questions' => [[
            'question_text' => 'Pick one',
            'options' => ['Yes', ' yes '],
        ]],
    ])->assertUnprocessable()->assertJsonValidationErrors('questions.0.options');

    $this->actingAs($user)->postJson('/api/polls', [
        'title' => 'Blank option',
        'questions' => [[
            'question_text' => 'Pick one',
            'options' => ['Yes', '   '],
        ]],
    ])->assertUnprocessable()->assertJsonValidationErrors('questions.0.options.1');
});

it('keeps the existing word cloud type when an update omits it', function () {
    $user = User::factory()->create();
    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Editable words',
        'type' => 'word_cloud',
    ]);
    PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Old question',
        'order_index' => 0,
    ]);

    $this->actingAs($user)->putJson("/api/polls/{$poll->id}", [
        'title' => 'Updated words',
        'questions' => [[
            'question_text' => 'New question',
            'options' => [],
        ]],
    ])->assertOk()->assertJsonPath('type', 'word_cloud');

    expect($poll->fresh()->type)->toBe('word_cloud');
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

it('prevents concurrent active sessions for the same poll', function () {
    $user = User::factory()->create();
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'One live run']);
    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);
    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Yes',
        'order_index' => 0,
    ]);
    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'LIVE1234',
        'status' => 'active',
        'current_question_id' => $question->id,
        'locked' => false,
        'started_at' => now(),
    ]);

    $this->actingAs($user)
        ->postJson("/api/polls/{$poll->id}/sessions")
        ->assertConflict();

    expect($poll->sessions()->count())->toBe(1);
});

it('enforces one active session per poll in the database', function () {
    $user = User::factory()->create();
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Database guard']);
    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);
    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'GUARD001',
        'status' => 'active',
        'current_question_id' => $question->id,
        'locked' => false,
        'started_at' => now(),
    ]);

    expect(fn () => PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'GUARD002',
        'status' => 'active',
        'current_question_id' => $question->id,
        'locked' => false,
        'started_at' => now(),
    ]))->toThrow(QueryException::class);

    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'GUARD003',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now()->subMinute(),
        'ended_at' => now(),
    ]);

    expect($poll->sessions()->count())->toBe(2);
});

it('clones an immutable poll into an editable copy', function () {
    $user = User::factory()->create();
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Original']);
    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Pick one',
        'order_index' => 0,
    ]);
    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Yes',
        'order_index' => 0,
    ]);
    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'CLONE123',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now()->subMinute(),
        'ended_at' => now(),
    ]);

    $response = $this->actingAs($user)
        ->postJson("/api/polls/{$poll->id}/clone")
        ->assertCreated()
        ->assertJsonPath('sessions_count', 0)
        ->assertJsonPath('questions.0.question_text', 'Pick one');

    expect((int) $response->json('id'))->not->toBe($poll->id);
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

    $token = str_repeat('a', 40);

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

it('supports word cloud polls and stores text responses', function () {
    $user = User::factory()->create();

    $create = $this->actingAs($user)->postJson('/api/polls', [
        'title' => 'Word cloud',
        'description' => null,
        'type' => 'word_cloud',
        'questions' => [
            [
                'question_text' => 'One word?',
                'options' => [],
            ],
        ],
    ]);

    $create->assertCreated();
    $pollId = $create->json('id');

    $session = $this->actingAs($user)->postJson("/api/polls/{$pollId}/sessions", [
        'name' => null,
    ]);
    $session->assertOk();

    $sessionId = $session->json('id');
    $questionId = $session->json('current_question_id');

    $cookieName = "enkat_r_{$sessionId}";
    $join = $this->postJson('/api/join', ['code' => $session->json('code')]);
    $join->assertOk()->assertCookie($cookieName);

    $token = str_repeat('b', 40);

    $vote = $this->withCredentials()
        ->withCookie($cookieName, $token)
        ->postJson("/api/sessions/{$sessionId}/vote", [
            'question_id' => $questionId,
            'answer_text' => 'Hej',
        ]);

    $vote->assertOk();
    $vote->assertJsonFragment(['answer_text' => 'hej']);
    $vote->assertJsonPath('total_responses', 1);
    $this->assertDatabaseHas('responses', [
        'session_id' => $sessionId,
        'question_id' => $questionId,
        'answer_text' => 'hej',
    ]);
});

it('scopes respondent cookies to the service and rejects malformed tokens', function () {
    config(['session.path' => '/enkat/']);
    $poll = Poll::create([
        'user_id' => User::factory()->create()->id,
        'title' => 'Cookie poll',
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
        'code' => 'COOKIE12',
        'status' => 'active',
        'current_question_id' => $question->id,
        'locked' => false,
        'started_at' => now(),
    ]);

    $join = $this->postJson('/api/join', ['code' => $session->code]);
    $cookieName = "enkat_r_{$session->id}";
    $cookie = collect($join->headers->getCookies())
        ->first(fn ($candidate) => $candidate->getName() === $cookieName);

    expect($cookie)->not->toBeNull()
        ->and($cookie->getPath())->toBe('/enkat/');

    $this->withCookie($cookieName, 'invalid')
        ->postJson("/api/sessions/{$session->id}/vote", [
            'question_id' => $question->id,
            'option_id' => $option->id,
        ])
        ->assertBadRequest();
});

it('uses all word cloud responses for percentages and exports every answer', function () {
    $user = User::factory()->create();
    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Large word cloud',
        'type' => 'word_cloud',
    ]);
    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'One word?',
        'order_index' => 0,
    ]);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'WORDS123',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now()->subMinute(),
        'ended_at' => now(),
    ]);

    foreach (range(1, 51) as $index) {
        PollResponse::create([
            'session_id' => $session->id,
            'question_id' => $question->id,
            'answer_text' => sprintf('answer-%02d', $index),
            'respondent_key' => hash('sha256', "respondent-{$index}"),
        ]);
    }

    $show = $this->actingAs($user)->getJson("/api/sessions/{$session->id}");

    $show->assertOk();
    expect($show->json("results.{$question->id}"))
        ->toHaveCount(50)
        ->each(fn ($result) => $result->percent->toBe(1.96));

    $this->postJson('/api/join', ['code' => $session->code])
        ->assertOk()
        ->assertJsonPath('total_responses', 51);

    $export = $this->actingAs($user)->get("/api/sessions/{$session->id}/export");

    $export->assertOk();
    $rows = array_values(array_filter(preg_split('/\R/', trim($export->streamedContent()))));
    expect($rows)->toHaveCount(52);
});

it('prevents access to another users polls and sessions', function () {
    $owner = User::factory()->create();
    $otherUser = User::factory()->create();
    $poll = Poll::create([
        'user_id' => $owner->id,
        'title' => 'Private poll',
    ]);
    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => 'Private question',
        'order_index' => 0,
    ]);
    PollOption::create([
        'question_id' => $question->id,
        'option_text' => 'Private option',
        'order_index' => 0,
    ]);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'OWNER123',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now()->subMinute(),
        'ended_at' => now(),
    ]);

    $this->actingAs($otherUser)->getJson("/api/polls/{$poll->id}")->assertForbidden();
    $this->actingAs($otherUser)->postJson("/api/polls/{$poll->id}/clone")->assertForbidden();
    $this->actingAs($otherUser)->getJson("/api/sessions/{$session->id}")->assertForbidden();
    $this->actingAs($otherUser)->get("/api/sessions/{$session->id}/export")->assertForbidden();
});

it('neutralizes spreadsheet formulas in csv exports', function () {
    $user = User::factory()->create();
    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Safe export',
        'type' => 'word_cloud',
    ]);
    $question = PollQuestion::create([
        'poll_id' => $poll->id,
        'question_text' => '=DANGEROUS()',
        'order_index' => 0,
    ]);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'CSVSAFE1',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'locked' => true,
        'started_at' => now()->subMinute(),
        'ended_at' => now(),
    ]);
    PollResponse::create([
        'session_id' => $session->id,
        'question_id' => $question->id,
        'answer_text' => '@DANGEROUS',
        'respondent_key' => hash('sha256', 'csv-voter'),
    ]);

    $content = $this->actingAs($user)
        ->get("/api/sessions/{$session->id}/export")
        ->streamedContent();

    expect($content)
        ->toContain("'=DANGEROUS()")
        ->toContain("'@DANGEROUS");
});
