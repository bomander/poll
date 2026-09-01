<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PollResponse;
use App\Models\PollSession;
use App\Services\PollResultBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class JoinController extends Controller
{
    public function __construct(private readonly PollResultBuilder $results) {}

    public function store(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'min:6', 'max:8'],
        ]);

        $code = Str::upper(trim($data['code']));
        $session = PollSession::where('code', $code)->firstOrFail();

        $session->load('poll', 'currentQuestion.options');
        $pollType = $session->poll?->type ?? 'multiple_choice';

        // Use a random, per-session cookie for anonymous duplicate-vote protection.
        $cookieName = "enkat_r_{$session->id}";
        $token = $request->cookie($cookieName);
        if (! is_string($token) || strlen($token) !== 40 || ! ctype_alnum($token)) {
            $token = Str::random(40);
        }

        $question = $session->currentQuestion;
        $results = $question ? $this->results->forQuestion($pollType, $session, $question) : [];
        $totalResponses = $question
            ? PollResponse::where('session_id', $session->id)
                ->where('question_id', $question->id)
                ->count()
            : 0;

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
            'poll_type' => $pollType,
            'current_question' => $question,
            'results' => $results,
            'total_responses' => $totalResponses,
            'has_voted' => $hasVoted,
        ])->cookie(
            $cookieName,
            $token,
            60 * 24,
            (string) config('session.path', '/'),
            config('session.domain'),
            (bool) (config('session.secure') ?? $request->isSecure()),
            true,
            false,
            'Lax'
        );
    }
}
