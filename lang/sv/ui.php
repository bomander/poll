<?php

return [
    'welcome' => [
        'tagline' => 'Live-omröstningar i klassrummet',
        'code_placeholder' => 'Ange kod',
        'join' => 'Gå med',
        'joining' => 'Ansluter...',
        'or' => 'eller',
        'dashboard' => 'Till dashboard',
        'teacher_login' => 'Logga in som lärare',
        'errors' => [
            'invalid_code' => 'Ogiltig eller avslutad kod.',
            'network' => 'Kunde inte ansluta till servern.',
        ],
    ],

    'join' => [
        'title' => 'Svara på poll',
        'code_placeholder' => 'Ange kod',
        'join' => 'Gå med',
        'waiting' => 'Väntar på att läraren startar.',
        'errors' => [
            'invalid_code' => 'Ogiltig kod.',
            'locked' => 'Frågan är låst.',
            'closed' => 'Sessionen är stängd.',
            'question_changed' => 'Frågan har bytts, uppdaterar...',
            'vote_failed' => 'Kunde inte skicka röst.',
            'token_missing' => 'Anslutningen gick ut, provar igen...',
        ],
        'status' => [
            'locked' => 'Frågan är låst.',
            'closed' => 'Sessionen är stängd.',
            'sending' => 'Skickar...',
            'submitted' => 'Röst inskickad.',
        ],
    ],

    'projector' => [
        'title' => 'Projektorvy',
        'invalid_code' => 'Ogiltig kod.',
        'ended_banner' => 'Sessionen är avslutad. Resultatet är slutligt.',
        'ended_title' => 'Sessionen är avslutad',
        'ended_subtitle' => 'Inga fler frågor visas.',
        'instruction' => 'Gå till :url och ange kod',
        'waiting_title' => 'Väntar på att frågan visas',
        'waiting_subtitle' => 'Läraren startar snart.',
        'errors' => [
            'load_failed' => 'Kunde inte hämta sessionen.',
        ],
    ],

    'session' => [
        'title' => 'Livesession',
        'load_failed' => 'Kunde inte hämta sessionen.',
        'update_question_failed' => 'Kunde inte uppdatera fråga.',
        'update_lock_failed' => 'Kunde inte uppdatera låsning.',
        'close_failed' => 'Kunde inte avsluta sessionen.',
        'code' => 'Kod',
        'lock' => 'Lås fråga',
        'unlock' => 'Lås upp fråga',
        'export_csv' => 'Exportera CSV',
        'end' => 'Avsluta session',
        'open_projector' => 'Öppna projektorvy',
        'questions' => 'Frågor',
        'live_results' => 'Live-resultat',
        'no_active_question' => 'Ingen aktiv fråga.',
        'loading' => 'Laddar...',
    ],
];

