<?php

namespace App\Session;

use Illuminate\Session\DatabaseSessionHandler;

class PrivacyDatabaseSessionHandler extends DatabaseSessionHandler
{
    /**
     * Do not persist request metadata for anonymous participants or teachers.
     * User IDs are still stored so authenticated sessions can be revoked.
     */
    protected function addRequestInformation(&$payload)
    {
        $payload['ip_address'] = null;
        $payload['user_agent'] = null;

        return $this;
    }
}
