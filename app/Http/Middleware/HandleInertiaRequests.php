<?php

namespace App\Http\Middleware;

use Illuminate\Http\Request;
use Inertia\Middleware;

class HandleInertiaRequests extends Middleware
{
    /**
     * The root template that's loaded on the first page visit.
     *
     * @see https://inertiajs.com/server-side-setup#root-template
     *
     * @var string
     */
    protected $rootView = 'app';

    /**
     * Determines the current asset version.
     *
     * @see https://inertiajs.com/asset-versioning
     */
    public function version(Request $request): ?string
    {
        return parent::version($request);
    }

    /**
     * Define the props that are shared by default.
     *
     * @see https://inertiajs.com/shared-data
     *
     * @return array<string, mixed>
     */
    public function share(Request $request): array
    {
        $appUrl = config('app.url');
        $basePath = parse_url($appUrl, PHP_URL_PATH) ?: '';
        $locale = app()->getLocale();
        $fallbackLocale = config('app.fallback_locale');
        $translations = $this->loadUiTranslations($fallbackLocale);
        if (is_string($locale) && $locale !== $fallbackLocale) {
            $translations = array_replace_recursive($translations, $this->loadUiTranslations($locale));
        }

        return [
            ...parent::share($request),
            'name' => config('app.name'),
            'basePath' => rtrim($basePath, '/'),
            'locale' => $locale,
            'translations' => $translations,
            'auth' => [
                'user' => $request->user(),
            ],
            'sidebarOpen' => ! $request->hasCookie('sidebar_state') || $request->cookie('sidebar_state') === 'true',
        ];
    }

    /**
     * @return array<string, mixed>
     */
    private function loadUiTranslations(?string $locale): array
    {
        if (!is_string($locale) || $locale === '') {
            return [];
        }

        $path = base_path('lang/'.$locale.'/ui.php');
        if (!is_file($path)) {
            return [];
        }

        $loaded = require $path;
        if (!is_array($loaded)) {
            return [];
        }

        return $loaded;
    }
}
