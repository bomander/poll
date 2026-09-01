<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Models\PollOption;
use App\Models\PollQuestion;
use App\Models\PollSession;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PollController extends Controller
{
    private const POLL_TYPES = ['multiple_choice', 'word_cloud'];

    public function index(Request $request)
    {
        $polls = Poll::query()
            ->where('user_id', $request->user()->id)
            ->with('questions.options')
            ->withCount('sessions')
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

            return $poll->load('questions.options')->loadCount('sessions');
        });

        return response()->json($poll, 201);
    }

    public function show(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        return response()->json($poll->load('questions.options')->loadCount('sessions'));
    }

    public function update(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        if (PollSession::where('poll_id', $poll->id)->exists()) {
            return response()->json([
                'message' => 'Cannot edit a poll after a session has been created. Clone it instead.',
            ], 409);
        }

        $data = $this->validatePoll($request, $poll);

        $poll = DB::transaction(function () use ($poll, $data) {
            $nextType = $data['type'] ?? $poll->type ?? 'multiple_choice';

            $poll->update([
                'title' => $data['title'],
                'description' => $data['description'] ?? null,
                'type' => $nextType,
                'settings' => array_key_exists('settings', $data) ? $data['settings'] : $poll->settings,
            ]);

            $poll->questions()->delete();
            $this->syncQuestions($poll, $data['questions']);

            return $poll->load('questions.options')->loadCount('sessions');
        });

        return response()->json($poll);
    }

    public function clone(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        $clone = DB::transaction(function () use ($poll, $request) {
            $newPoll = Poll::create([
                'user_id' => $request->user()->id,
                'title' => $poll->title.' '.__('ui.polls.copy_suffix'),
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

            return $newPoll->load('questions.options')->loadCount('sessions');
        });

        return response()->json($clone, 201);
    }

    private function authorizePoll(Request $request, Poll $poll): void
    {
        abort_unless($poll->user_id === $request->user()->id, 403);
    }

    private function validatePoll(Request $request, ?Poll $poll = null): array
    {
        $data = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'type' => ['sometimes', 'string', 'max:32', 'in:'.implode(',', self::POLL_TYPES)],
            'settings' => ['nullable', 'array'],
            'questions' => ['required', 'array', 'size:1'],
            'questions.*.question_text' => ['required', 'string', 'max:500'],
            'questions.*.options' => ['nullable', 'array', 'max:8'],
            'questions.*.options.*' => ['required', 'string', 'max:255'],
        ]);

        $type = $data['type'] ?? $poll?->type ?? 'multiple_choice';
        $data['title'] = trim($data['title']);
        $description = isset($data['description']) ? trim($data['description']) : '';
        $data['description'] = $description !== '' ? $description : null;
        $data['questions'][0]['question_text'] = trim($data['questions'][0]['question_text']);

        if ($data['title'] === '' || $data['questions'][0]['question_text'] === '') {
            $messages = [];
            if ($data['title'] === '') {
                $messages['title'] = ['The title field is required.'];
            }
            if ($data['questions'][0]['question_text'] === '') {
                $messages['questions.0.question_text'] = ['The question text field is required.'];
            }

            throw ValidationException::withMessages($messages);
        }

        if ($type === 'multiple_choice') {
            $request->validate([
                'questions.0.options' => ['required', 'array', 'min:2', 'max:8'],
            ]);

            $options = array_map(
                static fn (string $option): string => trim($option),
                $data['questions'][0]['options'],
            );
            $normalized = array_map(
                static fn (string $option): string => mb_strtolower($option, 'UTF-8'),
                $options,
            );

            if (in_array('', $options, true)) {
                throw ValidationException::withMessages([
                    'questions.0.options' => ['Options cannot be blank.'],
                ]);
            }

            if (count(array_unique($normalized)) !== count($normalized)) {
                throw ValidationException::withMessages([
                    'questions.0.options' => ['Options must be unique.'],
                ]);
            }

            $data['questions'][0]['options'] = $options;
        }

        if ($type === 'word_cloud') {
            $options = $data['questions'][0]['options'] ?? [];
            if (count($options) > 0) {
                throw ValidationException::withMessages([
                    'questions.0.options' => ['Word cloud polls cannot have options.'],
                ]);
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
