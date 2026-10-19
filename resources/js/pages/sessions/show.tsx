import { Head, usePage } from '@inertiajs/react';
import {
    ArrowLeft,
    Check,
    Download,
    Eye,
    EyeOff,
    Link2,
    Lock,
    LockOpen,
    MonitorPlay,
    Play,
    Square,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import { StartSessionDialog } from '@/components/start-session-dialog';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
    formatCode,
    optionColor,
    optionLetter,
    type MultipleChoiceResult,
    type PollQuestion,
    type PollType,
    type WordCloudResult,
} from '@/lib/poll';

type PageProps = {
    basePath: string;
    sessionId: number;
    joinHost: string;
    joinBaseUrl: string;
};

type Session = {
    id: number;
    code: string;
    name?: string | null;
    status: 'active' | 'closed';
    locked: boolean;
    show_results: boolean;
    current_question_id: number | null;
    started_at?: string | null;
    ended_at?: string | null;
    poll: {
        id: number;
        title: string;
        type: PollType;
        questions: PollQuestion[];
    };
    results?: Record<number, (MultipleChoiceResult | WordCloudResult)[]>;
    response_totals?: Record<number, number>;
};

export default function SessionShow() {
    const { basePath, sessionId, joinHost, joinBaseUrl } =
        usePage<PageProps>().props;
    const t = useT();
    const [session, setSession] = useState<Session | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const [restartOpen, setRestartOpen] = useState(false);

    const loadSession = useCallback(async () => {
        try {
            const res = await apiFetch(`${basePath}/api/sessions/${sessionId}`);
            if (!res.ok) throw new Error();
            setSession((await res.json()) as Session);
            setError(null);
        } catch {
            setError(t('session.load_failed'));
        }
    }, [sessionId, basePath, t]);

    useEffect(() => {
        const timer = window.setTimeout(() => void loadSession(), 0);
        return () => window.clearTimeout(timer);
    }, [loadSession]);

    useEffect(() => {
        if (session?.status !== 'active') return;
        const interval = window.setInterval(() => void loadSession(), 5000);
        return () => window.clearInterval(interval);
    }, [session?.status, loadSession]);

    const post = async (path: string, body?: object) => {
        const res = await apiFetch(
            `${basePath}/api/sessions/${sessionId}/${path}`,
            {
                method: 'POST',
                body: body ? JSON.stringify(body) : undefined,
            },
        );
        if (!res.ok) {
            setError(
                path === 'close'
                    ? t('session.close_failed')
                    : t('session.update_failed'),
            );
            return;
        }
        setError(null);
        setSession((await res.json()) as Session);
    };

    const isClosed = session?.status === 'closed';
    const joinUrl = session ? `${joinBaseUrl}${session.code}` : '';
    const question =
        session?.poll.questions.find(
            (q) => q.id === session.current_question_id,
        ) ?? session?.poll.questions[0];
    const results = (question && session?.results?.[question.id]) || [];
    const total = (question && session?.response_totals?.[question.id]) || 0;
    const pollType = session?.poll.type ?? 'multiple_choice';

    const copyLink = async () => {
        try {
            await navigator.clipboard.writeText(joinUrl);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 2000);
        } catch {
            window.prompt(t('session.copy_link'), joinUrl);
        }
    };

    const statusLabel = isClosed
        ? t('session.status.closed')
        : session?.locked
          ? t('session.status.locked')
          : t('session.status.open');
    const statusClass = isClosed
        ? 'bg-neutral-200 text-neutral-800'
        : session?.locked
          ? 'bg-amber-100 text-amber-900'
          : 'bg-emerald-100 text-emerald-800';

    return (
        <AppLayout>
            <Head title={session?.poll.title ?? t('session.title')} />
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
                <div>
                    <Button variant="ghost" size="sm" className="-ml-2" asChild>
                        <a href={`${basePath}/sessions`}>
                            <ArrowLeft />
                            {t('session.back')}
                        </a>
                    </Button>
                    {session ? (
                        <div className="mt-2 flex flex-wrap items-center gap-3">
                            <h1 className="text-2xl font-semibold">
                                {session.poll.title}
                            </h1>
                            <span
                                className={`rounded-full px-2.5 py-0.5 text-sm font-medium ${statusClass}`}
                            >
                                {statusLabel}
                            </span>
                            {session.name ? (
                                <span className="text-sm text-muted-foreground">
                                    {session.name}
                                </span>
                            ) : null}
                        </div>
                    ) : null}
                </div>

                {error ? (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                ) : null}

                {!session ? (
                    error ? null : (
                        <p className="text-sm text-muted-foreground">
                            {t('session.loading')}
                        </p>
                    )
                ) : (
                    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
                        <div className="grid gap-6">
                            {!isClosed ? (
                                <section className="rounded-xl border p-6">
                                    <h2 className="text-sm font-medium text-muted-foreground">
                                        {t('session.join_title')}
                                    </h2>
                                    <p className="mt-2 text-lg">
                                        {t('session.join_instruction', {
                                            host: joinHost,
                                        })}
                                    </p>
                                    <p className="mt-1 font-mono text-5xl font-bold tracking-widest">
                                        {formatCode(session.code)}
                                    </p>
                                    <div className="mt-5 flex flex-wrap gap-2">
                                        <Button size="lg" asChild>
                                            <a
                                                href={`${basePath}/projector/${session.code}`}
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                <MonitorPlay />
                                                {t('session.open_projector')}
                                            </a>
                                        </Button>
                                        <Button
                                            size="lg"
                                            variant="outline"
                                            onClick={() => void copyLink()}
                                        >
                                            {copied ? <Check /> : <Link2 />}
                                            {copied
                                                ? t('session.copied')
                                                : t('session.copy_link')}
                                        </Button>
                                    </div>
                                    <p className="mt-3 text-xs text-muted-foreground">
                                        {t('session.projector_help')}
                                    </p>
                                </section>
                            ) : null}

                            <section className="rounded-xl border p-6">
                                <div className="flex flex-wrap items-baseline justify-between gap-2">
                                    <h2 className="text-lg font-semibold">
                                        {t('session.results_title')}
                                    </h2>
                                    <span className="text-sm font-medium">
                                        {total
                                            ? t('session.responses', {
                                                  count: total,
                                              })
                                            : t('session.no_responses')}
                                    </span>
                                </div>
                                {question ? (
                                    <p className="mt-1 text-muted-foreground">
                                        {question.question_text}
                                    </p>
                                ) : null}
                                <div className="mt-5">
                                    {pollType === 'word_cloud' ? (
                                        <WordCloudList
                                            results={
                                                results as WordCloudResult[]
                                            }
                                            onToggle={(answer, hidden) =>
                                                void post('hidden-answers', {
                                                    answer_text: answer,
                                                    hidden,
                                                })
                                            }
                                        />
                                    ) : (
                                        <ChoiceBars
                                            results={
                                                results as MultipleChoiceResult[]
                                            }
                                        />
                                    )}
                                </div>
                                {!session.show_results && !isClosed ? (
                                    <p className="mt-5 text-xs text-muted-foreground">
                                        {t('session.results_teacher_note')}
                                    </p>
                                ) : null}
                            </section>
                        </div>

                        <aside className="grid gap-4 rounded-xl border p-6">
                            <h2 className="text-lg font-semibold">
                                {t('session.controls_title')}
                            </h2>
                            {!isClosed ? (
                                <>
                                    <Control
                                        label={
                                            session.show_results
                                                ? t('session.hide_results')
                                                : t('session.show_results')
                                        }
                                        icon={
                                            session.show_results ? (
                                                <EyeOff />
                                            ) : (
                                                <Eye />
                                            )
                                        }
                                        help={
                                            session.show_results
                                                ? t(
                                                      'session.results_visible_help',
                                                  )
                                                : t(
                                                      'session.results_hidden_help',
                                                  )
                                        }
                                        onClick={() =>
                                            void post('results-visibility', {
                                                show_results:
                                                    !session.show_results,
                                            })
                                        }
                                    />
                                    <Control
                                        label={
                                            session.locked
                                                ? t('session.unlock')
                                                : t('session.lock')
                                        }
                                        icon={
                                            session.locked ? (
                                                <LockOpen />
                                            ) : (
                                                <Lock />
                                            )
                                        }
                                        help={
                                            session.locked
                                                ? undefined
                                                : t('session.lock_help')
                                        }
                                        onClick={() =>
                                            void post('lock-question', {
                                                locked: !session.locked,
                                            })
                                        }
                                    />
                                    <Button
                                        variant="destructive"
                                        onClick={() => {
                                            if (
                                                window.confirm(
                                                    t('session.confirm_end'),
                                                )
                                            ) {
                                                void post('close');
                                            }
                                        }}
                                    >
                                        <Square />
                                        {t('session.end')}
                                    </Button>
                                </>
                            ) : (
                                <Button onClick={() => setRestartOpen(true)}>
                                    <Play />
                                    {t('session.restart')}
                                </Button>
                            )}
                            <Button variant="outline" asChild>
                                <a
                                    href={`${basePath}/api/sessions/${session.id}/export`}
                                >
                                    <Download />
                                    {t('session.export_csv')}
                                </a>
                            </Button>
                        </aside>
                    </div>
                )}
            </div>
            <StartSessionDialog
                poll={restartOpen && session ? session.poll : null}
                onOpenChange={setRestartOpen}
            />
        </AppLayout>
    );
}

function Control({
    label,
    icon,
    help,
    onClick,
}: {
    label: string;
    icon: React.ReactNode;
    help?: string;
    onClick: () => void;
}) {
    return (
        <div className="grid gap-1">
            <Button
                variant="outline"
                className="justify-start"
                onClick={onClick}
            >
                {icon}
                {label}
            </Button>
            {help ? (
                <p className="text-xs text-muted-foreground">{help}</p>
            ) : null}
        </div>
    );
}

function ChoiceBars({ results }: { results: MultipleChoiceResult[] }) {
    return (
        <div className="grid gap-3">
            {results.map((result, index) => (
                <div key={result.option_id}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex items-center gap-2">
                            <span
                                className="flex size-6 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
                                style={{ backgroundColor: optionColor(index) }}
                            >
                                {optionLetter(index)}
                            </span>
                            {result.option_text}
                        </span>
                        <span className="tabular-nums">
                            {result.count} · {Math.round(result.percent)} %
                        </span>
                    </div>
                    <div className="mt-1 h-2.5 rounded-full bg-muted">
                        <div
                            className="h-2.5 rounded-full transition-all duration-500"
                            style={{
                                width: `${result.percent}%`,
                                backgroundColor: optionColor(index),
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

function WordCloudList({
    results,
    onToggle,
}: {
    results: WordCloudResult[];
    onToggle: (answer: string, hidden: boolean) => void;
}) {
    const t = useT();
    if (results.length === 0) return null;

    return (
        <div className="grid gap-1">
            <p className="mb-2 text-xs text-muted-foreground">
                {t('session.hide_answer_help')}
            </p>
            {results.map((result) => (
                <div
                    key={result.answer_text}
                    className={`flex items-center justify-between gap-3 rounded-md px-2 py-1 text-sm ${
                        result.hidden ? 'bg-muted text-muted-foreground' : ''
                    }`}
                >
                    <span
                        className={`min-w-0 break-words ${
                            result.hidden ? 'line-through' : ''
                        }`}
                    >
                        {result.answer_text}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                        {result.hidden ? (
                            <span className="text-xs">
                                {t('session.hidden_badge')}
                            </span>
                        ) : null}
                        <span className="w-6 text-right tabular-nums">
                            {result.count}
                        </span>
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                                onToggle(result.answer_text, !result.hidden)
                            }
                        >
                            {result.hidden ? <Eye /> : <EyeOff />}
                            {result.hidden
                                ? t('session.show_answer')
                                : t('session.hide_answer')}
                        </Button>
                    </span>
                </div>
            ))}
        </div>
    );
}
