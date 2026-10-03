<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" @class(['dark' => ($appearance ?? 'system') == 'dark'])>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <meta name="csrf-token" content="{{ csrf_token() }}">

        {{-- Inline script to detect system dark mode preference and apply it immediately --}}
        <script>
            (function() {
                const appearance = '{{ $appearance ?? "system" }}';

                if (appearance === 'system') {
                    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;

                    if (prefersDark) {
                        document.documentElement.classList.add('dark');
                    }
                }
            })();
        </script>

        {{-- Inline style to set the HTML background color based on our theme in app.css --}}
        <style>
            html {
                background-color: oklch(1 0 0);
            }

            html.dark {
                background-color: oklch(0.145 0 0);
            }
        </style>

        <title inertia>{{ $page['props']['seo']['title'] ?? config('app.name') }}</title>
        @if (isset($page['props']['seo']))
            <meta name="description" content="{{ $page['props']['seo']['description'] }}" inertia="description">
            <link rel="canonical" href="{{ $page['props']['seo']['canonical'] }}" inertia="canonical">
        @endif

        <link rel="icon" href="{{ url('favicon.ico') }}" sizes="any">
        <link rel="icon" href="{{ url('favicon.svg') }}" type="image/svg+xml">
        <link rel="apple-touch-icon" href="{{ url('apple-touch-icon.png') }}">

        @viteReactRefresh
        @vite(['resources/js/app.tsx', "resources/js/pages/{$page['component']}.tsx"])
        @inertiaHead
    </head>
    <body class="font-sans antialiased">
        @if (($page['component'] ?? '') === 'welcome' && isset($page['props']['seo']))
            <div id="app" data-page="{{ json_encode($page) }}">
                <main>
                    <h1>{{ $page['props']['seo']['title'] }}</h1>
                    <p>{{ $page['props']['seo']['description'] }}</p>
                    <nav aria-label="Kom igång">
                        <a href="{{ route('public.join') }}">Delta i en enkät</a>
                        <a href="{{ route('login') }}">Logga in</a>
                    </nav>
                </main>
            </div>
        @else
            @inertia
        @endif
    </body>
</html>
