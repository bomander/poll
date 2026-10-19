import { Head, usePage } from '@inertiajs/react';
import { Maximize, Minimize } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { WaitingDots } from '@/components/playful';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
    formatCode,
    optionLetter,
    type MultipleChoiceResult,
    type ParticipantState,
    type PollQuestion,
    type WordCloudResult,
} from '@/lib/poll';
import { getTheme, readableInk, themeColor } from '@/lib/themes';

type PageProps = {
    basePath: string;
    code: string;
    joinUrl: string | null;
    joinHost: string;
    qrSvg: string | null;
};

type Theme = ReturnType<typeof getTheme>;

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
    const theme = getTheme(state?.theme);

    return (
        <div
            className="playful relative flex h-dvh flex-col gap-[2.2vh] overflow-hidden px-[2.5vw] pt-[2.5vh] pb-[4vh]"
            data-theme={state?.theme}
        >
            <Head title={t('projector.title')} />
            <div className="playful-shapes" aria-hidden>
                <span />
                <span />
                <span />
                <span />
            </div>

            {!closed && !invalid ? (
                <JoinBand host={joinHost} code={code} qrSvg={qrSvg} />
            ) : null}

            <div className="playful-card font-toy flex min-h-0 flex-1 flex-col px-[3.5vw] pt-[3vh] pb-[3.5vh]">
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
                        waiting={!closed}
                    />
                ) : (
                    <main
                        // Ny fråga ger ett nytt ordmoln i stället för att rita om det gamla.
                        key={question.id}
                        className="flex min-h-0 flex-1 flex-col"
                    >
                        <div className="flex items-center justify-between gap-6 text-[clamp(1rem,1.5vw,1.75rem)] font-semibold">
                            <span className="flex min-w-0 items-center gap-[0.6em]">
                                <span className="truncate rounded-[var(--btn-radius)] bg-[var(--pill)] px-[0.8em] py-[0.15em] text-[var(--pill-ink)]">
                                    {state.poll_title}
                                </span>
                                {state.question_count > 1 &&
                                state.question_number ? (
                                    <span className="shrink-0">
                                        {t('projector.question_position', {
                                            n: state.question_number,
                                            count: state.question_count,
                                        })}
                                    </span>
                                ) : null}
                            </span>
                            <span className="flex shrink-0 items-center gap-[0.6em]">
                                <StateChip state={state} />
                                <span className="rounded-[var(--btn-radius)] border-[0.15em] border-[var(--line)] bg-[var(--card)] px-[0.8em] py-[0.1em] tabular-nums">
                                    {total
                                        ? t('projector.responses', {
                                              count: total,
                                          })
                                        : t('projector.no_responses')}
                                </span>
                            </span>
                        </div>
                        <h1 className="font-question mt-[2vh] text-[clamp(1.75rem,4.2vw,5rem)] leading-[1.1] font-semibold text-balance">
                            {question.question_text}
                        </h1>
                        <div className="mt-[3vh] flex min-h-0 flex-1 flex-col">
                            {state.poll_type === 'multiple_choice' ? (
                                <ChoiceResults
                                    theme={theme}
                                    question={question}
                                    results={
                                        state.results as MultipleChoiceResult[]
                                    }
                                    showResults={state.show_results}
                                />
                            ) : state.show_results ? (
                                <WordCloudCanvas
                                    theme={theme}
                                    results={state.results as WordCloudResult[]}
                                />
                            ) : (
                                <Centered
                                    title={t('projector.results_hidden_title')}
                                    subtitle={t(
                                        'projector.results_hidden_subtitle',
                                    )}
                                    waiting
                                />
                            )}
                        </div>
                        {state.poll_type === 'multiple_choice' &&
                        !state.show_results &&
                        !closed ? (
                            <p className="mt-[2vh] text-center text-[clamp(1rem,1.7vw,2rem)] font-medium text-[var(--ink-soft)]">
                                {t('projector.results_hidden_subtitle')}
                            </p>
                        ) : null}
                    </main>
                )}
            </div>

            <button
                type="button"
                onClick={toggleFullscreen}
                className="font-toy fixed right-4 bottom-4 z-20 flex items-center gap-2 rounded-[var(--btn-radius)] border-[3px] border-[var(--line)] bg-[var(--card)] px-4 py-2 text-sm font-semibold text-[var(--ink)] opacity-40 transition-opacity hover:opacity-100 focus:opacity-100"
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
    const step = 'text-[clamp(0.9rem,1.3vw,1.5rem)] font-semibold opacity-75';
    return (
        <header className="font-toy relative z-10 flex shrink-0 items-center gap-[3vw] rounded-[var(--card-radius)] bg-[var(--band)] px-[3vw] py-[1.8vh] text-[var(--band-ink)] shadow-[0_8px_0_rgb(0_0_0/0.25)]">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-[3.5vw] gap-y-2">
                <div className="min-w-0">
                    <div className={step}>1. {t('projector.join_step')}</div>
                    <div className="truncate text-[clamp(1.5rem,3.3vw,3.75rem)] leading-tight font-semibold">
                        {host}
                    </div>
                </div>
                <div>
                    <div className={step}>2. {t('projector.code_step')}</div>
                    <div className="mt-[0.3vh] inline-block rounded-[min(var(--btn-radius),0.4em)] border-[0.08em] border-[var(--band-ink)] bg-[var(--code)] px-[0.35em] py-[0.05em] text-[clamp(2rem,4.8vw,5.5rem)] leading-none font-bold tracking-[0.12em] text-[var(--code-ink)]">
                        {formatCode(code)}
                    </div>
                </div>
            </div>
            {qrSvg ? (
                <div className="flex shrink-0 items-center gap-3">
                    <span className={`${step} hidden lg:block`}>
                        {t('projector.scan')}
                    </span>
                    <div
                        className="aspect-square w-[clamp(5.5rem,9vw,11rem)] rounded-[min(var(--btn-radius),1.25rem)] border-[0.35rem] border-[var(--code)] bg-white p-1 [&>svg]:h-full [&>svg]:w-full"
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
    const [label, background, color] =
        state.status === 'closed'
            ? [t('projector.state.closed'), 'var(--track)', 'var(--ink)']
            : state.locked
              ? [t('projector.state.locked'), 'var(--note)', 'var(--note-ink)']
              : [t('projector.state.open'), 'var(--ok)', 'var(--ok-ink)'];
    return (
        <span
            className="rounded-[var(--btn-radius)] border-[0.15em] border-[var(--line)] px-[0.8em] py-[0.1em]"
            style={{ backgroundColor: background, color }}
        >
            {label}
        </span>
    );
}

function Centered({
    title,
    subtitle,
    waiting = false,
}: {
    title: string;
    subtitle?: string;
    waiting?: boolean;
}) {
    return (
        <div className="flex flex-1 flex-col items-center justify-center px-[4vw] text-center">
            {waiting ? (
                <div className="mb-[4vh] scale-[1.8]">
                    <WaitingDots />
                </div>
            ) : null}
            <h2 className="text-[clamp(1.75rem,3.8vw,4.25rem)] font-semibold">
                {title}
            </h2>
            {subtitle ? (
                <p className="mt-[1.5vh] text-[clamp(1.1rem,2.1vw,2.4rem)] font-medium text-[var(--ink-soft)]">
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
    theme,
    question,
    results,
    showResults,
}: {
    theme: Theme;
    question: PollQuestion;
    results: MultipleChoiceResult[];
    showResults: boolean;
}) {
    const byOption = new Map(
        results.map((result) => [result.option_id, result]),
    );
    const maxPercent = Math.max(...results.map((result) => result.percent), 1);

    return (
        <ol className="flex min-h-0 flex-1 flex-col justify-center gap-[1.8vh]">
            {question.options.map((option, index) => {
                const result = byOption.get(option.id);
                const color = themeColor(theme, index);
                const width = result ? (result.percent / maxPercent) * 100 : 0;
                return (
                    <li
                        key={option.id}
                        className="flex min-h-0 items-center gap-[1.2vw] text-[clamp(1.1rem,2.4vw,2.9rem)]"
                    >
                        <span
                            className="flex aspect-square w-[1.9em] shrink-0 items-center justify-center rounded-[min(var(--btn-radius),9999px)] border-[0.12em] border-[var(--line)] font-bold"
                            style={{
                                backgroundColor: color,
                                color: readableInk(theme, color),
                            }}
                        >
                            {optionLetter(index)}
                        </span>
                        <div className="relative min-w-0 flex-1 overflow-hidden rounded-[min(var(--btn-radius),0.9em)] border-[0.12em] border-[var(--line)] bg-[var(--track)]">
                            {showResults ? (
                                <div
                                    className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-[cubic-bezier(0.34,1.56,0.64,1)]"
                                    style={{
                                        width: `${width}%`,
                                        // Mörka färger tonas ned så att texten syns på avstånd.
                                        // Ljusa färger fyller stapeln helt på ljusa kort, annars försvinner de.
                                        backgroundColor:
                                            !theme.darkCard &&
                                            readableInk(theme, color) ===
                                                theme.darkInk
                                                ? color
                                                : `${color}4d`,
                                        borderRight:
                                            width > 0
                                                ? `0.25em solid ${color}`
                                                : undefined,
                                    }}
                                />
                            ) : null}
                            <div className="relative flex items-center justify-between gap-4 px-[0.7em] py-[0.4em]">
                                <span className="font-question min-w-0 leading-snug font-medium">
                                    {option.option_text}
                                </span>
                                {showResults && result ? (
                                    <span className="shrink-0 font-bold tabular-nums">
                                        {Math.round(result.percent)} %
                                        <span className="ml-[0.5em] text-[0.7em] font-medium text-[var(--ink-soft)]">
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

function WordCloudCanvas({
    theme,
    results,
}: {
    theme: Theme;
    results: WordCloudResult[];
}) {
    const t = useT();
    const containerRef = useRef<HTMLDivElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const engineRef = useRef<WordCloudEngine | null>(null);
    const [engineLoaded, setEngineLoaded] = useState(false);
    const [fontReady, setFontReady] = useState<string | null>(null);
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

    // Ordmolnet ritas på en canvas, så temats typsnitt måste vara laddat först.
    useEffect(() => {
        let cancelled = false;
        const font = theme.cloudFont;
        void Promise.resolve(document.fonts?.load(`600 48px ${font}`))
            .catch(() => undefined)
            .then(() => {
                if (!cancelled) setFontReady(font);
            });
        return () => {
            cancelled = true;
        };
    }, [theme.cloudFont]);

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
        if (fontReady !== theme.cloudFont) return;
        if (size.width === 0 || size.height === 0) return;

        const entries = results
            .filter((item) => item.answer_text)
            .map((item) => [item.answer_text, item.count] as [string, number])
            .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'sv'))
            .slice(0, 50);

        const signature = `${theme.key}|${size.width}x${size.height}|${entries
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
            fontFamily: `${theme.cloudFont}, ui-rounded, system-ui, sans-serif`,
            fontWeight: '600',
            color: (word: string) => themeColor(theme, stableHash(word)),
            random,
        });
    }, [engineLoaded, fontReady, results, size, theme]);

    useEffect(() => () => engineRef.current?.stop?.(), []);

    return (
        <div ref={containerRef} className="relative min-h-0 flex-1">
            <canvas
                ref={canvasRef}
                className="absolute inset-0 h-full w-full"
            />
            {results.length === 0 ? (
                <div className="absolute inset-0 flex items-center justify-center">
                    <p className="text-[clamp(1.1rem,2.1vw,2.4rem)] font-medium text-[var(--ink-soft)]">
                        {t('projector.no_answers_yet')}
                    </p>
                </div>
            ) : null}
        </div>
    );
}
