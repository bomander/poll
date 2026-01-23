<?php

use Illuminate\Support\Facades\Broadcast;

Broadcast::channel('session.{code}', function () {
    return true;
});
