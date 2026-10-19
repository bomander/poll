import { Head, usePage } from '@inertiajs/react';
import { ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';

import {
    PollForm,
    type PollFormValues,
    type PollPayload,
} from '@/components/poll-form';
import { Button } from '@/components/ui/button';
import AppLayout from '@/layouts/app-layout';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { type Poll } from '@/lib/poll';

type PageProps = { basePath: string; pollId: number };

export default function PollEdit() {
    const { basePath, pollId } = usePage<PageProps>().props;
    const t = useT();
    const [poll, setPoll] = useState<Poll | null>(null);
    const [error, setError] = useState<string | null>(null);
    const backToList = () => window.location.assign(`${basePath}/polls`);

    useEffect(() => {
        apiFetch(`${basePath}/api/polls/${pollId}`)
            .then(async (res) => {
                if (!res.ok) throw new Error();
                setPoll((await res.json()) as Poll);
            })
            .catch(() => setError(t('polls.errors.load_poll')));
    }, [pollId, basePath, t]);

    const save = async (payload: PollPayload) => {
        setError(null);
        const res = await apiFetch(`${basePath}/api/polls/${pollId}`, {
            method: 'PUT',
            body: JSON.stringify(payload),
        });
        if (!res.ok) {
            setError(
                res.status === 409
                    ? t('polls.errors.locked')
                    : t('polls.errors.save_poll'),
            );
            return;
        }
        backToList();
    };

    const question = poll?.questions[0];
    const initial: Partial<PollFormValues> | undefined = poll
        ? {
              title: poll.title,
              description: poll.description ?? '',
              type: poll.type ?? 'multiple_choice',
              question: question?.question_text ?? '',
              options:
                  (poll.type ?? 'multiple_choice') === 'multiple_choice'
                      ? (question?.options.map((o) => o.option_text) ?? [
                            '',
                            '',
                        ])
                      : ['', ''],
          }
        : undefined;

    return (
        <AppLayout>
            <Head title={t('polls.edit_title')} />
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
                <div>
                    <Button
                        variant="ghost"
                        size="sm"
                        className="-ml-2"
                        onClick={backToList}
                    >
                        <ArrowLeft />
                        {t('polls.back')}
                    </Button>
                    <h1 className="mt-2 text-2xl font-semibold">
                        {t('polls.edit_title')}
                    </h1>
                </div>
                {error ? (
                    <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        {error}
                    </p>
                ) : null}
                {poll?.sessions_count ? (
                    <section className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
                        {t('polls.history_locked_edit')}
                    </section>
                ) : poll ? (
                    <section className="rounded-xl border p-6">
                        <PollForm
                            initial={initial}
                            submitLabel={t('polls.save')}
                            submittingLabel={t('polls.saving')}
                            onSubmit={save}
                            onCancel={backToList}
                        />
                    </section>
                ) : error ? null : (
                    <p className="text-sm text-muted-foreground">
                        {t('session.loading')}
                    </p>
                )}
            </div>
        </AppLayout>
    );
}
