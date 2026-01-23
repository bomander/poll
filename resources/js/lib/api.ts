function getCsrfToken(): string {
    return document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') || '';
}

export async function apiFetch(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = new Headers(options.headers);
    
    if (!headers.has('Content-Type') && options.body) {
        headers.set('Content-Type', 'application/json');
    }
    
    headers.set('X-CSRF-TOKEN', getCsrfToken());
    headers.set('Accept', 'application/json');
    
    return fetch(url, {
        ...options,
        headers,
        credentials: 'include',
    });
}
