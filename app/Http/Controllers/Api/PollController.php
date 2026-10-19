<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Poll;
use App\Models\PollOption;
use App\Models\PollQuestion;
use App\Models\PollResponse;
use App\Models\PollSession;
use App\Support\Themes;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PollController extends Controller
{
    private const POLL_TYPES = ['multiple_choice', 'word_cloud'];

    private const MAX_QUESTIONS = 10;

    public function index(Request $request)
    {
        $polls = Poll::query()
            ->where('user_id', $request->user()->id)
            ->with('questions.options')
            ->withCount('sessions')
            ->addSelect(['active_session_id' => PollSession::select('id')
                ->whereColumn('poll_id', 'polls.id')
                ->where('status', 'active')
                ->limit(1)])
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
                'settings' => $this->settingsFrom($data),
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
                'settings' => array_key_exists('settings', $data) ? $this->settingsFrom($data) : $poll->settings,
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

    /**
     * Raderar enkäten med alla avslutade sessioner och deras svar.
     */
    public function destroy(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        if ($poll->sessions()->where('status', 'active')->exists()) {
            return response()->json([
                'message' => 'Cannot delete a poll with an active session.',
            ], 409);
        }

        DB::transaction(function () use ($poll) {
            $sessionIds = $poll->sessions()->pluck('id');
            PollResponse::whereIn('session_id', $sessionIds)->delete();
            PollSession::whereIn('id', $sessionIds)->delete();
            $poll->delete();
        });

        return response()->json(['message' => 'Poll deleted.']);
    }

    /**
     * Temat är bara utseende och får därför bytas även efter att enkäten har körts.
     */
    public function updateTheme(Request $request, Poll $poll)
    {
        $this->authorizePoll($request, $poll);

        $data = $request->validate([
            'theme' => ['required', 'string', 'in:'.implode(',', Themes::KEYS)],
        ]);

        $poll->update(['settings' => [...($poll->settings ?? []), 'theme' => $data['theme']]]);

        return response()->json($poll->load('questions.options')->loadCount('sessions'));
    }

    /**
     * Sparar bara kända inställningar.
     */
    private function settingsFrom(array $data): ?array
    {
        $theme = $data['settings']['theme'] ?? null;

        return $theme ? ['theme' => $theme] : null;
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
            'settings.theme' => ['nullable', 'string', 'in:'.implode(',', Themes::KEYS)],
            'questions' => ['required', 'array', 'min:1', 'max:'.self::MAX_QUESTIONS],
            'questions.*.question_text' => ['required', 'string', 'max:500'],
            'questions.*.options' => ['nullable', 'array', 'max:8'],
            'questions.*.options.*' => ['required', 'string', 'max:255'],
        ]);

        $type = $data['type'] ?? $poll?->type ?? 'multiple_choice';
        $data['title'] = trim($data['title']);
        $description = isset($data['description']) ? trim($data['description']) : '';
        $data['description'] = $description !== '' ? $description : null;
        $data['questions'] = array_values($data['questions']);

        $messages = [];
        if ($data['title'] === '') {
            $messages['title'] = ['The title field is required.'];
        }

        // Alla frågor i en enkät har samma typ, så samma regler gäller för var och en.
        foreach ($data['questions'] as $index => $question) {
            $field = "questions.{$index}";
            $data['questions'][$index]['question_text'] = trim($question['question_text']);

            if ($data['questions'][$index]['question_text'] === '') {
                $messages["{$field}.question_text"] = ['The question text field is required.'];
            }

            $options = $question['options'] ?? [];

            if ($type === 'word_cloud') {
                if (count($options) > 0) {
                    $messages["{$field}.options"] = ['Word cloud polls cannot have options.'];
                }
                $data['questions'][$index]['options'] = [];

                continue;
            }

            $options = array_map(static fn (string $option): string => trim($option), $options);
            $normalized = array_map(
                static fn (string $option): string => mb_strtolower($option, 'UTF-8'),
                $options,
            );

            if (count($options) < 2) {
                $messages["{$field}.options"] = ['The options field must have at least 2 items.'];
            } elseif (in_array('', $options, true)) {
                $messages["{$field}.options"] = ['Options cannot be blank.'];
            } elseif (count(array_unique($normalized)) !== count($normalized)) {
                $messages["{$field}.options"] = ['Options must be unique.'];
            }

            $data['questions'][$index]['options'] = $options;
        }

        if ($messages !== []) {
            throw ValidationException::withMessages($messages);
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
