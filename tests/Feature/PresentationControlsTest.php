<?php

use App\Models\Poll;
use App\Models\PollOption;
use App\Models\PollQuestion;
use App\Models\PollResponse;
use App\Models\PollSession;
use App\Models\User;

function choicePoll(User $user): array
{
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Läget', 'type' => 'multiple_choice']);
    $question = PollQuestion::create(['poll_id' => $poll->id, 'question_text' => 'Hur går det?', 'order_index' => 0]);
    $yes = PollOption::create(['question_id' => $question->id, 'option_text' => 'Bra', 'order_index' => 0]);
    $no = PollOption::create(['question_id' => $question->id, 'option_text' => 'Sådär', 'order_index' => 1]);

    return [$poll, $question, $yes, $no];
}

it('creates short codes without easily confused characters', function () {
    $user = User::factory()->create();
    [$poll] = choicePoll($user);

    $response = $this->actingAs($user)->postJson("/api/polls/{$poll->id}/sessions")->assertOk();

    expect($response->json('code'))
        ->toHaveLength(6)
        ->toMatch('/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]+$/')
        ->and($response->json('show_results'))->toBeTrue();
});

it('accepts codes typed with spaces, dashes and lowercase letters', function () {
    $user = User::factory()->create();
    [$poll, $question] = choicePoll($user);
    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'ABC234',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);

    $this->postJson('/api/join', ['code' => ' abc 2-34 '])
        ->assertOk()
        ->assertJsonPath('code', 'ABC234');
    $this->postJson('/api/join', ['code' => 'AB'])->assertUnprocessable();
});

it('points to the running session instead of failing when a poll is started twice', function () {
    $user = User::factory()->create();
    [$poll] = choicePoll($user);

    $first = $this->actingAs($user)->postJson("/api/polls/{$poll->id}/sessions")->assertOk();

    $this->actingAs($user)->postJson("/api/polls/{$poll->id}/sessions")
        ->assertStatus(409)
        ->assertJsonPath('session_id', $first->json('id'));
});

it('hides results from students and the projector until the teacher shows them', function () {
    $user = User::factory()->create();
    [$poll, $question, $yes] = choicePoll($user);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'HIDE23',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);

    $this->actingAs($user)
        ->postJson("/api/sessions/{$session->id}/results-visibility", ['show_results' => false])
        ->assertOk()
        ->assertJsonPath('show_results', false);
    auth()->logout();

    $this->postJson('/api/join', ['code' => 'HIDE23'])
        ->assertOk()
        ->assertJsonPath('show_results', false)
        ->assertJsonPath('results', [])
        ->assertJsonPath('has_voted', false)
        ->assertJsonPath('current_question.options.0.option_text', 'Bra');

    $cookie = "enkat_r_{$session->id}";
    $token = str_repeat('b', 40);
    $vote = $this->withCredentials()->withCookie($cookie, $token)->postJson("/api/sessions/{$session->id}/vote", [
        'question_id' => $question->id,
        'option_id' => $yes->id,
    ])->assertOk();

    // Eleven får veta vad den själv svarade, men inte hur klassen svarade.
    $vote->assertJsonPath('results', [])
        ->assertJsonPath('total_responses', 1)
        ->assertJsonPath('has_voted', true)
        ->assertJsonPath('my_answer.option_id', $yes->id);

    $teacher = $this->actingAs($user)->getJson("/api/sessions/{$session->id}")->assertOk();
    expect($teacher->json("results.{$question->id}.0.count"))->toBe(1)
        ->and($teacher->json("response_totals.{$question->id}"))->toBe(1);

    $this->actingAs($user)
        ->postJson("/api/sessions/{$session->id}/results-visibility", ['show_results' => true])
        ->assertOk();
    auth()->logout();

    $this->withCredentials()->withCookie($cookie, $token)->postJson('/api/join', ['code' => 'HIDE23'])
        ->assertOk()
        ->assertJsonPath('results.0.count', 1)
        ->assertJsonPath('has_voted', true);
});

it('lets the teacher hide a word cloud answer from the class', function () {
    $user = User::factory()->create();
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Ord', 'type' => 'word_cloud']);
    $question = PollQuestion::create(['poll_id' => $poll->id, 'question_text' => 'Ett ord?', 'order_index' => 0]);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'WORD23',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);
    foreach (['sol', 'sol', 'olämpligt'] as $index => $answer) {
        PollResponse::create([
            'session_id' => $session->id,
            'question_id' => $question->id,
            'answer_text' => $answer,
            'respondent_key' => hash('sha256', "r{$index}"),
        ]);
    }

    $teacher = $this->actingAs($user)
        ->postJson("/api/sessions/{$session->id}/hidden-answers", ['answer_text' => 'olämpligt', 'hidden' => true])
        ->assertOk()
        ->assertJsonPath('hidden_answers', ['olämpligt']);
    expect(collect($teacher->json("results.{$question->id}"))->firstWhere('answer_text', 'olämpligt')['hidden'])->toBeTrue();
    auth()->logout();

    $public = $this->postJson('/api/join', ['code' => 'WORD23'])->assertOk();
    expect(collect($public->json('results'))->pluck('answer_text')->all())->toBe(['sol'])
        ->and($public->json('results.0.percent'))->toEqual(100);

    $this->actingAs($user)
        ->postJson("/api/sessions/{$session->id}/hidden-answers", ['answer_text' => 'olämpligt', 'hidden' => false])
        ->assertOk()
        ->assertJsonPath('hidden_answers', []);
});

it('rejects word cloud answers that are too long for the projector', function () {
    $user = User::factory()->create();
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Ord', 'type' => 'word_cloud']);
    $question = PollQuestion::create(['poll_id' => $poll->id, 'question_text' => 'Ett ord?', 'order_index' => 0]);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'LONG23',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);

    $this->withCredentials()->withCookie("enkat_r_{$session->id}", str_repeat('c', 40))->postJson("/api/sessions/{$session->id}/vote", [
        'question_id' => $question->id,
        'answer_text' => str_repeat('a', 61),
    ])->assertUnprocessable();
});

it('keeps the original end time when a session is closed twice', function () {
    $user = User::factory()->create();
    [$poll, $question] = choicePoll($user);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'END234',
        'status' => 'closed',
        'current_question_id' => $question->id,
        'started_at' => now()->subHour(),
        'ended_at' => now()->subMinutes(30),
    ]);
    $endedAt = $session->ended_at->toDateTimeString();

    $this->actingAs($user)->postJson("/api/sessions/{$session->id}/close")->assertOk();

    expect($session->fresh()->ended_at->toDateTimeString())->toBe($endedAt);
});

it('deletes a poll with its closed sessions but not while a session is running', function () {
    $user = User::factory()->create();
    [$poll, $question, $yes] = choicePoll($user);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'DEL234',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);
    PollResponse::create([
        'session_id' => $session->id,
        'question_id' => $question->id,
        'option_id' => $yes->id,
        'respondent_key' => hash('sha256', 'r'),
    ]);

    $this->actingAs($user)->deleteJson("/api/polls/{$poll->id}")->assertStatus(409);

    $session->update(['status' => 'closed', 'ended_at' => now()]);
    $this->actingAs($user)->deleteJson("/api/polls/{$poll->id}")->assertOk();

    $this->assertDatabaseMissing('polls', ['id' => $poll->id]);
    $this->assertDatabaseMissing('poll_sessions', ['id' => $session->id]);
    $this->assertDatabaseMissing('responses', ['session_id' => $session->id]);
});

it('only lets the owner control presentation and delete polls', function () {
    $owner = User::factory()->create();
    $other = User::factory()->create();
    [$poll, $question] = choicePoll($owner);
    $session = PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'OWN234',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);

    $this->actingAs($other)
        ->postJson("/api/sessions/{$session->id}/results-visibility", ['show_results' => false])
        ->assertForbidden();
    $this->actingAs($other)
        ->postJson("/api/sessions/{$session->id}/hidden-answers", ['answer_text' => 'x', 'hidden' => true])
        ->assertForbidden();
    $this->actingAs($other)->deleteJson("/api/polls/{$poll->id}")->assertForbidden();
});

it('renders the projector with a join link and qr code', function () {
    $this->get('/projector/abc234')
        ->assertOk()
        ->assertInertia(fn ($page) => $page
            ->component('public/projector')
            ->where('code', 'ABC234')
            ->where('joinUrl', rtrim(config('app.url'), '/').'/join?code=ABC234')
            ->where('qrSvg', fn ($svg) => str_starts_with($svg, '<svg')));
});
