<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // Permanent OIDC `sub` från auth.boma.nu. Ersätter basen_subject
            // som identitetskoppling; basen_subject behålls som historik.
            $table->uuid('auth_subject')->nullable()->unique()->after('basen_subject');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('auth_subject');
        });
    }
};
