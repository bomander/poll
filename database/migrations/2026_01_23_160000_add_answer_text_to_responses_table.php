<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::disableForeignKeyConstraints();

        if (DB::getDriverName() === 'sqlite') {
            DB::statement('drop index if exists responses_unique_vote');
        }

        Schema::create('responses_new', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('poll_sessions')->cascadeOnDelete();
            $table->foreignId('question_id')->constrained('poll_questions')->cascadeOnDelete();
            $table->foreignId('option_id')->nullable()->constrained('poll_options')->nullOnDelete();
            $table->text('answer_text')->nullable();
            $table->string('respondent_key', 64);
            $table->timestamps();

            $table->unique(['session_id', 'question_id', 'respondent_key'], 'responses_unique_vote');
        });

        DB::statement(
            'insert into responses_new (id, session_id, question_id, option_id, answer_text, respondent_key, created_at, updated_at)
             select id, session_id, question_id, option_id, null, respondent_key, created_at, updated_at
             from responses'
        );

        Schema::drop('responses');
        Schema::rename('responses_new', 'responses');

        Schema::enableForeignKeyConstraints();
    }

    public function down(): void
    {
        Schema::disableForeignKeyConstraints();

        if (DB::getDriverName() === 'sqlite') {
            DB::statement('drop index if exists responses_unique_vote');
        }

        Schema::create('responses_old', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('poll_sessions')->cascadeOnDelete();
            $table->foreignId('question_id')->constrained('poll_questions')->cascadeOnDelete();
            $table->foreignId('option_id')->constrained('poll_options')->cascadeOnDelete();
            $table->string('respondent_key', 64);
            $table->timestamps();

            $table->unique(['session_id', 'question_id', 'respondent_key'], 'responses_unique_vote');
        });

        DB::statement(
            'insert into responses_old (id, session_id, question_id, option_id, respondent_key, created_at, updated_at)
             select id, session_id, question_id, option_id, respondent_key, created_at, updated_at
             from responses
             where option_id is not null'
        );

        Schema::drop('responses');
        Schema::rename('responses_old', 'responses');

        Schema::enableForeignKeyConstraints();
    }
};
