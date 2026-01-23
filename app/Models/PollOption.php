<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PollOption extends Model
{
    protected $fillable = [
        'question_id',
        'option_text',
        'order_index',
    ];

    public function question(): BelongsTo
    {
        return $this->belongsTo(PollQuestion::class, 'question_id');
    }
}
