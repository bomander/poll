import { Head, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import AppLayout from '@/layouts/app-layout';

type PageProps = { basePath: string };
type PollOption = { id: number; option_text: string };
type PollQuestion = { id: number; question_text: string; options: PollOption[] };
type Poll = { id: number; title: string; questions: PollQuestion[] };
type Results = Record<number, { option_id: number; option_text: string; count: number; percent: number }[]>;
type Session = {
    id: number;
    code: string;
    name?: string | null;
    status: 'active' | 'closed';
    locked: boolean;
    current_question_id: number | null;
    poll: Poll;
    results?: Results;
};

declare global {
    interface Window {
        Echo?: any;
    }
}

export default function SessionShow() {
    const { basePath } = usePage<PageProps>().props;
    const sessionId = useMemo(() => {
        const match = window.location.pathname.match(/sessions\/(\d+)/);
        return match ? Number(match[1]) : null;
    }, []);

    const [session, setSession] = useState<Session | null>(null);
    const [results, setResults] = useState<Results>({});
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!sessionId) return;
        apiFetch(`${basePath}/api/sessions/${sessionId}`)
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error('Failed to load session.');
                }
                const data = await res.json();
                setSession(data);
                setResults(data.results || {});
            })
            .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load session.'));
    }, [sessionId, basePath]);

    useEffect(() => {
        if (!sessionId || !window.Echo) return;
        const channel = window.Echo.channel(`session.${sessionId}`);
        channel.listen('.results_updated', (payload: any) => {
            setResults((prev) => ({ ...prev, [payload.question_id]: payload.results }));
        });
        channel.listen('.session_updated', (payload: any) => {
            setSession((prev) =>
                prev
                    ? {
                          ...prev,
                          status: payload.status,
                          current_question_id: payload.current_question_id,
                          locked: payload.locked,
                      }
                    : prev,
            );
        });
        return () => {
            channel.stopListening('.results_updated');
            channel.stopListening('.session_updated');
        };
    }, [sessionId]);

    const currentQuestion = session?.poll.questions.find(
        (question) => question.id === session.current_question_id,
    );
    const currentResults = currentQuestion ? results[currentQuestion.id] || [] : [];

    const isClosed = session?.status === 'closed';

    const setQuestion = async (questionId: number) => {
        if (!sessionId || isClosed) return;
        const res = await apiFetch(`${basePath}/api/sessions/${sessionId}/current-question`, {
            method: 'POST',
            body: JSON.stringify({ question_id: questionId }),
        });
        if (res.ok) {
            const data = await res.json();
            setSession(data);
            setResults(data.results || {});
        } else {
            setError('Failed to update question.');
        }
    };

    const toggleLock = async () => {
        if (!sessionId || !session || isClosed) return;
        const res = await apiFetch(`${basePath}/api/sessions/${sessionId}/lock-question`, {
            method: 'POST',
            body: JSON.stringify({ locked: !session.locked }),
        });
        if (res.ok) {
            const data = await res.json();
            setSession(data);
            setResults(data.results || {});
        } else {
            setError('Failed to update lock state.');
        }
    };

    const closeSession = async () => {
        if (!sessionId || isClosed) return;
        const res = await apiFetch(`${basePath}/api/sessions/${sessionId}/close`, { method: 'POST' });
        if (res.ok) {
            const data = await res.json();
            setSession(data);
            setResults(data.results || {});
        } else {
            setError('Failed to close session.');
        }
    };

    return (
        <AppLayout>
            <Head title="Live session" />
            <div className="flex flex-col gap-6 p-6">
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {session ? (
                    <>
                        <section className="rounded-xl border border-sidebar-border/70 p-6">
                            <h1 className="text-2xl font-semibold">{session.poll.title}</h1>
                            {session.name ? (
                                <p className="mt-1 text-sm text-muted-foreground">
                                    Session: <span className="font-medium text-neutral-900">{session.name}</span>
                                </p>
                            ) : null}
                            <p className="mt-2 text-lg">
                                Code: <span className="font-mono">{session.code}</span>
                            </p>
                            <div className="mt-4 flex flex-wrap gap-3">
                                <button
                                    type="button"
                                    className="rounded-md border px-3 py-2 text-sm disabled:opacity-50"
                                    onClick={toggleLock}
                                    disabled={isClosed}
                                >
                                    {session.locked ? 'Unlock question' : 'Lock question'}
                                </button>
                                <a
                                    className="rounded-md border px-3 py-2 text-sm"
                                    href={`${basePath}/api/sessions/${session.id}/export`}
                                >
                                    Export CSV
                                </a>
                                <button
                                    type="button"
                                    className="rounded-md bg-black px-3 py-2 text-sm text-white disabled:opacity-50"
                                    onClick={closeSession}
                                    disabled={isClosed}
                                >
                                    End session
                                </button>
                                <a
                                    className="rounded-md border px-3 py-2 text-sm"
                                    href={`${basePath}/projector/${session.code}`}
                                    target="_blank"
                                    rel="noreferrer"
                                >
                                    Open projector view
                                </a>
                            </div>
                        </section>

                        <section className="grid gap-6 lg:grid-cols-[320px,1fr]">
                            <div className="rounded-xl border border-sidebar-border/70 p-6">
                                <h2 className="text-lg font-semibold">Questions</h2>
                                <div className="mt-4 grid gap-2">
                                    {session.poll.questions.map((question) => (
                                        <button
                                            key={question.id}
                                            type="button"
                                            className={`rounded-md border px-3 py-2 text-left text-sm disabled:opacity-50 ${
                                                session.current_question_id === question.id
                                                    ? 'border-black font-semibold'
                                                    : ''
                                            }`}
                                            onClick={() => setQuestion(question.id)}
                                            disabled={isClosed}
                                        >
                                            {question.question_text}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="rounded-xl border border-sidebar-border/70 p-6">
                                <h2 className="text-lg font-semibold">Live results</h2>
                                {currentQuestion ? (
                                    <div className="mt-4 space-y-3">
                                        <p className="text-sm text-muted-foreground">
                                            {currentQuestion.question_text}
                                        </p>
                                        {currentResults.map((result) => (
                                            <div key={result.option_id}>
                                                <div className="flex justify-between text-sm">
                                                    <span>{result.option_text}</span>
                                                    <span>{result.count}</span>
                                                </div>
                                                <div className="mt-1 h-2 rounded-full bg-neutral-200">
                                                    <div
                                                        className="h-2 rounded-full bg-black"
                                                        style={{ width: `${result.percent}%` }}
                                                    />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm text-muted-foreground">
                                        No active question.
                                    </p>
                                )}
                            </div>
                        </section>
                    </>
                ) : (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                )}
            </div>
        </AppLayout>
    );
}
