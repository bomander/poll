<?php

namespace App\Http\Controllers;

use App\Services\IdentityEventProcessor;
use App\Services\IdentityEventVerifier;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class IdentityEventController extends Controller
{
    public function __invoke(
        Request $request,
        IdentityEventVerifier $verifier,
        IdentityEventProcessor $processor,
    ): JsonResponse {
        abort_unless((bool) config('services.boma_identity.events.enabled'), 404);
        abort_unless($request->header('Content-Type') === 'application/jwt', 415);

        if (app()->environment('production')
            && trim((string) config('services.boma_identity.events.subject_hash_key')) === '') {
            abort(503);
        }

        try {
            $identityEvent = $verifier->verify($request->getContent());
        } catch (Throwable) {
            return response()->json(['message' => 'Identitetshändelsen kunde inte verifieras.'], 401);
        }

        return response()->json(['status' => $processor->process($identityEvent)]);
    }
}
