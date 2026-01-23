<?php

use App\Models\User;

test('login redirects to basen oauth', function () {
    $this->get('/login')->assertRedirect(route('auth.basen'));
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

