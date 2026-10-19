import { usePage } from '@inertiajs/react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';

type Props = {
    poll: { id: number; title: string } | null;
    onOpenChange: (open: boolean) => void;
};

/**
 * Startar en omgång för en enkät. Har enkäten redan en pågående omgång
 * öppnas den i stället, så att läraren aldrig fastnar på ett felmeddelande.
 */
export function StartSessionDialog({ poll, onOpenChange }: Props) {
    const { basePath } = usePage<{ basePath: string }>().props;
    const t = useT();
    const [name, setName] = useState('');
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const close = (open: boolean) => {
        if (!open) {
            setName('');
            setError(null);
        }
        onOpenChange(open);
    };

    const start = async (event: React.FormEvent) => {
        event.preventDefault();
        if (!poll || starting) return;
        setStarting(true);
        setError(null);
        try {
            const res = await apiFetch(
                `${basePath}/api/polls/${poll.id}/sessions`,
                {
                    method: 'POST',
                    body: JSON.stringify({ name: name.trim() || null }),
                },
            );
            const data = (await res.json().catch(() => ({}))) as {
                id?: number;
                session_id?: number;
            };
            const sessionId = res.ok
                ? data.id
                : res.status === 409
                  ? data.session_id
                  : undefined;
            if (!sessionId) {
                throw new Error();
            }
            window.location.assign(`${basePath}/sessions/${sessionId}`);
        } catch {
            setError(t('start.failed'));
            setStarting(false);
        }
    };

    return (
        <Dialog open={poll !== null} onOpenChange={close}>
            <DialogContent className="sm:max-w-md">
                <form onSubmit={start} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>{t('start.title')}</DialogTitle>
                        <DialogDescription>
                            <span className="font-medium text-foreground">
                                {poll?.title}
                            </span>
                            <br />
                            {t('start.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <label className="grid gap-1.5 text-sm">
                        <span className="font-medium">
                            {t('start.name_label')}
                        </span>
                        <input
                            className="w-full rounded-md border bg-background px-3 py-2"
                            placeholder={t('start.name_placeholder')}
                            value={name}
                            maxLength={255}
                            autoFocus
                            onChange={(event) => setName(event.target.value)}
                        />
                        <span className="text-xs text-muted-foreground">
                            {t('start.name_help')}
                        </span>
                    </label>
                    {error ? (
                        <p className="text-sm text-red-600">{error}</p>
                    ) : null}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => close(false)}
                        >
                            {t('start.cancel')}
                        </Button>
                        <Button type="submit" disabled={starting}>
                            {starting ? t('start.starting') : t('start.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
