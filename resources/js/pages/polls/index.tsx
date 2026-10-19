import { Head, usePage } from '@inertiajs/react';
import {
    BarChart3,
    Cloud,
    Copy,
    ListChecks,
    Palette,
    Pencil,
    Play,
    Plus,
    Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';

import { PollForm, type PollPayload } from '@/components/poll-form';
import { StartSessionDialog } from '@/components/start-session-dialog';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { formatSince, type Poll } from '@/lib/poll';

type PageProps = { basePath: string };
type ListedPoll = Poll & {
    active_session_id?: number | null;
    active_session_started_at?: string | null;
};

export default function PollIndex() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const [polls, setPolls] = useState<ListedPoll[] | null>(null);
    const [creating, setCreating] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [startPoll, setStartPoll] = useState<ListedPoll | null>(null);

    useEffect(() => {
        apiFetch(`${basePath}/api/polls`)
            .then(async (res) => {
                if (!res.ok) throw new Error();
                const data = (await res.json()) as ListedPoll[];
                setPolls(data);
                // En ny lärare, eller den som klickat "Ny enkät", möts av formuläret.
                const wantsNew = new URLSearchParams(
                    window.location.search,
                ).has('new');
                if (data.length === 0 || wantsNew) setCreating(true);
            })
            .catch(() => setError(t('polls.errors.load_polls')));
    }, [basePath, t]);

    const createPoll = async (payload: PollPayload, startNow: boolean) => {
        setError(null);
        const res = await apiFetch(`${basePath}/api/polls`, {
            method: 'POST',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            setError(t('polls.errors.create_poll'));
            return;
        }
        const poll = (await res.json()) as ListedPoll;
        setPolls((current) => [poll, ...(current ?? [])]);
        setCreating(false);
        if (startNow) setStartPoll(poll);
    };

    const clonePoll = async (poll: ListedPoll) => {
        setError(null);
        const res = await apiFetch(`${basePath}/api/polls/${poll.id}/clone`, {
            method: 'POST',
        });
        if (!res.ok) {
            setError(t('polls.errors.clone_poll'));
            return;
        }
        // En kopia görs för att ändras, så den öppnas direkt.
        const cloned = (await res.json()) as ListedPoll;
        window.location.assign(`${basePath}/polls/${cloned.id}/edit`);
    };

    const deletePoll = async (poll: ListedPoll) => {
        if (!window.confirm(t('polls.confirm_delete', { title: poll.title }))) {
            return;
        }
        setError(null);
        const res = await apiFetch(`${basePath}/api/polls/${poll.id}`, {
            method: 'DELETE',
        });
        if (!res.ok) {
            setError(t('polls.errors.delete_poll'));
            return;
        }
        setPolls((current) =>
            (current ?? []).filter((item) => item.id !== poll.id),
        );
    };

    return (
        <AppLayout>
            <Head title={t('polls.title')} />
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold">
                            {t('polls.title')}
                        </h1>
                        <p className="text-sm text-muted-foreground">
                            {t('polls.subtitle')}
                        </p>
                    </div>
                    {!creating ? (
                        <Button onClick={() => setCreating(true)}>
                            <Plus />
                            {t('polls.new')}
                        </Button>
                    ) : null}
                </div>

                {error ? (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                ) : null}

                {creating ? (
                    <section className="rounded-xl border p-6">
                        <h2 className="mb-4 text-lg font-semibold">
                            {t('polls.create_title')}
                        </h2>
                        <PollForm
                            submitLabel={t('polls.create')}
                            submittingLabel={t('polls.creating')}
                            secondaryLabel={t('polls.create_and_start')}
                            onSubmit={createPoll}
                            onCancel={
                                polls?.length
                                    ? () => setCreating(false)
                                    : undefined
                            }
                        />
                    </section>
                ) : null}

                {polls === null ? (
                    <p className="text-sm text-muted-foreground">
                        {t('session.loading')}
                    </p>
                ) : polls.length === 0 ? (
                    creating ? null : (
                        <p className="text-sm text-muted-foreground">
                            {t('polls.no_polls_yet')}
                        </p>
                    )
                ) : (
                    <section className="grid gap-3">
                        {polls.map((poll) => (
                            <PollCard
                                key={poll.id}
                                poll={poll}
                                onStart={() => setStartPoll(poll)}
                                onOpenActive={() =>
                                    window.location.assign(
                                        `${basePath}/sessions/${poll.active_session_id}`,
                                    )
                                }
                                onEdit={() =>
                                    window.location.assign(
                                        `${basePath}/polls/${poll.id}/edit`,
                                    )
                                }
                                onResults={() =>
                                    window.location.assign(
                                        `${basePath}/sessions?poll=${poll.id}`,
                                    )
                                }
                                onClone={() => void clonePoll(poll)}
                                onDelete={() => void deletePoll(poll)}
                            />
                        ))}
                    </section>
                )}
            </div>
            <StartSessionDialog
                poll={startPoll}
                onOpenChange={(open) => !open && setStartPoll(null)}
            />
        </AppLayout>
    );
}

function PollCard({
    poll,
    onStart,
    onOpenActive,
    onEdit,
    onResults,
    onClone,
    onDelete,
}: {
    poll: ListedPoll;
    onStart: () => void;
    onOpenActive: () => void;
    onEdit: () => void;
    onResults: () => void;
    onClone: () => void;
    onDelete: () => void;
}) {
    const t = useT();
    const type = poll.type ?? 'multiple_choice';
    const question = poll.questions[0];
    const TypeIcon = type === 'word_cloud' ? Cloud : BarChart3;
    const locked = poll.sessions_count > 0;

    return (
        <article className="rounded-xl border p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-semibold">{poll.title}</h2>
                        {poll.active_session_id ? (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                                {poll.active_session_started_at
                                    ? t('polls.active_since', {
                                          when: formatSince(
                                              poll.active_session_started_at,
                                          ),
                                      })
                                    : t('polls.active_badge')}
                            </span>
                        ) : null}
                    </div>
                    {question ? (
                        <p className="mt-1 text-sm">{question.question_text}</p>
                    ) : null}
                    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                            <TypeIcon className="size-3.5" />
                            {t(`polls.type_badge.${type}`)}
                            {poll.questions.length > 1
                                ? ` · ${t('polls.questions_count', { count: poll.questions.length })}`
                                : type === 'multiple_choice' && question
                                  ? ` · ${t('polls.options_count', { count: question.options.length })}`
                                  : ''}
                        </span>
                        <span>
                            {poll.sessions_count === 0
                                ? t('polls.no_sessions')
                                : poll.sessions_count === 1
                                  ? t('polls.sessions_count_one')
                                  : t('polls.sessions_count', {
                                        count: poll.sessions_count,
                                    })}
                        </span>
                    </p>
                    {poll.description ? (
                        <p className="mt-2 text-xs text-muted-foreground italic">
                            {poll.description}
                        </p>
                    ) : null}
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    {poll.active_session_id ? (
                        <Button onClick={onOpenActive}>
                            <Play />
                            {t('polls.actions.open_active')}
                        </Button>
                    ) : (
                        <Button onClick={onStart}>
                            <Play />
                            {t('polls.actions.start_session')}
                        </Button>
                    )}
                </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2 border-t pt-3">
                {locked ? (
                    <>
                        <Button variant="outline" size="sm" onClick={onResults}>
                            <ListChecks />
                            {t('polls.actions.results')}
                        </Button>
                        {/* Frågorna är låsta efter en omgång, men temat går att byta. */}
                        <Button variant="outline" size="sm" onClick={onEdit}>
                            <Palette />
                            {t('polls.actions.theme')}
                        </Button>
                    </>
                ) : (
                    <Button variant="outline" size="sm" onClick={onEdit}>
                        <Pencil />
                        {t('polls.actions.edit')}
                    </Button>
                )}
                <Button variant="outline" size="sm" onClick={onClone}>
                    <Copy />
                    {t('polls.actions.clone')}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="ml-auto text-red-700 hover:text-red-800"
                    onClick={onDelete}
                    disabled={!!poll.active_session_id}
                >
                    <Trash2 />
                    {t('polls.actions.delete')}
                </Button>
            </div>
        </article>
    );
}
