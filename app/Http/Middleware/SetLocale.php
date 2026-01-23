<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\App;
use Illuminate\Support\Str;

class SetLocale
{
    /**
     * @param  Closure(Request): (\Symfony\Component\HttpFoundation\Response)  $next
     */
    public function handle(Request $request, Closure $next)
    {
        $supportedLocales = ['en', 'sv'];

        $queryLocale = $request->query('lang');
        if (is_string($queryLocale)) {
            $queryLocale = Str::lower(Str::before($queryLocale, '-'));
            if (in_array($queryLocale, $supportedLocales, true)) {
                $request->session()->put('locale', $queryLocale);
                App::setLocale($queryLocale);

                return $next($request);
            }
        }

        $sessionLocale = $request->session()->get('locale');
        if (is_string($sessionLocale)) {
            $sessionLocale = Str::lower(Str::before($sessionLocale, '-'));
            if (in_array($sessionLocale, $supportedLocales, true)) {
                App::setLocale($sessionLocale);

                return $next($request);
            }
        }

        $acceptLanguage = (string) $request->header('Accept-Language', '');
        if (preg_match('/\b([a-z]{2})(?:-[A-Z]{2})?\b/', $acceptLanguage, $matches)) {
            $preferred = Str::lower($matches[1]);
            if (in_array($preferred, $supportedLocales, true)) {
                App::setLocale($preferred);
            }
        }

        return $next($request);
    }
}

