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
            $poll->update([
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
            ]);

            $poll->questions()->delete();
            $this->syncQuestions($poll, $data['questions']);

            return $poll->load('questions.options');
        });

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
        return $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string'],
            'questions' => ['required', 'array', 'min:1'],
            'questions.*.question_text' => ['required', 'string'],
            'questions.*.options' => ['required', 'array', 'min:2', 'max:8'],
            'questions.*.options.*' => ['required', 'string', 'max:255'],
        ]);
    }

    private function syncQuestions(Poll $poll, array $questions): void
    {
        foreach (array_values($questions) as $index => $questionData) {
            $question = PollQuestion::create([
                'poll_id' => $poll->id,
                'question_text' => $questionData['question_text'],
                'order_index' => $index,
            ]);

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
