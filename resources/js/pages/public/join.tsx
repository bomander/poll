import { Head, usePage } from '@inertiajs/react';
import { Check } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { PlayfulPage, WaitingDots } from '@/components/playful';
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
        <PlayfulPage>
            <Head title={state?.poll_title ?? t('join.title')} />
            {!state ? (
                <form
                    className="playful-card p-6 sm:p-8"
                    onSubmit={(event) => {
                        event.preventDefault();
                        void join(code);
                    }}
                >
                    <h1 className="font-toy text-center text-4xl font-semibold">
                        {t('join.title')}
                    </h1>
                    <label className="mt-6 grid gap-2">
                        <span className="font-toy text-center text-lg font-medium">
                            {t('join.code_label')}
                        </span>
                        <input
                            className="toy-input font-toy h-20 text-center text-4xl font-semibold tracking-[0.2em] uppercase"
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
                    {error ? <ErrorNote text={error} /> : null}
                    <button
                        type="submit"
                        disabled={joining}
                        className="toy-button toy-button--go mt-6 h-16 text-2xl"
                    >
                        {joining ? t('join.joining') : t('join.join')}
                    </button>
                    <p className="mt-6 text-center text-sm text-[var(--ink-soft)]">
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
        </PlayfulPage>
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
        <div className="playful-card p-5 sm:p-7">
            <div className="flex items-center justify-between gap-3">
                <span className="font-toy min-w-0 truncate rounded-full bg-[var(--sun)] px-3 py-1 text-sm font-semibold">
                    {state.poll_title}
                </span>
                <button
                    type="button"
                    onClick={onLeave}
                    className="shrink-0 text-sm font-semibold text-[var(--ink-soft)] underline underline-offset-4"
                >
                    {t('join.leave')}
                </button>
            </div>
            {state.question_count > 1 && state.question_number ? (
                <QuestionSteps
                    current={state.question_number}
                    count={state.question_count}
                    label={t('join.question_position', {
                        n: state.question_number,
                        count: state.question_count,
                    })}
                />
            ) : null}

            {!question ? (
                <div className="py-10 text-center">
                    <WaitingDots />
                    <p className="font-toy mt-6 text-2xl font-medium">
                        {t('join.waiting')}
                    </p>
                </div>
            ) : (
                <>
                    <h1 className="font-toy mt-4 text-[1.85rem] leading-tight font-semibold">
                        {question.question_text}
                    </h1>

                    {canAnswer ? (
                        state.poll_type === 'multiple_choice' ? (
                            <form
                                className="mt-6 grid gap-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (selected !== null) {
                                        onVote({ option_id: selected });
                                    }
                                }}
                            >
                                <p className="font-semibold text-[var(--ink-soft)]">
                                    {t('join.pick_one')}
                                </p>
                                {question.options.map((option, index) => (
                                    <OptionButton
                                        key={option.id}
                                        index={index}
                                        text={option.option_text}
                                        selected={selected === option.id}
                                        dimmed={
                                            selected !== null &&
                                            selected !== option.id
                                        }
                                        onSelect={() => setSelected(option.id)}
                                    />
                                ))}
                                <SubmitButton
                                    disabled={selected === null || voting}
                                    voting={voting}
                                />
                            </form>
                        ) : (
                            <form
                                className="mt-6 grid gap-2"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    if (answerText.trim()) {
                                        onVote({ answer_text: answerText });
                                    }
                                }}
                            >
                                <label
                                    htmlFor="answer"
                                    className="font-toy text-lg font-medium"
                                >
                                    {t('join.word_cloud.label')}
                                </label>
                                <input
                                    id="answer"
                                    className="toy-input h-16 px-5 text-xl font-semibold"
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
                                <p className="text-right text-sm font-semibold text-[var(--ink-soft)]">
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
                        <div className="toy-pop mt-6 rounded-[1.5rem] border-[3px] border-[var(--ink)] bg-[var(--grass)] p-5 text-white">
                            <div className="flex items-center gap-3">
                                <span className="flex size-12 shrink-0 items-center justify-center rounded-full border-[3px] border-[var(--ink)] bg-white text-[var(--grass)]">
                                    <Check className="size-7" strokeWidth={4} />
                                </span>
                                <p className="font-toy text-xl leading-tight font-semibold">
                                    {t('join.submitted_title')}
                                </p>
                            </div>
                            <MyAnswer state={state} />
                            {!closed ? (
                                <p className="mt-3 font-semibold">
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

                    {error ? <ErrorNote text={error} /> : null}

                    {showResults ? (
                        <ParticipantResults state={state} />
                    ) : state.has_voted && !state.show_results && !closed ? (
                        <p className="font-toy mt-6 text-center text-lg font-medium text-[var(--ink-soft)]">
                            {t('join.results_hidden')}
                        </p>
                    ) : null}
                </>
            )}

            <p className="mt-7 text-center text-sm text-[var(--ink-soft)]">
                {t('join.anonymous')}
            </p>
        </div>
    );
}

/** Rad med prickar som visar var i enkäten klassen är. */
function QuestionSteps({
    current,
    count,
    label,
}: {
    current: number;
    count: number;
    label: string;
}) {
    return (
        <div className="mt-4 flex items-center gap-3">
            <div className="flex gap-1.5" aria-hidden>
                {Array.from({ length: count }, (_, index) => (
                    <span
                        key={index}
                        className="size-3.5 rounded-full border-2 border-[var(--ink)]"
                        style={{
                            backgroundColor:
                                index < current ? optionColor(index) : '#fff',
                        }}
                    />
                ))}
            </div>
            <span className="font-toy text-sm font-semibold">{label}</span>
        </div>
    );
}

function OptionButton({
    index,
    text,
    selected,
    dimmed,
    onSelect,
}: {
    index: number;
    text: string;
    selected: boolean;
    dimmed: boolean;
    onSelect: () => void;
}) {
    const color = optionColor(index);
    return (
        <button
            type="button"
            aria-pressed={selected}
            onClick={onSelect}
            className="toy-button min-h-16 justify-start px-3 py-2 text-left text-xl"
            style={
                {
                    '--toy': color,
                    '--toy-text': '#fff',
                    opacity: dimmed ? 0.55 : 1,
                } as React.CSSProperties
            }
        >
            <span
                className="flex size-11 shrink-0 items-center justify-center rounded-full border-[3px] border-[var(--ink)] bg-white text-2xl"
                style={{ color }}
            >
                {optionLetter(index)}
            </span>
            <span className="min-w-0 flex-1 leading-snug break-words">
                {text}
            </span>
            {selected ? (
                <span className="toy-pop flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
                    <Check
                        className="size-6"
                        strokeWidth={4}
                        style={{ color }}
                    />
                </span>
            ) : null}
        </button>
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
            className="toy-button mt-2 h-16 text-2xl"
        >
            {voting
                ? t('join.status.sending')
                : (label ?? t('join.word_cloud.submit'))}
        </button>
    );
}

function StatusNote({ text }: { text: string }) {
    return (
        <p className="font-toy mt-6 rounded-[1.5rem] border-[3px] border-[var(--ink)] bg-[var(--sun)] p-5 text-center text-xl font-semibold">
            {text}
        </p>
    );
}

function ErrorNote({ text }: { text: string }) {
    return (
        <p
            role="alert"
            className="mt-4 rounded-2xl border-[3px] border-[var(--berry)] bg-[#fff0f3] px-4 py-3 text-center font-semibold text-[#a3123a]"
        >
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
            <p className="mt-4 rounded-2xl bg-white/20 px-4 py-3 text-lg">
                {t('join.your_answer')}:{' '}
                <span className="font-toy font-semibold">
                    {answer.answer_text}
                </span>
            </p>
        );
    }

    const options = state.current_question?.options ?? [];
    const index = options.findIndex((option) => option.id === answer.option_id);
    if (index < 0) return null;

    return (
        <p className="mt-4 flex items-center gap-3 rounded-2xl bg-white/20 px-4 py-3 text-lg">
            <span className="shrink-0">{t('join.your_answer')}:</span>
            <span
                className="font-toy flex size-8 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ink)] bg-white"
                style={{ color: optionColor(index) }}
            >
                {optionLetter(index)}
            </span>
            <span className="font-toy min-w-0 font-semibold break-words">
                {options[index].option_text}
            </span>
        </p>
    );
}

function ParticipantResults({ state }: { state: ParticipantState }) {
    const t = useT();
    const options = state.current_question?.options ?? [];

    return (
        <section className="mt-7 border-t-[3px] border-dashed border-[#e4dccd] pt-6">
            <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-toy text-xl font-semibold">
                    {t('join.results_title')}
                </h2>
                <span className="font-semibold text-[var(--ink-soft)]">
                    {t('join.total', { count: state.total_responses })}
                </span>
            </div>
            <div className="mt-4 grid gap-4">
                {state.poll_type === 'multiple_choice'
                    ? (state.results as MultipleChoiceResult[]).map(
                          (result) => {
                              const index = Math.max(
                                  options.findIndex(
                                      (option) =>
                                          option.id === result.option_id,
                                  ),
                                  0,
                              );
                              const color = optionColor(index);
                              return (
                                  <div key={result.option_id}>
                                      <div className="mb-1.5 flex items-center justify-between gap-3">
                                          <span className="flex min-w-0 items-center gap-2 font-semibold">
                                              <span
                                                  className="font-toy flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-[var(--ink)] text-sm text-white"
                                                  style={{
                                                      backgroundColor: color,
                                                  }}
                                              >
                                                  {optionLetter(index)}
                                              </span>
                                              <span className="truncate">
                                                  {result.option_text}
                                              </span>
                                          </span>
                                          <span className="font-toy shrink-0 text-lg font-semibold tabular-nums">
                                              {Math.round(result.percent)} %
                                          </span>
                                      </div>
                                      <div className="toy-bar">
                                          <span
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
                          .map((result, index) => (
                              <div
                                  key={result.answer_text}
                                  className="flex items-center justify-between gap-3 rounded-2xl border-[3px] border-[var(--ink)] px-4 py-2 text-white"
                                  style={{
                                      backgroundColor: optionColor(index),
                                  }}
                              >
                                  <span className="font-toy min-w-0 text-lg font-semibold break-words">
                                      {result.answer_text}
                                  </span>
                                  <span className="font-toy flex size-8 shrink-0 items-center justify-center rounded-full bg-white font-semibold text-[var(--ink)] tabular-nums">
                                      {result.count}
                                  </span>
                              </div>
                          ))}
            </div>
        </section>
    );
}
