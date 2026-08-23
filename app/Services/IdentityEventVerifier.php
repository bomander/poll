<?php

namespace App\Services;

use DateTimeImmutable;
use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Support\Str;
use RuntimeException;
use stdClass;

class IdentityEventVerifier
{
    private const EVENTS = [
        'subject.disabled',
        'subject.enabled',
        'subject.sessions_revoked',
        'subject.application_revoked',
        'subject.deleted',
    ];

    public function __construct(private readonly BomaIdentityClient $identity) {}

    /** @return array{jti: string, event: string, sub: string, occurred_at: DateTimeImmutable, quarantine_until: DateTimeImmutable|null} */
    public function verify(string $token): array
    {
        $segments = explode('.', $token);
        if (count($segments) !== 3) {
            throw new RuntimeException('Identity event is not a compact JWT.');
        }

        $header = json_decode($this->base64UrlDecode($segments[0]), true);
        if (! is_array($header)
            || ($header['alg'] ?? null) !== 'RS256'
            || ($header['typ'] ?? null) !== 'boma-identity-event+jwt'
            || ! is_string($header['kid'] ?? null)
            || $header['kid'] === '') {
            throw new RuntimeException('Identity event JOSE header is invalid.');
        }

        $previousLeeway = JWT::$leeway;
        JWT::$leeway = 60;
        try {
            $claims = JWT::decode($token, JWK::parseKeySet($this->identity->jwks()));
        } finally {
            JWT::$leeway = $previousLeeway;
        }

        return $this->validateClaims($claims);
    }

    /** @return array{jti: string, event: string, sub: string, occurred_at: DateTimeImmutable, quarantine_until: DateTimeImmutable|null} */
    public function validateClaims(stdClass $claims): array
    {
        $issuer = rtrim((string) config('services.boma_identity.issuer'), '/');
        $audience = (string) config('services.boma_identity.client_id');
        $issuedAt = $claims->iat ?? null;
        $expiresAt = $claims->exp ?? null;

        if (($claims->iss ?? null) !== $issuer
            || ! is_string($claims->aud ?? null) || ! hash_equals($audience, $claims->aud)
            || ! is_string($claims->sub ?? null) || $claims->sub === '' || strlen($claims->sub) > 255
            || ! is_string($claims->jti ?? null) || ! Str::isUuid($claims->jti)
            || ! is_string($claims->event ?? null) || ! in_array($claims->event, self::EVENTS, true)
            || ! is_int($issuedAt) || ! is_int($expiresAt)
            || $expiresAt <= $issuedAt || $expiresAt - $issuedAt > 300) {
            throw new RuntimeException('Identity event claims are invalid.');
        }

        $occurredAt = $this->rfc3339($claims->occurred_at ?? null, 'occurred_at');
        $quarantineUntil = null;

        if (property_exists($claims, 'quarantine_until')) {
            if ($claims->event !== 'subject.deleted') {
                throw new RuntimeException('Only deletion events may contain quarantine_until.');
            }

            $quarantineUntil = $this->rfc3339($claims->quarantine_until, 'quarantine_until');
        }

        if ($claims->event === 'subject.deleted') {
            $quarantineUntil ??= $occurredAt->modify('+30 days');
            if ($quarantineUntil <= $occurredAt || $quarantineUntil > $occurredAt->modify('+30 days')) {
                throw new RuntimeException('Identity deletion quarantine is outside the allowed window.');
            }
        }

        return [
            'jti' => $claims->jti,
            'event' => $claims->event,
            'sub' => $claims->sub,
            'occurred_at' => $occurredAt,
            'quarantine_until' => $quarantineUntil,
        ];
    }

    private function rfc3339(mixed $value, string $claim): DateTimeImmutable
    {
        if (! is_string($value) || $value === '') {
            throw new RuntimeException("Identity event {$claim} is invalid.");
        }

        $date = DateTimeImmutable::createFromFormat(DATE_RFC3339_EXTENDED, $value)
            ?: DateTimeImmutable::createFromFormat(DATE_RFC3339, $value);
        $errors = DateTimeImmutable::getLastErrors();

        if (! $date || ($errors !== false && ($errors['warning_count'] !== 0 || $errors['error_count'] !== 0))) {
            throw new RuntimeException("Identity event {$claim} is invalid.");
        }

        return $date;
    }

    private function base64UrlDecode(string $value): string
    {
        $decoded = base64_decode(strtr($value, '-_', '+/'), true);
        if ($decoded === false) {
            throw new RuntimeException('Identity event JOSE header is invalid.');
        }

        return $decoded;
    }
}
