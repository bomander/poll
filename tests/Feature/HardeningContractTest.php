<?php

use App\Models\User;
use App\Session\PrivacyDatabaseSessionHandler;
use App\Session\PrivacySessionManager;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

it('keeps web API routes behind CSRF validation', function () {
    $bootstrap = file_get_contents(base_path('bootstrap/app.php'));

    expect($bootstrap)->not->toContain('validateCsrfTokens(except:')
        ->and($bootstrap)->not->toContain("'api/*'");
});

it('allows a full classroom to use polling behind one shared address', function () {
    $routes = file_get_contents(base_path('routes/api.php'));

    expect($routes)->toContain("middleware('throttle:600,1')");
});

it('includes the CSRF token in every browser API request helper', function () {
    $helper = file_get_contents(resource_path('js/lib/api.ts'));
    $welcome = file_get_contents(resource_path('js/pages/welcome.tsx'));

    expect($helper)->toContain("headers.set('X-CSRF-TOKEN', getCsrfToken())")
        ->and($welcome)->toContain('apiFetch(`${basePath}/api/join`');
});

it('does not store request metadata in database sessions', function () {
    expect(app('session'))->toBeInstanceOf(PrivacySessionManager::class);

    $user = User::factory()->create();
    $this->actingAs($user);
    app()->instance('request', Request::create('/', 'GET', server: [
        'REMOTE_ADDR' => '192.0.2.10',
        'HTTP_USER_AGENT' => 'Private browser',
    ]));

    $handler = new PrivacyDatabaseSessionHandler(
        DB::connection(),
        'sessions',
        120,
        app(),
    );

    DB::table('sessions')->insert([
        'id' => 'privacy-test-session',
        'ip_address' => '192.0.2.10',
        'user_agent' => 'Previously stored browser',
        'payload' => 'old payload',
        'last_activity' => now()->timestamp,
    ]);
    $handler->read('privacy-test-session');
    $handler->write('privacy-test-session', 'payload');

    $stored = DB::table('sessions')->where('id', 'privacy-test-session')->first();
    expect($stored)->not->toBeNull()
        ->and($stored->user_id)->toBe($user->id)
        ->and($stored->ip_address)->toBeNull()
        ->and($stored->user_agent)->toBeNull();
});

it('adds baseline browser security headers', function () {
    $this->get(route('home'))
        ->assertHeader('X-Content-Type-Options', 'nosniff')
        ->assertHeader('X-Frame-Options', 'SAMEORIGIN')
        ->assertHeader('Referrer-Policy', 'same-origin')
        ->assertHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
        ->assertHeader('X-Permitted-Cross-Domain-Policies', 'none');
});
