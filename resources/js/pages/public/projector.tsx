import { Head, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

type PageProps = { basePath: string };
type PollOption = { id: number; option_text: string };
type PollQuestion = { id: number; question_text: string; options: PollOption[] };
type Results = { option_id: number; option_text: string; count: number; percent: number }[];

declare global {
    interface Window {
        Echo?: any;
    }
}

const BAR_COLORS = [
    '#3B82F6', // blue
    '#F59E0B', // amber
    '#10B981', // emerald
    '#EC4899', // pink
    '#8B5CF6', // violet
    '#EF4444', // red
    '#06B6D4', // cyan
    '#F97316', // orange
];

export default function ProjectorPage() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const code = useMemo(() => {
        const match = window.location.pathname.match(/projector\/(.+)$/);
        return match ? match[1] : '';
    }, []);

    const [sessionId, setSessionId] = useState<number | null>(null);
    const [pollTitle, setPollTitle] = useState<string | null>(null);
    const [question, setQuestion] = useState<PollQuestion | null>(null);
    const [results, setResults] = useState<Results>([]);
    const [sessionStatus, setSessionStatus] = useState<'active' | 'closed' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const totalVotes = useMemo(() => results.reduce((sum, r) => sum + r.count, 0), [results]);

    const loadSession = async () => {
        try {
            const res = await apiFetch(`${basePath}/api/join`, {
                method: 'POST',
                body: JSON.stringify({ code }),
            });
            if (!res.ok) {
                throw new Error(t('projector.invalid_code'));
            }
            const data = await res.json();
            setError(null);
            setSessionId(data.session_id);
            setPollTitle(data.poll_title || null);
            setQuestion(data.current_question);
            setResults(data.results || []);
            setSessionStatus(data.status || null);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('projector.errors.load_failed'));
        }
    };

    useEffect(() => {
        if (code) {
            loadSession();
        }
    }, [code]);

    // Polling fallback - refresh results every 2 seconds
    useEffect(() => {
        if (!sessionId || sessionStatus === 'closed') return;
        const interval = setInterval(() => {
            loadSession();
        }, 2000);
        return () => clearInterval(interval);
    }, [sessionId, code, sessionStatus]);

    // WebSocket support (if Echo is available)
    useEffect(() => {
        if (!sessionId || !window.Echo) return;
        const channel = window.Echo.channel(`session.${code.toUpperCase()}`);
        channel.listen('.session_updated', (payload: any) => {
            setSessionStatus(payload.status || null);
            if (payload.status === 'active') {
                loadSession();
            }
        });
        channel.listen('.results_updated', (payload: any) => {
            if (payload.question_id === question?.id) {
                setResults(payload.results);
            }
        });
        return () => {
            channel.stopListening('.session_updated');
            channel.stopListening('.results_updated');
        };
    }, [sessionId, question?.id]);

    const maxPercent = useMemo(() => Math.max(...results.map((r) => r.percent), 1), [results]);

    return (
        <div className="flex min-h-screen flex-col bg-white dark:bg-neutral-950">
            <Head title={t('projector.title')} />

            {/* Header with code */}
            <header className="border-b-2 border-neutral-200 bg-neutral-50 px-8 py-4 dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-center justify-between">
                    <div className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                        {t('projector.instruction', { url: 'boma.nu/enkat' })}{' '}
                        <span className="ml-2 rounded-md border-2 border-neutral-300 bg-white px-3 py-1 font-mono text-xl font-bold tracking-widest text-neutral-900 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white">
                            {code}
                        </span>
                        {pollTitle ? <span className="ml-3 text-neutral-400 dark:text-neutral-500">- {pollTitle}</span> : null}
                    </div>
                    <div className="flex items-center gap-2 rounded-full border-2 border-neutral-200 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-800">
                        <div className="h-3 w-3 rounded-full bg-emerald-500" />
                        <span className="font-semibold text-neutral-700 dark:text-neutral-200">{totalVotes}</span>
                    </div>
                </div>
            </header>

            {error ? (
                <div className="flex flex-1 items-center justify-center">
                    <p className="text-xl text-red-600 dark:text-red-400">{error}</p>
                </div>
            ) : question ? (
                <main className="flex flex-1 flex-col px-12 py-10">
                    {sessionStatus === 'closed' ? (
                        <div className="mb-6 rounded-xl border-2 border-amber-200 bg-amber-50 px-6 py-4 text-center text-amber-900">
                            {t('projector.ended_banner')}
                        </div>
                    ) : null}
                    {/* Question */}
                    <h1 className="text-center text-4xl font-bold leading-tight text-neutral-900 dark:text-white">
                        {question.question_text}
                    </h1>

                    {/* Bar chart - using grid to ensure aligned baselines */}
                    <div className="mt-8 flex flex-1 flex-col justify-end">
                        {/* Bars row - fixed height container */}
                        <div className="flex items-end justify-center gap-8" style={{ height: '50vh' }}>
                            {results.map((result, index) => {
                                const color = BAR_COLORS[index % BAR_COLORS.length];
                                const heightPercent = maxPercent > 0 ? (result.percent / maxPercent) * 100 : 0;

                                return (
                                    <div key={result.option_id} className="flex h-full flex-col items-center justify-end" style={{ flex: '1 1 0', maxWidth: '180px' }}>
                                        {/* Count above bar */}
                                        <div
                                            className="mb-2 text-3xl font-bold transition-all duration-500"
                                            style={{ color }}
                                        >
                                            {result.count}
                                        </div>

                                        {/* Bar */}
                                        <div
                                            className="w-full rounded-t-lg transition-all duration-500 ease-out"
                                            style={{
                                                backgroundColor: color,
                                                height: heightPercent > 0 ? `${Math.max(heightPercent, 5)}%` : '8px',
                                                minHeight: '8px',
                                            }}
                                        />
                                    </div>
                                );
                            })}
                        </div>

                        {/* Labels row - fixed height, all labels aligned */}
                        <div className="mt-2 flex justify-center gap-8">
                            {results.map((result, index) => {
                                const color = BAR_COLORS[index % BAR_COLORS.length];

                                return (
                                    <div
                                        key={result.option_id}
                                        className="flex h-24 items-center justify-center rounded-lg border-2 px-3 py-2 text-center"
                                        style={{
                                            flex: '1 1 0',
                                            maxWidth: '180px',
                                            borderColor: color,
                                            backgroundColor: `${color}15`,
                                        }}
                                    >
                                        <span className="line-clamp-3 text-base font-semibold text-neutral-800 dark:text-neutral-100">
                                            {result.option_text}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </main>
            ) : sessionStatus === 'closed' ? (
                <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-16 py-12 text-center text-amber-900">
                        <div className="mb-4 text-5xl">
                            <span role="img" aria-label="ended">✓</span>
                        </div>
                        <h2 className="text-2xl font-semibold">{t('projector.ended_title')}</h2>
                        <p className="mt-2">{t('projector.ended_subtitle')}</p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-16 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
                        <div className="mb-4 text-6xl">
                            <span role="img" aria-label="waiting">...</span>
                        </div>
                        <h2 className="text-2xl font-semibold text-neutral-700 dark:text-neutral-200">{t('projector.waiting_title')}</h2>
                        <p className="mt-2 text-neutral-500 dark:text-neutral-400">{t('projector.waiting_subtitle')}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
