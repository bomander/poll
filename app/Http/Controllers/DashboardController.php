<?php

namespace App\Http\Controllers;

use App\Models\Poll;
use App\Models\PollSession;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();

        $polls = Poll::query()
            ->where('user_id', $user->id)
            ->withCount(['questions', 'sessions'])
            ->orderByDesc('updated_at')
            ->limit(5)
            ->get();

        $activeSessions = PollSession::query()
            ->whereHas('poll', fn ($q) => $q->where('user_id', $user->id))
            ->where('status', 'active')
            ->with(['poll:id,title', 'responses'])
            ->orderByDesc('started_at')
            ->get()
            ->map(fn ($session) => [
                'id' => $session->id,
                'code' => $session->code,
                'poll_title' => $session->poll->title,
                'poll_id' => $session->poll_id,
                'response_count' => $session->responses->count(),
                'started_at' => $session->started_at->diffForHumans(),
            ]);

        $stats = [
            'total_polls' => Poll::where('user_id', $user->id)->count(),
            'total_sessions' => PollSession::whereHas('poll', fn ($q) => $q->where('user_id', $user->id))->count(),
            'active_sessions' => $activeSessions->count(),
        ];

        return Inertia::render('dashboard', [
            'polls' => $polls,
            'activeSessions' => $activeSessions,
            'stats' => $stats,
        ]);
    }
}
