<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('authenticated users can open appearance settings', function () {
    $this->actingAs(User::factory()->create());

    $this->get(route('appearance.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('settings/appearance'));
});

