<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('session.{sessionId}', function () {
    return true;
});
