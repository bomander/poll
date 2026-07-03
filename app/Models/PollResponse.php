<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PollResponse extends Model
{
    protected $table = 'responses';

    protected $fillable = [
        'session_id',
        'question_id',
        'option_id',
        'answer_text',
        'respondent_key',
    ];

    public function session(): BelongsTo
    {
        return $this->belongsTo(PollSession::class, 'session_id');
    }

    public function question(): BelongsTo
    {
        return $this->belongsTo(PollQuestion::class, 'question_id');
    }

    public function option(): BelongsTo
    {
        return $this->belongsTo(PollOption::class, 'option_id');
    }
}
