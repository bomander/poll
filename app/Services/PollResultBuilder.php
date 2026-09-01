<?php

namespace App\Services;

use App\Models\PollQuestion;
use App\Models\PollResponse;
use App\Models\PollSession;
use Illuminate\Support\Facades\DB;

class PollResultBuilder
{
    public function forQuestion(
        string $pollType,
        PollSession $session,
        PollQuestion $question,
        ?int $limit = 50,
    ): array {
        if ($pollType === 'word_cloud') {
            return $this->wordCloudResults($session, $question, $limit);
        }

        return $this->multipleChoiceResults($session, $question);
    }

    private function wordCloudResults(PollSession $session, PollQuestion $question, ?int $limit): array
    {
        $responses = PollResponse::query()
            ->where('session_id', $session->id)
            ->where('question_id', $question->id)
            ->whereNotNull('answer_text');

        $total = (int) (clone $responses)->count();

        $counts = $responses
            ->select('answer_text', DB::raw('count(*) as total'))
            ->groupBy('answer_text')
            ->orderByDesc('total')
            ->orderBy('answer_text');

        if ($limit !== null) {
            $counts->limit($limit);
        }

        return $counts->get()->map(function ($row) use ($total) {
            $count = (int) $row->total;

            return [
                'answer_text' => $row->answer_text,
                'count' => $count,
                'percent' => $total > 0 ? round(($count / $total) * 100, 2) : 0,
            ];
        })->all();
    }

    private function multipleChoiceResults(PollSession $session, PollQuestion $question): array
    {
        $counts = PollResponse::query()
            ->where('session_id', $session->id)
            ->where('question_id', $question->id)
            ->select('option_id', DB::raw('count(*) as total'))
            ->groupBy('option_id')
            ->pluck('total', 'option_id');

        $total = (int) $counts->sum();
        $question->loadMissing('options');

        return $question->options->map(function ($option) use ($counts, $total) {
            $count = (int) ($counts[$option->id] ?? 0);

            return [
                'option_id' => $option->id,
                'option_text' => $option->option_text,
                'count' => $count,
                'percent' => $total > 0 ? round(($count / $total) * 100, 2) : 0,
            ];
        })->all();
    }
}
