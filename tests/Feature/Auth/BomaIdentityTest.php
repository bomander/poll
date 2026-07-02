<?php

use App\Models\User;

beforeEach(function () {
    config([
        'services.boma_identity.enabled' => true,
        'services.boma_identity.client_id' => 'test-client-id',
        'services.boma_identity.redirect' => 'https://example.test/auth/boma/callback',
    ]);
});

test('login redirects to boma identity', function () {
    $this->get('/login')->assertRedirect(route('auth.boma'));
});

test('local username/password login is disabled', function () {
    $this->post('/login')->assertNotFound();
});

test('local registration and password routes are not available', function () {
    $this->get('/register')->assertNotFound();
    $this->get('/forgot-password')->assertNotFound();
    $this->get('/reset-password/test-token')->assertNotFound();
});

test('logout works for authenticated users', function () {
    $this->actingAs(User::factory()->create());

    $this->post(route('logout'))->assertRedirect('/');
});

test('identity routes 404 when sso is disabled', function () {
    config(['services.boma_identity.enabled' => false]);

    $this->get(route('auth.boma'))->assertNotFound();
    $this->get(route('auth.boma.callback'))->assertNotFound();
});

test('callback without a login transaction redirects safely home', function () {
    $this->get(route('auth.boma.callback'))->assertRedirect(route('home'));
});

test('callback signs in a new teacher linked by sub', function () {
    fakeIdentityLogin($this, [
        'sub' => 'sub-teacher',
        'email' => 'teacher@example.test',
        'email_verified' => true,
        'name' => 'Lärare',
    ]);

    $this->get(route('auth.boma.callback', ['state' => 'state-ok', 'code' => 'x']))
        ->assertRedirect(route('dashboard'));

    $this->assertAuthenticated();
    expect(User::query()->sole()->auth_subject)->toBe('sub-teacher');
});

test('existing basen-era account links by verified email once', function () {
    $existing = User::factory()->create([
        'email' => 'legacy@example.test',
        'basen_subject' => 'old-basen-id',
    ]);

    fakeIdentityLogin($this, [
        'sub' => 'sub-legacy',
        'email' => 'legacy@example.test',
        'email_verified' => true,
        'name' => 'Legacy',
    ]);

    $this->get(route('auth.boma.callback', ['state' => 'state-ok', 'code' => 'x']))
        ->assertRedirect(route('dashboard'));

    expect($existing->refresh()->auth_subject)->toBe('sub-legacy')
        ->and(User::query()->count())->toBe(1);
});

test('banned users are rejected after identity verification', function () {
    User::factory()->create([
        'email' => 'banned@example.test',
        'is_banned' => true,
        'ban_reason' => 'Test',
    ]);

    fakeIdentityLogin($this, [
        'sub' => 'sub-banned',
        'email' => 'banned@example.test',
        'email_verified' => true,
        'name' => 'Avstängd',
    ]);

    $this->get(route('auth.boma.callback', ['state' => 'state-ok', 'code' => 'x']))
        ->assertRedirect(route('home'));

    $this->assertGuest();
});

test('callback rejects an unverified email without creating a user', function () {
    fakeIdentityLogin($this, [
        'sub' => 'sub-unverified',
        'email' => 'unverified@example.test',
        'email_verified' => false,
        'name' => 'Overifierad',
    ]);

    $this->get(route('auth.boma.callback', ['state' => 'state-ok', 'code' => 'x']))
        ->assertRedirect(route('home'));

    $this->assertGuest();
    expect(User::query()->count())->toBe(0);
});
