import { Head, usePage } from '@inertiajs/react';
import { CheckCircle2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import {
    WORD_CLOUD_MAX_LENGTH,
    normalizeCode,
    optionColor,
    optionLetter,
    type MultipleChoiceResult,
    type ParticipantState,
    type WordCloudResult,
} from '@/lib/poll';

type PageProps = { basePath: string };

const REFRESH_MS = 5000;

export default function JoinPage() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const [initialCode] = useState(() =>
        normalizeCode(
            new URLSearchParams(window.location.search).get('code') ?? '',
        ),
    );
    const [code, setCode] = useState(initialCode);
    const [joinedCode, setJoinedCode] = useState<string | null>(null);
    const [state, setState] = useState<ParticipantState | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [joining, setJoining] = useState(false);
    const [voting, setVoting] = useState(false);
    const autoJoinStarted = useRef(false);

    const fetchState = useCallback(
        async (rawCode: string) => {
            const res = await apiFetch(`${basePath}/api/join`, {
                method: 'POST',
                body: JSON.stringify({ code: rawCode }),
            });
            if (res.status === 429) return 'throttled' as const;
            if (!res.ok) return 'invalid' as const;
            return (await res.json()) as ParticipantState;
        },
        [basePath],
    );

    const join = useCallback(
        async (rawCode: string) => {
            const clean = normalizeCode(rawCode);
            if (!clean) {
                setError(t('join.errors.code_required'));
                return;
            }
            setJoining(true);
            setError(null);
            try {
                const result = await fetchState(clean);
                if (result === 'throttled') {
                    setError(t('join.errors.throttled'));
                } else if (result === 'invalid') {
                    setError(t('join.errors.invalid_code'));
                } else {
                    setState(result);
                    setJoinedCode(clean);
                    // Koden i adressfältet gör att en omladdning hamnar rätt.
                    window.history.replaceState(
                        null,
                        '',
                        `${basePath}/join?code=${clean}`,
                    );
                }
            } catch {
                setError(t('join.errors.join_failed'));
            } finally {
                setJoining(false);
            }
        },
        [basePath, fetchState, t],
    );

    useEffect(() => {
        if (!initialCode || autoJoinStarted.current) return;
        autoJoinStarted.current = true;
        const timer = window.setTimeout(() => void join(initialCode), 0);
        return () => window.clearTimeout(timer);
    }, [initialCode, join]);

    const closed = state?.status === 'closed';
    const questionId = state?.current_question?.id ?? null;
    const questionIdRef = useRef(questionId);
    useEffect(() => {
        questionIdRef.current = questionId;
    }, [questionId]);

    useEffect(() => {
        if (!joinedCode || closed) return;
        const interval = window.setInterval(async () => {
            try {
                const result = await fetchState(joinedCode);
                if (typeof result !== 'object') return;
                // Ett fel om förra frågan gäller inte när läraren har gått vidare.
                if (
                    (result.current_question?.id ?? null) !==
                    questionIdRef.current
                ) {
                    setError(null);
                }
                setState(result);
            } catch {
                // Nästa uppdatering försöker igen.
            }
        }, REFRESH_MS);
        return () => window.clearInterval(interval);
    }, [joinedCode, closed, fetchState]);

    const vote = async (body: object) => {
        if (!state?.current_question || voting) return;
        setVoting(true);
        setError(null);
        try {
            const res = await apiFetch(
                `${basePath}/api/sessions/${state.session_id}/vote`,
                {
                    method: 'POST',
                    body: JSON.stringify({
                        question_id: state.current_question.id,
                        ...body,
                    }),
                },
            );
            if (res.ok) {
                setState((await res.json()) as ParticipantState);
                return;
            }
            if (res.status === 429) {
                setError(t('join.errors.throttled'));
                return;
            }
            const message =
                ((await res.json().catch(() => ({}))) as { message?: string })
                    .message ?? '';
            const known: Record<string, string> = {
                'Question is locked.': t('join.errors.locked'),
                'Session is closed.': t('join.errors.closed'),
                'Not the active question.': t('join.errors.question_changed'),
                'No respondent token.': t('join.errors.token_missing'),
            };
            if (message !== 'Already voted.') {
                setError(known[message] ?? t('join.errors.vote_failed'));
            }
            if (joinedCode) {
                const result = await fetchState(joinedCode);
                if (typeof result === 'object') setState(result);
            }
        } catch {
            setError(t('join.errors.vote_failed'));
        } finally {
            setVoting(false);
        }
    };

    const leave = () => {
        setState(null);
        setJoinedCode(null);
        setCode('');
        setError(null);
        window.history.replaceState(null, '', `${basePath}/join`);
    };

    return (
        <div className="min-h-dvh bg-neutral-100 px-4 py-6 text-neutral-900 sm:py-10 dark:bg-neutral-950 dark:text-white">
            <Head title={state?.poll_title ?? t('join.title')} />
            <div className="mx-auto max-w-lg">
                {!state ? (
                    <form
                        className="rounded-2xl border bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"
                        onSubmit={(event) => {
                            event.preventDefault();
                            void join(code);
                        }}
                    >
                        <h1 className="text-2xl font-semibold">
                            {t('join.title')}
                        </h1>
                        <label className="mt-5 grid gap-2">
                            <span className="text-sm font-medium">
                                {t('join.code_label')}
                            </span>
                            <input
                                className="h-16 w-full rounded-lg border-2 border-neutral-300 bg-white text-center font-mono text-3xl tracking-[0.2em] uppercase placeholder:text-neutral-300 focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:placeholder:text-neutral-600 dark:focus:border-white"
                                placeholder={t('join.code_placeholder')}
                                value={code}
                                maxLength={12}
                                inputMode="text"
                                autoCapitalize="characters"
                                autoComplete="off"
                                autoCorrect="off"
                                spellCheck={false}
                                autoFocus={!initialCode}
                                onChange={(event) => {
                                    setCode(event.target.value.toUpperCase());
                                    setError(null);
                                }}
                            />
                        </label>
                        {error ? (
                            <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                                {error}
                            </p>
                        ) : null}
                        <button
                            type="submit"
                            disabled={joining}
                            className="mt-4 h-12 w-full rounded-lg bg-neutral-900 font-semibold text-white hover:bg-neutral-800 disabled:opacity-60 dark:bg-white dark:text-neutral-900"
                        >
                            {joining ? t('join.joining') : t('join.join')}
                        </button>
                        <p className="mt-4 text-center text-xs text-neutral-500">
                            {t('join.anonymous')}
                        </p>
                    </form>
                ) : (
                    // Nyckeln nollställer elevens val om läraren byter fråga.
                    <ParticipantView
                        key={state.current_question?.id ?? 'waiting'}
                        state={state}
                        error={error}
                        voting={voting}
                        onVote={(body) => void vote(body)}
                        onLeave={leave}
                    />
                )}
            </div>
        </div>
    );
}

function ParticipantView({
    state,
    error,
    voting,
    onVote,
    onLeave,
}: {
    state: ParticipantState;
    error: string | null;
    voting: boolean;
    onVote: (body: object) => void;
    onLeave: () => void;
}) {
    const t = useT();
    const [selected, setSelected] = useState<number | null>(null);
    const [answerText, setAnswerText] = useState('');
    const question = state.current_question;
    const closed = state.status === 'closed';
    const canAnswer =
        !!question && !state.has_voted && !state.locked && !closed;
    const showResults =
        state.show_results && (state.has_voted || state.locked || closed);

    return (
        <div className="rounded-2xl border bg-white p-5 shadow-sm sm:p-6 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-medium text-neutral-500 dark:text-neutral-400">
                    {state.poll_title}
                    {state.question_count > 1 && state.question_number ? (
                        <span className="block font-normal">
                            {t('join.question_position', {
                                n: state.question_number,
                                count: state.question_count,
                            })}
                        </span>
                    ) : null}
                </p>
                <button
                    type="button"
                    onClick={onLeave}
                    className="shrink-0 text-sm text-neutral-500 underline-offset-2 hover:underline"
                >
                    {t('join.leave')}
                </button>
            </div>

            {!question ? (
                <p className="mt-6 text-lg">{t('join.waiting')}</p>
            ) : (
                <>
                    <h1 className="mt-2 text-2xl leading-snug font-semibold">
                        {question.question_text}
                    </h1>

                    {canAnswer ? (
                        state.poll_type === 'multiple_choice' ? (
                            <form
                                className="mt-5 grid gap-3"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (selected !== null) {
                                        onVote({ option_id: selected });
                                    }
                                }}
                            >
                                <p className="text-sm text-neutral-500 dark:text-neutral-400">
                                    {t('join.pick_one')}
                                </p>
                                {question.options.map((option, index) => {
                                    const color = optionColor(index);
                                    const isSelected = selected === option.id;
                                    return (
                                        <button
                                            key={option.id}
                                            type="button"
                                            aria-pressed={isSelected}
                                            onClick={() =>
                                                setSelected(option.id)
                                            }
                                            className="flex min-h-14 items-center gap-3 rounded-xl border-2 px-3 py-2 text-left text-lg font-medium transition-colors"
                                            style={{
                                                borderColor: isSelected
                                                    ? color
                                                    : 'rgb(212 212 212 / 0.8)',
                                                backgroundColor: isSelected
                                                    ? `${color}1f`
                                                    : 'transparent',
                                            }}
                                        >
                                            <span
                                                className="flex size-9 shrink-0 items-center justify-center rounded-lg font-bold text-white"
                                                style={{
                                                    backgroundColor: color,
                                                }}
                                            >
                                                {optionLetter(index)}
                                            </span>
                                            <span className="min-w-0 flex-1 break-words">
                                                {option.option_text}
                                            </span>
                                            {isSelected ? (
                                                <CheckCircle2
                                                    className="size-6 shrink-0"
                                                    style={{ color }}
                                                />
                                            ) : null}
                                        </button>
                                    );
                                })}
                                <SubmitButton
                                    disabled={selected === null || voting}
                                    voting={voting}
                                />
                            </form>
                        ) : (
                            <form
                                className="mt-5 grid gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (answerText.trim()) {
                                        onVote({ answer_text: answerText });
                                    }
                                }}
                            >
                                <label
                                    htmlFor="answer"
                                    className="text-sm font-medium"
                                >
                                    {t('join.word_cloud.label')}
                                </label>
                                <input
                                    id="answer"
                                    className="h-14 w-full rounded-xl border-2 border-neutral-300 bg-white px-4 text-lg focus:border-neutral-900 focus:outline-none dark:border-neutral-700 dark:bg-neutral-800 dark:focus:border-white"
                                    placeholder={t(
                                        'join.word_cloud.placeholder',
                                    )}
                                    value={answerText}
                                    maxLength={WORD_CLOUD_MAX_LENGTH}
                                    autoComplete="off"
                                    onChange={(event) =>
                                        setAnswerText(event.target.value)
                                    }
                                />
                                <p className="text-right text-xs text-neutral-500">
                                    {t('join.word_cloud.remaining', {
                                        count:
                                            WORD_CLOUD_MAX_LENGTH -
                                            answerText.length,
                                    })}
                                </p>
                                <SubmitButton
                                    disabled={!answerText.trim() || voting}
                                    voting={voting}
                                    label={t('join.word_cloud.submit')}
                                />
                            </form>
                        )
                    ) : null}

                    {state.has_voted ? (
                        <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-100">
                            <p className="flex items-center gap-2 font-semibold">
                                <CheckCircle2 className="size-5 shrink-0" />
                                {t('join.submitted_title')}
                            </p>
                            <MyAnswer state={state} />
                            {!closed ? (
                                <p className="mt-2 text-sm">
                                    {(state.question_number ?? 0) <
                                    state.question_count
                                        ? t('join.submitted_help_next')
                                        : t('join.submitted_help')}
                                </p>
                            ) : null}
                        </div>
                    ) : null}

                    {closed ? (
                        <StatusNote text={t('join.status.closed')} />
                    ) : state.locked && !state.has_voted ? (
                        <StatusNote text={t('join.status.locked')} />
                    ) : null}

                    {error ? (
                        <p className="mt-4 text-sm text-red-600 dark:text-red-400">
                            {error}
                        </p>
                    ) : null}

                    {showResults ? (
                        <ParticipantResults state={state} />
                    ) : state.has_voted && !state.show_results && !closed ? (
                        <p className="mt-5 text-sm text-neutral-500 dark:text-neutral-400">
                            {t('join.results_hidden')}
                        </p>
                    ) : null}
                </>
            )}

            <p className="mt-6 text-center text-xs text-neutral-500">
                {t('join.anonymous')}
            </p>
        </div>
    );
}

function SubmitButton({
    disabled,
    voting,
    label,
}: {
    disabled: boolean;
    voting: boolean;
    label?: string;
}) {
    const t = useT();
    return (
        <button
            type="submit"
            disabled={disabled}
            className="mt-1 h-12 w-full rounded-xl bg-neutral-900 text-lg font-semibold text-white hover:bg-neutral-800 disabled:opacity-40 dark:bg-white dark:text-neutral-900"
        >
            {voting
                ? t('join.status.sending')
                : (label ?? t('join.word_cloud.submit'))}
        </button>
    );
}

function StatusNote({ text }: { text: string }) {
    return (
        <p className="mt-5 rounded-xl bg-neutral-100 p-4 text-center font-medium dark:bg-neutral-800">
            {text}
        </p>
    );
}

function MyAnswer({ state }: { state: ParticipantState }) {
    const t = useT();
    const answer = state.my_answer;
    if (!answer) return null;

    if (answer.answer_text) {
        return (
            <p className="mt-2 text-sm">
                {t('join.your_answer')}:{' '}
                <span className="font-semibold">{answer.answer_text}</span>
            </p>
        );
    }

    const options = state.current_question?.options ?? [];
    const index = options.findIndex((option) => option.id === answer.option_id);
    if (index < 0) return null;

    return (
        <p className="mt-2 flex items-center gap-2 text-sm">
            {t('join.your_answer')}:
            <span
                className="flex size-6 items-center justify-center rounded font-bold text-white"
                style={{ backgroundColor: optionColor(index) }}
            >
                {optionLetter(index)}
            </span>
            <span className="font-semibold">{options[index].option_text}</span>
        </p>
    );
}

function ParticipantResults({ state }: { state: ParticipantState }) {
    const t = useT();
    const options = state.current_question?.options ?? [];

    return (
        <section className="mt-6 border-t pt-5 dark:border-neutral-800">
            <div className="flex items-baseline justify-between">
                <h2 className="font-semibold">{t('join.results_title')}</h2>
                <span className="text-sm text-neutral-500">
                    {t('join.total', { count: state.total_responses })}
                </span>
            </div>
            <div className="mt-3 grid gap-3">
                {state.poll_type === 'multiple_choice'
                    ? (state.results as MultipleChoiceResult[]).map(
                          (result) => {
                              const index = options.findIndex(
                                  (option) => option.id === result.option_id,
                              );
                              const color = optionColor(Math.max(index, 0));
                              return (
                                  <div key={result.option_id}>
                                      <div className="flex justify-between gap-3 text-sm">
                                          <span className="flex min-w-0 items-center gap-2">
                                              <span
                                                  className="flex size-5 shrink-0 items-center justify-center rounded text-xs font-bold text-white"
                                                  style={{
                                                      backgroundColor: color,
                                                  }}
                                              >
                                                  {optionLetter(
                                                      Math.max(index, 0),
                                                  )}
                                              </span>
                                              <span className="truncate">
                                                  {result.option_text}
                                              </span>
                                          </span>
                                          <span className="shrink-0 tabular-nums">
                                              {Math.round(result.percent)} %
                                          </span>
                                      </div>
                                      <div className="mt-1 h-2.5 rounded-full bg-neutral-200 dark:bg-neutral-700">
                                          <div
                                              className="h-2.5 rounded-full transition-all duration-500"
                                              style={{
                                                  width: `${result.percent}%`,
                                                  backgroundColor: color,
                                              }}
                                          />
                                      </div>
                                  </div>
                              );
                          },
                      )
                    : (state.results as WordCloudResult[])
                          .slice(0, 15)
                          .map((result) => (
                              <div
                                  key={result.answer_text}
                                  className="flex justify-between gap-3 text-sm"
                              >
                                  <span className="min-w-0 font-medium break-words">
                                      {result.answer_text}
                                  </span>
                                  <span className="shrink-0 text-neutral-500 tabular-nums">
                                      {result.count}
                                  </span>
                              </div>
                          ))}
            </div>
        </section>
    );
}
