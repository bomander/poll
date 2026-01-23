<?php

namespace App\Http\Controllers\Auth;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class BasenOAuthController extends Controller
{
    public function redirect(Request $request)
    {
        $state = Str::random(40);
        $request->session()->put('basen_oauth_state', $state);

        $query = http_build_query([
            'client_id' => config('services.basen.client_id'),
            'redirect_uri' => config('services.basen.redirect_uri'),
            'response_type' => 'code',
            'scope' => config('services.basen.scopes', 'profile.read'),
            'state' => $state,
        ]);

        return redirect()->away(rtrim(config('services.basen.authorize_url'), '/').'?'.$query);
    }

    public function callback(Request $request)
    {
        $state = $request->session()->pull('basen_oauth_state');
        if (!$state || $state !== $request->query('state')) {
            abort(403, 'Invalid OAuth state.');
        }

        $code = $request->query('code');
        if (!$code) {
            abort(400, 'Missing authorization code.');
        }

        $tokenResponse = Http::asForm()->post(config('services.basen.token_url'), [
            'grant_type' => 'authorization_code',
            'client_id' => config('services.basen.client_id'),
            'client_secret' => config('services.basen.client_secret'),
            'redirect_uri' => config('services.basen.redirect_uri'),
            'code' => $code,
        ]);
        Log::info('Basen token exchange response', [
            'status' => $tokenResponse->status(),
        ]);

        if (!$tokenResponse->ok()) {
            Log::warning('Basen token exchange failed', [
                'status' => $tokenResponse->status(),
                'body' => $tokenResponse->body(),
            ]);
            abort(401, 'Token exchange failed.');
        }

        $accessToken = $tokenResponse->json('access_token');
        if (!$accessToken) {
            abort(401, 'Missing access token.');
        }

        $userInfoUrl = config('services.basen.userinfo_url');
        Log::info('Basen userinfo request', ['url' => $userInfoUrl]);
        $userInfoResponse = Http::withToken($accessToken)->acceptJson()->get($userInfoUrl);
        Log::info('Basen userinfo response', [
            'status' => $userInfoResponse->status(),
        ]);
        if (!$userInfoResponse->ok()) {
            Log::warning('Basen userinfo failed', [
                'status' => $userInfoResponse->status(),
                'body' => $userInfoResponse->body(),
            ]);
            abort(401, 'User info request failed.');
        }

        $userInfo = $userInfoResponse->json();
        $subjectField = config('services.basen.subject_field', 'sub');
        $emailField = config('services.basen.email_field', 'email');
        $nameField = config('services.basen.name_field', 'name');

        $subject = $userInfo[$subjectField] ?? null;
        if (!$subject) {
            abort(401, 'Missing subject in user info.');
        }

        $email = $userInfo[$emailField] ?? null;
        $name = $userInfo[$nameField] ?? $email ?? 'Teacher';

        $user = User::updateOrCreate(
            ['basen_subject' => $subject],
            [
                'name' => $name,
                'email' => $email ?? $subject.'@basen.local',
                'password' => Str::random(32),
                'email_verified_at' => now(),
            ]
        );

        // Block banned users
        if ($user->is_banned) {
            return redirect()->route('home')->withErrors([
                'banned' => 'Ditt konto har avstangts.' . ($user->ban_reason ? ' Anledning: ' . $user->ban_reason : ''),
            ]);
        }

        Auth::login($user, true);

        return redirect()->intended(route('dashboard'));
    }
}
