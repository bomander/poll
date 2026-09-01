<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

class AttachReleaseHeader
{
    public function handle(Request $request, Closure $next): Response
    {
        $response = $next($request);
        $metadata = @file_get_contents(base_path('.release-meta'));

        if (is_string($metadata) && preg_match('/^release=(\d{14})$/m', $metadata, $matches) === 1) {
            $response->headers->set('X-Boma-Release', $matches[1]);
        }

        return $response;
    }
}
