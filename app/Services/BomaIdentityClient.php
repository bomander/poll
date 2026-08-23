<?php

namespace App\Services;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Illuminate\Http\Client\PendingRequest;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use stdClass;

/**
 * OIDC client against the shared boma.nu identity provider (auth.boma.nu).
 * OIDC client for the shared boma.nu identity provider.
 */
class BomaIdentityClient
{
    /**
     * @return array<string, mixed>
     */
    public function discovery(): array
    {
        $issuer = rtrim((string) config('services.boma_identity.issuer'), '/');
        $response = $this->http()
            ->timeout(10)
            ->get($issuer.'/.well-known/openid-configuration')
            ->throw();

        $discovery = $response->json();

        if (! is_array($discovery) || ($discovery['issuer'] ?? null) !== $issuer) {
            throw new RuntimeException('Identitetstjänstens issuer stämmer inte med konfigurationen.');
        }

        return $discovery;
    }

    /**
     * @return array<string, mixed>
     */
    public function exchangeCode(string $code, string $verifier, string $redirectUri): array
    {
        $discovery = $this->discovery();
        $response = $this->http()
            ->asForm()
            ->acceptJson()
            ->timeout(10)
            ->post($this->requiredEndpoint($discovery, 'token_endpoint'), [
                'grant_type' => 'authorization_code',
                'client_id' => config('services.boma_identity.client_id'),
                'client_secret' => config('services.boma_identity.client_secret'),
                'redirect_uri' => $redirectUri,
                'code' => $code,
                'code_verifier' => $verifier,
            ])
            ->throw();

        $tokens = $response->json();

        if (! is_array($tokens) || ! isset($tokens['id_token'])) {
            throw new RuntimeException('Identitetstjänsten returnerade ingen ID-token.');
        }

        return $tokens;
    }

    public function verifyIdToken(string $idToken, string $expectedNonce): stdClass
    {
        $claims = JWT::decode($idToken, JWK::parseKeySet($this->jwks()));

        return $this->validateClaims($claims, $expectedNonce);
    }

    /**
     * @return array<string, mixed>
     */
    public function jwks(): array
    {
        $discovery = $this->discovery();
        $jwks = $this->http()
            ->timeout(10)
            ->get($this->requiredEndpoint($discovery, 'jwks_uri'))
            ->throw()
            ->json();

        if (! is_array($jwks)) {
            throw new RuntimeException('Identitetstjänstens nyckeluppsättning är ogiltig.');
        }

        return $jwks;
    }

    public function validateClaims(stdClass $claims, string $expectedNonce): stdClass
    {
        $clientId = (string) config('services.boma_identity.client_id');
        $audiences = is_array($claims->aud ?? null) ? $claims->aud : [$claims->aud ?? null];
        $authorizedParty = $claims->azp ?? null;

        if (($claims->iss ?? null) !== config('services.boma_identity.issuer')
            || ! in_array($clientId, $audiences, true)
            || (count($audiences) > 1 && $authorizedParty !== $clientId)
            || ($authorizedParty !== null && $authorizedParty !== $clientId)
            || ! is_string($claims->sub ?? null)
            || $claims->sub === ''
            || ! is_string($claims->nonce ?? null)
            || ! hash_equals($expectedNonce, $claims->nonce)) {
            throw new RuntimeException('ID-tokenens identitetsuppgifter är ogiltiga.');
        }

        return $claims;
    }

    /**
     * @param  array<string, mixed>  $discovery
     */
    private function requiredEndpoint(array $discovery, string $key): string
    {
        $endpoint = $discovery[$key] ?? null;

        if (! is_string($endpoint) || $endpoint === '' || ! $this->hasIssuerOrigin($endpoint)) {
            throw new RuntimeException("Discovery-dokumentet saknar {$key}.");
        }

        return $endpoint;
    }

    private function hasIssuerOrigin(string $endpoint): bool
    {
        $issuer = parse_url(rtrim((string) config('services.boma_identity.issuer'), '/'));
        $candidate = parse_url($endpoint);

        if (! is_array($issuer) || ! is_array($candidate)) {
            return false;
        }

        $issuerScheme = strtolower((string) ($issuer['scheme'] ?? ''));
        $candidateScheme = strtolower((string) ($candidate['scheme'] ?? ''));
        $issuerHost = strtolower((string) ($issuer['host'] ?? ''));
        $candidateHost = strtolower((string) ($candidate['host'] ?? ''));
        $issuerPort = $issuer['port'] ?? ($issuerScheme === 'https' ? 443 : null);
        $candidatePort = $candidate['port'] ?? ($candidateScheme === 'https' ? 443 : null);

        return $issuerScheme === 'https'
            && $candidateScheme === $issuerScheme
            && $candidateHost === $issuerHost
            && $candidatePort === $issuerPort
            && ! isset($candidate['user'])
            && ! isset($candidate['pass'])
            && ! isset($candidate['fragment']);
    }

    private function http(): PendingRequest
    {
        $request = Http::acceptJson()->withOptions(['allow_redirects' => false]);
        $resolveIp = config('services.boma_identity.resolve_ip');

        if (is_string($resolveIp) && filter_var($resolveIp, FILTER_VALIDATE_IP)) {
            $host = parse_url((string) config('services.boma_identity.issuer'), PHP_URL_HOST);

            if (is_string($host) && $host !== '') {
                $request = $request->withOptions([
                    'curl' => [
                        CURLOPT_RESOLVE => ["{$host}:443:{$resolveIp}"],
                    ],
                ]);
            }
        }

        return $request;
    }
}
