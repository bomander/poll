<?php

namespace App\Events;

use App\Models\PollSession;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class ResultsUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(
        public PollSession $session,
        public int $questionId,
        public array $results
    ) {
    }

    public function broadcastOn(): Channel
    {
        // Public channel keyed by session join code to avoid easy enumeration of numeric IDs.
        return new Channel('session.'.$this->session->code);
    }

    public function broadcastAs(): string
    {
        return 'results_updated';
    }

    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->session->id,
            'question_id' => $this->questionId,
            'results' => $this->results,
        ];
    }
}
