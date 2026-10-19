import { BarChart3, Cloud, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { useT } from '@/lib/i18n';
import { optionColor, optionLetter, type PollType } from '@/lib/poll';

export type PollFormValues = {
    title: string;
    description: string;
    type: PollType;
    question: string;
    options: string[];
};

export type PollPayload = {
    title: string;
    description: string | null;
    type: PollType;
    questions: { question_text: string; options: string[] }[];
};

type Errors = {
    title?: string;
    question?: string;
    options?: string;
    duplicates?: number[];
};

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

export const EMPTY_POLL: PollFormValues = {
    title: '',
    description: '',
    type: 'multiple_choice',
    question: '',
    options: ['', ''],
};

export function PollForm({
    initial,
    submitLabel,
    submittingLabel,
    secondaryLabel,
    onSubmit,
    onCancel,
}: Props) {
    const t = useT();
    const [values, setValues] = useState<PollFormValues>({
        ...EMPTY_POLL,
        ...initial,
    });
    const [errors, setErrors] = useState<Errors>({});
    const [submitting, setSubmitting] = useState(false);

    const update = (patch: Partial<PollFormValues>) => {
        setValues((current) => ({ ...current, ...patch }));
        setErrors({});
    };

    const setOption = (index: number, value: string) =>
        update({
            options: values.options.map((option, i) =>
                i === index ? value : option,
            ),
        });

    const removeOption = (index: number) =>
        update({ options: values.options.filter((_, i) => i !== index) });

    const validate = (): PollPayload | null => {
        const next: Errors = {};
        const title = values.title.trim();
        const question = values.question.trim();
        // Tomma rader hoppas över i stället för att stoppa sparandet.
        const options = values.options
            .map((option) => option.trim())
            .filter(Boolean);

        if (!title) next.title = t('polls.validation.title_required');
        if (!question) {
            next.question = t('polls.validation.question_text_required');
        }

        if (values.type === 'multiple_choice') {
            if (options.length < 2) {
                next.options = t('polls.validation.min_options_summary');
            }
            const seen = new Map<string, number>();
            const duplicates: number[] = [];
            values.options.forEach((option, index) => {
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

        setErrors(next);
        if (Object.keys(next).length) return null;

        return {
            title,
            description: values.description.trim() || null,
            type: values.type,
            questions: [
                {
                    question_text: question,
                    options: values.type === 'multiple_choice' ? options : [],
                },
            ],
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
                                            options:
                                                value === 'multiple_choice' &&
                                                values.options.length < 2
                                                    ? ['', '']
                                                    : values.options,
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

            <label className="grid gap-1.5">
                <span className="text-sm font-medium">
                    {t('polls.question_label')}
                </span>
                <textarea
                    className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-lg"
                    placeholder={t('polls.question_placeholder')}
                    value={values.question}
                    maxLength={500}
                    rows={2}
                    aria-invalid={!!errors.question}
                    onChange={(event) =>
                        update({ question: event.target.value })
                    }
                />
                {errors.question ? (
                    <span className="text-sm text-red-600">
                        {errors.question}
                    </span>
                ) : null}
            </label>

            {values.type === 'multiple_choice' ? (
                <fieldset className="grid gap-2">
                    <legend className="mb-1.5 text-sm font-medium">
                        {t('polls.options_label')}
                    </legend>
                    {values.options.map((option, index) => {
                        const duplicate = errors.duplicates?.includes(index);
                        return (
                            <div
                                key={index}
                                className="flex items-center gap-2"
                            >
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
                                        setOption(index, event.target.value)
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
                                    disabled={values.options.length <= 2}
                                    onClick={() => removeOption(index)}
                                >
                                    <X />
                                </Button>
                            </div>
                        );
                    })}
                    {errors.options ? (
                        <span className="text-sm text-red-600">
                            {errors.options}
                        </span>
                    ) : null}
                    {values.options.length < MAX_OPTIONS ? (
                        <Button
                            type="button"
                            variant="outline"
                            className="justify-self-start"
                            onClick={() =>
                                update({ options: [...values.options, ''] })
                            }
                        >
                            <Plus />
                            {t('polls.add_option')}
                        </Button>
                    ) : null}
                </fieldset>
            ) : null}

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
