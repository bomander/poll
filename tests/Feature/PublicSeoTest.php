<?php

use Illuminate\Support\Facades\Http;
use Inertia\Testing\AssertableInertia;

it('public home has metadata and readable content', function () {
    $this->withoutVite();
    Http::fake();
    $this->get('/')->assertOk()
        ->assertSee('<title', false)
        ->assertSee('<meta name="description"', false)
        ->assertSee('<link rel="canonical" href="https://boma.nu/enkat/"', false)
        ->assertSee('<h1', false)
        ->assertSee('<a href=', false);
});

it('home canonical does not leak to other pages', function () {
    $this->withoutVite();
    $this->get('/login')
        ->assertDontSee('<link rel="canonical" href="https://boma.nu/enkat/"', false);
});

it('inertia home response includes the same metadata', function () {
    $this->withoutVite();
    Http::fake();
    $this->get('/')
        ->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->where('seo.canonical', config('public-seo.canonical')));
});
