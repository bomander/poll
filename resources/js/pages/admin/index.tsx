import { Head, usePage } from '@inertiajs/react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import AppLayout from '@/layouts/app-layout';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { type BreadcrumbItem } from '@/types';

type SessionDetails = {
    session_id: number;
    poll_type: 'multiple_choice' | 'word_cloud';
    questions: {
        id: number;
        question_text: string;
        total_responses: number;
        options?: { id: number; option_text: string; count: number }[];
        answers?: { answer_text: string; count: number }[];
    }[];
};

type TFunction = (key: string, replacements?: Record<string, string | number>) => string;

function SessionRow({ session, basePath, t }: { session: Session; basePath: string; t: TFunction }) {
    const [expanded, setExpanded] = useState(false);
    const [details, setDetails] = useState<SessionDetails | null>(null);
    const [loading, setLoading] = useState(false);

    const toggleExpand = async () => {
        if (expanded) {
            setExpanded(false);
            return;
        }
        if (!details) {
            setLoading(true);
            try {
                const res = await apiFetch(`${basePath}/api/admin/sessions/${session.id}`);
                if (res.ok) {
                    setDetails(await res.json());
                }
            } finally {
                setLoading(false);
            }
        }
        setExpanded(true);
    };

    return (
        <>
            <tr className="border-b">
                <td className="py-2">
                    <button
                        type="button"
                        onClick={toggleExpand}
                        className="flex h-6 w-6 items-center justify-center rounded hover:bg-neutral-100 dark:hover:bg-neutral-800"
                    >
                        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                </td>
                <td className="py-2 font-mono">{session.code}</td>
                <td className="py-2">{session.poll_title}</td>
                <td className="py-2 text-muted-foreground">{session.user_name}</td>
                <td className="py-2 text-right">{session.responses_count}</td>
                <td className="py-2">
                    <span
                        className={`rounded px-1.5 py-0.5 text-xs ${
                            session.status === 'active'
                                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                                : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400'
                        }`}
                    >
                        {session.status === 'active' ? t('admin.status.active') : t('admin.status.closed')}
                    </span>
                </td>
                <td className="py-2 text-muted-foreground">{session.created_at}</td>
            </tr>
            {expanded && (
                <tr>
                    <td colSpan={7} className="bg-neutral-50 p-4 dark:bg-neutral-900">
                        {loading ? (
                            <p className="text-sm text-muted-foreground">{t('admin.loading')}</p>
                        ) : details ? (
                            <div className="space-y-4">
                                {details.questions.map((q) => (
                                    <div key={q.id} className="rounded border p-3">
                                        <p className="font-medium">{q.question_text}</p>
                                        <p className="mb-2 text-xs text-muted-foreground">
                                            {t('admin.responses', { count: q.total_responses })}
                                        </p>
                                        <div className="space-y-1">
                                            {details.poll_type === 'word_cloud'
                                                ? (q.answers || []).map((answer, index) => {
                                                      const percent =
                                                          q.total_responses > 0
                                                              ? Math.round((answer.count / q.total_responses) * 100)
                                                              : 0;
                                                      return (
                                                          <div key={`${answer.answer_text}-${index}`} className="flex items-center gap-2 text-sm">
                                                              <div className="w-32 truncate">{answer.answer_text}</div>
                                                              <div className="flex-1">
                                                                  <div className="h-4 rounded bg-neutral-200 dark:bg-neutral-700">
                                                                      <div
                                                                          className="h-4 rounded bg-blue-500"
                                                                          style={{ width: `${percent}%` }}
                                                                      />
                                                                  </div>
                                                              </div>
                                                              <div className="w-16 text-right text-muted-foreground">
                                                                  {answer.count} ({percent}%)
                                                              </div>
                                                          </div>
                                                      );
                                                  })
                                                : (q.options || []).map((opt) => {
                                                      const percent =
                                                          q.total_responses > 0
                                                              ? Math.round((opt.count / q.total_responses) * 100)
                                                              : 0;
                                                      return (
                                                          <div key={opt.id} className="flex items-center gap-2 text-sm">
                                                              <div className="w-32 truncate">{opt.option_text}</div>
                                                              <div className="flex-1">
                                                                  <div className="h-4 rounded bg-neutral-200 dark:bg-neutral-700">
                                                                      <div
                                                                          className="h-4 rounded bg-blue-500"
                                                                          style={{ width: `${percent}%` }}
                                                                      />
                                                                  </div>
                                                              </div>
                                                              <div className="w-16 text-right text-muted-foreground">
                                                                  {opt.count} ({percent}%)
                                                              </div>
                                                          </div>
                                                      );
                                                  })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">{t('admin.details_load_failed')}</p>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}

type User = {
    id: number;
    name: string;
    email: string;
    is_admin: boolean;
    is_banned: boolean;
    ban_reason: string | null;
    polls_count: number;
    sessions_count: number;
    responses_count: number;
    created_at: string;
    last_login: string;
};

type Session = {
    id: number;
    code: string;
    status: string;
    poll_title: string;
    user_name: string;
    user_email: string;
    responses_count: number;
    created_at: string;
};

type Stats = {
    total_users: number;
    total_polls: number;
    total_sessions: number;
    total_responses: number;
    active_sessions: number;
};

type Props = {
    stats: Stats;
    users: User[];
    recentSessions: Session[];
    activityByDay: Record<string, number>;
};

type PageProps = Props & { basePath: string };

export default function AdminIndex({ stats, users: initialUsers, recentSessions, activityByDay }: Props) {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const breadcrumbs: BreadcrumbItem[] = [
        { title: t('nav.dashboard'), href: '/dashboard' },
        { title: t('nav.admin'), href: '/admin' },
    ];
    const [users, setUsers] = useState(initialUsers);
    const [banReason, setBanReason] = useState('');
    const [banningUserId, setBanningUserId] = useState<number | null>(null);
    const [loading, setLoading] = useState(false);

    const banUser = async (userId: number) => {
        setLoading(true);
        try {
            const res = await apiFetch(`${basePath}/api/admin/users/${userId}/ban`, {
                method: 'POST',
                body: JSON.stringify({ reason: banReason }),
            });
            if (res.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, is_banned: true, ban_reason: banReason } : u));
                setBanningUserId(null);
                setBanReason('');
            }
        } finally {
            setLoading(false);
        }
    };

    const unbanUser = async (userId: number) => {
        setLoading(true);
        try {
            const res = await apiFetch(`${basePath}/api/admin/users/${userId}/unban`, {
                method: 'POST',
            });
            if (res.ok) {
                setUsers(users.map(u => u.id === userId ? { ...u, is_banned: false, ban_reason: null } : u));
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('admin.title')} />
            <div className="flex flex-col gap-6 p-6">
                <h1 className="text-2xl font-bold">{t('admin.panel_title')}</h1>

                {/* Stats */}
                <div className="grid gap-4 md:grid-cols-5">
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>{t('admin.stats.users')}</CardDescription>
                            <CardTitle className="text-3xl">{stats.total_users}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>{t('admin.stats.polls')}</CardDescription>
                            <CardTitle className="text-3xl">{stats.total_polls}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>{t('admin.stats.sessions')}</CardDescription>
                            <CardTitle className="text-3xl">{stats.total_sessions}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>{t('admin.stats.responses')}</CardDescription>
                            <CardTitle className="text-3xl">{stats.total_responses}</CardTitle>
                        </CardHeader>
                    </Card>
                    <Card>
                        <CardHeader className="pb-2">
                            <CardDescription>{t('admin.stats.active_now')}</CardDescription>
                            <CardTitle className="text-3xl text-green-600">{stats.active_sessions}</CardTitle>
                        </CardHeader>
                    </Card>
                </div>

                {/* Activity chart */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('admin.activity.title')}</CardTitle>
                        <CardDescription>{t('admin.activity.description')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="flex h-32 items-end gap-1">
                            {Object.entries(activityByDay).map(([date, count]) => {
                                const maxCount = Math.max(...Object.values(activityByDay), 1);
                                const height = (count / maxCount) * 100;
                                return (
                                    <div
                                        key={date}
                                        className="flex-1 rounded-t bg-blue-500 transition-all"
                                        style={{ height: `${Math.max(height, 2)}%` }}
                                        title={t('admin.activity.bar_title', { date, count })}
                                    />
                                );
                            })}
                        </div>
                        {Object.keys(activityByDay).length === 0 && (
                            <p className="text-sm text-muted-foreground">{t('admin.activity.empty')}</p>
                        )}
                    </CardContent>
                </Card>

                {/* Users */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('admin.users.title')}</CardTitle>
                        <CardDescription>{t('admin.users.description')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="pb-2 font-medium">{t('admin.users.columns.name')}</th>
                                        <th className="pb-2 font-medium">{t('admin.users.columns.email')}</th>
                                        <th className="pb-2 font-medium text-right">{t('admin.users.columns.polls')}</th>
                                        <th className="pb-2 font-medium text-right">{t('admin.users.columns.sessions')}</th>
                                        <th className="pb-2 font-medium text-right">{t('admin.users.columns.responses')}</th>
                                        <th className="pb-2 font-medium">{t('admin.users.columns.status')}</th>
                                        <th className="pb-2 font-medium">{t('admin.users.columns.action')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((user) => (
                                        <tr key={user.id} className={`border-b ${user.is_banned ? 'bg-red-50 dark:bg-red-950' : ''}`}>
                                            <td className="py-2">
                                                {user.name}
                                                {user.is_admin && (
                                                    <span className="ml-2 rounded bg-blue-100 px-1.5 py-0.5 text-xs text-blue-700 dark:bg-blue-900 dark:text-blue-300">
                                                        Admin
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2 text-muted-foreground">{user.email}</td>
                                            <td className="py-2 text-right">{user.polls_count}</td>
                                            <td className="py-2 text-right">{user.sessions_count}</td>
                                            <td className="py-2 text-right">{user.responses_count}</td>
                                            <td className="py-2">
                                                {user.is_banned ? (
                                                    <span className="rounded bg-red-100 px-1.5 py-0.5 text-xs text-red-700 dark:bg-red-900 dark:text-red-300" title={user.ban_reason || ''}>
                                                        Avstängd
                                                    </span>
                                                ) : (
                                                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-xs text-green-700 dark:bg-green-900 dark:text-green-300">
                                                        Aktiv
                                                    </span>
                                                )}
                                            </td>
                                            <td className="py-2">
                                                {!user.is_admin && (
                                                    <>
                                                        {user.is_banned ? (
                                                                <Button
                                                                    variant="outline"
                                                                    size="sm"
                                                                    onClick={() => unbanUser(user.id)}
                                                                    disabled={loading}
                                                                >
                                                                Återaktivera
                                                                </Button>
                                                        ) : banningUserId === user.id ? (
                                                            <div className="flex items-center gap-2">
                                                                <input
                                                                    type="text"
                                                                    placeholder={t('admin.users.ban_reason_placeholder')}
                                                                    value={banReason}
                                                                    onChange={(e) => setBanReason(e.target.value)}
                                                                    className="h-8 w-32 rounded border px-2 text-xs"
                                                                />
                                                                <Button
                                                                    variant="destructive"
                                                                    size="sm"
                                                                    onClick={() => banUser(user.id)}
                                                                    disabled={loading}
                                                                >
                                                                    {t('admin.users.confirm')}
                                                                </Button>
                                                                <Button
                                                                    variant="ghost"
                                                                    size="sm"
                                                                    onClick={() => { setBanningUserId(null); setBanReason(''); }}
                                                                >
                                                                    {t('admin.users.cancel')}
                                                                </Button>
                                                            </div>
                                                        ) : (
                                                            <Button
                                                                variant="outline"
                                                                size="sm"
                                                                onClick={() => setBanningUserId(user.id)}
                                                            >
                                                                {t('admin.users.disable')}
                                                            </Button>
                                                        )}
                                                    </>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>

                {/* Recent sessions */}
                <Card>
                    <CardHeader>
                        <CardTitle>{t('admin.recent_sessions.title')}</CardTitle>
                        <CardDescription>{t('admin.recent_sessions.description')}</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b text-left">
                                        <th className="w-8 pb-2"></th>
                                        <th className="pb-2 font-medium">{t('admin.recent_sessions.columns.code')}</th>
                                        <th className="pb-2 font-medium">{t('admin.recent_sessions.columns.poll')}</th>
                                        <th className="pb-2 font-medium">{t('admin.recent_sessions.columns.creator')}</th>
                                        <th className="pb-2 font-medium text-right">{t('admin.recent_sessions.columns.responses')}</th>
                                        <th className="pb-2 font-medium">{t('admin.recent_sessions.columns.status')}</th>
                                        <th className="pb-2 font-medium">{t('admin.recent_sessions.columns.created')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentSessions.map((session) => (
                                        <SessionRow key={session.id} session={session} basePath={basePath} t={t} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </AppLayout>
    );
}
