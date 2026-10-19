<?php

use App\Models\Poll;
use App\Models\PollResponse;
use App\Models\PollSession;
use App\Models\User;

function threeQuestionPayload(): array
{
    return [
        'title' => 'Kapitel 3',
        'type' => 'multiple_choice',
        'questions' => [
            ['question_text' => 'Vad är 2 + 2?', 'options' => ['3', '4']],
            ['question_text' => 'Vilken färg har himlen?', 'options' => ['Blå', 'Grön', 'Röd']],
            ['question_text' => 'Hur gick det?', 'options' => ['Bra', 'Sådär']],
        ],
    ];
}

/**
 * Skapar en enkät med tre frågor via API:t och startar en omgång.
 *
 * @return array{0: Poll, 1: array<int, int>, 2: int}
 */
function startThreeQuestionSession($test, User $user): array
{
    $pollId = $test->actingAs($user)->postJson('/api/polls', threeQuestionPayload())
        ->assertCreated()
        ->json('id');
    $poll = Poll::with('questions.options')->findOrFail($pollId);
    $questionIds = $poll->questions->pluck('id')->all();

    $sessionId = $test->actingAs($user)->postJson("/api/polls/{$pollId}/sessions")
        ->assertOk()
        ->assertJsonPath('current_question_id', $questionIds[0])
        ->json('id');

    return [$poll, $questionIds, $sessionId];
}

it('creates, edits and clones polls with several questions in order', function () {
    $user = User::factory()->create();

    $created = $this->actingAs($user)->postJson('/api/polls', threeQuestionPayload())
        ->assertCreated()
        ->assertJsonCount(3, 'questions')
        ->assertJsonPath('questions.1.question_text', 'Vilken färg har himlen?')
        ->assertJsonPath('questions.1.order_index', 1)
        ->assertJsonCount(3, 'questions.1.options');

    $pollId = $created->json('id');
    $payload = threeQuestionPayload();
    $payload['questions'] = [$payload['questions'][2], $payload['questions'][0]];

    $this->actingAs($user)->putJson("/api/polls/{$pollId}", $payload)
        ->assertOk()
        ->assertJsonCount(2, 'questions')
        ->assertJsonPath('questions.0.question_text', 'Hur gick det?')
        ->assertJsonPath('questions.1.question_text', 'Vad är 2 + 2?');

    $this->actingAs($user)->postJson("/api/polls/{$pollId}/clone")
        ->assertCreated()
        ->assertJsonCount(2, 'questions')
        ->assertJsonPath('questions.0.question_text', 'Hur gick det?')
        ->assertJsonPath('questions.0.options.1.option_text', 'Sådär')
        ->assertJsonPath('questions.1.question_text', 'Vad är 2 + 2?');
});

it('allows one to ten questions and validates each of them', function () {
    $user = User::factory()->create();
    $question = ['question_text' => 'Fråga', 'options' => ['Ja', 'Nej']];

    $this->actingAs($user)->postJson('/api/polls', ['title' => 'Tio', 'questions' => array_fill(0, 10, $question)])
        ->assertCreated()
        ->assertJsonCount(10, 'questions');

    $this->actingAs($user)->postJson('/api/polls', ['title' => 'Elva', 'questions' => array_fill(0, 11, $question)])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('questions');

    $this->actingAs($user)->postJson('/api/polls', ['title' => 'Ingen', 'questions' => []])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('questions');

    // Felen pekar ut rätt fråga, inte bara den första.
    $this->actingAs($user)->postJson('/api/polls', [
        'title' => 'Fel i senare frågor',
        'questions' => [
            $question,
            ['question_text' => 'Bara ett alternativ', 'options' => ['Ja']],
            ['question_text' => 'Dubbletter', 'options' => ['Ja', ' ja ']],
        ],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors(['questions.1.options', 'questions.2.options'])
        ->assertJsonMissingValidationErrors(['questions.0.options']);

    $this->actingAs($user)->postJson('/api/polls', [
        'title' => 'Ordmoln med alternativ',
        'type' => 'word_cloud',
        'questions' => [
            ['question_text' => 'Ett ord?'],
            ['question_text' => 'Ett till?', 'options' => ['Nej']],
        ],
    ])
        ->assertUnprocessable()
        ->assertJsonValidationErrors('questions.1.options');

    $this->actingAs($user)->postJson('/api/polls', [
        'title' => 'Ordmoln',
        'type' => 'word_cloud',
        'questions' => [['question_text' => 'Ett ord?'], ['question_text' => 'Ett till?']],
    ])
        ->assertCreated()
        ->assertJsonCount(2, 'questions');
});

it('lets the teacher step through the questions and the class follow', function () {
    $user = User::factory()->create();
    [, $questionIds, $sessionId] = startThreeQuestionSession($this, $user);
    $code = PollSession::findOrFail($sessionId)->code;

    $this->actingAs($user)->postJson("/api/sessions/{$sessionId}/lock-question", ['locked' => true])->assertOk();

    // Nästa fråga öppnar svaren igen.
    $this->actingAs($user)
        ->postJson("/api/sessions/{$sessionId}/current-question", ['question_id' => $questionIds[1]])
        ->assertOk()
        ->assertJsonPath('current_question_id', $questionIds[1])
        ->assertJsonPath('locked', false);
    auth()->logout();

    $this->postJson('/api/join', ['code' => $code])
        ->assertOk()
        ->assertJsonPath('current_question.id', $questionIds[1])
        ->assertJsonPath('current_question.question_text', 'Vilken färg har himlen?')
        ->assertJsonCount(3, 'current_question.options')
        ->assertJsonPath('question_number', 2)
        ->assertJsonPath('question_count', 3);

    // En fråga från en annan enkät går inte att välja.
    $other = $this->actingAs($user)->postJson('/api/polls', threeQuestionPayload())->json('questions.0.id');
    $this->actingAs($user)
        ->postJson("/api/sessions/{$sessionId}/current-question", ['question_id' => $other])
        ->assertNotFound();

    $this->actingAs($user)->postJson("/api/sessions/{$sessionId}/close")->assertOk();
    $this->actingAs($user)
        ->postJson("/api/sessions/{$sessionId}/current-question", ['question_id' => $questionIds[0]])
        ->assertStatus(409);
});

it('only accepts votes on the active question and tracks answers per question', function () {
    $user = User::factory()->create();
    [$poll, $questionIds, $sessionId] = startThreeQuestionSession($this, $user);
    $session = PollSession::findOrFail($sessionId);
    auth()->logout();

    $cookie = "enkat_r_{$sessionId}";
    $token = str_repeat('b', 40);
    $optionOf = fn (int $question, int $option) => $poll->questions[$question]->options[$option]->id;

    $this->withCredentials()->withCookie($cookie, $token)
        ->postJson("/api/sessions/{$sessionId}/vote", [
            'question_id' => $questionIds[0],
            'option_id' => $optionOf(0, 1),
        ])
        ->assertOk()
        ->assertJsonPath('has_voted', true)
        ->assertJsonPath('my_answer.option_id', $optionOf(0, 1));

    // Fråga 2 är inte aktiv än.
    $this->withCredentials()->withCookie($cookie, $token)
        ->postJson("/api/sessions/{$sessionId}/vote", [
            'question_id' => $questionIds[1],
            'option_id' => $optionOf(1, 0),
        ])
        ->assertStatus(409)
        ->assertJsonPath('message', 'Not the active question.');

    $this->actingAs($user)
        ->postJson("/api/sessions/{$sessionId}/current-question", ['question_id' => $questionIds[1]])
        ->assertOk();
    auth()->logout();

    // Samma elev har inte svarat på den nya frågan.
    $this->withCredentials()->withCookie($cookie, $token)
        ->postJson('/api/join', ['code' => $session->code])
        ->assertOk()
        ->assertJsonPath('has_voted', false)
        ->assertJsonPath('my_answer', null);

    // En röst på den tidigare frågan avvisas när läraren har gått vidare.
    $this->withCredentials()->withCookie($cookie, $token)
        ->postJson("/api/sessions/{$sessionId}/vote", [
            'question_id' => $questionIds[0],
            'option_id' => $optionOf(0, 0),
        ])
        ->assertStatus(409);

    $this->withCredentials()->withCookie($cookie, $token)
        ->postJson("/api/sessions/{$sessionId}/vote", [
            'question_id' => $questionIds[1],
            'option_id' => $optionOf(1, 2),
        ])
        ->assertOk()
        ->assertJsonPath('my_answer.option_id', $optionOf(1, 2))
        ->assertJsonPath('total_responses', 1);

    // Tillbaka till fråga 1: det tidigare svaret gäller fortfarande.
    $this->actingAs($user)
        ->postJson("/api/sessions/{$sessionId}/current-question", ['question_id' => $questionIds[0]])
        ->assertOk()
        ->assertJsonPath("response_totals.{$questionIds[0]}", 1)
        ->assertJsonPath("response_totals.{$questionIds[1]}", 1)
        ->assertJsonPath("response_totals.{$questionIds[2]}", 0);
    auth()->logout();

    $this->withCredentials()->withCookie($cookie, $token)
        ->postJson('/api/join', ['code' => $session->code])
        ->assertOk()
        ->assertJsonPath('has_voted', true)
        ->assertJsonPath('my_answer.option_id', $optionOf(0, 1));

    expect(PollResponse::where('session_id', $sessionId)->count())->toBe(2);
});

it('exports the results of every question in order', function () {
    $user = User::factory()->create();
    [$poll, $questionIds, $sessionId] = startThreeQuestionSession($this, $user);

    foreach ([[0, 1, 'a'], [0, 1, 'b'], [1, 0, 'a'], [2, 1, 'c']] as [$question, $option, $who]) {
        PollResponse::create([
            'session_id' => $sessionId,
            'question_id' => $questionIds[$question],
            'option_id' => $poll->questions[$question]->options[$option]->id,
            'respondent_key' => hash('sha256', "respondent-{$who}"),
        ]);
    }

    $export = $this->actingAs($user)->get("/api/sessions/{$sessionId}/export")->assertOk();
    $rows = array_map(
        'str_getcsv',
        array_values(array_filter(preg_split('/\R/', trim($export->streamedContent())))),
    );

    expect($rows)->toBe([
        ['question', 'option', 'count', 'percent'],
        ['Vad är 2 + 2?', '3', '0', '0'],
        ['Vad är 2 + 2?', '4', '2', '100'],
        ['Vilken färg har himlen?', 'Blå', '1', '100'],
        ['Vilken färg har himlen?', 'Grön', '0', '0'],
        ['Vilken färg har himlen?', 'Röd', '0', '0'],
        ['Hur gick det?', 'Bra', '0', '0'],
        ['Hur gick det?', 'Sådär', '1', '100'],
    ]);
});
