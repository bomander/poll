import {
    ArrowDown,
    ArrowUp,
    BarChart3,
    Cloud,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { useState } from 'react';

import { ThemePicker } from '@/components/theme-picker';
import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { optionColor, optionLetter, type PollType } from '@/lib/poll';
import { DEFAULT_THEME, type ThemeKey } from '@/lib/themes';

export type PollFormQuestion = {
    question: string;
    options: string[];
};

export type PollFormValues = {
    title: string;
    description: string;
    type: PollType;
    theme: ThemeKey;
    questions: PollFormQuestion[];
};

export type PollPayload = {
    title: string;
    description: string | null;
    type: PollType;
    settings: { theme: ThemeKey };
    questions: { question_text: string; options: string[] }[];
};

type QuestionErrors = {
    question?: string;
    options?: string;
    duplicates?: number[];
};

type Errors = {
    title?: string;
    questions?: Record<number, QuestionErrors>;
};

/** Nyckeln håller ihop en fråga med sina fält när frågorna flyttas. */
type DraftQuestion = PollFormQuestion & { key: number };

type Props = {
    initial?: Partial<PollFormValues>;
    submitLabel: string;
    submittingLabel: string;
    /** Valfri andra knapp, till exempel "Skapa och starta". */
    secondaryLabel?: string;
    onSubmit: (payload: PollPayload, secondary: boolean) => Promise<void>;
    onCancel?: () => void;
};

const MAX_OPTIONS = 8;
export const MAX_QUESTIONS = 10;

const emptyQuestion = (): PollFormQuestion => ({
    question: '',
    options: ['', ''],
});

export const EMPTY_POLL: PollFormValues = {
    title: '',
    description: '',
    type: 'multiple_choice',
    theme: DEFAULT_THEME,
    questions: [emptyQuestion()],
};

let nextQuestionKey = 0;
const withKey = (question: PollFormQuestion): DraftQuestion => ({
    ...question,
    key: nextQuestionKey++,
});

export function PollForm({
    initial,
    submitLabel,
    submittingLabel,
    secondaryLabel,
    onSubmit,
    onCancel,
}: Props) {
    const t = useT();
    const [values, setValues] = useState<
        Omit<PollFormValues, 'questions'> & { questions: DraftQuestion[] }
    >(() => {
        const start = { ...EMPTY_POLL, ...initial };
        return {
            ...start,
            questions: (start.questions.length
                ? start.questions
                : [emptyQuestion()]
            ).map(withKey),
        };
    });
    const [errors, setErrors] = useState<Errors>({});
    const [submitting, setSubmitting] = useState(false);
    // Den nyss tillagda frågan får fokus så att läraren kan skriva direkt.
    const [addedKey, setAddedKey] = useState<number | null>(null);
    const multiple = values.questions.length > 1;

    const update = (patch: Partial<typeof values>) => {
        setValues((current) => ({ ...current, ...patch }));
        setErrors({});
    };

    const updateQuestion = (index: number, patch: Partial<PollFormQuestion>) =>
        update({
            questions: values.questions.map((question, i) =>
                i === index ? { ...question, ...patch } : question,
            ),
        });

    const setOption = (index: number, optionIndex: number, value: string) =>
        updateQuestion(index, {
            options: values.questions[index].options.map((option, i) =>
                i === optionIndex ? value : option,
            ),
        });

    const removeOption = (index: number, optionIndex: number) =>
        updateQuestion(index, {
            options: values.questions[index].options.filter(
                (_, i) => i !== optionIndex,
            ),
        });

    const addQuestion = () => {
        const question = withKey(emptyQuestion());
        setAddedKey(question.key);
        update({ questions: [...values.questions, question] });
    };

    const removeQuestion = (index: number) => {
        const question = values.questions[index];
        const hasContent =
            question.question.trim() !== '' ||
            question.options.some((option) => option.trim() !== '');
        if (
            hasContent &&
            !window.confirm(
                t('polls.confirm_remove_question', { n: index + 1 }),
            )
        ) {
            return;
        }
        update({ questions: values.questions.filter((_, i) => i !== index) });
    };

    const moveQuestion = (index: number, offset: -1 | 1) => {
        const target = index + offset;
        if (target < 0 || target >= values.questions.length) return;
        const questions = [...values.questions];
        [questions[index], questions[target]] = [
            questions[target],
            questions[index],
        ];
        update({ questions });
    };

    const validateQuestion = (
        question: DraftQuestion,
    ): { errors: QuestionErrors; options: string[] } => {
        const next: QuestionErrors = {};
        // Tomma rader hoppas över i stället för att stoppa sparandet.
        const options = question.options
            .map((option) => option.trim())
            .filter(Boolean);

        if (!question.question.trim()) {
            next.question = t('polls.validation.question_text_required');
        }

        if (values.type === 'multiple_choice') {
            if (options.length < 2) {
                next.options = t('polls.validation.min_options_summary');
            }
            const seen = new Map<string, number>();
            const duplicates: number[] = [];
            question.options.forEach((option, index) => {
                const key = option.trim().toLowerCase();
                if (!key) return;
                const first = seen.get(key);
                if (first !== undefined) {
                    duplicates.push(first, index);
                } else {
                    seen.set(key, index);
                }
            });
            if (duplicates.length) {
                next.duplicates = duplicates;
                next.options ??= t('polls.validation.duplicate_option');
            }
        }

        return { errors: next, options };
    };

    const validate = (): PollPayload | null => {
        const next: Errors = {};
        const title = values.title.trim();
        if (!title) next.title = t('polls.validation.title_required');

        const checked = values.questions.map(validateQuestion);
        checked.forEach((result, index) => {
            if (Object.keys(result.errors).length) {
                next.questions ??= {};
                next.questions[index] = result.errors;
            }
        });

        setErrors(next);
        if (Object.keys(next).length) return null;

        return {
            title,
            description: values.description.trim() || null,
            type: values.type,
            settings: { theme: values.theme },
            questions: values.questions.map((question, index) => ({
                question_text: question.question.trim(),
                options:
                    values.type === 'multiple_choice'
                        ? checked[index].options
                        : [],
            })),
        };
    };

    const submit = async (secondary: boolean) => {
        const payload = validate();
        if (!payload || submitting) return;
        setSubmitting(true);
        try {
            await onSubmit(payload, secondary);
        } finally {
            setSubmitting(false);
        }
    };

    const typeChoices: {
        value: PollType;
        icon: typeof BarChart3;
    }[] = [
        { value: 'multiple_choice', icon: BarChart3 },
        { value: 'word_cloud', icon: Cloud },
    ];

    return (
        <form
            className="grid gap-6"
            onSubmit={(event) => {
                event.preventDefault();
                void submit(false);
            }}
        >
            <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                    {t('polls.title_label')}
                </span>
                <input
                    className="w-full rounded-md border bg-background px-3 py-2"
                    placeholder={t('polls.poll_title_placeholder')}
                    value={values.title}
                    maxLength={255}
                    aria-invalid={!!errors.title}
                    onChange={(event) => update({ title: event.target.value })}
                />
                {errors.title ? (
                    <span className="text-sm text-red-600">{errors.title}</span>
                ) : (
                    <span className="text-xs text-muted-foreground">
                        {t('polls.title_help')}
                    </span>
                )}
            </label>

            <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-sm font-medium">
                    {t('polls.type_label')}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                    {typeChoices.map(({ value, icon: Icon }) => {
                        const selected = values.type === value;
                        return (
                            <label
                                key={value}
                                className={`flex cursor-pointer gap-3 rounded-lg border-2 p-3 transition-colors ${
                                    selected
                                        ? 'border-foreground bg-muted/60'
                                        : 'border-border hover:border-muted-foreground/40'
                                }`}
                            >
                                <input
                                    type="radio"
                                    name="poll-type"
                                    value={value}
                                    checked={selected}
                                    className="sr-only"
                                    onChange={() =>
                                        update({
                                            type: value,
                                            questions: values.questions.map(
                                                (question) =>
                                                    value ===
                                                        'multiple_choice' &&
                                                    question.options.length < 2
                                                        ? {
                                                              ...question,
                                                              options: ['', ''],
                                                          }
                                                        : question,
                                            ),
                                        })
                                    }
                                />
                                <Icon className="mt-0.5 size-5 shrink-0" />
                                <span className="grid gap-0.5">
                                    <span className="font-medium">
                                        {t(`polls.types.${value}`)}
                                    </span>
                                    <span className="text-xs text-muted-foreground">
                                        {t(`polls.type_help.${value}`)}
                                    </span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            </fieldset>

            {values.questions.map((question, index) => {
                const questionErrors = errors.questions?.[index] ?? {};
                const number = index + 1;
                return (
                    <div
                        key={question.key}
                        role="group"
                        aria-labelledby={`question-label-${question.key}`}
                        className={`grid gap-4 ${
                            multiple ? 'rounded-xl border p-4' : ''
                        }`}
                    >
                        <div className="flex items-center justify-between gap-2">
                            <label
                                id={`question-label-${question.key}`}
                                htmlFor={`question-${question.key}`}
                                className="text-sm font-medium"
                            >
                                {multiple
                                    ? t('polls.question_number_label', {
                                          n: number,
                                      })
                                    : t('polls.question_label')}
                            </label>
                            {multiple ? (
                                <span className="flex gap-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t(
                                            'polls.move_question_up',
                                            { n: number },
                                        )}
                                        title={t('polls.move_question_up', {
                                            n: number,
                                        })}
                                        disabled={index === 0}
                                        onClick={() => moveQuestion(index, -1)}
                                    >
                                        <ArrowUp />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t(
                                            'polls.move_question_down',
                                            { n: number },
                                        )}
                                        title={t('polls.move_question_down', {
                                            n: number,
                                        })}
                                        disabled={
                                            index ===
                                            values.questions.length - 1
                                        }
                                        onClick={() => moveQuestion(index, 1)}
                                    >
                                        <ArrowDown />
                                    </Button>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        aria-label={t('polls.remove_question', {
                                            n: number,
                                        })}
                                        title={t('polls.remove_question', {
                                            n: number,
                                        })}
                                        onClick={() => removeQuestion(index)}
                                    >
                                        <Trash2 />
                                    </Button>
                                </span>
                            ) : null}
                        </div>
                        <div className="-mt-2 grid gap-1.5">
                            <textarea
                                id={`question-${question.key}`}
                                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-lg"
                                placeholder={t('polls.question_placeholder')}
                                value={question.question}
                                maxLength={500}
                                rows={2}
                                autoFocus={question.key === addedKey}
                                aria-invalid={!!questionErrors.question}
                                onChange={(event) =>
                                    updateQuestion(index, {
                                        question: event.target.value,
                                    })
                                }
                            />
                            {questionErrors.question ? (
                                <span className="text-sm text-red-600">
                                    {questionErrors.question}
                                </span>
                            ) : null}
                        </div>

                        {values.type === 'multiple_choice' ? (
                            <OptionList
                                questionNumber={number}
                                options={question.options}
                                errors={questionErrors}
                                onChange={(optionIndex, value) =>
                                    setOption(index, optionIndex, value)
                                }
                                onRemove={(optionIndex) =>
                                    removeOption(index, optionIndex)
                                }
                                onAdd={() =>
                                    updateQuestion(index, {
                                        options: [...question.options, ''],
                                    })
                                }
                            />
                        ) : null}
                    </div>
                );
            })}

            {values.questions.length < MAX_QUESTIONS ? (
                <div className="grid gap-1.5 border-t pt-4">
                    <Button
                        type="button"
                        variant="secondary"
                        className="justify-self-start"
                        onClick={addQuestion}
                    >
                        <Plus />
                        {t('polls.add_question')}
                    </Button>
                    {!multiple ? (
                        <span className="text-xs text-muted-foreground">
                            {t('polls.add_question_help')}
                        </span>
                    ) : null}
                </div>
            ) : null}

            <fieldset className="grid gap-2">
                <legend className="mb-1.5 text-sm font-medium">
                    {t('themes.label')}
                </legend>
                <ThemePicker
                    value={values.theme}
                    onChange={(theme) => update({ theme })}
                />
                <span className="text-xs text-muted-foreground">
                    {t('themes.help')}
                </span>
            </fieldset>

            <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                    {t('polls.description_label')}
                </span>
                <textarea
                    className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                    placeholder={t('polls.description_placeholder')}
                    value={values.description}
                    maxLength={5000}
                    rows={2}
                    onChange={(event) =>
                        update({ description: event.target.value })
                    }
                />
            </label>

            {errors.questions && multiple ? (
                <p className="text-sm text-red-600">
                    {t('polls.validation.check_questions')}
                </p>
            ) : null}

            <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={submitting}>
                    {submitting ? submittingLabel : submitLabel}
                </Button>
                {secondaryLabel ? (
                    <Button
                        type="button"
                        variant="outline"
                        disabled={submitting}
                        onClick={() => void submit(true)}
                    >
                        {secondaryLabel}
                    </Button>
                ) : null}
                {onCancel ? (
                    <Button
                        type="button"
                        variant="ghost"
                        disabled={submitting}
                        onClick={onCancel}
                    >
                        {t('polls.cancel')}
                    </Button>
                ) : null}
            </div>
        </form>
    );
}

function OptionList({
    questionNumber,
    options,
    errors,
    onChange,
    onRemove,
    onAdd,
}: {
    questionNumber: number;
    options: string[];
    errors: QuestionErrors;
    onChange: (index: number, value: string) => void;
    onRemove: (index: number) => void;
    onAdd: () => void;
}) {
    const t = useT();

    return (
        <div
            className="grid gap-2"
            role="group"
            aria-label={t('polls.options_for_question', {
                n: questionNumber,
            })}
        >
            <span className="text-sm font-medium">
                {t('polls.options_label')}
            </span>
            {options.map((option, index) => {
                const duplicate = errors.duplicates?.includes(index);
                return (
                    <div key={index} className="flex items-center gap-2">
                        <span
                            className="flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-bold text-white"
                            style={{
                                backgroundColor: optionColor(index),
                            }}
                            aria-hidden
                        >
                            {optionLetter(index)}
                        </span>
                        <input
                            className={`w-full rounded-md border bg-background px-3 py-2 ${
                                duplicate ? 'border-red-500' : ''
                            }`}
                            placeholder={t('polls.option_placeholder', {
                                n: index + 1,
                            })}
                            value={option}
                            maxLength={255}
                            aria-invalid={duplicate}
                            onChange={(event) =>
                                onChange(index, event.target.value)
                            }
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={t('polls.remove_option', {
                                n: index + 1,
                            })}
                            title={t('polls.remove_option', {
                                n: index + 1,
                            })}
                            disabled={options.length <= 2}
                            onClick={() => onRemove(index)}
                        >
                            <X />
                        </Button>
                    </div>
                );
            })}
            {errors.options ? (
                <span className="text-sm text-red-600">{errors.options}</span>
            ) : null}
            {options.length < MAX_OPTIONS ? (
                <Button
                    type="button"
                    variant="outline"
                    className="justify-self-start"
                    onClick={onAdd}
                >
                    <Plus />
                    {t('polls.add_option')}
                </Button>
            ) : null}
        </div>
    );
}
