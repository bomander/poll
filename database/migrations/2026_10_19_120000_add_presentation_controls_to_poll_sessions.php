<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('poll_sessions', function (Blueprint $table) {
            // Styr om resultatet syns för elever och på projektorn.
            $table->boolean('show_results')->default(true)->after('locked');
            // Ordmolnssvar som läraren har dolt från projektorn och elevvyn.
            $table->json('hidden_answers')->nullable()->after('show_results');
        });
    }

    public function down(): void
    {
        Schema::table('poll_sessions', function (Blueprint $table) {
            $table->dropColumn(['show_results', 'hidden_answers']);
        });
    }
};
