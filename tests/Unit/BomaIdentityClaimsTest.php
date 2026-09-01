<?php

use App\Services\BomaIdentityClient;
use Illuminate\Support\Facades\Http;
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

it('rejects an empty expected nonce', function (): void {
    config([
        'services.boma_identity.issuer' => 'https://auth.example.test',
        'services.boma_identity.client_id' => 'expected-client',
    ]);

    $claims = (object) [
        'iss' => 'https://auth.example.test',
        'aud' => 'expected-client',
        'sub' => 'subject-1',
        'nonce' => '',
    ];

    expect(fn () => app(BomaIdentityClient::class)->validateClaims($claims, ''))
        ->toThrow(RuntimeException::class);
});

it('requires the authorization endpoint to share the issuer origin', function (): void {
    config(['services.boma_identity.issuer' => 'https://auth.example.test']);
    Http::fake([
        'https://auth.example.test/.well-known/openid-configuration' => Http::response([
            'issuer' => 'https://auth.example.test',
            'authorization_endpoint' => 'https://attacker.example/oauth/authorize',
        ]),
    ]);

    expect(fn () => app(BomaIdentityClient::class)->authorizationEndpoint())
        ->toThrow(RuntimeException::class);
});
