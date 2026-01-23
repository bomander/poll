<?php

namespace App\Http\Controllers;

use App\Models\Poll;
use App\Models\PollResponse;
use App\Models\PollSession;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Inertia\Inertia;
use Inertia\Response;

class AdminController extends Controller
{
    public function __invoke(Request $request): Response
    {
        $user = $request->user();

        if (!$user->is_admin) {
            abort(403);
        }

        // Overall stats
        $stats = [
            'total_users' => User::count(),
            'total_polls' => Poll::count(),
            'total_sessions' => PollSession::count(),
            'total_responses' => PollResponse::count(),
            'active_sessions' => PollSession::where('status', 'active')->count(),
        ];

        // Users with their activity
        $users = User::query()
            ->withCount('polls')
            ->orderByDesc('created_at')
            ->get()
            ->map(function ($user) {
                $sessionsCount = PollSession::query()
                    ->whereHas('poll', fn($q) => $q->where('user_id', $user->id))
                    ->count();

                $responsesCount = PollResponse::query()
                    ->whereHas('session.poll', fn($q) => $q->where('user_id', $user->id))
                    ->count();

                return [
                    'id' => $user->id,
                    'name' => $user->name,
                    'email' => $user->email,
                    'is_admin' => $user->is_admin,
                    'is_banned' => $user->is_banned,
                    'ban_reason' => $user->ban_reason,
                    'polls_count' => $user->polls_count,
                    'sessions_count' => $sessionsCount,
                    'responses_count' => $responsesCount,
                    'created_at' => $user->created_at->format('Y-m-d H:i'),
                    'last_login' => $user->updated_at->diffForHumans(),
                ];
            });

        // Recent sessions
        $recentSessions = PollSession::query()
            ->with(['poll.user:id,name,email'])
            ->withCount('responses')
            ->orderByDesc('created_at')
            ->limit(20)
            ->get()
            ->map(fn($session) => [
                'id' => $session->id,
                'code' => $session->code,
                'name' => $session->name,
                'status' => $session->status,
                'poll_title' => $session->poll->title,
                'user_name' => $session->poll->user->name,
                'user_email' => $session->poll->user->email,
                'responses_count' => $session->responses_count,
                'created_at' => $session->created_at->format('Y-m-d H:i'),
            ]);

        // Activity by day (last 30 days)
        $activityByDay = PollResponse::query()
            ->where('created_at', '>=', now()->subDays(30))
            ->select(DB::raw('DATE(created_at) as date'), DB::raw('count(*) as count'))
            ->groupBy('date')
            ->orderBy('date')
            ->pluck('count', 'date');

        return Inertia::render('admin/index', [
            'stats' => $stats,
            'users' => $users,
            'recentSessions' => $recentSessions,
            'activityByDay' => $activityByDay,
        ]);
    }
}
