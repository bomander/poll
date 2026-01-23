<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Models\PollOption;
use App\Models\PollQuestion;
use App\Models\PollSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class PollController extends Controller
{
    private const POLL_TYPES = ['multiple_choice', 'word_cloud'];

    public function index(Request $request)
    {
        $polls = Poll::query()
            ->where('user_id', $request->user()->id)
            ->with('questions.options')
            ->orderByDesc('updated_at')
            ->get();

        return response()->json($polls);
    }

    public function store(Request $request)
    {
        $data = $this->validatePoll($request);

        $poll = DB::transaction(function () use ($data, $request) {
            $poll = Poll::create([
                'user_id' => $request->user()->id,
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'type' => $data['type'] ?? 'multiple_choice',
                'settings' => $data['settings'] ?? null,
            ]);

            $this->syncQuestions($poll, $data['questions']);

            return $poll->load('questions.options');
        });

        return response()->json($poll, 201);
    }

    public function show(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        return response()->json($poll->load('questions.options'));
    }

    public function update(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        if (PollSession::where('poll_id', $poll->id)->where('status', 'active')->exists()) {
            return response()->json(['message' => 'Cannot edit poll with an active session.'], 409);
        }

        $data = $this->validatePoll($request);

        $poll = DB::transaction(function () use ($poll, $data) {
            $nextType = $data['type'] ?? $poll->type ?? 'multiple_choice';

            if ($nextType !== ($poll->type ?? 'multiple_choice') && $poll->sessions()->exists()) {
                return response()->json(['message' => 'Cannot change poll type after sessions have been created.'], 409);
            }

            $poll->update([
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'type' => $nextType,
                'settings' => $data['settings'] ?? $poll->settings,
            ]);

            $poll->questions()->delete();
            $this->syncQuestions($poll, $data['questions']);

            return $poll->load('questions.options');
        });

        if ($poll instanceof \Illuminate\Http\JsonResponse) {
            return $poll;
        }

        return response()->json($poll);
    }

    public function clone(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        $clone = DB::transaction(function () use ($poll, $request) {
            $newPoll = Poll::create([
                'user_id' => $request->user()->id,
                'title' => $poll->title.' (Copy)',
                'description' => $poll->description,
                'type' => $poll->type ?? 'multiple_choice',
                'settings' => $poll->settings,
            ]);

            $questions = $poll->questions()->with('options')->get();
            $this->syncQuestions($newPoll, $questions->map(function (PollQuestion $question) {
                return [
                    'question_text' => $question->question_text,
                    'options' => $question->options->pluck('option_text')->all(),
                ];
            })->all());

            return $newPoll->load('questions.options');
        });

        return response()->json($clone, 201);
    }

    private function authorizePoll(Request $request, Poll $poll): void
    {
        abort_unless($poll->user_id === $request->user()->id, 403);
    }

    private function validatePoll(Request $request): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'type' => ['sometimes', 'string', 'max:32', 'in:'.implode(',', self::POLL_TYPES)],
            'settings' => ['nullable', 'array'],
            'questions' => ['required', 'array', 'size:1'],
            'questions.*.question_text' => ['required', 'string'],
            'questions.*.options' => ['nullable', 'array', 'max:8'],
            'questions.*.options.*' => ['required', 'string', 'max:255'],
        ]);

        $type = $data['type'] ?? 'multiple_choice';

        if ($type === 'multiple_choice') {
            $request->validate([
                'questions.0.options' => ['required', 'array', 'min:2', 'max:8'],
            ]);
        }

        if ($type === 'word_cloud') {
            $options = $data['questions'][0]['options'] ?? [];
            if (count($options) > 0) {
                abort(422, 'Word cloud polls cannot have options.');
            }
        }

        return $data;
    }

    private function syncQuestions(Poll $poll, array $questions): void
    {
        foreach (array_values($questions) as $index => $questionData) {
            $question = PollQuestion::create([
                'poll_id' => $poll->id,
                'question_text' => $questionData['question_text'],
                'order_index' => $index,
            ]);

            if (($poll->type ?? 'multiple_choice') === 'multiple_choice') {
                foreach (array_values($questionData['options']) as $optionIndex => $optionText) {
                    PollOption::create([
                        'question_id' => $question->id,
                        'option_text' => $optionText,
                        'order_index' => $optionIndex,
                    ]);
                }
            }
        }
    }
}
