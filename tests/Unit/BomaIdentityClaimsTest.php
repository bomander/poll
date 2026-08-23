<?php

use App\Services\BomaIdentityClient;
use Tests\TestCase;

uses(TestCase::class);

it('rejects an ID token issued to a different authorized party', function (): void {
    config([
        'services.boma_identity.issuer' => 'https://auth.example.test',
        'services.boma_identity.client_id' => 'expected-client',
    ]);

    $claims = (object) [
        'iss' => 'https://auth.example.test',
        'aud' => ['expected-client', 'other-client'],
        'azp' => 'expected-client',
        'sub' => 'subject-1',
        'nonce' => 'nonce-1',
    ];

    expect(app(BomaIdentityClient::class)->validateClaims($claims, 'nonce-1'))->toBe($claims);

    $claims->azp = 'other-client';

    expect(fn () => app(BomaIdentityClient::class)->validateClaims($claims, 'nonce-1'))
        ->toThrow(RuntimeException::class);
});
