import { Head, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

type PageProps = { basePath: string };
type PollType = 'multiple_choice' | 'word_cloud';
type PollOption = { id: number; option_text: string };
type PollQuestion = { id: number; question_text: string; options: PollOption[] };
type MultipleChoiceResult = { option_id: number; option_text: string; count: number; percent: number };
type WordCloudResult = { answer_text: string; count: number; percent: number };
type Results = MultipleChoiceResult[] | WordCloudResult[];

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

type WordCloudEngine = (canvas: HTMLCanvasElement, options: Record<string, unknown>) => void;
type WordCloudModule = WordCloudEngine & { stop?: () => void };

function stableHash(input: string): number {
    let hash = 2166136261;
    for (let index = 0; index < input.length; index++) {
        hash ^= input.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t += 0x6D2B79F5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

function resizeCanvasToElement(canvas: HTMLCanvasElement) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(1, Math.floor(rect.width * dpr));
    const height = Math.max(1, Math.floor(rect.height * dpr));
    if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
    }
}

function resultsEqual(pollType: PollType, a: Results, b: Results): boolean {
    if (pollType === 'word_cloud') {
        const mapA = new Map<string, number>();
        for (const item of a as WordCloudResult[]) {
            mapA.set(item.answer_text, item.count);
        }
        const mapB = new Map<string, number>();
        for (const item of b as WordCloudResult[]) {
            mapB.set(item.answer_text, item.count);
        }
        if (mapA.size !== mapB.size) return false;
        for (const [key, value] of mapA) {
            if (mapB.get(key) !== value) return false;
        }
        return true;
    }

    const mapA = new Map<number, number>();
    for (const item of a as MultipleChoiceResult[]) {
        mapA.set(item.option_id, item.count);
    }
    const mapB = new Map<number, number>();
    for (const item of b as MultipleChoiceResult[]) {
        mapB.set(item.option_id, item.count);
    }
    if (mapA.size !== mapB.size) return false;
    for (const [key, value] of mapA) {
        if (mapB.get(key) !== value) return false;
    }
    return true;
}

export default function ProjectorPage() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const code = useMemo(() => {
        const match = window.location.pathname.match(/projector\/(.+)$/);
        return match ? match[1] : '';
    }, []);

    const [sessionId, setSessionId] = useState<number | null>(null);
    const [pollTitle, setPollTitle] = useState<string | null>(null);
    const [pollType, setPollType] = useState<PollType>('multiple_choice');
    const [question, setQuestion] = useState<PollQuestion | null>(null);
    const [results, setResults] = useState<Results>([]);
    const [sessionStatus, setSessionStatus] = useState<'active' | 'closed' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [wordCloudLoaded, setWordCloudLoaded] = useState(false);

    const wordCloudCanvasRef = useRef<HTMLCanvasElement | null>(null);
    const wordCloudEngineRef = useRef<WordCloudModule | null>(null);
    const previousCountsRef = useRef<Map<string, number>>(new Map());
    const renderTimerRef = useRef<number | null>(null);
    const lastWordCloudSignatureRef = useRef<string | null>(null);

    const totalVotes = useMemo(() => results.reduce((sum, r) => sum + (r as any).count, 0), [results]);

    const loadSession = async () => {
        try {
            const res = await apiFetch(`${basePath}/api/join`, {
                method: 'POST',
                body: JSON.stringify({ code }),
            });
            if (res.status === 429) {
                return;
            }
            if (!res.ok) {
                throw new Error(t('projector.invalid_code'));
            }
            const data = await res.json();
            const nextPollType = (data.poll_type as PollType) || 'multiple_choice';
            const nextResults = (data.results || []) as Results;
            setError(null);
            setSessionId(data.session_id);
            setPollTitle(data.poll_title || null);
            setPollType(nextPollType);
            setQuestion(data.current_question);
            setResults((prev) => (resultsEqual(nextPollType, prev, nextResults) ? prev : nextResults));
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

    // Polling fallback - keep a slow refresh to recover if websockets fail.
    useEffect(() => {
        if (!sessionId || sessionStatus === 'closed') return;
        const intervalMs = window.Echo ? 15000 : 5000;
        const interval = setInterval(() => {
            loadSession();
        }, intervalMs);
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
                const nextResults = (payload.results || []) as Results;
                setResults((prev) => (resultsEqual(pollType, prev, nextResults) ? prev : nextResults));
            }
        });
        return () => {
            channel.stopListening('.session_updated');
            channel.stopListening('.results_updated');
        };
    }, [sessionId, question?.id, pollType]);

    const maxPercent = useMemo(() => Math.max(...results.map((r) => (r as any).percent), 1), [results]);

    useEffect(() => {
        if (pollType !== 'word_cloud') return;
        let cancelled = false;

        (async () => {
            if (wordCloudEngineRef.current) return;
            const mod = await import('wordcloud');
            if (cancelled) return;
            wordCloudEngineRef.current = ((mod as any).default ?? (mod as any)) as WordCloudModule;
            setWordCloudLoaded(true);
        })();

        return () => {
            cancelled = true;
        };
    }, [pollType]);

    useEffect(() => {
        if (pollType !== 'word_cloud') return;
        if (!wordCloudLoaded) return;
        const canvas = wordCloudCanvasRef.current;
        const WordCloud = wordCloudEngineRef.current;
        if (!canvas || !WordCloud) return;

        const incoming = (results as WordCloudResult[]) ?? [];
        const nextCounts = new Map<string, number>();
        for (const item of incoming) {
            if (!item.answer_text) continue;
            nextCounts.set(item.answer_text, item.count);
        }

        const nextSignature = Array.from(nextCounts.entries())
            .sort(([a], [b]) => a.localeCompare(b, 'sv'))
            .map(([text, count]) => `${text}:${count}`)
            .join('|');
        if (nextSignature === lastWordCloudSignatureRef.current) {
            return;
        }
        lastWordCloudSignatureRef.current = nextSignature;

        const scheduleRender = () => {
            if (renderTimerRef.current) {
                window.clearTimeout(renderTimerRef.current);
            }
            renderTimerRef.current = window.setTimeout(() => {
                renderTimerRef.current = null;
                renderOnce(nextCounts);
            }, 120);
        };

        const buildList = (counts: Map<string, number>) => {
            const entries = Array.from(counts.entries());
            entries.sort((a, b) => (b[1] - a[1]) || a[0].localeCompare(b[0], 'sv'));
            return entries.slice(0, 50);
        };

        const renderOnce = (counts: Map<string, number>) => {
            resizeCanvasToElement(canvas);
            const entries = buildList(counts);
            const maxCount = Math.max(...entries.map(([, count]) => count), 1);

            const list = entries.map(([text, count]) => [text, Math.sqrt(count)] as [string, number]);
            const weightFactor = Math.max(10, Math.min(canvas.width, canvas.height) / 10) / Math.sqrt(maxCount);
            const seed = stableHash(entries.map(([text]) => text).sort((a, b) => a.localeCompare(b, 'sv')).join('|'));
            const random = mulberry32(seed);

            WordCloud.stop?.();
            WordCloud(canvas, {
                list,
                weightFactor,
                gridSize: Math.max(8, Math.floor(Math.min(canvas.width, canvas.height) / 40)),
                rotateRatio: 0,
                shuffle: false,
                drawOutOfBound: false,
                clearCanvas: true,
                backgroundColor: 'transparent',
                fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
                color: (word: string) => BAR_COLORS[stableHash(word) % BAR_COLORS.length],
                random,
            });

            previousCountsRef.current = new Map(counts);
        };

        scheduleRender();

        return () => {
            if (renderTimerRef.current) {
                window.clearTimeout(renderTimerRef.current);
                renderTimerRef.current = null;
            }
            WordCloud.stop?.();
        };
    }, [pollType, results, wordCloudLoaded]);

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

                    {pollType === 'multiple_choice' ? (
                        <>
                            {/* Bar chart - using grid to ensure aligned baselines */}
                            <div className="mt-8 flex flex-1 flex-col justify-end">
                                {/* Bars row - fixed height container */}
                                <div className="flex items-end justify-center gap-8" style={{ height: '50vh' }}>
                                    {(results as MultipleChoiceResult[]).map((result, index) => {
                                        const color = BAR_COLORS[index % BAR_COLORS.length];
                                        const heightPercent = maxPercent > 0 ? (result.percent / maxPercent) * 100 : 0;

                                        return (
                                            <div
                                                key={result.option_id}
                                                className="flex h-full flex-col items-center justify-end"
                                                style={{ flex: '1 1 0', maxWidth: '180px' }}
                                            >
                                                <div className="mb-2 text-3xl font-bold transition-all duration-500" style={{ color }}>
                                                    {result.count}
                                                </div>
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
                                    {(results as MultipleChoiceResult[]).map((result, index) => {
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
                        </>
                    ) : (
                        <div className="mt-8 flex flex-1 flex-col">
                            <div
                                className="relative flex flex-1 items-center justify-center rounded-2xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950"
                            >
                                <canvas ref={wordCloudCanvasRef} className="h-full w-full" />
                                {(results as WordCloudResult[]).length === 0 ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                        <p className="text-lg text-neutral-500 dark:text-neutral-400">
                                            {t('projector.waiting_subtitle')}
                                        </p>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    )}
                </main>
            ) : sessionStatus === 'closed' ? (
                <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 px-16 py-12 text-center text-amber-900">
                        <div className="mb-4 text-5xl">
                            <span
                                role="img"
                                aria-label={t('projector.aria_ended')}
                            >
                                ✓
                            </span>
                        </div>
                        <h2 className="text-2xl font-semibold">{t('projector.ended_title')}</h2>
                        <p className="mt-2">{t('projector.ended_subtitle')}</p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-1 flex-col items-center justify-center">
                    <div className="rounded-2xl border-2 border-neutral-200 bg-neutral-50 px-16 py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
                        <div className="mb-4 text-6xl">
                            <span
                                role="img"
                                aria-label={t('projector.aria_waiting')}
                            >
                                ...
                            </span>
                        </div>
                        <h2 className="text-2xl font-semibold text-neutral-700 dark:text-neutral-200">{t('projector.waiting_title')}</h2>
                        <p className="mt-2 text-neutral-500 dark:text-neutral-400">{t('projector.waiting_subtitle')}</p>
                    </div>
                </div>
            )}
        </div>
    );
}
