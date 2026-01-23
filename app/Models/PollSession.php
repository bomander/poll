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
        'started_at',
        'ended_at',
    ];

    protected $casts = [
        'locked' => 'boolean',
        'started_at' => 'datetime',
        'ended_at' => 'datetime',
    ];

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
