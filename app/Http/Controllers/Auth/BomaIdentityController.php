<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\BomaIdentityClient;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Lärarinloggning via det gemensamma boma.nu-kontot (auth.boma.nu OIDC).
 * Ersätter Basen-OAuth-flödet. Konton kopplas via det permanenta OIDC `sub`
 * (users.auth_subject); konton från Basen-tiden (basen_subject) länkas en
 * gång via verifierad e-post.
 */
class BomaIdentityController extends Controller
{
    public function redirect(Request $request, BomaIdentityClient $identity): RedirectResponse
    {
        abort_unless(config('services.boma_identity.enabled'), 404);

        $state = Str::random(64);
        $verifier = Str::random(96);
        $nonce = Str::random(64);
        $request->session()->put('boma_identity', [
            'state' => $state,
            'verifier' => $verifier,
            'nonce' => $nonce,
        ]);

        $discovery = $identity->discovery();
        $authorizationEndpoint = $discovery['authorization_endpoint'] ?? null;
        abort_unless(is_string($authorizationEndpoint) && $authorizationEndpoint !== '', 502);

        $query = http_build_query([
            'client_id' => config('services.boma_identity.client_id'),
            'redirect_uri' => (string) config('services.boma_identity.redirect'),
            'response_type' => 'code',
            'scope' => 'openid profile email',
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => rtrim(strtr(base64_encode(hash('sha256', $verifier, true)), '+/', '-_'), '='),
            'code_challenge_method' => 'S256',
        ]);

        return redirect()->away($authorizationEndpoint.'?'.$query);
    }

    public function callback(Request $request, BomaIdentityClient $identity): RedirectResponse
    {
        abort_unless(config('services.boma_identity.enabled'), 404);

        $transaction = $request->session()->pull('boma_identity');
        $state = $request->string('state')->toString();

        if (! is_array($transaction)
            || $state === ''
            || ! hash_equals((string) ($transaction['state'] ?? ''), $state)
            || ! $request->filled('code')) {
            return redirect()->route('home')
                ->withErrors(['login' => 'Inloggningssvaret kunde inte verifieras. Försök igen.']);
        }

        try {
            $tokens = $identity->exchangeCode(
                $request->string('code')->toString(),
                (string) $transaction['verifier'],
                (string) config('services.boma_identity.redirect'),
            );
            $claims = $identity->verifyIdToken(
                (string) $tokens['id_token'],
                (string) ($transaction['nonce'] ?? ''),
            );

            if (($claims->email_verified ?? false) !== true
                || ! is_string($claims->email ?? null)
                || $claims->email === '') {
                throw new \RuntimeException('Kontot saknar en verifierad e-postadress.');
            }

            $user = $this->findOrCreateUser(
                (string) $claims->sub,
                (string) $claims->email,
                (string) ($claims->name ?? $claims->preferred_username ?? 'Teacher'),
            );

            if ($user->is_banned) {
                return redirect()->route('home')->withErrors([
                    'banned' => 'Ditt konto har avstängts.'.($user->ban_reason ? ' Anledning: '.$user->ban_reason : ''),
                ]);
            }

            Auth::login($user, true);
            $request->session()->regenerate();

            return redirect()->intended(route('dashboard'));
        } catch (Throwable $e) {
            Log::error('Boma identity callback error', [
                'exception' => $e::class,
                'message' => $e->getMessage(),
            ]);

            return redirect()->route('home')
                ->withErrors(['login' => 'Ett fel uppstod vid inloggning. Försök igen eller kontakta support om problemet kvarstår.']);
        }
    }

    protected function findOrCreateUser(string $sub, string $email, string $name): User
    {
        $user = User::query()->where('auth_subject', $sub)->first();

        if ($user) {
            $user->update([
                'name' => $name ?: $user->name,
                'email' => $email,
                'email_verified_at' => $user->email_verified_at ?: now(),
            ]);

            return $user;
        }

        // Engångsfallback via verifierad e-post för konton från Basen-tiden.
        $user = User::query()->whereNull('auth_subject')->where('email', $email)->first();

        if ($user) {
            $user->update([
                'auth_subject' => $sub,
                'email_verified_at' => $user->email_verified_at ?: now(),
            ]);

            return $user;
        }

        return User::create([
            'auth_subject' => $sub,
            'name' => $name,
            'email' => $email,
            'password' => Str::random(32),
            'email_verified_at' => now(),
        ]);
    }
}
