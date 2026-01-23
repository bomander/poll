<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PollResponse;
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

        $questions = $session->poll->questions->map(function ($question) use ($session) {
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
                'options' => $question->options->map(fn($option) => [
                    'id' => $option->id,
                    'option_text' => $option->option_text,
                    'count' => (int) ($counts[$option->id] ?? 0),
                ]),
                'total_responses' => $totalResponses,
            ];
        });

        return response()->json([
            'session_id' => $session->id,
            'questions' => $questions,
        ]);
    }
}
