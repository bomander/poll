<?php

namespace App\Models;

// use Illuminate\Contracts\Auth\MustVerifyEmail;
use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    /**
     * The attributes that are mass assignable.
     *
     * @var list<string>
     */
    protected $fillable = [
        'name',
        'email',
        'password',
        'basen_subject',
        'auth_subject',
        'identity_disabled_at',
        'identity_application_revoked_at',
        'identity_deleted_at',
        'identity_quarantine_until',
        'identity_session_version',
        'is_admin',
        'is_banned',
        'ban_reason',
    ];

    /**
     * The attributes that should be hidden for serialization.
     *
     * @var list<string>
     */
    protected $hidden = [
        'password',
        'remember_token',
    ];

    /**
     * Get the attributes that should be cast.
     *
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'is_admin' => 'boolean',
            'is_banned' => 'boolean',
            'identity_disabled_at' => 'datetime',
            'identity_application_revoked_at' => 'datetime',
            'identity_deleted_at' => 'datetime',
            'identity_quarantine_until' => 'datetime',
            'identity_session_version' => 'integer',
        ];
    }

    public function polls()
    {
        return $this->hasMany(Poll::class);
    }
}
