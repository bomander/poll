<?php

use App\Models\User;
use Inertia\Testing\AssertableInertia as Assert;

test('authenticated users can open appearance settings', function () {
    $this->actingAs(User::factory()->create());

    $this->get(route('appearance.edit'))
        ->assertOk()
        ->assertInertia(fn (Assert $page) => $page->component('settings/appearance'));
});

test('invalid appearance cookies are not inserted into the page script', function () {
    $this->withUnencryptedCookie('appearance', "dark';alert(1);//")
        ->get(route('home'))
        ->assertOk()
        ->assertSee("const appearance = 'system';", false)
        ->assertDontSee('alert(1)', false);
});
