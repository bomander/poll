<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PollSession extends Model
{
    protected $table = 'poll_sessions';

    protected $fillable = [
        'poll_id',
        'code',
        'name',
        'status',
        'current_question_id',
        'locked',
        'show_results',
        'hidden_answers',
        'started_at',
        'ended_at',
    ];

    protected $casts = [
        'locked' => 'boolean',
        'show_results' => 'boolean',
        'hidden_answers' => 'array',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

    /**
     * Teckenuppsättning för deltagarkoder. Saknar lättförväxlade tecken (0/O, 1/I/L).
     */
    public const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

    public const CODE_LENGTH = 6;

    /**
     * Gör om det en elev skrev till en sökbar kod: versaler utan mellanslag och bindestreck.
     */
    public static function normalizeCode(string $input): string
    {
        return strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $input) ?? '');
    }

    /**
     * @return list<string>
     */
    public function hiddenAnswers(): array
    {
        return array_values(array_filter(
            $this->hidden_answers ?? [],
            static fn ($answer): bool => is_string($answer),
        ));
    }

    public function poll(): BelongsTo
    {
        return $this->belongsTo(Poll::class);
    }

    public function currentQuestion(): BelongsTo
    {
        return $this->belongsTo(PollQuestion::class, 'current_question_id');
    }

    public function responses(): HasMany
    {
        return $this->hasMany(PollResponse::class, 'session_id');
    }
}
