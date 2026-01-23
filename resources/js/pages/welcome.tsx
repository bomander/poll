import { Head, Link, usePage } from '@inertiajs/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';

type PageProps = {
    basePath: string;
    auth: { user: { id: number } | null };
};

export default function Welcome() {
    const { basePath, auth } = usePage<PageProps>().props;
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!code.trim()) return;

        setError(null);
        setLoading(true);

        try {
            const res = await fetch(`${basePath}/api/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ code: code.trim().toUpperCase() }),
            });

            if (!res.ok) {
                setError('Ogiltig eller avslutad kod');
                return;
            }

            // Koden är giltig, redirecta till join-sidan
            window.location.href = `${basePath}/join?code=${code.trim().toUpperCase()}`;
        } catch {
            setError('Kunde inte ansluta till servern');
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <Head title="Enkat" />
            <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
                <div className="w-full max-w-sm space-y-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                            Enkat
                        </h1>
                        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                            Live-omrostningar i klassrummet
                        </p>
                    </div>

                    <form onSubmit={handleJoin} className="space-y-4">
                        <div>
                            <input
                                type="text"
                                placeholder="Ange kod"
                                value={code}
                                onChange={(e) => {
                                    setCode(e.target.value.toUpperCase());
                                    setError(null);
                                }}
                                maxLength={8}
                                className="h-14 w-full rounded-md border border-neutral-300 bg-white text-center text-xl font-mono tracking-wider text-neutral-900 placeholder:text-neutral-400 focus:border-neutral-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                            />
                            {error && (
                                <p className="mt-2 text-center text-sm text-red-600">{error}</p>
                            )}
                        </div>
                        <Button type="submit" className="w-full h-12" disabled={!code.trim() || loading}>
                            {loading ? 'Ansluter...' : 'Ga med'}
                        </Button>
                    </form>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-neutral-50 px-4 text-neutral-500 dark:bg-neutral-950">
                                eller
                            </span>
                        </div>
                    </div>

                    <div className="text-center">
                        {auth.user ? (
                            <Button variant="outline" className="w-full" asChild>
                                <Link href={`${basePath}/dashboard`}>Till Dashboard</Link>
                            </Button>
                        ) : (
                            <Button variant="outline" className="w-full" asChild>
                                <Link href={`${basePath}/login`}>Logga in som larare</Link>
                            </Button>
                        )}
                        </div>
                </div>
            </div>
        </>
    );
}
