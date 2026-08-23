<?php

namespace App\Console\Commands;

use App\Models\User;
use Illuminate\Console\Command;

class PurgeIdentityQuarantine extends Command
{
    protected $signature = 'identity-events:purge-quarantine {--dry-run}';

    protected $description = 'Radera lokala identitetsägda data efter 30 dagars karantän';

    public function handle(): int
    {
        $query = User::query()
            ->whereNotNull('identity_deleted_at')
            ->whereNotNull('identity_quarantine_until')
            ->where('identity_quarantine_until', '<=', now());

        if ($this->option('dry-run')) {
            $this->info((string) $query->count());

            return self::SUCCESS;
        }

        $purged = 0;
        $query->orderBy('id')->chunkById(100, function ($users) use (&$purged): void {
            foreach ($users as $user) {
                $user->delete();
                $purged++;
            }
        });

        $this->info("Raderade {$purged} lokala identiteter.");

        return self::SUCCESS;
    }
}
