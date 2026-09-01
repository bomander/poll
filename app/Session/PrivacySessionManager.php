<?php

namespace App\Session;

use Illuminate\Session\SessionManager;

class PrivacySessionManager extends SessionManager
{
    protected function createDatabaseDriver()
    {
        return $this->buildSession(new PrivacyDatabaseSessionHandler(
            $this->getDatabaseConnection(),
            (string) $this->config->get('session.table', 'sessions'),
            (int) $this->config->get('session.lifetime', 120),
            $this->container,
        ));
    }
}
