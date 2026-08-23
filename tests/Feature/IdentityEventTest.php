<?php

namespace Tests\Feature;

use App\Models\Poll;
use App\Models\PollSession;
use App\Models\User;
use App\Services\BomaIdentityClient;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Illuminate\Support\Str;
use Mockery\MockInterface;
use Tests\TestCase;

class IdentityEventTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.boma_identity.issuer' => 'https://auth.example.test',
            'services.boma_identity.client_id' => 'receiver-client',
            'services.boma_identity.events.enabled' => false,
            'services.boma_identity.events.subject_hash_key' => 'receipt-test-key',
        ]);
    }

    public function test_endpoint_is_default_off(): void
    {
        $this->eventRequest('not-a-token')->assertNotFound();
    }

    public function test_signed_revocation_is_client_bound_idempotent_and_pseudonymous(): void
    {
        $this->enableEvents();
        $subject = (string) Str::uuid();
        $user = User::factory()->create([
            'auth_subject' => $subject,
            'remember_token' => 'remember-me',
            'identity_session_version' => 4,
        ]);
        DB::table('sessions')->insert([
            'id' => 'identity-event-session',
            'user_id' => $user->getKey(),
            'ip_address' => '127.0.0.1',
            'user_agent' => 'test',
            'payload' => 'test-payload',
            'last_activity' => time(),
        ]);
        $jti = (string) Str::uuid();
        $token = $this->eventToken(['sub' => $subject, 'jti' => $jti]);

        $this->eventRequest($token)->assertOk()->assertJson(['status' => 'processed']);
        $this->eventRequest($token)->assertOk()->assertJson(['status' => 'duplicate']);

        $user->refresh();
        $this->assertNull($user->remember_token);
        $this->assertSame(5, $user->identity_session_version);
        $this->assertDatabaseMissing('sessions', ['id' => 'identity-event-session']);
        $this->assertDatabaseHas('identity_event_receipts', [
            'jti' => $jti,
            'event' => 'subject.sessions_revoked',
            'subject_hash' => hash_hmac('sha256', $subject, 'receipt-test-key'),
        ]);
        $this->assertSame(1, DB::table('identity_event_receipts')->where('jti', $jti)->count());
        $this->assertFalse(property_exists(DB::table('identity_event_receipts')->where('jti', $jti)->first(), 'sub'));
    }

    public function test_media_type_audience_jose_type_and_lifetime_are_enforced(): void
    {
        $this->enableEvents();

        $this->call(
            'POST',
            route('internal.auth.events', [], false),
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/json', 'HTTP_ACCEPT' => 'application/json'],
            $this->eventToken(),
        )->assertStatus(415);

        $this->eventRequest($this->eventToken(['aud' => 'another-client']))->assertUnauthorized();
        $this->eventRequest($this->eventToken([], ['typ' => 'JWT']))->assertUnauthorized();
        $this->eventRequest($this->eventToken(['exp' => time() + 301]))->assertUnauthorized();
    }

    public function test_deleted_identity_is_quarantined_for_30_days_then_purged(): void
    {
        $this->enableEvents();
        $subject = (string) Str::uuid();
        $user = User::factory()->create(['auth_subject' => $subject]);
        $occurredAt = now()->subDays(31)->startOfSecond();

        $this->eventRequest($this->eventToken([
            'sub' => $subject,
            'event' => 'subject.deleted',
            'occurred_at' => $occurredAt->toRfc3339String(),
        ]))->assertOk()->assertJson(['status' => 'processed']);

        $user->refresh();
        $this->assertTrue($user->identity_deleted_at?->equalTo($occurredAt));
        $this->assertTrue($user->identity_quarantine_until?->equalTo($occurredAt->copy()->addDays(30)));

        $this->artisan('identity-events:purge-quarantine')->assertSuccessful();
        $this->assertDatabaseMissing('users', ['id' => $user->getKey()]);
    }

    public function test_stale_local_session_version_is_rejected(): void
    {
        Route::middleware('web')->get('/_identity-session-test', fn () => 'ok');
        $user = User::factory()->create([
            'auth_subject' => (string) Str::uuid(),
            'identity_session_version' => 2,
        ]);

        $this->actingAs($user)
            ->withSession(['boma_identity_session_version' => 1])
            ->get('/_identity-session-test')
            ->assertRedirect(route('login'));

        $this->assertGuest();
    }

    public function test_disabling_identity_closes_owned_public_poll_sessions(): void
    {
        $this->enableEvents();
        $user = User::factory()->create(['auth_subject' => (string) Str::uuid()]);
        $poll = Poll::query()->create(['user_id' => $user->getKey(), 'title' => 'Test']);
        $session = PollSession::query()->create([
            'poll_id' => $poll->getKey(),
            'code' => 'ABC12345',
            'status' => 'active',
            'locked' => false,
        ]);

        $this->eventRequest($this->eventToken([
            'sub' => $user->auth_subject,
            'event' => 'subject.disabled',
        ]))->assertOk();

        $this->assertSame('closed', $session->fresh()->status);
        $this->assertTrue($session->fresh()->locked);
        $this->assertNotNull($session->fresh()->ended_at);
    }

    private function enableEvents(): void
    {
        config(['services.boma_identity.events.enabled' => true]);
        [, $jwks] = $this->keyMaterial();
        $this->mock(BomaIdentityClient::class, function (MockInterface $mock) use ($jwks): void {
            $mock->shouldReceive('jwks')->zeroOrMoreTimes()->andReturn($jwks);
        });
    }

    /** @param array<string, mixed> $overrides @param array<string, string> $headers */
    private function eventToken(array $overrides = [], array $headers = ['typ' => 'boma-identity-event+jwt']): string
    {
        $now = time();
        $payload = array_replace([
            'iss' => 'https://auth.example.test',
            'aud' => 'receiver-client',
            'sub' => (string) Str::uuid(),
            'jti' => (string) Str::uuid(),
            'event' => 'subject.sessions_revoked',
            'iat' => $now,
            'exp' => $now + 120,
            'occurred_at' => now()->startOfSecond()->toRfc3339String(),
        ], $overrides);

        [$privateKey] = $this->keyMaterial();

        return JWT::encode($payload, $privateKey, 'RS256', 'event-test-key', $headers);
    }

    private function eventRequest(string $jwt)
    {
        return $this->call(
            'POST',
            route('internal.auth.events', [], false),
            [],
            [],
            [],
            ['CONTENT_TYPE' => 'application/jwt', 'HTTP_ACCEPT' => 'application/json'],
            $jwt,
        );
    }

    /** @return array{string, array<string, mixed>} */
    private function keyMaterial(): array
    {
        static $material;

        if (is_array($material)) {
            return $material;
        }

        $key = openssl_pkey_new([
            'private_key_bits' => 2048,
            'private_key_type' => OPENSSL_KEYTYPE_RSA,
        ]);
        openssl_pkey_export($key, $privateKey);
        $details = openssl_pkey_get_details($key);

        return $material = [$privateKey, ['keys' => [[
            'kty' => 'RSA',
            'kid' => 'event-test-key',
            'use' => 'sig',
            'alg' => 'RS256',
            'n' => $this->base64Url($details['rsa']['n']),
            'e' => $this->base64Url($details['rsa']['e']),
        ]]]];
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
