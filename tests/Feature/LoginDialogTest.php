<?php

test('the welcome page loads the shared sign-in dialog when the boma.nu account is enabled', function () {
    config([
        'services.boma_identity.enabled' => true,
        'services.boma_identity.client_id' => 'enkat-test',
        'services.boma_identity.issuer' => 'https://auth.boma.nu',
    ]);

    $response = $this->get('/');

    $response->assertOk()
        ->assertSee('<script src="https://auth.boma.nu/konto.js?v=1" defer></script>', false)
        ->assertSee('data-boma-login="'.route('auth.boma').'"', false);

    expect((string) $response->headers->get('Content-Security-Policy'))
        ->toContain("script-src 'self' 'unsafe-inline' https://auth.boma.nu;")
        ->toContain("frame-src 'self' https://auth.boma.nu;");
});

test('the welcome page does not load the dialog without the boma.nu account', function () {
    config(['services.boma_identity.enabled' => false]);

    $this->get('/')->assertOk()->assertDontSee('konto.js', false);
});
