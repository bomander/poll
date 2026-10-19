import { Head, usePage } from '@inertiajs/react';
import { Maximize, Minimize } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
    formatCode,
    optionColor,
    optionLetter,
    type MultipleChoiceResult,
    type ParticipantState,
    type PollQuestion,
    type WordCloudResult,
} from '@/lib/poll';

type PageProps = {
    basePath: string;
    code: string;
    joinUrl: string | null;
    joinHost: string;
    qrSvg: string | null;
};

type WordCloudEngine = ((
    canvas: HTMLCanvasElement,
    options: Record<string, unknown>,
) => void) & { stop?: () => void };

// Projektorn är en enda klient per klassrum, så den kan fråga lite oftare.
const REFRESH_MS = 3000;

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
        t += 0x6d2b79f5;
        let x = t;
        x = Math.imul(x ^ (x >>> 15), x | 1);
        x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

export default function ProjectorPage() {
    const { basePath, code, joinHost, qrSvg } = usePage<PageProps>().props;
    const t = useT();
    const [state, setState] = useState<ParticipantState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [invalid, setInvalid] = useState(false);
    const [fullscreen, setFullscreen] = useState(false);

    const load = useCallback(async () => {
        try {
            const res = await apiFetch(`${basePath}/api/join`, {
                method: 'POST',
                body: JSON.stringify({ code }),
            });
            if (res.status === 429) return;
            if (!res.ok) {
                setInvalid(res.status === 404 || res.status === 422);
                setError(t('projector.invalid_code'));
                return;
            }
            setState((await res.json()) as ParticipantState);
            setError(null);
        } catch {
            setError(t('projector.errors.load_failed'));
        }
    }, [basePath, code, t]);

    useEffect(() => {
        const timer = window.setTimeout(() => void load(), 0);
        return () => window.clearTimeout(timer);
    }, [load]);

    const closed = state?.status === 'closed';
    useEffect(() => {
        if (closed || invalid) return;
        const interval = window.setInterval(() => void load(), REFRESH_MS);
        return () => window.clearInterval(interval);
    }, [closed, invalid, load]);

    useEffect(() => {
        const sync = () => setFullscreen(document.fullscreenElement !== null);
        document.addEventListener('fullscreenchange', sync);
        return () => document.removeEventListener('fullscreenchange', sync);
    }, []);

    const toggleFullscreen = () => {
        if (document.fullscreenElement) {
            void document.exitFullscreen();
        } else {
            void document.documentElement.requestFullscreen?.();
        }
    };

    const question = state?.current_question ?? null;
    const total = state?.total_responses ?? 0;

    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-white text-neutral-900 dark:bg-neutral-950 dark:text-white">
            <Head title={t('projector.title')} />

            {!closed && !invalid ? (
                <JoinBand host={joinHost} code={code} qrSvg={qrSvg} />
            ) : null}

            {error ? (
                <Centered title={error} />
            ) : !state ? null : !question ? (
                <Centered
                    title={
                        closed
                            ? t('projector.ended_title')
                            : t('projector.waiting_title')
                    }
                    subtitle={
                        closed
                            ? t('projector.ended_subtitle')
                            : t('projector.waiting_subtitle')
                    }
                />
            ) : (
                <main
                    // Ny fråga ger ett nytt ordmoln i stället för att rita om det gamla.
                    key={question.id}
                    className="flex min-h-0 flex-1 flex-col px-[4vw] pt-[2.5vh] pb-[3vh]"
                >
                    <div className="flex items-center justify-between gap-6 text-[clamp(1rem,1.5vw,1.75rem)]">
                        <span className="truncate text-neutral-500 dark:text-neutral-400">
                            {state.poll_title}
                            {state.question_count > 1 && state.question_number
                                ? ` · ${t('projector.question_position', {
                                      n: state.question_number,
                                      count: state.question_count,
                                  })}`
                                : null}
                        </span>
                        <span className="flex shrink-0 items-center gap-4">
                            <StateChip state={state} />
                            <span className="font-semibold tabular-nums">
                                {total
                                    ? t('projector.responses', { count: total })
                                    : t('projector.no_responses')}
                            </span>
                        </span>
                    </div>
                    <h1 className="mt-[1.5vh] text-[clamp(1.75rem,4vw,4.75rem)] leading-tight font-bold text-balance">
                        {question.question_text}
                    </h1>
                    <div className="mt-[3vh] flex min-h-0 flex-1 flex-col">
                        {state.poll_type === 'multiple_choice' ? (
                            <ChoiceResults
                                question={question}
                                results={
                                    state.results as MultipleChoiceResult[]
                                }
                                showResults={state.show_results}
                            />
                        ) : state.show_results ? (
                            <WordCloudCanvas
                                results={state.results as WordCloudResult[]}
                            />
                        ) : (
                            <Centered
                                title={t('projector.results_hidden_title')}
                                subtitle={t(
                                    'projector.results_hidden_subtitle',
                                )}
                            />
                        )}
                    </div>
                    {state.poll_type === 'multiple_choice' &&
                    !state.show_results &&
                    !closed ? (
                        <p className="mt-[2vh] text-center text-[clamp(1rem,1.6vw,1.75rem)] text-neutral-500 dark:text-neutral-400">
                            {t('projector.results_hidden_subtitle')}
                        </p>
                    ) : null}
                </main>
            )}

            <button
                type="button"
                onClick={toggleFullscreen}
                className="fixed right-3 bottom-3 flex items-center gap-2 rounded-md bg-neutral-900/70 px-3 py-2 text-sm text-white opacity-30 transition-opacity hover:opacity-100 focus:opacity-100"
                aria-label={
                    fullscreen
                        ? t('projector.exit_fullscreen')
                        : t('projector.fullscreen')
                }
            >
                {fullscreen ? (
                    <Minimize className="size-4" />
                ) : (
                    <Maximize className="size-4" />
                )}
                {fullscreen
                    ? t('projector.exit_fullscreen')
                    : t('projector.fullscreen')}
            </button>
        </div>
    );
}

function JoinBand({
    host,
    code,
    qrSvg,
}: {
    host: string;
    code: string;
    qrSvg: string | null;
}) {
    const t = useT();
    return (
        <header className="flex shrink-0 items-center gap-[3vw] bg-neutral-900 px-[4vw] py-[1.8vh] text-white">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[3vw] gap-y-2">
                <div className="min-w-0">
                    <div className="text-[clamp(0.85rem,1.2vw,1.4rem)] tracking-wide text-neutral-400 uppercase">
                        1. {t('projector.join_step')}
                    </div>
                    <div className="truncate text-[clamp(1.5rem,3.2vw,3.5rem)] leading-tight font-semibold">
                        {host}
                    </div>
                </div>
                <div>
                    <div className="text-[clamp(0.85rem,1.2vw,1.4rem)] tracking-wide text-neutral-400 uppercase">
                        2. {t('projector.code_step')}
                    </div>
                    <div className="font-mono text-[clamp(2rem,4.6vw,5.25rem)] leading-none font-bold tracking-[0.12em] text-amber-300">
                        {formatCode(code)}
                    </div>
                </div>
            </div>
            {qrSvg ? (
                <div className="flex shrink-0 items-center gap-3">
                    <span className="hidden text-[clamp(0.85rem,1.2vw,1.4rem)] text-neutral-400 lg:block">
                        {t('projector.scan')}
                    </span>
                    <div
                        className="aspect-square w-[clamp(5.5rem,9vw,11rem)] rounded-md bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
                        // SVG:n skapas på servern från lärarens kod, inte från elevdata.
                        dangerouslySetInnerHTML={{ __html: qrSvg }}
                    />
                </div>
            ) : null}
        </header>
    );
}

function StateChip({ state }: { state: ParticipantState }) {
    const t = useT();
    const [label, className] =
        state.status === 'closed'
            ? [t('projector.state.closed'), 'bg-neutral-200 text-neutral-800']
            : state.locked
              ? [t('projector.state.locked'), 'bg-amber-100 text-amber-900']
              : [t('projector.state.open'), 'bg-emerald-100 text-emerald-800'];
    return (
        <span
            className={`rounded-full px-[1em] py-[0.25em] font-semibold ${className}`}
        >
            {label}
        </span>
    );
}

function Centered({ title, subtitle }: { title: string; subtitle?: string }) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-[4vw] text-center">
            <h2 className="text-[clamp(1.75rem,3.6vw,4rem)] font-semibold">
                {title}
            </h2>
            {subtitle ? (
                <p className="mt-[1.5vh] text-[clamp(1.1rem,2vw,2.25rem)] text-neutral-500 dark:text-neutral-400">
                    {subtitle}
                </p>
            ) : null}
        </div>
    );
}

/**
 * Flervalsfrågan visas som liggande staplar. Alternativen syns alltid,
 * medan antal och staplar bara visas när läraren låter resultatet synas.
 */
function ChoiceResults({
    question,
    results,
    showResults,
}: {
    question: PollQuestion;
    results: MultipleChoiceResult[];
    showResults: boolean;
}) {
    const byOption = new Map(
        results.map((result) => [result.option_id, result]),
    );
    const maxPercent = Math.max(...results.map((result) => result.percent), 1);

    return (
        <ol className="flex min-h-0 flex-1 flex-col justify-center gap-[1.6vh]">
            {question.options.map((option, index) => {
                const result = byOption.get(option.id);
                const color = optionColor(index);
                const width = result ? (result.percent / maxPercent) * 100 : 0;
                return (
                    <li
                        key={option.id}
                        className="flex min-h-0 items-center gap-[1.5vw] text-[clamp(1.1rem,2.3vw,2.75rem)]"
                    >
                        <span
                            className="flex aspect-square w-[1.8em] shrink-0 items-center justify-center rounded-lg font-bold text-white"
                            style={{ backgroundColor: color }}
                        >
                            {optionLetter(index)}
                        </span>
                        <div className="relative min-w-0 flex-1 rounded-lg bg-neutral-100 dark:bg-neutral-900">
                            {showResults ? (
                                <div
                                    className="absolute inset-y-0 left-0 rounded-lg transition-[width] duration-700 ease-out"
                                    style={{
                                        width: `${width}%`,
                                        backgroundColor: `${color}33`,
                                        borderLeft: `0.35em solid ${color}`,
                                    }}
                                />
                            ) : null}
                            <div className="relative flex items-center justify-between gap-4 px-[0.7em] py-[0.45em]">
                                <span className="min-w-0 leading-snug font-medium">
                                    {option.option_text}
                                </span>
                                {showResults && result ? (
                                    <span className="shrink-0 font-bold tabular-nums">
                                        {Math.round(result.percent)} %
                                        <span className="ml-[0.5em] text-[0.7em] font-medium text-neutral-500 dark:text-neutral-400">
                                            ({result.count})
                                        </span>
                                    </span>
                                ) : null}
                            </div>
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

function WordCloudCanvas({ results }: { results: WordCloudResult[] }) {
    const t = useT();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<WordCloudEngine | null>(null);
    const [engineLoaded, setEngineLoaded] = useState(false);
    const [size, setSize] = useState({ width: 0, height: 0 });
    const lastSignatureRef = useRef<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        void import('wordcloud').then((mod) => {
            if (cancelled) return;
            engineRef.current = mod.default as WordCloudEngine;
            setEngineLoaded(true);
        });
        return () => {
            cancelled = true;
        };
    }, []);

    // Rita om när projektorfönstret ändrar storlek, till exempel vid helskärm.
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(([entry]) => {
            const { width, height } = entry.contentRect;
            setSize({ width: Math.floor(width), height: Math.floor(height) });
        });
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        const WordCloud = engineRef.current;
        if (!engineLoaded || !canvas || !WordCloud) return;
        if (size.width === 0 || size.height === 0) return;

        const entries = results
            .filter((item) => item.answer_text)
            .map((item) => [item.answer_text, item.count] as [string, number])
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sv'))
            .slice(0, 50);

        const signature = `${size.width}x${size.height}|${entries
            .map(([text, count]) => `${text}:${count}`)
            .join('|')}`;
        if (signature === lastSignatureRef.current) return;
        lastSignatureRef.current = signature;

        const dpr = window.devicePixelRatio || 1;
        canvas.width = Math.floor(size.width * dpr);
        canvas.height = Math.floor(size.height * dpr);

        const maxCount = Math.max(...entries.map(([, count]) => count), 1);
        const shortSide = Math.min(canvas.width, canvas.height);
        // Även ett ensamt ord ska bli stort, men inte större än att det får plats.
        const weightFactor = Math.max(12, shortSide / 4) / Math.sqrt(maxCount);
        const random = mulberry32(
            stableHash(
                entries
                    .map(([text]) => text)
                    .sort((a, b) => a.localeCompare(b, 'sv'))
                    .join('|'),
            ),
        );

        WordCloud.stop?.();
        WordCloud(canvas, {
            list: entries.map(([text, count]) => [text, Math.sqrt(count)]),
            weightFactor,
            gridSize: Math.max(8, Math.floor(shortSide / 50)),
            rotateRatio: 0,
            shuffle: false,
            drawOutOfBound: false,
            shrinkToFit: true,
            clearCanvas: true,
            backgroundColor: 'transparent',
            fontFamily:
                'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
            fontWeight: '700',
            color: (word: string) => optionColor(stableHash(word)),
            random,
        });
    }, [engineLoaded, results, size]);

    useEffect(() => () => engineRef.current?.stop?.(), []);

    return (
        <div ref={containerRef} className="relative min-h-0 flex-1">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
            />
            {results.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[clamp(1.1rem,2vw,2.25rem)] text-neutral-500 dark:text-neutral-400">
                        {t('projector.no_answers_yet')}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
