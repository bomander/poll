import { Link, usePage } from '@inertiajs/react';
import { useState } from 'react';

import PublicSeo from '@/components/PublicSeo';
import { Button } from '@/components/ui/button';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { normalizeCode } from '@/lib/poll';
import { type SharedData } from '@/types';

type PageProps = {
    basePath: string;
    auth: { user: { id: number } | null };
};

export default function Welcome() {
    const { basePath, auth, name } = usePage<PageProps & SharedData>().props;
    const t = useT();
    const [code, setCode] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const handleJoin = async (e: React.FormEvent) => {
        e.preventDefault();
        const clean = normalizeCode(code);
        if (!clean) return;

        setError(null);
        setLoading(true);

        try {
            const res = await apiFetch(`${basePath}/api/join`, {
                method: 'POST',
                body: JSON.stringify({ code: clean }),
            });

            if (!res.ok) {
                setError(t('welcome.errors.invalid_code'));
                return;
            }

            window.location.assign(`${basePath}/join?code=${clean}`);
        } catch {
            setError(t('welcome.errors.network'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <>
            <PublicSeo />
            <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
                <div className="w-full max-w-sm space-y-8">
                    <div className="text-center">
                        <h1 className="text-3xl font-semibold tracking-tight text-neutral-900 dark:text-neutral-100">
                            {name}
                        </h1>
                        <p className="mt-2 text-neutral-600 dark:text-neutral-400">
                            {t('welcome.tagline')}
                        </p>
                    </div>

                    <form onSubmit={handleJoin} className="space-y-4">
                        <div>
                            <label
                                htmlFor="code"
                                className="mb-2 block text-center text-sm font-medium text-neutral-700 dark:text-neutral-300"
                            >
                                {t('welcome.code_label')}
                            </label>
                            <input
                                id="code"
                                type="text"
                                inputMode="text"
                                autoCapitalize="characters"
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                                placeholder={t('welcome.code_placeholder')}
                                value={code}
                                onChange={(e) => {
                                    setCode(e.target.value.toUpperCase());
                                    setError(null);
                                }}
                                maxLength={12}
                                className="h-16 w-full rounded-md border border-neutral-300 bg-white text-center font-mono text-3xl tracking-[0.2em] text-neutral-900 placeholder:text-neutral-300 focus:border-neutral-500 focus:outline-none dark:border-neutral-600 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-500"
                            />
                            {error && (
                                <p className="mt-2 text-center text-sm text-red-600">
                                    {error}
                                </p>
                            )}
                        </div>
                        <Button
                            type="submit"
                            className="h-12 w-full"
                            disabled={!code.trim() || loading}
                        >
                            {loading ? t('welcome.joining') : t('welcome.join')}
                        </Button>
                    </form>

                    <div className="relative">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-neutral-200 dark:border-neutral-800" />
                        </div>
                        <div className="relative flex justify-center text-sm">
                            <span className="bg-neutral-50 px-4 text-neutral-500 dark:bg-neutral-950">
                                {t('welcome.or')}
                            </span>
                        </div>
                    </div>

                    <div className="text-center">
                        {auth.user ? (
                            <Button
                                variant="outline"
                                className="w-full"
                                asChild
                            >
                                <Link href={`${basePath}/dashboard`}>
                                    {t('welcome.dashboard')}
                                </Link>
                            </Button>
                        ) : (
                            <Button
                                variant="outline"
                                className="w-full"
                                asChild
                            >
                                <a href={`${basePath}/login`}>
                                    {t('welcome.teacher_login')}
                                </a>
                            </Button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
