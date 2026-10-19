<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Models\PollQuestion;
use App\Models\PollSession;
use App\Services\PollResultBuilder;
use Illuminate\Database\QueryException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SessionController extends Controller
{
    public function __construct(private readonly PollResultBuilder $results) {}

    public function store(Request $request, Poll $poll)
    {
        abort_unless($poll->user_id === $request->user()->id, 403);

        // En glömd omgång från en tidigare lektion ska inte återanvändas.
        PollSession::closeStale($poll->id);

        $active = $poll->sessions()->where('status', 'active')->first();
        if ($active) {
            return response()->json([
                'message' => 'This poll already has an active session.',
                'session_id' => $active->id,
            ], 409);
        }

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:255'],
        ]);

        try {
            $session = DB::transaction(function () use ($poll, $data) {
                $code = $this->generateCode();
                $firstQuestion = $poll->questions()->orderBy('order_index')->first();

                abort_if($firstQuestion === null, 422, 'The poll has no question.');

                return PollSession::create([
                    'poll_id' => $poll->id,
                    'code' => $code,
                    'name' => $data['name'] ?? null,
                    'status' => 'active',
                    'current_question_id' => $firstQuestion?->id,
                    'locked' => false,
                    'show_results' => true,
                    'started_at' => now(),
                ]);
            });
        } catch (QueryException $exception) {
            if (str_contains($exception->getMessage(), 'poll_sessions_one_active_per_poll')
                || str_contains($exception->getMessage(), 'poll_sessions.poll_id')) {
                return response()->json([
                    'message' => 'This poll already has an active session.',
                    'session_id' => $poll->sessions()->where('status', 'active')->value('id'),
                ], 409);
            }

            throw $exception;
        }

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
            ->with('poll:id,title,type')
            ->withCount('responses')
            ->orderByDesc('created_at')
            ->get()
            ->map(function (PollSession $session) {
                return [
                    'id' => $session->id,
                    'name' => $session->name,
                    'code' => $session->code,
                    'status' => $session->status,
                    'poll_id' => $session->poll_id,
                    'poll_title' => $session->poll?->title,
                    'poll_type' => $session->poll?->type ?? 'multiple_choice',
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

        if ($session->status !== 'closed') {
            $session->update([
                'status' => 'closed',
                'ended_at' => now(),
            ]);
        }

        return response()->json($this->sessionPayload($session, true));
    }

    public function setResultsVisibility(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        $data = $request->validate([
            'show_results' => ['required', 'boolean'],
        ]);

        $session->update(['show_results' => $data['show_results']]);

        return response()->json($this->sessionPayload($session, true));
    }

    public function setAnswerHidden(Request $request, PollSession $session)
    {
        $this->authorizeSession($request, $session);

        $data = $request->validate([
            'answer_text' => ['required', 'string', 'max:200'],
            'hidden' => ['required', 'boolean'],
        ]);

        $hidden = array_values(array_diff($session->hiddenAnswers(), [$data['answer_text']]));
        if ($data['hidden']) {
            $hidden[] = $data['answer_text'];
        }

        $session->update(['hidden_answers' => $hidden === [] ? null : $hidden]);

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
                $results = $this->results->forQuestion($pollType, $session, $question, null, true);
                foreach ($results as $result) {
                    fputcsv($handle, [
                        $this->safeCsvCell($question->question_text),
                        $this->safeCsvCell($result['option_text'] ?? $result['answer_text'] ?? ''),
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
        $alphabet = PollSession::CODE_ALPHABET;
        $max = strlen($alphabet) - 1;

        do {
            $code = '';
            for ($i = 0; $i < PollSession::CODE_LENGTH; $i++) {
                $code .= $alphabet[random_int(0, $max)];
            }
        } while (PollSession::where('code', $code)->exists());

        return $code;
    }

    private function safeCsvCell(string $value): string
    {
        return preg_match('/^[=+\-@\t\r]/u', $value) === 1 ? "'{$value}" : $value;
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
            'show_results' => (bool) $session->show_results,
            'hidden_answers' => $session->hiddenAnswers(),
            'current_question_id' => $session->current_question_id,
            'started_at' => $session->started_at?->format('Y-m-d H:i'),
            'ended_at' => $session->ended_at?->format('Y-m-d H:i'),
            'poll' => $session->poll,
        ];

        if ($includeResults) {
            $pollType = $session->poll?->type ?? 'multiple_choice';
            $results = [];
            $totals = [];
            foreach ($session->poll->questions as $question) {
                $results[$question->id] = $this->results->forQuestion($pollType, $session, $question, 200, true);
                $totals[$question->id] = $session->responses()->where('question_id', $question->id)->count();
            }
            $payload['results'] = $results;
            $payload['response_totals'] = $totals;
        }

        return $payload;
    }
}
