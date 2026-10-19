import { Head, usePage } from '@inertiajs/react';
import { BarChart3, Cloud, Download, Square, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatCode, type PollType } from '@/lib/poll';

type PageProps = { basePath: string };
type Session = {
    id: number;
    name?: string | null;
    code: string;
    status: 'active' | 'closed';
    poll_id: number;
    poll_title?: string | null;
    poll_type: PollType;
    responses_count: number;
    created_at?: string | null;
    started_at?: string | null;
    ended_at?: string | null;
};
type Filter = 'all' | 'active' | 'closed';

export default function SessionsIndex() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const [sessions, setSessions] = useState<Session[] | null>(null);
    const [statusFilter, setStatusFilter] = useState<Filter>('all');
    // Från enkätens knapp Resultat visas bara den enkätens omgångar.
    const [pollFilter, setPollFilter] = useState<number | null>(() => {
        const value = Number(
            new URLSearchParams(window.location.search).get('poll'),
        );
        return Number.isInteger(value) && value > 0 ? value : null;
    });
    const [error, setError] = useState<string | null>(null);

    const filteredSessions = useMemo(
        () =>
            (sessions ?? []).filter(
                (session) =>
                    (statusFilter === 'all' ||
                        session.status === statusFilter) &&
                    (pollFilter === null || session.poll_id === pollFilter),
            ),
        [sessions, statusFilter, pollFilter],
    );

    useEffect(() => {
        apiFetch(`${basePath}/api/sessions`)
            .then(async (res) => {
                if (!res.ok) throw new Error();
                setSessions((await res.json()) as Session[]);
            })
            .catch(() => setError(t('sessions_index.errors.load_sessions')));
    }, [basePath, t]);

    const deleteSession = async (sessionId: number) => {
        if (!window.confirm(t('sessions_index.confirm_delete'))) return;
        setError(null);
        const res = await apiFetch(`${basePath}/api/sessions/${sessionId}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            setError(t('sessions_index.errors.delete_session'));
            return;
        }
        setSessions((prev) =>
            (prev ?? []).filter((session) => session.id !== sessionId),
        );
    };

    const closeSession = async (sessionId: number) => {
        if (!window.confirm(t('sessions_index.confirm_close'))) return;
        setError(null);
        const res = await apiFetch(
            `${basePath}/api/sessions/${sessionId}/close`,
            { method: 'POST' },
        );
        if (!res.ok) {
            setError(t('sessions_index.errors.close_session'));
            return;
        }
        const updated = (await res.json()) as Pick<
            Session,
            'status' | 'ended_at'
        >;
        setSessions((prev) =>
            (prev ?? []).map((session) =>
                session.id === sessionId
                    ? {
                          ...session,
                          status: updated.status,
                          ended_at: updated.ended_at ?? session.ended_at,
                      }
                    : session,
            ),
        );
    };

    return (
        <AppLayout>
            <Head title={t('sessions_index.title')} />
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
                <div className="flex flex-wrap items-end justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            {t('sessions_index.title')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('sessions_index.subtitle')}
                        </p>
                        {pollFilter !== null ? (
                            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                                <span>
                                    {t('sessions_index.filtered', {
                                        title:
                                            sessions?.find(
                                                (session) =>
                                                    session.poll_id ===
                                                    pollFilter,
                                            )?.poll_title ?? '',
                                    })}
                                </span>
                                <button
                                    type="button"
                                    className="font-medium underline underline-offset-4"
                                    onClick={() => {
                                        setPollFilter(null);
                                        window.history.replaceState(
                                            null,
                                            '',
                                            `${basePath}/sessions`,
                                        );
                                    }}
                                >
                                    {t('sessions_index.show_all')}
                                </button>
                            </p>
                        ) : null}
                    </div>
                    <div
                        className="flex gap-1 rounded-md border p-1 text-sm"
                        role="group"
                    >
                        {(['all', 'active', 'closed'] as const).map((value) => (
                            <button
                                key={value}
                                type="button"
                                aria-pressed={statusFilter === value}
                                className={`rounded px-3 py-1 ${
                                    statusFilter === value
                                        ? 'bg-foreground text-background'
                                        : 'text-muted-foreground'
                                }`}
                                onClick={() => setStatusFilter(value)}
                            >
                                {t(`sessions_index.filter.${value}`)}
                            </button>
                        ))}
                    </div>
                </div>

                {error ? (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                ) : null}

                {sessions === null ? (
                    error ? null : (
                        <p className="text-sm text-muted-foreground">
                            {t('sessions_index.loading')}
                        </p>
                    )
                ) : filteredSessions.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        {t('sessions_index.empty')}
                    </p>
                ) : (
                    <section className="grid gap-3">
                        {filteredSessions.map((session) => {
                            const TypeIcon =
                                session.poll_type === 'word_cloud'
                                    ? Cloud
                                    : BarChart3;
                            const active = session.status === 'active';
                            return (
                                <article
                                    key={session.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
                                >
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <a
                                                href={`${basePath}/sessions/${session.id}`}
                                                className="text-lg font-semibold hover:underline"
                                            >
                                                {session.poll_title || '–'}
                                            </a>
                                            <span
                                                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                                    active
                                                        ? 'bg-emerald-100 text-emerald-800'
                                                        : 'bg-neutral-200 text-neutral-700'
                                                }`}
                                            >
                                                {t(
                                                    `sessions_index.status.${session.status}`,
                                                )}
                                            </span>
                                        </div>
                                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                                            <TypeIcon className="size-3.5" />
                                            {session.name ? (
                                                <span className="font-medium text-foreground">
                                                    {session.name}
                                                </span>
                                            ) : null}
                                            <span>
                                                {t('sessions_index.started', {
                                                    when:
                                                        session.started_at ||
                                                        session.created_at ||
                                                        '–',
                                                })}
                                                {session.ended_at
                                                    ? `, ${t('sessions_index.ended', { when: session.ended_at })}`
                                                    : ''}
                                            </span>
                                            <span>
                                                {t('sessions_index.responses', {
                                                    count: session.responses_count,
                                                })}
                                            </span>
                                            {active ? (
                                                <span className="font-mono">
                                                    {formatCode(session.code)}
                                                </span>
                                            ) : null}
                                        </p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="sm" asChild>
                                            <a
                                                href={`${basePath}/sessions/${session.id}`}
                                            >
                                                {t('sessions_index.open')}
                                            </a>
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            asChild
                                        >
                                            <a
                                                href={`${basePath}/api/sessions/${session.id}/export`}
                                            >
                                                <Download />
                                                CSV
                                            </a>
                                        </Button>
                                        {active ? (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={() =>
                                                    void closeSession(
                                                        session.id,
                                                    )
                                                }
                                            >
                                                <Square />
                                                {t('sessions_index.close')}
                                            </Button>
                                        ) : (
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-red-700 hover:text-red-800"
                                                onClick={() =>
                                                    void deleteSession(
                                                        session.id,
                                                    )
                                                }
                                            >
                                                <Trash2 />
                                                {t('sessions_index.delete')}
                                            </Button>
                                        )}
                                    </div>
                                </article>
                            );
                        })}
                    </section>
                )}
            </div>
        </AppLayout>
    );
}
