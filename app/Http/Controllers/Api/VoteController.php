<?php

namespace App\Http\Controllers\Api;

use App\Events\ResultsUpdated;
use App\Http\Controllers\Controller;
use App\Models\PollOption;
use App\Models\PollQuestion;
use App\Models\PollResponse;
use App\Models\PollSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class VoteController extends Controller
{
    public function store(Request $request, PollSession $session)
    {
        $session->loadMissing('poll');
        $pollType = $session->poll->type ?? 'multiple_choice';

        $rules = [
            'question_id' => ['required', 'integer'],
        ];

        if ($pollType === 'multiple_choice') {
            $rules['option_id'] = ['required', 'integer'];
            $rules['answer_text'] = ['prohibited'];
        } elseif ($pollType === 'word_cloud') {
            $rules['answer_text'] = ['required', 'string', 'max:200'];
            $rules['option_id'] = ['prohibited'];
        } else {
            return response()->json(['message' => 'Unknown poll type.'], 409);
        }

        $data = $request->validate($rules);

        if ($session->status !== 'active') {
            return response()->json(['message' => 'Session is closed.'], 409);
        }

        if ($session->locked) {
            return response()->json(['message' => 'Question is locked.'], 409);
        }

        if ((int) $session->current_question_id !== (int) $data['question_id']) {
            return response()->json(['message' => 'Not the active question.'], 409);
        }

        // Get respondent token from cookie
        $cookieName = "enkat_r_{$session->id}";
        $token = $request->cookie($cookieName);
        
        if (!$token) {
            return response()->json(['message' => 'No respondent token.'], 400);
        }

        $question = PollQuestion::where('poll_id', $session->poll_id)
            ->where('id', $data['question_id'])
            ->firstOrFail();

        $optionId = null;
        $answerText = null;

        if ($pollType === 'multiple_choice') {
            $optionId = (int) $data['option_id'];
            PollOption::where('question_id', $question->id)
                ->where('id', $optionId)
                ->firstOrFail();
        }

        if ($pollType === 'word_cloud') {
            $answerText = $this->normalizeAnswerText($data['answer_text']);
            if ($answerText === '') {
                return response()->json(['message' => 'Answer cannot be empty.'], 422);
            }
        }

        $respondentKey = hash('sha256', $token);

        $alreadyVoted = PollResponse::where('session_id', $session->id)
            ->where('question_id', $question->id)
            ->where('respondent_key', $respondentKey)
            ->exists();

        if ($alreadyVoted) {
            return response()->json(['message' => 'Already voted.'], 409);
        }

        try {
            DB::transaction(function () use ($session, $question, $respondentKey, $optionId, $answerText) {
                PollResponse::create([
                    'session_id' => $session->id,
                    'question_id' => $question->id,
                    'option_id' => $optionId,
                    'answer_text' => $answerText,
                    'respondent_key' => $respondentKey,
                ]);
            });
        } catch (\Illuminate\Database\QueryException $exception) {
            if (str_contains($exception->getMessage(), 'responses_unique_vote')) {
                return response()->json(['message' => 'Already voted.'], 409);
            }

            throw $exception;
        }

        $results = $this->resultsForQuestion($session, $question, $pollType);

        broadcast(new ResultsUpdated($session, $question->id, $results))->toOthers();

        return response()->json([
            'results' => $results,
        ]);
    }

    private function resultsForQuestion(PollSession $session, PollQuestion $question, string $pollType): array
    {
        if ($pollType === 'word_cloud') {
            $counts = PollResponse::query()
                ->where('session_id', $session->id)
                ->where('question_id', $question->id)
                ->whereNotNull('answer_text')
                ->select('answer_text', DB::raw('count(*) as total'))
                ->groupBy('answer_text')
                ->orderByDesc('total')
                ->limit(50)
                ->get();

            $total = (int) $counts->sum('total');

            return $counts->map(function ($row) use ($total) {
                $count = (int) $row->total;
                $percent = $total > 0 ? round(($count / $total) * 100, 2) : 0;

                return [
                    'answer_text' => $row->answer_text,
                    'count' => $count,
                    'percent' => $percent,
                ];
            })->all();
        }

        $counts = PollResponse::query()
            ->where('session_id', $session->id)
            ->where('question_id', $question->id)
            ->select('option_id', DB::raw('count(*) as total'))
            ->groupBy('option_id')
            ->pluck('total', 'option_id');

        $total = $counts->sum();

        $question->loadMissing('options');

        return $question->options->map(function ($option) use ($counts, $total) {
            $count = (int) ($counts[$option->id] ?? 0);
            $percent = $total > 0 ? round(($count / $total) * 100, 2) : 0;

            return [
                'option_id' => $option->id,
                'option_text' => $option->option_text,
                'count' => $count,
                'percent' => $percent,
            ];
        })->all();
    }

    private function normalizeAnswerText(string $text): string
    {
        $text = trim($text);
        $text = preg_replace('/\\s+/u', ' ', $text) ?? $text;

        return mb_strtolower($text, 'UTF-8');
    }
}
