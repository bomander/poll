<?php

namespace App\Support;

use Illuminate\Http\Request;

final class OidcLoginTransactions
{
    private const SESSION_KEY = 'boma_identity_transactions';

    private const LEGACY_SESSION_KEY = 'boma_identity';

    private const TTL_SECONDS = 600;

    private const MAX_TRANSACTIONS = 5;

    /** @param array<string, mixed> $transaction */
    public static function store(Request $request, array $transaction): void
    {
        $state = $transaction['state'] ?? null;

        if (! is_string($state) || $state === '') {
            throw new \InvalidArgumentException('OIDC transaction requires a state.');
        }

        $transactions = self::validTransactions($request->session()->get(self::SESSION_KEY, []));
        $transactions[$state] = [...$transaction, 'created_at' => time()];

        uasort($transactions, static fn (array $left, array $right): int => $left['created_at'] <=> $right['created_at']);
        self::persist($request, array_slice($transactions, -self::MAX_TRANSACTIONS, null, true));
    }

    /** @return array<string, mixed>|null */
    public static function pull(Request $request, string $state): ?array
    {
        if ($state === '') {
            return null;
        }

        $transactions = self::validTransactions($request->session()->get(self::SESSION_KEY, []));
        $transaction = $transactions[$state] ?? null;
        unset($transactions[$state]);
        self::persist($request, $transactions);

        if (is_array($transaction)) {
            return $transaction;
        }

        $legacy = $request->session()->pull(self::LEGACY_SESSION_KEY);

        if (! is_array($legacy)
            || ! is_string($legacy['state'] ?? null)
            || ! hash_equals($legacy['state'], $state)) {
            return null;
        }

        return $legacy;
    }

    /** @return array<string, array<string, mixed>> */
    private static function validTransactions(mixed $stored): array
    {
        if (! is_array($stored)) {
            return [];
        }

        $cutoff = time() - self::TTL_SECONDS;

        return array_filter($stored, static function (mixed $transaction) use ($cutoff): bool {
            return is_array($transaction)
                && is_string($transaction['state'] ?? null)
                && is_string($transaction['verifier'] ?? null)
                && is_string($transaction['nonce'] ?? null)
                && is_int($transaction['created_at'] ?? null)
                && $transaction['created_at'] >= $cutoff;
        });
    }

    /** @param array<string, array<string, mixed>> $transactions */
    private static function persist(Request $request, array $transactions): void
    {
        if ($transactions === []) {
            $request->session()->forget(self::SESSION_KEY);

            return;
        }

        $request->session()->put(self::SESSION_KEY, $transactions);
    }
}
