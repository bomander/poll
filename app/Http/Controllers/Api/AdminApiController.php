<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PollQuestion;
use App\Models\PollSession;
use App\Models\User;
use App\Services\PollResultBuilder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminApiController extends Controller
{
    public function __construct(private readonly PollResultBuilder $results) {}

    public function banUser(Request $request, User $user)
    {
        if (! $request->user()->is_admin) {
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

        $user = DB::transaction(function () use ($user, $data): User {
            $lockedUser = User::query()->lockForUpdate()->findOrFail($user->getKey());
            $lockedUser->forceFill([
                'is_banned' => true,
                'ban_reason' => $data['reason'] ?? null,
                'remember_token' => null,
                'identity_session_version' => (int) $lockedUser->identity_session_version + 1,
            ])->save();

            DB::table((string) config('session.table', 'sessions'))
                ->where('user_id', $lockedUser->getKey())
                ->delete();

            PollSession::query()
                ->whereHas('poll', fn ($query) => $query->where('user_id', $lockedUser->getKey()))
                ->where('status', 'active')
                ->update([
                    'status' => 'closed',
                    'locked' => true,
                    'ended_at' => now(),
                ]);

            return $lockedUser;
        }, 3);

        return response()->json(['message' => 'User banned.', 'user' => $user]);
    }

    public function unbanUser(Request $request, User $user)
    {
        if (! $request->user()->is_admin) {
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
        if (! $request->user()->is_admin) {
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
        $results = $this->results->forQuestion($pollType, $session, $question, null);

        if ($pollType === 'word_cloud') {
            return [
                'id' => $question->id,
                'question_text' => $question->question_text,
                'answers' => collect($results)->map(fn (array $result) => [
                    'answer_text' => $result['answer_text'],
                    'count' => $result['count'],
                ]),
                'total_responses' => collect($results)->sum('count'),
            ];
        }

        return [
            'id' => $question->id,
            'question_text' => $question->question_text,
            'options' => collect($results)->map(fn (array $result) => [
                'id' => $result['option_id'],
                'option_text' => $result['option_text'],
                'count' => $result['count'],
            ]),
            'total_responses' => collect($results)->sum('count'),
        ];
    }
}
