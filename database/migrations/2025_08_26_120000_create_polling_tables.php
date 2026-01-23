<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('polls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('title');
            $table->text('description')->nullable();
            $table->timestamps();
        });

        Schema::create('poll_questions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poll_id')->constrained()->cascadeOnDelete();
            $table->text('question_text');
            $table->unsignedInteger('order_index');
            $table->timestamps();
        });

        Schema::create('poll_options', function (Blueprint $table) {
            $table->id();
            $table->foreignId('question_id')->constrained('poll_questions')->cascadeOnDelete();
            $table->string('option_text');
            $table->unsignedInteger('order_index');
            $table->timestamps();
        });

        Schema::create('poll_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('poll_id')->constrained()->cascadeOnDelete();
            $table->string('code', 8)->unique();
            $table->string('status', 16)->default('active');
            $table->foreignId('current_question_id')->nullable()->constrained('poll_questions')->nullOnDelete();
            $table->boolean('locked')->default(false);
            $table->timestamp('started_at')->nullable();
            $table->timestamp('ended_at')->nullable();
            $table->timestamps();
        });

        Schema::create('responses', function (Blueprint $table) {
            $table->id();
            $table->foreignId('session_id')->constrained('poll_sessions')->cascadeOnDelete();
            $table->foreignId('question_id')->constrained('poll_questions')->cascadeOnDelete();
            $table->foreignId('option_id')->constrained('poll_options')->cascadeOnDelete();
            $table->string('respondent_key', 64);
            $table->timestamps();

            $table->unique(['session_id', 'question_id', 'respondent_key'], 'responses_unique_vote');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('responses');
        Schema::dropIfExists('poll_sessions');
        Schema::dropIfExists('poll_options');
        Schema::dropIfExists('poll_questions');
        Schema::dropIfExists('polls');
    }
};
