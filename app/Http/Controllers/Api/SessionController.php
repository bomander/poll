<?php

namespace App\Http\Controllers\Api;

use App\Events\ResultsUpdated;
use App\Events\SessionUpdated;
use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Models\PollQuestion;
use App\Models\PollSession;
use App\Models\PollResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class SessionController extends Controller
{
    public function store(Request $request, Poll $poll)
    {
        abort_unless($poll->user_id === $request->user()->id, 403);

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        $session = DB::transaction(function () use ($poll, $data) {
            $code = $this->generateCode();
            $firstQuestion = $poll->questions()->orderBy('order_index')->first();

            return PollSession::create([
                'poll_id' => $poll->id,
                'code' => $code,
                'name' => $data['name'] ?? null,
                'status' => 'active',
                'current_question_id' => $firstQuestion?->id,
                'locked' => false,
                'started_at' => now(),
            ]);
        });

        broadcast(new SessionUpdated($session))->toOthers();

        return response()->json($this->sessionPayload($session));
    }

    public function show(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        return response()->json($this->sessionPayload($session, true));
    }

    public function index(Request $request)
    {
        $sessions = PollSession::query()
            ->whereHas('poll', fn ($query) => $query->where('user_id', $request->user()->id))
            ->with('poll:id,title')
            ->withCount('responses')
            ->orderByDesc('created_at')
            ->get()
            ->map(function (PollSession $session) {
                return [
                    'id' => $session->id,
                    'name' => $session->name,
                    'code' => $session->code,
                    'status' => $session->status,
                    'poll_title' => $session->poll?->title,
                    'responses_count' => $session->responses_count,
                    'created_at' => $session->created_at?->format('Y-m-d H:i'),
                    'started_at' => $session->started_at?->format('Y-m-d H:i'),
                    'ended_at' => $session->ended_at?->format('Y-m-d H:i'),
                ];
            });

        return response()->json($sessions);
    }

    public function destroy(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        if ($session->status === 'active') {
            return response()->json(['message' => 'Cannot delete an active session.'], 409);
        }

        $session->delete();

        return response()->json(['message' => 'Session deleted.']);
    }

    public function close(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        $session->update([
            'status' => 'closed',
            'ended_at' => now(),
        ]);

        broadcast(new SessionUpdated($session))->toOthers();

        return response()->json($this->sessionPayload($session, true));
    }

    public function setCurrentQuestion(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        if ($session->status !== 'active') {
            return response()->json(['message' => 'Session is closed.'], 409);
        }

        $data = $request->validate([
            'question_id' => ['required', 'integer'],
        ]);

        $question = PollQuestion::where('poll_id', $session->poll_id)
            ->where('id', $data['question_id'])
            ->firstOrFail();

        $session->update([
            'current_question_id' => $question->id,
            'locked' => false,
        ]);

        broadcast(new SessionUpdated($session))->toOthers();

        return response()->json($this->sessionPayload($session, true));
    }

    public function lockQuestion(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        if ($session->status !== 'active') {
            return response()->json(['message' => 'Session is closed.'], 409);
        }

        $data = $request->validate([
            'locked' => ['required', 'boolean'],
        ]);

        $session->update([
            'locked' => $data['locked'],
        ]);

        broadcast(new SessionUpdated($session))->toOthers();

        return response()->json($this->sessionPayload($session, true));
    }

    public function export(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        $session->load('poll.questions.options');
        $pollType = $session->poll?->type ?? 'multiple_choice';

        $filename = 'session-'.$session->id.'-results.csv';

        return response()->streamDownload(function () use ($session, $pollType) {
            $handle = fopen('php://output', 'w');
            fputcsv($handle, ['question', 'option', 'count', 'percent']);

            foreach ($session->poll->questions as $question) {
                $results = $this->resultsForQuestion($pollType, $session, $question);
                foreach ($results as $result) {
                    fputcsv($handle, [
                        $question->question_text,
                        $result['option_text'] ?? $result['answer_text'] ?? '',
                        $result['count'],
                        $result['percent'],
                    ]);
                }
            }

            fclose($handle);
        }, $filename, ['Content-Type' => 'text/csv']);
    }

    private function authorizeSession(Request $request, PollSession $session): void
    {
        $session->loadMissing('poll');
        abort_unless($session->poll->user_id === $request->user()->id, 403);
    }

    private function generateCode(): string
    {
        do {
            $code = strtoupper(Str::random(8));
        } while (PollSession::where('code', $code)->exists());

        return $code;
    }

    private function sessionPayload(PollSession $session, bool $includeResults = false): array
    {
        $session->loadMissing('poll.questions.options', 'currentQuestion.options');

        $payload = [
            'id' => $session->id,
            'code' => $session->code,
            'name' => $session->name,
            'status' => $session->status,
            'locked' => $session->locked,
            'current_question_id' => $session->current_question_id,
            'poll' => $session->poll,
        ];

        if ($includeResults) {
            $pollType = $session->poll?->type ?? 'multiple_choice';
            $results = [];
            foreach ($session->poll->questions as $question) {
                $results[$question->id] = $this->resultsForQuestion($pollType, $session, $question);
            }
            $payload['results'] = $results;
        }

        return $payload;
    }

    private function resultsForQuestion(string $pollType, PollSession $session, PollQuestion $question): array
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
