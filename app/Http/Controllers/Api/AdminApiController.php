<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PollResponse;
use App\Models\PollQuestion;
use App\Models\PollSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminApiController extends Controller
{
    public function banUser(Request $request, User $user)
    {
        if (!$request->user()->is_admin) {
            abort(403);
        }

        // Prevent banning yourself
        if ($user->id === $request->user()->id) {
            return response()->json(['message' => 'Cannot ban yourself.'], 422);
        }

        // Prevent banning other admins
        if ($user->is_admin) {
            return response()->json(['message' => 'Cannot ban an admin.'], 422);
        }

        $data = $request->validate([
            'reason' => ['nullable', 'string', 'max:500'],
        ]);

        $user->update([
            'is_banned' => true,
            'ban_reason' => $data['reason'] ?? null,
        ]);

        return response()->json(['message' => 'User banned.', 'user' => $user]);
    }

    public function unbanUser(Request $request, User $user)
    {
        if (!$request->user()->is_admin) {
            abort(403);
        }

        $user->update([
            'is_banned' => false,
            'ban_reason' => null,
        ]);

        return response()->json(['message' => 'User unbanned.', 'user' => $user]);
    }

    public function sessionDetails(Request $request, PollSession $session)
    {
        if (!$request->user()->is_admin) {
            abort(403);
        }

        $session->load(['poll.questions.options']);
        $pollType = $session->poll?->type ?? 'multiple_choice';

        $questions = $session->poll->questions->map(function ($question) use ($pollType, $session) {
            return $this->questionDetailsForSession($pollType, $session, $question);
        });

        return response()->json([
            'session_id' => $session->id,
            'poll_type' => $pollType,
            'questions' => $questions,
        ]);
    }

    private function questionDetailsForSession(string $pollType, PollSession $session, PollQuestion $question): array
    {
        if ($pollType === 'word_cloud') {
            $counts = PollResponse::query()
                ->where('session_id', $session->id)
                ->where('question_id', $question->id)
                ->whereNotNull('answer_text')
                ->select('answer_text', DB::raw('count(*) as total'))
                ->groupBy('answer_text')
                ->orderByDesc('total')
                ->get();

            $totalResponses = (int) $counts->sum('total');

            return [
                'id' => $question->id,
                'question_text' => $question->question_text,
                'answers' => $counts->map(fn ($row) => [
                    'answer_text' => $row->answer_text,
                    'count' => (int) $row->total,
                ]),
                'total_responses' => $totalResponses,
            ];
        }

        $counts = PollResponse::query()
            ->where('session_id', $session->id)
            ->where('question_id', $question->id)
            ->select('option_id', DB::raw('count(*) as total'))
            ->groupBy('option_id')
            ->pluck('total', 'option_id');

        $totalResponses = $counts->sum();

        return [
            'id' => $question->id,
            'question_text' => $question->question_text,
            'options' => $question->options->map(fn ($option) => [
                'id' => $option->id,
                'option_text' => $option->option_text,
                'count' => (int) ($counts[$option->id] ?? 0),
            ]),
            'total_responses' => $totalResponses,
        ];
    }
}
