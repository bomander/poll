import { Link, usePage } from '@inertiajs/react';
import { useState } from 'react';

import { PlayfulPage } from '@/components/playful';
import PublicSeo from '@/components/PublicSeo';
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
            <PlayfulPage>
                <div className="pt-[6vh] sm:pt-[10vh]">
                    <div className="mb-8 text-center">
                        <h1 className="font-toy text-6xl font-bold tracking-tight">
                            {name}
                        </h1>
                    </div>

                    <form
                        onSubmit={handleJoin}
                        className="playful-card p-6 sm:p-8"
                    >
                        <input
                            id="code"
                            aria-label={t('welcome.code_label')}
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
                            className="toy-input font-toy h-20 text-center text-4xl font-semibold tracking-[0.2em]"
                        />
                        {error && (
                            <p
                                role="alert"
                                className="mt-4 rounded-2xl border-[3px] border-[var(--danger-line)] bg-[var(--danger-bg)] px-4 py-3 text-center font-semibold text-[var(--danger)]"
                            >
                                {error}
                            </p>
                        )}
                        <button
                            type="submit"
                            className="toy-button toy-button--go mt-6 h-16 text-2xl"
                            disabled={!code.trim() || loading}
                        >
                            {loading ? t('welcome.joining') : t('welcome.join')}
                        </button>
                    </form>

                    <div className="mt-10 text-center">
                        {auth.user ? (
                            <Link
                                href={`${basePath}/dashboard`}
                                className="font-semibold underline underline-offset-4"
                            >
                                {t('welcome.dashboard')}
                            </Link>
                        ) : (
                            <a
                                href={`${basePath}/login`}
                                className="font-semibold underline underline-offset-4"
                            >
                                {t('welcome.teacher_login')}
                            </a>
                        )}
                    </div>
                </div>
            </PlayfulPage>
        </>
    );
}
