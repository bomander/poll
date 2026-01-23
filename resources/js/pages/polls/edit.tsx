import { Head, usePage } from '@inertiajs/react';
import { useEffect, useMemo, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import AppLayout from '@/layouts/app-layout';

type PageProps = { basePath: string };
type PollOption = { option_text: string };
type PollQuestion = { question_text: string; options: PollOption[] };
type Poll = {
    id: number;
    title: string;
    description?: string | null;
    questions: PollQuestion[];
};
type QuestionErrors = {
    question_text?: string;
    options: Array<string | undefined>;
    optionsSummary?: string;
};
type FieldErrors = {
    title?: string;
    questions: QuestionErrors[];
};

export default function PollEdit() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();
    const pollId = useMemo(() => {
        const match = window.location.pathname.match(/polls\/(\d+)/);
        return match ? Number(match[1]) : null;
    }, []);

    const [poll, setPoll] = useState<Poll | null>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [questions, setQuestions] = useState<PollQuestion[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);
    const [fieldErrors, setFieldErrors] = useState<FieldErrors>({ questions: [] });

    useEffect(() => {
        if (!pollId) return;
        apiFetch(`${basePath}/api/polls/${pollId}`)
            .then(async (res) => {
                if (!res.ok) {
                    throw new Error(t('polls.errors.load_poll'));
                }
                const data = await res.json();
                setPoll(data);
                setTitle(data.title);
                setDescription(data.description || '');
                setQuestions(
                    data.questions.map((q: any) => ({
                        question_text: q.question_text,
                        options: q.options.map((o: any) => ({ option_text: o.option_text })),
                    })),
                );
            })
            .catch((err) => setError(err instanceof Error ? err.message : t('polls.errors.load_poll')));
    }, [pollId, basePath]);

    const updateQuestion = (index: number, value: string) => {
        if (validationErrors.length || fieldErrors.questions.length) {
            setValidationErrors([]);
            setFieldErrors({ questions: [] });
        }
        const next = [...questions];
        next[index] = { ...next[index], question_text: value };
        setQuestions(next);
    };

    const updateOption = (qIndex: number, oIndex: number, value: string) => {
        if (validationErrors.length || fieldErrors.questions.length) {
            setValidationErrors([]);
            setFieldErrors({ questions: [] });
        }
        const next = [...questions];
        const options = [...next[qIndex].options];
        options[oIndex] = { option_text: value };
        next[qIndex] = { ...next[qIndex], options };
        setQuestions(next);
    };

    const addQuestion = () => {
        if (validationErrors.length || fieldErrors.questions.length) {
            setValidationErrors([]);
            setFieldErrors({ questions: [] });
        }
        setQuestions([
            ...questions,
            { question_text: '', options: [{ option_text: '' }, { option_text: '' }] },
        ]);
    };

    const addOption = (qIndex: number) => {
        if (validationErrors.length || fieldErrors.questions.length) {
            setValidationErrors([]);
            setFieldErrors({ questions: [] });
        }
        const next = [...questions];
        next[qIndex] = {
            ...next[qIndex],
            options: [...next[qIndex].options, { option_text: '' }],
        };
        setQuestions(next);
    };

    const validatePoll = () => {
        const errors: string[] = [];
        const nextFieldErrors: FieldErrors = {
            title: undefined,
            questions: questions.map((question) => ({
                question_text: undefined,
                options: question.options.map(() => undefined),
            })),
        };

        if (!title.trim()) {
            const message = t('polls.validation.title_required');
            errors.push(message);
            nextFieldErrors.title = message;
        }

        questions.forEach((question, qIndex) => {
            const optionTexts = question.options.map((option) => option.option_text.trim());
            const nonEmptyOptions = optionTexts.filter(Boolean);
            if (nonEmptyOptions.length < 2) {
                errors.push(t('polls.validation.question_min_options', { n: qIndex + 1 }));
                nextFieldErrors.questions[qIndex].optionsSummary = t('polls.validation.min_options_summary');
            }

            const qText = question.question_text.trim();
            if (!qText) {
                const message = t('polls.validation.question_text_required');
                errors.push(message);
                nextFieldErrors.questions[qIndex].question_text = message;
            }

            const seen = new Map<string, number>();
            let hasDuplicate = false;
            optionTexts.forEach((optionText, optionIndex) => {
                if (!optionText) return;
                const normalized = optionText.toLowerCase();
                const firstIndex = seen.get(normalized);
                if (firstIndex !== undefined) {
                    const message = t('polls.validation.duplicate_option');
                    nextFieldErrors.questions[qIndex].options[optionIndex] = message;
                    nextFieldErrors.questions[qIndex].options[firstIndex] = message;
                    hasDuplicate = true;
                } else {
                    seen.set(normalized, optionIndex);
                }
            });
            if (hasDuplicate) {
                errors.push(t('polls.validation.question_duplicate_options', { n: qIndex + 1 }));
            }
        });

        setFieldErrors(nextFieldErrors);
        return errors;
    };

    const savePoll = async () => {
        if (!pollId) return;
        const errors = validatePoll();
        if (errors.length > 0) {
            setValidationErrors(errors);
            return;
        }
        setLoading(true);
        setError(null);
        setValidationErrors([]);
        try {
            const payload = {
                title: title.trim(),
                description: description.trim() || null,
                questions: questions.map((q) => ({
                    question_text: q.question_text.trim(),
                    options: q.options.map((o) => o.option_text.trim()),
                })),
            };
            const res = await apiFetch(`${basePath}/api/polls/${pollId}`, {
                method: 'PUT',
                body: JSON.stringify(payload),
            });
            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData.message || t('polls.errors.save_poll'));
            }
            const updated = await res.json();
            setPoll(updated);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('polls.errors.save_poll'));
        } finally {
            setLoading(false);
        }
    };

    return (
        <AppLayout>
            <Head title={t('polls.edit_title')} />
            <div className="flex flex-col gap-6 p-6">
                <div className="flex items-center justify-between">
                    <h1 className="text-xl font-semibold">{t('polls.edit_title')}</h1>
                    <button
                        type="button"
                        className="rounded-md border px-3 py-2 text-sm"
                        onClick={() => (window.location.href = `${basePath}/polls`)}
                    >
                        {t('polls.back')}
                    </button>
                </div>
                {error ? <p className="text-sm text-red-600">{error}</p> : null}
                {validationErrors.length > 0 ? (
                    <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {validationErrors.map((message) => (
                            <p key={message}>{message}</p>
                        ))}
                    </div>
                ) : null}
                {poll ? (
                    <section className="rounded-xl border border-sidebar-border/70 p-6">
                        <div className="grid gap-4">
                            <input
                                className="w-full rounded-md border px-3 py-2"
                                placeholder={t('polls.poll_title_placeholder')}
                                value={title}
                                onChange={(event) => {
                                    if (validationErrors.length || fieldErrors.questions.length || fieldErrors.title) {
                                        setValidationErrors([]);
                                        setFieldErrors({ questions: [] });
                                    }
                                    setTitle(event.target.value);
                                }}
                            />
                            {fieldErrors.title ? (
                                <p className="text-xs text-red-600">{fieldErrors.title}</p>
                            ) : null}
                            <textarea
                                className="w-full rounded-md border px-3 py-2"
                                placeholder={t('polls.description_placeholder')}
                                value={description}
                                onChange={(event) => {
                                    if (validationErrors.length || fieldErrors.questions.length || fieldErrors.title) {
                                        setValidationErrors([]);
                                        setFieldErrors({ questions: [] });
                                    }
                                    setDescription(event.target.value);
                                }}
                            />
                            {questions.map((question, qIndex) => (
                                <div key={qIndex} className="rounded-lg border p-4">
                                    <input
                                        className="w-full rounded-md border px-3 py-2"
                                        placeholder={t('polls.question_placeholder', { n: qIndex + 1 })}
                                        value={question.question_text}
                                        onChange={(event) =>
                                            updateQuestion(qIndex, event.target.value)
                                        }
                                    />
                                    {fieldErrors.questions[qIndex]?.question_text ? (
                                        <p className="mt-1 text-xs text-red-600">
                                            {fieldErrors.questions[qIndex]?.question_text}
                                        </p>
                                    ) : null}
                                    <div className="mt-3 grid gap-2">
                                        {question.options.map((option, oIndex) => (
                                            <div key={oIndex}>
                                                <input
                                                    className="w-full rounded-md border px-3 py-2"
                                                    placeholder={t('polls.option_placeholder', { n: oIndex + 1 })}
                                                    value={option.option_text}
                                                    onChange={(event) =>
                                                        updateOption(qIndex, oIndex, event.target.value)
                                                    }
                                                />
                                                {fieldErrors.questions[qIndex]?.options[oIndex] ? (
                                                    <p className="mt-1 text-xs text-red-600">
                                                        {fieldErrors.questions[qIndex]?.options[oIndex]}
                                                    </p>
                                                ) : null}
                                            </div>
                                        ))}
                                        {fieldErrors.questions[qIndex]?.optionsSummary ? (
                                            <p className="text-xs text-red-600">
                                                {fieldErrors.questions[qIndex]?.optionsSummary}
                                            </p>
                                        ) : null}
                                        {question.options.length < 8 ? (
                                            <button
                                                type="button"
                                                className="text-left text-sm text-blue-600"
                                                onClick={() => addOption(qIndex)}
                                            >
                                                + {t('polls.add_option')}
                                            </button>
                                        ) : null}
                                    </div>
                                </div>
                            ))}
                            <button
                                type="button"
                                className="text-left text-sm text-blue-600"
                                onClick={addQuestion}
                            >
                                + {t('polls.add_question')}
                            </button>
                            <button
                                type="button"
                                className="rounded-md bg-black px-4 py-2 text-white"
                                onClick={savePoll}
                                disabled={loading}
                            >
                                {loading ? t('polls.saving') : t('polls.save')}
                            </button>
                        </div>
                    </section>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('session.loading')}</p>
                )}
            </div>
        </AppLayout>
    );
}
