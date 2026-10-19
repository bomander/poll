<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PollSession;
use App\Services\ParticipantState;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use Illuminate\Validation\ValidationException;

class JoinController extends Controller
{
    public function __construct(private readonly ParticipantState $state) {}

    public function store(Request $request)
    {
        $data = $request->validate([
            'code' => ['required', 'string', 'max:32'],
        ]);

        // Elever skriver ofta koden med mellanslag eller gemener.
        $code = PollSession::normalizeCode($data['code']);
        if (strlen($code) < 6 || strlen($code) > 8) {
            throw ValidationException::withMessages(['code' => ['Ogiltig kod.']]);
        }

        $session = PollSession::where('code', $code)->firstOrFail();

        // Use a random, per-session cookie for anonymous duplicate-vote protection.
        $cookieName = "enkat_r_{$session->id}";
        $token = $request->cookie($cookieName);
        if (! is_string($token) || strlen($token) !== 40 || ! ctype_alnum($token)) {
            $token = Str::random(40);
        }

        return response()->json([
            'code' => $session->code,
            ...$this->state->for($session, hash('sha256', $token)),
        ])->cookie(
            $cookieName,
            $token,
            60 * 24,
            (string) config('session.path', '/'),
            config('session.domain'),
            (bool) (config('session.secure') ?? $request->isSecure()),
            true,
            false,
            'Lax'
        );
    }
}
