<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (in_array(DB::getDriverName(), ['sqlite', 'pgsql'], true)) {
            DB::statement(
                "CREATE UNIQUE INDEX poll_sessions_one_active_per_poll ON poll_sessions (poll_id) WHERE status = 'active'",
            );
        }
    }

    public function down(): void
    {
        if (in_array(DB::getDriverName(), ['sqlite', 'pgsql'], true)) {
            DB::statement('DROP INDEX IF EXISTS poll_sessions_one_active_per_poll');
        }
    }
};
