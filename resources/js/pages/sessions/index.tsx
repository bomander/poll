import { Head, usePage } from '@inertiajs/react';
import { ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import AppLayout from '@/layouts/app-layout';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

type PageProps = { basePath: string };
type Session = {
    id: number;
    name?: string | null;
    code: string;
    status: 'active' | 'closed';
    poll_title?: string | null;
    responses_count: number;
    created_at?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
};
type PollQuestion = { id: number; question_text: string };
type SessionDetails = {
    current_question_id?: number | null;
    poll: { questions: PollQuestion[] };
    results?: Record<number, { option_id: number; option_text: string; count: number; percent: number }[]>;
};

const OPTION_COLORS = [
    '#3B82F6',
    '#F59E0B',
    '#10B981',
    '#EC4899',
    '#8B5CF6',
    '#EF4444',
    '#06B6D4',
    '#F97316',
];

export default function SessionsIndex() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const [sessions, setSessions] = useState<Session[]>([]);
    const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'closed'>('all');
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [expandedDetails, setExpandedDetails] = useState<Record<number, SessionDetails>>({});
    const [expandedLoadingId, setExpandedLoadingId] = useState<number | null>(null);
    const [previewSessionId, setPreviewSessionId] = useState<number | null>(null);
    const [previewQuestionId, setPreviewQuestionId] = useState<number | null>(null);

    const filteredSessions = useMemo(() => {
        if (statusFilter === 'all') return sessions;
        return sessions.filter((session) => session.status === statusFilter);
    }, [sessions, statusFilter]);

    useEffect(() => {
        setLoading(true);
        apiFetch(`${basePath}/api/sessions`)
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(t('sessions_index.errors.load_sessions'));
                }
                const data = await res.json();
                setSessions(data);
            })
            .catch((err) => setError(err instanceof Error ? err.message : t('sessions_index.errors.load_sessions')))
            .finally(() => setLoading(false));
    }, [basePath]);

    const deleteSession = async (sessionId: number) => {
        const confirm = window.confirm(t('sessions_index.confirm_delete'));
        if (!confirm) return;
        setError(null);
        const res = await apiFetch(`${basePath}/api/sessions/${sessionId}`, { method: 'DELETE' });
        if (res.ok) {
            setSessions((prev) => prev.filter((session) => session.id !== sessionId));
            return;
        }
        const errData = await res.json().catch(() => ({}));
        setError(errData.message || t('sessions_index.errors.delete_session'));
    };

    const closeSession = async (sessionId: number) => {
        const confirm = window.confirm(t('sessions_index.confirm_close'));
        if (!confirm) return;
        setError(null);
        const res = await apiFetch(`${basePath}/api/sessions/${sessionId}/close`, { method: 'POST' });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            setError(errData.message || t('sessions_index.errors.close_session'));
            return;
        }
        const updated = await res.json();
        setSessions((prev) =>
            prev.map((session) =>
                session.id === sessionId
                    ? {
                          ...session,
                          status: updated.status,
                          ended_at: updated.ended_at || session.ended_at,
                      }
                    : session,
            ),
        );
    };

    const loadSessionDetails = async (sessionId: number) => {
        if (expandedDetails[sessionId]) {
            return expandedDetails[sessionId];
        }
        setExpandedLoadingId(sessionId);
        setError(null);
        try {
            const res = await apiFetch(`${basePath}/api/sessions/${sessionId}`);
            if (!res.ok) {
                throw new Error(t('sessions_index.errors.load_session'));
            }
            const data = await res.json();
            setExpandedDetails((prev) => ({ ...prev, [sessionId]: data }));
            return data;
        } catch (err) {
            setError(err instanceof Error ? err.message : t('sessions_index.errors.load_session'));
        } finally {
            setExpandedLoadingId(null);
        }
        return null;
    };

    const toggleExpanded = async (sessionId: number) => {
        if (expandedId === sessionId) {
            setExpandedId(null);
            return;
        }
        setExpandedId(sessionId);
        await loadSessionDetails(sessionId);
    };

    const openPreview = async (sessionId: number) => {
        setPreviewSessionId(sessionId);
        const details = await loadSessionDetails(sessionId);
        const defaultQuestionId =
            details?.current_question_id ?? details?.poll.questions[0]?.id ?? null;
        setPreviewQuestionId(defaultQuestionId);
    };

    const previewDetails = previewSessionId ? expandedDetails[previewSessionId] : null;
    const previewQuestions = previewDetails?.poll.questions ?? [];
    const previewResults = previewQuestionId
        ? previewDetails?.results?.[previewQuestionId] ?? []
        : [];
    const previewMaxPercent = Math.max(...previewResults.map((result) => result.percent), 1);

    return (
        <AppLayout>
            <Head title={t('sessions_index.title')} />
            <div className="flex flex-col gap-6 p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h1 className="text-xl font-semibold">{t('sessions_index.title')}</h1>
                        <p className="text-sm text-muted-foreground">
                            {t('sessions_index.subtitle')}
                        </p>
                    </div>
                    <div className="flex gap-2 rounded-md border p-1 text-sm">
                        {(['all', 'active', 'closed'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                className={`rounded-md px-3 py-1 ${
                                    statusFilter === value ? 'bg-black text-white' : 'text-muted-foreground'
                                }`}
                                onClick={() => setStatusFilter(value)}
                            >
                                {value === 'all'
                                    ? t('sessions_index.filter.all')
                                    : value === 'active'
                                      ? t('sessions_index.filter.active')
                                      : t('sessions_index.filter.closed')}
                            </button>
                        ))}
                    </div>
                </div>

                {error ? <p className="text-sm text-red-600">{error}</p> : null}

                <section className="rounded-xl border border-sidebar-border/70 p-6">
                    {loading ? (
                        <p className="text-sm text-muted-foreground">{t('sessions_index.loading')}</p>
                    ) : filteredSessions.length === 0 ? (
                        <p className="text-sm text-muted-foreground">{t('sessions_index.empty')}</p>
                    ) : (
                        <div className="grid gap-4">
                            {filteredSessions.map((session) => (
                                <div key={session.id} className="rounded-lg border p-4">
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="space-y-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <button
                                                    type="button"
                                                    className="flex items-center gap-2"
                                                    onClick={() => toggleExpanded(session.id)}
                                                >
                                                    <ChevronRight
                                                        className={`h-4 w-4 transition-transform ${
                                                            expandedId === session.id ? 'rotate-90' : ''
                                                        }`}
                                                    />
                                                    <span className="text-lg font-semibold">
                                                        {session.name || session.poll_title || t('sessions_index.title')}
                                                    </span>
                                                </button>
                                                <span
                                                    className={`rounded-full px-2 py-0.5 text-xs ${
                                                        session.status === 'active'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-neutral-200 text-neutral-700'
                                                    }`}
                                                >
                                                    {session.status === 'active'
                                                        ? t('sessions_index.status.active')
                                                        : t('sessions_index.status.closed')}
                                                </span>
                                            </div>
                                            <div className="text-sm text-muted-foreground">
                                                {t('sessions_index.poll_label')}: {session.poll_title || '-'} • {t('session.code')}: {session.code}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                Start: {session.started_at || session.created_at || '-'} •
                                                Slut: {session.ended_at || '-'} •
                                                Svar: {session.responses_count}
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap gap-2">
                                            <a
                                                className="rounded-md border px-3 py-2 text-sm"
                                                href={`${basePath}/sessions/${session.id}`}
                                            >
                                                {t('sessions_index.open')}
                                            </a>
                                            <a
                                                className="rounded-md border px-3 py-2 text-sm"
                                                href={`${basePath}/api/sessions/${session.id}/export`}
                                            >
                                                {t('sessions_index.export_csv')}
                                            </a>
                                            <button
                                                type="button"
                                                className="rounded-md border px-3 py-2 text-sm"
                                                onClick={() => openPreview(session.id)}
                                            >
                                                {t('sessions_index.quick_view')}
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                                onClick={() => closeSession(session.id)}
                                                disabled={session.status !== 'active'}
                                            >
                                                {t('sessions_index.close')}
                                            </button>
                                            <button
                                                type="button"
                                                className="rounded-md border border-red-200 px-3 py-2 text-sm text-red-700 disabled:opacity-50"
                                                onClick={() => deleteSession(session.id)}
                                                disabled={session.status === 'active'}
                                            >
                                                {t('sessions_index.delete')}
                                            </button>
                                        </div>
                                    </div>
                                    {expandedId === session.id ? (
                                        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 dark:border-neutral-800 dark:bg-neutral-900">
                                            {expandedLoadingId === session.id ? (
                                                <p className="text-sm text-muted-foreground">{t('sessions_index.loading_results')}</p>
                                            ) : (
                                                (() => {
                                                    const details = expandedDetails[session.id];
                                                    if (!details || !details.results) {
                                                        return (
                                                            <p className="text-sm text-muted-foreground">
                                                                {t('sessions_index.no_results')}
                                                            </p>
                                                        );
                                                    }
                                                    return (
                                                        <div className="space-y-4">
                                                            {details.poll.questions.map((question) => {
                                                                const results = details.results?.[question.id] || [];
                                                                return (
                                                                    <div key={question.id} className="space-y-2">
                                                                        <div className="text-sm font-semibold">
                                                                            {question.question_text}
                                                                        </div>
                                                                        {results.length === 0 ? (
                                                                            <p className="text-xs text-muted-foreground">
                                                                                {t('sessions_index.no_votes')}
                                                                            </p>
                                                                        ) : (
                                                                            <div className="space-y-2">
                                                                                {results.map((result) => (
                                                                                    <div key={result.option_id}>
                                                                                        <div className="flex justify-between text-xs text-neutral-700">
                                                                                            <span>{result.option_text}</span>
                                                                                            <span>{result.count}</span>
                                                                                        </div>
                                                                                        <div className="mt-1 h-2 rounded-full bg-neutral-200">
                                                                                            <div
                                                                                                className="h-2 rounded-full bg-black"
                                                                                                style={{
                                                                                                    width: `${result.percent}%`,
                                                                                                }}
                                                                                            />
                                                                                        </div>
                                                                                    </div>
                                                                                ))}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    );
                                                })()
                                            )}
                                        </div>
                                    ) : null}
                                </div>
                            ))}
                        </div>
                    )}
                </section>
            </div>
            <Dialog open={previewSessionId !== null} onOpenChange={() => setPreviewSessionId(null)}>
                <DialogContent className="max-w-4xl bg-white dark:bg-neutral-950">
                    <DialogHeader>
                        <DialogTitle>Resultat</DialogTitle>
                    </DialogHeader>
                    {previewSessionId && expandedLoadingId === previewSessionId ? (
                        <p className="text-sm text-muted-foreground">Laddar...</p>
                    ) : previewDetails ? (
                        <div className="space-y-6">
                            <div className="flex flex-wrap items-center justify-between gap-4">
                                <div>
                                    <div className="text-lg font-semibold">
                                        {previewDetails.poll.questions.length > 0
                                            ? 'Aktuell fråga'
                                            : 'Inga frågor'}
                                    </div>
                                    <div className="text-sm text-muted-foreground">
                                        {previewDetails.poll.questions.find((q) => q.id === previewQuestionId)
                                            ?.question_text || '—'}
                                    </div>
                                </div>
                                {previewQuestions.length > 1 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {previewQuestions.map((question, index) => (
                                            <button
                                                key={question.id}
                                                type="button"
                                                className={`rounded-full border px-3 py-1 text-xs ${
                                                    previewQuestionId === question.id
                                                        ? 'bg-black text-white'
                                                        : 'text-muted-foreground'
                                                }`}
                                                onClick={() => setPreviewQuestionId(question.id)}
                                            >
                                                Fråga {index + 1}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>

                            {previewResults.length === 0 ? (
                                <p className="text-sm text-muted-foreground">Inga röster.</p>
                            ) : (
                                <div className="flex items-end justify-center gap-6" style={{ height: '280px' }}>
                                    {previewResults.map((result, index) => {
                                        const color = OPTION_COLORS[index % OPTION_COLORS.length];
                                        const heightPercent =
                                            previewMaxPercent > 0
                                                ? (result.percent / previewMaxPercent) * 100
                                                : 0;
                                        return (
                                            <div
                                                key={result.option_id}
                                                className="flex h-full flex-1 flex-col items-center justify-end"
                                                style={{ maxWidth: '160px' }}
                                            >
                                                <div className="mb-2 text-2xl font-bold" style={{ color }}>
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
                                                <div
                                                    className="mt-2 w-full rounded-lg border px-2 py-1 text-center text-xs font-semibold"
                                                    style={{
                                                        borderColor: color,
                                                        backgroundColor: `${color}15`,
                                                    }}
                                                >
                                                    {result.option_text}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-muted-foreground">Inga resultat att visa.</p>
                    )}
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
