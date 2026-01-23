import { usePage } from '@inertiajs/react';

type TranslationValue = string | Record<string, TranslationValue>;
type Translations = Record<string, TranslationValue>;
type Replacements = Record<string, string | number>;

function getNestedValue(translations: Translations | undefined, key: string): unknown {
    if (!translations) return undefined;
    return key.split('.').reduce<unknown>((value, part) => {
        if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
            return (value as Record<string, unknown>)[part];
        }
        return undefined;
    }, translations);
}

function applyReplacements(template: string, replacements?: Replacements): string {
    if (!replacements) return template;
    return Object.entries(replacements).reduce((result, [name, value]) => {
        return result.replaceAll(`:${name}`, String(value));
    }, template);
}

export function translate(translations: Translations | undefined, key: string, replacements?: Replacements): string {
    const value = getNestedValue(translations, key);
    if (typeof value !== 'string') return key;
    return applyReplacements(value, replacements);
}

export function useT() {
    const { translations } = usePage<{ translations?: Translations }>().props;
    return (key: string, replacements?: Replacements) => translate(translations, key, replacements);
}

