import { Head, Link, usePage } from '@inertiajs/react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { apiFetch } from '@/lib/api';
import { type BreadcrumbItem } from '@/types';

type PageProps = {
    basePath: string;
};

type Poll = {
    id: number;
    title: string;
    description: string | null;
    questions_count: number;
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

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Dashboard',
        href: '/dashboard',
    },
];

export default function Dashboard({ polls, activeSessions, stats }: Props) {
    const { basePath } = usePage<PageProps>().props;
    const url = (path: string) => `${basePath}/${path}`;

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Dashboard" />
            <div className="flex flex-col gap-6 p-6">
                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-3">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Totalt antal polls</CardDescription>
                            <CardTitle className="text-3xl">{stats.total_polls}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Genomförda sessioner</CardDescription>
                            <CardTitle className="text-3xl">{stats.total_sessions}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>Aktiva sessioner</CardDescription>
                            <CardTitle className="text-3xl text-green-600">{stats.active_sessions}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                {/* Active Sessions */}
                {activeSessions.length > 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Aktiva sessioner</CardTitle>
                            <CardDescription>Pågående omröstningar</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="divide-y">
                                {activeSessions.map((session) => (
                                    <div key={session.id} className="flex items-center justify-between py-3">
                                        <div>
                                            <p className="font-medium">{session.poll_title}</p>
                                            <p className="text-sm text-muted-foreground">
                                                Kod: <span className="font-mono font-bold">{session.code}</span>
                                                {' '} - {session.response_count} svar - startad {session.started_at}
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={url(`sessions/${session.id}`)}>Hantera</Link>
                                            </Button>
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={url(`projector/${session.code}`)} target="_blank">
                                                    Projektorvy
                                                </Link>
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
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Dina polls</CardTitle>
                            <CardDescription>Senast uppdaterade</CardDescription>
                        </div>
                        <Button asChild>
                            <Link href={url('polls')}>Visa alla / Skapa ny</Link>
                        </Button>
                    </CardHeader>
                    <CardContent>
                        {polls.length === 0 ? (
                            <p className="py-8 text-center text-muted-foreground">
                                Du har inga polls ännu.{' '}
                                <Link href={url('polls')} className="text-primary underline">
                                    Skapa din första poll
                                </Link>
                            </p>
                        ) : (
                            <div className="divide-y">
                                {polls.map((poll) => (
                                    <div key={poll.id} className="flex items-center justify-between py-3">
                                        <div>
                                            <p className="font-medium">{poll.title}</p>
                                            <p className="text-sm text-muted-foreground">
                                                {poll.questions_count} frågor - {poll.sessions_count} sessioner
                                            </p>
                                        </div>
                                        <div className="flex gap-2">
                                            <Button variant="outline" size="sm" asChild>
                                                <Link href={url(`polls/${poll.id}/edit`)}>Redigera</Link>
                                            </Button>
                                            <Button size="sm" onClick={() => startSession(poll.id, basePath)}>
                                                Starta session
                                            </Button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Quick Start Guide */}
                {stats.total_polls === 0 && (
                    <Card>
                        <CardHeader>
                            <CardTitle>Kom igång</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-start gap-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    1
                                </div>
                                <div>
                                    <p className="font-medium">Skapa en poll</p>
                                    <p className="text-sm text-muted-foreground">
                                        Lägg till frågor med svarsalternativ. Du kan ha flera frågor i samma poll.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    2
                                </div>
                                <div>
                                    <p className="font-medium">Starta en session</p>
                                    <p className="text-sm text-muted-foreground">
                                        När du startar en session får du en kod som deltagarna använder för att gå med.
                                    </p>
                                </div>
                            </div>
                            <div className="flex items-start gap-4">
                                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                                    3
                                </div>
                                <div>
                                    <p className="font-medium">Visa resultat live</p>
                                    <p className="text-sm text-muted-foreground">
                                        Använd projektorvyn för att visa resultat i realtid på en storskärm.
                                    </p>
                                </div>
                            </div>
                            <Button className="mt-4" asChild>
                                <Link href={url('polls')}>Skapa din första poll</Link>
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>
        </AppLayout>
    );
}

async function startSession(pollId: number, basePath: string) {
    const nameInput = window.prompt('Ange ett namn for sessionen (valfritt)');
    const name = nameInput?.trim() || null;
    const res = await apiFetch(`${basePath}/api/polls/${pollId}/sessions`, {
        method: 'POST',
        body: JSON.stringify({ name }),
    });
    if (res.ok) {
        const session = await res.json();
        window.location.href = `${basePath}/sessions/${session.id}`;
    }
}
