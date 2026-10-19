import { Head, Link, usePage } from '@inertiajs/react';
import { MonitorPlay, Play, Plus } from 'lucide-react';
import { useState } from 'react';

import { StartSessionDialog } from '@/components/start-session-dialog';
import { Button } from '@/components/ui/button';
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { useT } from '@/lib/i18n';
import { type BreadcrumbItem } from '@/types';

type PageProps = {
    basePath: string;
};

type Poll = {
    id: number;
    title: string;
    description: string | null;
    sessions_count: number;
    updated_at: string;
};

type ActiveSession = {
    id: number;
    code: string;
    poll_title: string;
    poll_id: number;
    response_count: number;
    started_at: string;
};

type Stats = {
    total_polls: number;
    total_sessions: number;
    active_sessions: number;
};

type Props = {
    polls: Poll[];
    activeSessions: ActiveSession[];
    stats: Stats;
};

export default function Dashboard({ polls, activeSessions, stats }: Props) {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const url = (path: string) => `${basePath}/${path}`;
    const [startPoll, setStartPoll] = useState<Poll | null>(null);
    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('nav.dashboard'), href: url('dashboard') },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('dashboard.title')} />
            <div className="flex flex-col gap-6 p-6">
                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>
                                {t('dashboard.stats.total_polls')}
                            </CardDescription>
                            <CardTitle className="text-3xl">
                                {stats.total_polls}
                            </CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>
                                {t('dashboard.stats.completed_sessions')}
                            </CardDescription>
                            <CardTitle className="text-3xl">
                                {stats.total_sessions}
                            </CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>
                                {t('dashboard.stats.active_sessions')}
                            </CardDescription>
                            <CardTitle className="text-3xl text-green-600">
                                {stats.active_sessions}
                            </CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                {/* Active Sessions */}
                {activeSessions.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {t('dashboard.active_sessions.title')}
                            </CardTitle>
                            <CardDescription>
                                {t('dashboard.active_sessions.description')}
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="divide-y">
                                {activeSessions.map((session) => (
                                    <div
                                        key={session.id}
                                        className="flex items-center justify-between py-3"
                                    >
                                        <div>
                                            <p className="font-medium">
                                                {session.poll_title}
                                            </p>
                                            <p className="text-sm text-muted-foreground">
                                                {t(
                                                    'dashboard.active_sessions.code',
                                                )}
                                                :{' '}
                                                <span className="font-mono font-bold">
                                                    {session.code}
                                                </span>{' '}
                                                -{' '}
                                                {t(
                                                    'dashboard.active_sessions.responses',
                                                    {
                                                        count: session.response_count,
                                                    },
                                                )}{' '}
                                                -{' '}
                                                {t(
                                                    'dashboard.active_sessions.started',
                                                    {
                                                        when: session.started_at,
                                                    },
                                                )}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                            >
                                                <Link
                                                    href={url(
                                                        `sessions/${session.id}`,
                                                    )}
                                                >
                                                    {t(
                                                        'dashboard.active_sessions.manage',
                                                    )}
                                                </Link>
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                asChild
                                            >
                                                <a
                                                    href={url(
                                                        `projector/${session.code}`,
                                                    )}
                                                    target="_blank"
                                                    rel="noreferrer"
                                                >
                                                    <MonitorPlay />
                                                    {t(
                                                        'dashboard.active_sessions.projector',
                                                    )}
                                                </a>
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Recent Polls */}
                <Card>
                    <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                        <div>
                            <CardTitle>
                                {t('dashboard.recent_polls.title')}
                            </CardTitle>
                            <CardDescription>
                                {t('dashboard.recent_polls.description')}
                            </CardDescription>
                        </div>
                        <div className="flex gap-2">
                            <Button variant="outline" asChild>
                                <Link href={url('polls')}>
                                    {t('dashboard.recent_polls.cta')}
                                </Link>
                            </Button>
                            <Button asChild>
                                <a href={url('polls?new=1')}>
                                    <Plus />
                                    {t('dashboard.recent_polls.new')}
                                </a>
                            </Button>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {polls.length === 0 ? (
                            <p className="py-8 text-center text-muted-foreground">
                                {t('dashboard.recent_polls.empty')}{' '}
                                <a
                                    href={url('polls?new=1')}
                                    className="text-primary underline"
                                >
                                    {t('dashboard.recent_polls.empty_link')}
                                </a>
                            </p>
                        ) : (
                            <div className="divide-y">
                                {polls.map((poll) => {
                                    const active = activeSessions.find(
                                        (session) =>
                                            session.poll_id === poll.id,
                                    );
                                    return (
                                        <div
                                            key={poll.id}
                                            className="flex flex-wrap items-center justify-between gap-3 py-3"
                                        >
                                            <div>
                                                <p className="font-medium">
                                                    {poll.title}
                                                </p>
                                                <p className="text-sm text-muted-foreground">
                                                    {poll.sessions_count === 1
                                                        ? t(
                                                              'dashboard.recent_polls.questions_sessions_one',
                                                          )
                                                        : t(
                                                              'dashboard.recent_polls.questions_sessions',
                                                              {
                                                                  sessions:
                                                                      poll.sessions_count,
                                                              },
                                                          )}
                                                </p>
                                            </div>
                                            {active ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    asChild
                                                >
                                                    <a
                                                        href={url(
                                                            `sessions/${active.id}`,
                                                        )}
                                                    >
                                                        {t(
                                                            'polls.actions.open_active',
                                                        )}
                                                    </a>
                                                </Button>
                                            ) : (
                                                <Button
                                                    size="sm"
                                                    onClick={() =>
                                                        setStartPoll(poll)
                                                    }
                                                >
                                                    <Play />
                                                    {t(
                                                        'polls.actions.start_session',
                                                    )}
                                                </Button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Start Guide */}
                {stats.total_polls === 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>
                                {t('dashboard.quick_start.title')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    1
                                </div>
                                <div>
                                    <p className="font-medium">
                                        {t(
                                            'dashboard.quick_start.step_1_title',
                                        )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {t('dashboard.quick_start.step_1_desc')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    2
                                </div>
                                <div>
                                    <p className="font-medium">
                                        {t(
                                            'dashboard.quick_start.step_2_title',
                                        )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {t('dashboard.quick_start.step_2_desc')}
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    3
                                </div>
                                <div>
                                    <p className="font-medium">
                                        {t(
                                            'dashboard.quick_start.step_3_title',
                                        )}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {t('dashboard.quick_start.step_3_desc')}
                                    </p>
                                </div>
                            </div>
                            <Button className="mt-4" asChild>
                                <a href={url('polls?new=1')}>
                                    {t('dashboard.quick_start.cta')}
                                </a>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
            <StartSessionDialog
                poll={startPoll}
                onOpenChange={(open) => !open && setStartPoll(null)}
            />
        </AppLayout>
    );
}
