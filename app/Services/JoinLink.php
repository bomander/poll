<?php

namespace App\Services;

use BaconQrCode\Renderer\Color\Rgb;
use BaconQrCode\Renderer\Image\SvgImageBackEnd;
use BaconQrCode\Renderer\ImageRenderer;
use BaconQrCode\Renderer\RendererStyle\Fill;
use BaconQrCode\Renderer\RendererStyle\RendererStyle;
use BaconQrCode\Writer;

/**
 * Länken och QR-koden som elever använder för att svara på en session.
 */
class JoinLink
{
    public function url(string $code): string
    {
        return rtrim((string) config('app.url'), '/').'/join?code='.rawurlencode($code);
    }

    /**
     * Adressen som skrivs ut på projektorn, utan protokoll: "boma.nu/enkat".
     */
    public function displayHost(): string
    {
        $url = rtrim((string) config('app.url'), '/');

        return (string) preg_replace('#^https?://#', '', $url);
    }

    public function qrSvg(string $code): string
    {
        $svg = (new Writer(new ImageRenderer(
            new RendererStyle(320, 1, null, null, Fill::uniformColor(new Rgb(255, 255, 255), new Rgb(17, 24, 39))),
            new SvgImageBackEnd,
        )))->writeString($this->url($code));

        // Ta bort XML-deklarationen så att SVG:n kan bäddas in direkt i sidan.
        return trim((string) substr($svg, (int) strpos($svg, '<svg')));
    }
}
