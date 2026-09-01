<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class EnsureIdentitySessionCurrent
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();

        if (! $user) {
            return $next($request);
        }

        $active = ! $user->is_banned;

        if ($user->auth_subject !== null) {
            $sessionVersion = (int) $request->session()->get('boma_identity_session_version', 0);
            $active = $active
                && $user->identity_disabled_at === null
                && $user->identity_application_revoked_at === null
                && $user->identity_deleted_at === null
                && $user->identity_quarantine_until === null
                && $sessionVersion === (int) $user->identity_session_version;
        }

        if ($active) {
            return $next($request);
        }

        Auth::guard('web')->logout();
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        if ($request->expectsJson()) {
            return response()->json(['message' => 'Sessionen har återkallats.'], 401);
        }

        return redirect()->route('login')->withErrors([
            'boma_identity' => 'Sessionen har avslutats. Logga in igen.',
        ]);
    }
}
