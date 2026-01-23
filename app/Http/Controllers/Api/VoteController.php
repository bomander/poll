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
        $data = $request->validate([
            'question_id' => ['required', 'integer'],
            'option_id' => ['required', 'integer'],
        ]);

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

        PollOption::where('question_id', $question->id)
            ->where('id', $data['option_id'])
            ->firstOrFail();

        $respondentKey = hash('sha256', $token);

        $alreadyVoted = PollResponse::where('session_id', $session->id)
            ->where('question_id', $question->id)
            ->where('respondent_key', $respondentKey)
            ->exists();

        if ($alreadyVoted) {
            return response()->json(['message' => 'Already voted.'], 409);
        }

        try {
            DB::transaction(function () use ($session, $question, $data, $respondentKey) {
                PollResponse::create([
                    'session_id' => $session->id,
                    'question_id' => $question->id,
                    'option_id' => $data['option_id'],
                    'respondent_key' => $respondentKey,
                ]);
            });
        } catch (\Illuminate\Database\QueryException $exception) {
            if (str_contains($exception->getMessage(), 'responses_unique_vote')) {
                return response()->json(['message' => 'Already voted.'], 409);
            }

            throw $exception;
        }

        $results = $this->resultsForQuestion($session, $question);

        broadcast(new ResultsUpdated($session, $question->id, $results))->toOthers();

        return response()->json([
            'results' => $results,
        ]);
    }

    private function resultsForQuestion(PollSession $session, PollQuestion $question): array
    {
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
}
