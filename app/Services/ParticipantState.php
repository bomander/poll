<?php

namespace App\Services;

use App\Models\PollResponse;
use App\Models\PollSession;

/**
 * Det elever och projektorn får se av en session. Resultat skickas bara när
 * läraren låter dem synas, och dolda ordmolnssvar räknas aldrig med.
 */
class ParticipantState
{
    public function __construct(private readonly PollResultBuilder $results) {}

    public function for(PollSession $session, ?string $respondentKey = null): array
    {
        $session->loadMissing('poll', 'currentQuestion.options');
        $pollType = $session->poll?->type ?? 'multiple_choice';
        $question = $session->currentQuestion;

        $totalResponses = 0;
        $myAnswer = null;
        // Frågorna i enkätordning, så att elever och projektor kan visa "Fråga 2 av 5".
        $questionIds = $session->poll
            ? $session->poll->questions()->pluck('id')->map(fn ($id) => (int) $id)->all()
            : [];
        $position = $question ? array_search((int) $question->id, $questionIds, true) : false;

        if ($question) {
            $responses = PollResponse::where('session_id', $session->id)
                ->where('question_id', $question->id);
            $totalResponses = (clone $responses)->count();

            if ($respondentKey !== null) {
                $mine = (clone $responses)->where('respondent_key', $respondentKey)->first();
                if ($mine) {
                    $myAnswer = $pollType === 'word_cloud'
                        ? ['answer_text' => $mine->answer_text]
                        : ['option_id' => $mine->option_id];
                }
            }
        }

        $showResults = (bool) $session->show_results;

        return [
            'session_id' => $session->id,
            'status' => $session->status,
            'locked' => (bool) $session->locked,
            'show_results' => $showResults,
            'poll_title' => $session->poll?->title,
            'poll_type' => $pollType,
            'current_question' => $question ? [
                'id' => $question->id,
                'question_text' => $question->question_text,
                'options' => $question->options->map(fn ($option) => [
                    'id' => $option->id,
                    'option_text' => $option->option_text,
                ])->values()->all(),
            ] : null,
            'question_number' => $position === false ? null : $position + 1,
            'question_count' => count($questionIds),
            'results' => $question && $showResults
                ? $this->results->forQuestion($pollType, $session, $question)
                : [],
            'total_responses' => $totalResponses,
            'has_voted' => $myAnswer !== null,
            'my_answer' => $myAnswer,
        ];
    }
}
