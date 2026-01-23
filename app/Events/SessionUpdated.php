<?php

namespace App\Events;

use App\Models\PollSession;
use Illuminate\Broadcasting\Channel;
use Illuminate\Broadcasting\InteractsWithSockets;
use Illuminate\Contracts\Broadcasting\ShouldBroadcast;
use Illuminate\Foundation\Events\Dispatchable;
use Illuminate\Queue\SerializesModels;

class SessionUpdated implements ShouldBroadcast
{
    use Dispatchable, InteractsWithSockets, SerializesModels;

    public function __construct(public PollSession $session)
    {
    }

    public function broadcastOn(): Channel
    {
        // Public channel keyed by session join code to avoid easy enumeration of numeric IDs.
        return new Channel('session.'.$this->session->code);
    }

    public function broadcastAs(): string
    {
        return 'session_updated';
    }

    public function broadcastWith(): array
    {
        return [
            'session_id' => $this->session->id,
            'status' => $this->session->status,
            'current_question_id' => $this->session->current_question_id,
            'locked' => $this->session->locked,
        ];
    }
}
