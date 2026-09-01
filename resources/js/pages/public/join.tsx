import { Head, usePage } from '@inertiajs/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

type PageProps = { basePath: string };
type PollType = 'multiple_choice' | 'word_cloud';
type PollOption = { id: number; option_text: string };
type PollQuestion = {
    id: number;
    question_text: string;
    options: PollOption[];
};
type MultipleChoiceResult = {
    option_id: number;
    option_text: string;
    count: number;
    percent: number;
};
type WordCloudResult = { answer_text: string; count: number; percent: number };
type Results = MultipleChoiceResult[] | WordCloudResult[];
type JoinResponse = {
    session_id: number;
    status: 'active' | 'closed';
    locked: boolean;
    poll_title: string | null;
    poll_type: PollType;
    current_question: PollQuestion | null;
    results: Results;
    total_responses: number;
    has_voted: boolean;
};

// Same colors as projector view
const OPTION_COLORS = [
    '#3B82F6', // blue
    '#F59E0B', // amber
    '#10B981', // emerald
    '#EC4899', // pink
    '#8B5CF6', // violet
    '#EF4444', // red
    '#06B6D4', // cyan
    '#F97316', // orange
];

export default function JoinPage() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const initialCode = useMemo(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('code')?.toUpperCase() || '';
    }, []);
    const [code, setCode] = useState(initialCode);
    const [sessionId, setSessionId] = useState<number | null>(null);
    const [pollTitle, setPollTitle] = useState<string | null>(null);
    const [pollType, setPollType] = useState<PollType>('multiple_choice');
    const [question, setQuestion] = useState<PollQuestion | null>(null);
    const [results, setResults] = useState<Results>([]);
    const [locked, setLocked] = useState(false);
    const [sessionStatus, setSessionStatus] = useState<
        'active' | 'closed' | null
    >(null);
    const [error, setError] = useState<string | null>(null);
    const [voted, setVoted] = useState(false);
    const [voting, setVoting] = useState(false);
    const autoJoinStarted = useRef(false);
    const [answerText, setAnswerText] = useState('');

    const joinSession = useCallback(async () => {
        setError(null);
        try {
            const cleanCode = code.trim().toUpperCase();
            if (!cleanCode) {
                setError(t('join.errors.code_required'));
                return;
            }
            // Token handled via HTTP-only cookie by server
            const res = await apiFetch(`${basePath}/api/join`, {
                method: 'POST',
                body: JSON.stringify({ code: cleanCode }),
            });
            if (res.status === 429) {
                setError(t('join.errors.throttled'));
                return;
            }
            if (!res.ok) {
                throw new Error(t('join.errors.invalid_code'));
            }
            const data = (await res.json()) as JoinResponse;
            setSessionId(data.session_id);
            setPollTitle(data.poll_title || null);
            setPollType(data.poll_type || 'multiple_choice');
            setQuestion(data.current_question);
            setResults(data.results || []);
            setLocked(data.locked);
            setVoted(data.has_voted || false);
            setSessionStatus(data.status || null);
        } catch (err) {
            setError(
                err instanceof Error
                    ? err.message
                    : t('join.errors.join_failed'),
            );
        }
    }, [basePath, code, t]);

    const voteChoice = async (optionId: number) => {
        if (
            !sessionId ||
            !question ||
            voting ||
            voted ||
            sessionStatus === 'closed'
        )
            return;
        setVoting(true);
        try {
            // Token handled via HTTP-only cookie by server
            const res = await apiFetch(
                `${basePath}/api/sessions/${sessionId}/vote`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        question_id: question.id,
                        option_id: optionId,
                    }),
                },
            );
            await handleVoteResponse(res);
        } finally {
            setVoting(false);
        }
    };

    const voteText = async () => {
        if (
            !sessionId ||
            !question ||
            voting ||
            voted ||
            sessionStatus === 'closed'
        )
            return;
        setVoting(true);
        try {
            const res = await apiFetch(
                `${basePath}/api/sessions/${sessionId}/vote`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        question_id: question.id,
                        answer_text: answerText,
                    }),
                },
            );
            await handleVoteResponse(res);
        } finally {
            setVoting(false);
        }
    };

    const handleVoteResponse = useCallback(
        async (res: Response) => {
            if (res.status === 429) {
                setError(t('join.errors.throttled'));
                return;
            }
            if (res.ok) {
                const data = await res.json();
                setResults(data.results || []);
                setVoted(true);
                setError(null);
                return;
            }

            const errData = (await res.json().catch(() => ({}))) as {
                message?: string;
            };
            const message = errData.message || '';

            if (message === 'Already voted.') {
                setVoted(true);
                setError(null);
                return;
            }

            if (message === 'Question is locked.') {
                setLocked(true);
                setError(t('join.errors.locked'));
                return;
            }

            if (message === 'Session is closed.') {
                setSessionStatus('closed');
                setError(t('join.errors.closed'));
                return;
            }

            if (message === 'Not the active question.') {
                setError(t('join.errors.question_changed'));
                await joinSession();
                return;
            }

            if (message === 'No respondent token.') {
                setError(t('join.errors.token_missing'));
                await joinSession();
                return;
            }

            setError(t('join.errors.vote_failed'));
        },
        [joinSession, t],
    );

    // Auto-join if code is in URL
    useEffect(() => {
        if (!initialCode || autoJoinStarted.current) return;
        autoJoinStarted.current = true;
        const timer = window.setTimeout(() => void joinSession(), 0);

        return () => window.clearTimeout(timer);
    }, [initialCode, joinSession]);

    // Refresh the live state while the session is active.
    useEffect(() => {
        if (!sessionId || !code || sessionStatus === 'closed') return;
        const interval = setInterval(async () => {
            try {
                const cleanCode = code.trim().toUpperCase();
                if (!cleanCode) return;
                const res = await apiFetch(`${basePath}/api/join`, {
                    method: 'POST',
                    body: JSON.stringify({ code: cleanCode }),
                });
                if (res.status === 429) {
                    return;
                }
                if (res.ok) {
                    const data = (await res.json()) as JoinResponse;
                    setError(null);
                    setSessionStatus(data.status || null);
                    const nextQuestion = data.current_question;
                    const questionChanged = nextQuestion?.id !== question?.id;
                    setQuestion(data.current_question);
                    setResults(data.results || []);
                    setLocked(data.locked);
                    setVoted(
                        questionChanged
                            ? !!data.has_voted
                            : voted || !!data.has_voted,
                    );
                }
            } catch {
                // Ignore polling errors
            }
        }, 5000);
        return () => clearInterval(interval);
    }, [sessionId, code, basePath, sessionStatus, question?.id, voted]);

    const isClosed = sessionStatus === 'closed';

    return (
        <div className="min-h-screen bg-neutral-100 px-6 py-10 dark:bg-neutral-950">
            <Head title={t('join.title')} />
            <div className="mx-auto max-w-lg rounded-xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
                    {t('join.title')}
                </h1>
                {pollTitle ? (
                    <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                        {pollTitle}
                    </p>
                ) : null}
                {error ? (
                    <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                        {error}
                    </p>
                ) : null}
                {sessionId ? (
                    <>
                        {question ? (
                            <div className="mt-6">
                                <h2 className="text-lg font-semibold text-neutral-900 dark:text-white">
                                    {question.question_text}
                                </h2>
                                {pollType === 'multiple_choice' ? (
                                    <div className="mt-4 grid gap-3">
                                        {question.options.map(
                                            (option, index) => {
                                                const color =
                                                    OPTION_COLORS[
                                                        index %
                                                            OPTION_COLORS.length
                                                    ];
                                                return (
                                                    <button
                                                        key={option.id}
                                                        type="button"
                                                        disabled={
                                                            locked ||
                                                            voted ||
                                                            voting ||
                                                            isClosed
                                                        }
                                                        className="rounded-lg border-2 px-4 py-3 text-left font-medium transition-all disabled:cursor-not-allowed disabled:opacity-50"
                                                        style={{
                                                            borderColor: color,
                                                            backgroundColor: `${color}15`,
                                                            color: color,
                                                        }}
                                                        onClick={() =>
                                                            voteChoice(
                                                                option.id,
                                                            )
                                                        }
                                                    >
                                                        {option.option_text}
                                                    </button>
                                                );
                                            },
                                        )}
                                    </div>
                                ) : (
                                    <div className="mt-4 grid gap-3">
                                        <input
                                            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-400"
                                            placeholder={t(
                                                'join.word_cloud.placeholder',
                                            )}
                                            value={answerText}
                                            onChange={(event) =>
                                                setAnswerText(
                                                    event.target.value,
                                                )
                                            }
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    voteText();
                                                }
                                            }}
                                            disabled={
                                                locked ||
                                                voted ||
                                                voting ||
                                                isClosed
                                            }
                                        />
                                        <button
                                            type="button"
                                            className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
                                            onClick={voteText}
                                            disabled={
                                                locked ||
                                                voted ||
                                                voting ||
                                                isClosed
                                            }
                                        >
                                            {t('join.word_cloud.submit')}
                                        </button>
                                    </div>
                                )}
                                {locked ? (
                                    <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                                        {t('join.status.locked')}
                                    </p>
                                ) : isClosed ? (
                                    <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                                        {t('join.status.closed')}
                                    </p>
                                ) : null}
                                {voting ? (
                                    <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
                                        {t('join.status.sending')}
                                    </p>
                                ) : voted ? (
                                    <p className="mt-3 text-sm text-green-700 dark:text-green-400">
                                        {t('join.status.submitted')}
                                    </p>
                                ) : null}
                                <div className="mt-6 space-y-3">
                                    {pollType === 'multiple_choice'
                                        ? (
                                              results as MultipleChoiceResult[]
                                          ).map((result, index) => {
                                              const color =
                                                  OPTION_COLORS[
                                                      index %
                                                          OPTION_COLORS.length
                                                  ];
                                              return (
                                                  <div key={result.option_id}>
                                                      <div
                                                          className="flex justify-between text-sm font-medium"
                                                          style={{ color }}
                                                      >
                                                          <span>
                                                              {
                                                                  result.option_text
                                                              }
                                                          </span>
                                                          <span>
                                                              {result.count}
                                                          </span>
                                                      </div>
                                                      <div className="mt-1 h-3 rounded-full bg-neutral-200 dark:bg-neutral-700">
                                                          <div
                                                              className="h-3 rounded-full transition-all duration-300"
                                                              style={{
                                                                  width: `${result.percent}%`,
                                                                  backgroundColor:
                                                                      color,
                                                              }}
                                                          />
                                                      </div>
                                                  </div>
                                              );
                                          })
                                        : (results as WordCloudResult[]).map(
                                              (result, index) => {
                                                  const color =
                                                      OPTION_COLORS[
                                                          index %
                                                              OPTION_COLORS.length
                                                      ];
                                                  const fontSize =
                                                      14 +
                                                      Math.min(
                                                          22,
                                                          (result.percent /
                                                              100) *
                                                              24,
                                                      );
                                                  return (
                                                      <div
                                                          key={`${result.answer_text}-${index}`}
                                                          className="flex items-center justify-between gap-3"
                                                      >
                                                          <span
                                                              className="font-semibold"
                                                              style={{
                                                                  color,
                                                                  fontSize,
                                                              }}
                                                          >
                                                              {
                                                                  result.answer_text
                                                              }
                                                          </span>
                                                          <span className="text-sm text-neutral-600 dark:text-neutral-400">
                                                              {result.count}
                                                          </span>
                                                      </div>
                                                  );
                                              },
                                          )}
                                </div>
                            </div>
                        ) : (
                            <p className="mt-6 text-sm text-neutral-600 dark:text-neutral-400">
                                {t('join.waiting')}
                            </p>
                        )}
                    </>
                ) : (
                    <div className="mt-6 grid gap-3">
                        <input
                            className="w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-neutral-900 placeholder:text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder:text-neutral-400"
                            placeholder={t('join.code_placeholder')}
                            value={code}
                            onChange={(event) =>
                                setCode(event.target.value.toUpperCase())
                            }
                        />
                        <button
                            type="button"
                            className="rounded-md bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                            onClick={joinSession}
                        >
                            {t('join.join')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
