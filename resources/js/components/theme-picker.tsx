import '../../css/playful.css';

import { usePage } from '@inertiajs/react';
import { Check } from 'lucide-react';
import { useState } from 'react';

import { apiFetch } from '@/lib/api';
import { useT } from '@/lib/i18n';
import { THEMES, readableInk, themeColor, type ThemeKey } from '@/lib/themes';

type Props = {
    value: ThemeKey;
    onChange: (theme: ThemeKey) => void;
    disabled?: boolean;
};

/** Rutnät med en liten förhandsvisning av varje tema. */
export function ThemePicker({ value, onChange, disabled = false }: Props) {
    const t = useT();

    return (
        <div
            role="radiogroup"
            aria-label={t('themes.label')}
            className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-2"
        >
            {THEMES.map((theme) => {
                const selected = theme.key === value;
                return (
                    <button
                        key={theme.key}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={t(`themes.names.${theme.key}`)}
                        disabled={disabled}
                        onClick={() => onChange(theme.key)}
                        className={`relative overflow-hidden rounded-lg border-2 text-left transition-colors disabled:opacity-60 ${
                            selected
                                ? 'border-foreground'
                                : 'border-border hover:border-muted-foreground/50'
                        }`}
                    >
                        <span
                            className="playful flex h-16 flex-col justify-between p-2"
                            data-theme={theme.key}
                            aria-hidden
                        >
                            <span className="font-toy text-lg leading-none">
                                Aa
                            </span>
                            <span className="flex gap-1">
                                {[0, 1, 2, 3].map((index) => {
                                    const color = themeColor(theme, index);
                                    return (
                                        <span
                                            key={index}
                                            className="flex size-4 items-center justify-center rounded-[min(var(--btn-radius),4px)] border border-[var(--line)] text-[9px] font-bold"
                                            style={{
                                                backgroundColor: color,
                                                color: readableInk(
                                                    theme,
                                                    color,
                                                ),
                                            }}
                                        />
                                    );
                                })}
                            </span>
                        </span>
                        <span className="flex items-center justify-between gap-1 bg-background px-2 py-1 text-xs font-medium">
                            {t(`themes.names.${theme.key}`)}
                            {selected ? <Check className="size-3.5" /> : null}
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

/**
 * Byter tema på en enkät direkt. Fungerar även när enkäten är låst efter
 * en omgång, eftersom temat bara påverkar utseendet.
 */
export function ThemeSwitcher({
    pollId,
    value,
    compact = false,
    onChanged,
}: {
    pollId: number;
    value: ThemeKey;
    compact?: boolean;
    onChanged: (theme: ThemeKey) => void;
}) {
    const { basePath } = usePage<{ basePath: string }>().props;
    const t = useT();
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<'saved' | 'failed' | null>(null);

    const change = async (theme: ThemeKey) => {
        if (theme === value || saving) return;
        setSaving(true);
        setStatus(null);
        try {
            const res = await apiFetch(
                `${basePath}/api/polls/${pollId}/theme`,
                {
                    method: 'PATCH',
                    body: JSON.stringify({ theme }),
                },
            );
            if (!res.ok) throw new Error();
            onChanged(theme);
            setStatus('saved');
        } catch {
            setStatus('failed');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="grid gap-1.5">
            {compact ? (
                <label className="grid gap-1.5 text-sm">
                    <span className="font-medium">{t('themes.label')}</span>
                    <select
                        className="w-full rounded-md border bg-background px-3 py-2"
                        value={value}
                        disabled={saving}
                        onChange={(event) =>
                            void change(event.target.value as ThemeKey)
                        }
                    >
                        {THEMES.map((theme) => (
                            <option key={theme.key} value={theme.key}>
                                {t(`themes.names.${theme.key}`)}
                            </option>
                        ))}
                    </select>
                </label>
            ) : (
                <ThemePicker
                    value={value}
                    disabled={saving}
                    onChange={(theme) => void change(theme)}
                />
            )}
            {status ? (
                <p
                    role="status"
                    className={`text-xs ${status === 'failed' ? 'text-red-600' : 'text-muted-foreground'}`}
                >
                    {status === 'failed'
                        ? t('session.theme_failed')
                        : t('themes.changed')}
                </p>
            ) : null}
        </div>
    );
}
