<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    'basen' => [
        'client_id' => env('BASEN_CLIENT_ID'),
        'client_secret' => env('BASEN_CLIENT_SECRET'),
        'authorize_url' => env('BASEN_AUTHORIZE_URL'),
        'token_url' => env('BASEN_TOKEN_URL'),
        'userinfo_url' => env('BASEN_USERINFO_URL'),
        'redirect_uri' => env('BASEN_REDIRECT_URI'),
        'scopes' => env('BASEN_SCOPES', 'profile.read'),
        'subject_field' => env('BASEN_SUBJECT_FIELD', 'sub'),
        'email_field' => env('BASEN_EMAIL_FIELD', 'email'),
        'name_field' => env('BASEN_NAME_FIELD', 'name'),
    ],

];
