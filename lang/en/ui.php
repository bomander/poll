<?php

return [
    'welcome' => [
        'tagline' => 'Live classroom polls',
        'code_placeholder' => 'Enter code',
        'join' => 'Join',
        'joining' => 'Joining...',
        'or' => 'or',
        'dashboard' => 'Go to dashboard',
        'teacher_login' => 'Teacher login',
        'errors' => [
            'invalid_code' => 'Invalid or ended code.',
            'network' => 'Could not connect to the server.',
        ],
    ],

    'join' => [
        'title' => 'Answer poll',
        'code_placeholder' => 'Enter code',
        'join' => 'Join',
        'waiting' => 'Waiting for the teacher to start.',
        'errors' => [
            'invalid_code' => 'Invalid code.',
            'locked' => 'Question is locked.',
            'closed' => 'Session is closed.',
            'question_changed' => 'Question changed, updating...',
            'vote_failed' => 'Could not submit vote.',
            'token_missing' => 'Connection expired, trying again...',
        ],
        'status' => [
            'locked' => 'Question is locked.',
            'closed' => 'Session is closed.',
            'sending' => 'Sending...',
            'submitted' => 'Vote submitted.',
        ],
    ],

    'projector' => [
        'title' => 'Projector view',
        'invalid_code' => 'Invalid code.',
        'ended_banner' => 'Session ended. Results are final.',
        'ended_title' => 'Session ended',
        'ended_subtitle' => 'No more questions will be shown.',
        'instruction' => 'Go to :url and enter code',
        'waiting_title' => 'Waiting for the question to appear',
        'waiting_subtitle' => 'The teacher will start soon.',
        'errors' => [
            'load_failed' => 'Failed to load session.',
        ],
    ],

    'session' => [
        'title' => 'Live session',
        'load_failed' => 'Failed to load session.',
        'update_question_failed' => 'Failed to update question.',
        'update_lock_failed' => 'Failed to update lock state.',
        'close_failed' => 'Failed to close session.',
        'code' => 'Code',
        'lock' => 'Lock question',
        'unlock' => 'Unlock question',
        'export_csv' => 'Export CSV',
        'end' => 'End session',
        'open_projector' => 'Open projector view',
        'questions' => 'Questions',
        'live_results' => 'Live results',
        'no_active_question' => 'No active question.',
        'loading' => 'Loading...',
    ],
];

