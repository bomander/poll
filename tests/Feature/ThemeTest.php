<?php

use App\Models\Poll;
use App\Models\PollQuestion;
use App\Models\PollSession;
use App\Models\User;

function themedPayload(array $settings = []): array
{
    return [
        'title' => 'Tema',
        'type' => 'word_cloud',
        'settings' => $settings,
        'questions' => [['question_text' => 'Ett ord?', 'options' => []]],
    ];
}

it('stores the chosen theme and drops unknown settings', function () {
    $user = User::factory()->create();

    $response = $this->actingAs($user)
        ->postJson('/api/polls', themedPayload(['theme' => 'rymd', 'secret' => 'x']))
        ->assertCreated();

    expect(Poll::find($response->json('id'))->settings)->toBe(['theme' => 'rymd']);
});

it('rejects themes that do not exist', function () {
    $user = User::factory()->create();

    $this->actingAs($user)
        ->postJson('/api/polls', themedPayload(['theme' => 'disco']))
        ->assertUnprocessable()
        ->assertJsonValidationErrors('settings.theme');
});

it('lets the teacher change the theme after the poll has been run', function () {
    $user = User::factory()->create();
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Körd', 'type' => 'word_cloud']);
    $question = PollQuestion::create(['poll_id' => $poll->id, 'question_text' => 'Ett ord?', 'order_index' => 0]);
    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'THEME2',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);

    $this->actingAs($user)
        ->patchJson("/api/polls/{$poll->id}/theme", ['theme' => 'tavla'])
        ->assertOk()
        ->assertJsonPath('settings.theme', 'tavla');
    auth()->logout();

    // Elever och projektor får temat direkt i nästa uppdatering.
    $this->postJson('/api/join', ['code' => 'THEME2'])
        ->assertOk()
        ->assertJsonPath('theme', 'tavla');
});

it('falls back to the playful theme when none is set', function () {
    $user = User::factory()->create();
    $poll = Poll::create(['user_id' => $user->id, 'title' => 'Utan tema', 'type' => 'word_cloud']);
    $question = PollQuestion::create(['poll_id' => $poll->id, 'question_text' => 'Ett ord?', 'order_index' => 0]);
    PollSession::create([
        'poll_id' => $poll->id,
        'code' => 'THEME3',
        'status' => 'active',
        'current_question_id' => $question->id,
        'started_at' => now(),
    ]);

    $this->postJson('/api/join', ['code' => 'THEME3'])
        ->assertOk()
        ->assertJsonPath('theme', 'lekfullt');
});

it('only lets the owner change the theme', function () {
    $owner = User::factory()->create();
    $poll = Poll::create(['user_id' => $owner->id, 'title' => 'Min', 'type' => 'word_cloud']);

    $this->actingAs(User::factory()->create())
        ->patchJson("/api/polls/{$poll->id}/theme", ['theme' => 'rymd'])
        ->assertForbidden();
    $this->actingAs($owner)
        ->patchJson("/api/polls/{$poll->id}/theme", ['theme' => 'disco'])
        ->assertUnprocessable();
});

it('keeps the theme when a poll is copied', function () {
    $user = User::factory()->create();
    $poll = Poll::create([
        'user_id' => $user->id,
        'title' => 'Original',
        'type' => 'word_cloud',
        'settings' => ['theme' => 'pixel'],
    ]);
    PollQuestion::create(['poll_id' => $poll->id, 'question_text' => 'Ett ord?', 'order_index' => 0]);

    $this->actingAs($user)
        ->postJson("/api/polls/{$poll->id}/clone")
        ->assertCreated()
        ->assertJsonPath('settings.theme', 'pixel');
});
