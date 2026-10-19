<?php

namespace App\Support;

/**
 * Teman som läraren kan välja per enkät. Temat styr elevvyn och projektorn.
 */
final class Themes
{
    public const DEFAULT = 'lekfullt';

    public const KEYS = [
        'lekfullt',
        'rymd',
        'skog',
        'hav',
        'pixel',
        'tavla',
        'arena',
        'pastell',
        'tidning',
        'bauhaus',
        'klar',
    ];

    public static function resolve(?array $settings): string
    {
        $theme = $settings['theme'] ?? null;

        return is_string($theme) && in_array($theme, self::KEYS, true) ? $theme : self::DEFAULT;
    }
}
