<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PollSession;
use App\Models\PollResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class JoinController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'min:6', 'max:8'],
        ]);

        $code = Str::upper(trim($data['code']));
        $session = PollSession::where('code', $code)->firstOrFail();

        $session->load('poll', 'currentQuestion.options');

        // Use cookie-based token for respondent identification
        $cookieName = "enkat_r_{$session->id}";
        $token = $request->cookie($cookieName);
        if (!is_string($token) || strlen($token) !== 40) {
            $token = Str::random(40);
        }
        
        $question = $session->currentQuestion;
        $results = $question ? $this->resultsForQuestion($session->id, $question->id) : [];

        // Check if user already voted on current question
        $hasVoted = false;
        if ($question) {
            $respondentKey = hash('sha256', $token);
            $hasVoted = PollResponse::where('session_id', $session->id)
                ->where('question_id', $question->id)
                ->where('respondent_key', $respondentKey)
                ->exists();
        }

        return response()->json([
            'session_id' => $session->id,
            'status' => $session->status,
            'locked' => $session->locked,
            'poll_title' => $session->poll?->title,
            'current_question' => $question,
            'results' => $results,
            'has_voted' => $hasVoted,
        ])->cookie(
            $cookieName,
            $token,
            60 * 24,
            '/',
            null,
            $request->isSecure(),
            true,
            false,
            'Lax'
        );
    }

    private function resultsForQuestion(int $sessionId, int $questionId): array
    {
        $counts = PollResponse::query()
            ->where('session_id', $sessionId)
            ->where('question_id', $questionId)
            ->select('option_id', DB::raw('count(*) as total'))
            ->groupBy('option_id')
            ->pluck('total', 'option_id');

        $options = DB::table('poll_options')
            ->where('question_id', $questionId)
            ->orderBy('order_index')
            ->get(['id', 'option_text']);

        $total = $counts->sum();

        return $options->map(function ($option) use ($counts, $total) {
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
