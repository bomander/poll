import { type CSSProperties } from 'react';

import { OPTION_COLORS } from '@/lib/poll';

export type ThemeKey =
    | 'lekfullt'
    | 'rymd'
    | 'skog'
    | 'hav'
    | 'pixel'
    | 'tavla'
    | 'arena'
    | 'pastell'
    | 'tidning'
    | 'bauhaus'
    | 'klar';

/**
 * Hur svarsalternativen ritas: fyllda knappar, konturer eller vita kort med
 * färgad bokstav.
 */
type OptionStyle = 'filled' | 'outlined' | 'card';

type Theme = {
    key: ThemeKey;
    options: string[];
    optionStyle: OptionStyle;
    /** Typsnittet som ordmolnet ritas med på projektorn. */
    cloudFont: string;
    /** Mörk och ljus text att välja mellan på färgade ytor. */
    darkInk: string;
    lightInk: string;
    /** Kortet är mörkt och texten på det ljus. */
    darkCard?: boolean;
};

export const THEMES: Theme[] = [
    {
        key: 'lekfullt',
        options: OPTION_COLORS,
        optionStyle: 'filled',
        cloudFont: "'Fredoka Variable'",
        darkInk: '#2b2140',
        lightInk: '#fff',
    },
    {
        key: 'rymd',
        darkCard: true,
        options: [
            '#4dd4ff',
            '#ff5fa2',
            '#ffd166',
            '#7cf29a',
            '#b18cff',
            '#ff8a5c',
            '#5ee6d0',
            '#f7a8ff',
        ],
        optionStyle: 'outlined',
        cloudFont: "'Space Grotesk Variable'",
        darkInk: '#0f1535',
        lightInk: '#fff',
    },
    {
        key: 'skog',
        options: [
            '#3f6b3a',
            '#8a5a2b',
            '#2f6f8f',
            '#a8432f',
            '#6b5b95',
            '#8f6a12',
            '#2e7d6b',
            '#7a4b6e',
        ],
        optionStyle: 'filled',
        cloudFont: "'Fraunces Variable'",
        darkInk: '#23361f',
        lightInk: '#fff',
    },
    {
        key: 'hav',
        options: [
            '#0b5d8f',
            '#d9483b',
            '#0b7a75',
            '#b5591a',
            '#5a4fcf',
            '#a3326b',
            '#3d7f2a',
            '#1f6fb5',
        ],
        optionStyle: 'filled',
        cloudFont: "'Lexend Variable'",
        darkInk: '#08344f',
        lightInk: '#fff',
    },
    {
        key: 'pixel',
        darkCard: true,
        options: [
            '#29adff',
            '#ff004d',
            '#00e436',
            '#ffa300',
            '#ff77a8',
            '#ffec27',
            '#83769c',
            '#ab5236',
        ],
        optionStyle: 'filled',
        cloudFont: "'Silkscreen'",
        darkInk: '#1d2b53',
        lightInk: '#fff1e8',
    },
    {
        key: 'tavla',
        darkCard: true,
        options: [
            '#a7d3f5',
            '#f4a6b8',
            '#f6e27a',
            '#b9e4a3',
            '#d2b8f2',
            '#f7c58f',
            '#9fe0dc',
            '#f4f1e6',
        ],
        optionStyle: 'outlined',
        cloudFont: "'Patrick Hand'",
        darkInk: '#25372d',
        lightInk: '#fff',
    },
    {
        key: 'arena',
        options: [
            '#1f5fbf',
            '#d62828',
            '#f2b705',
            '#2a8a3f',
            '#6a2c91',
            '#e06c00',
            '#00838f',
            '#111111',
        ],
        optionStyle: 'card',
        cloudFont: "'Anton'",
        darkInk: '#123d1a',
        lightInk: '#fff',
    },
    {
        key: 'pastell',
        options: [
            '#bfe8d4',
            '#d9cdf6',
            '#ffd9c7',
            '#bfe0f6',
            '#fff1b8',
            '#f7c6d9',
            '#d6efc2',
            '#e6d5c3',
        ],
        optionStyle: 'filled',
        cloudFont: "'Quicksand Variable'",
        darkInk: '#4a2747',
        lightInk: '#fff',
    },
    {
        key: 'tidning',
        options: [
            '#161616',
            '#c8102e',
            '#1f3a5f',
            '#5a5a5a',
            '#7a1f1f',
            '#2f4f3f',
            '#7a5f12',
            '#3d2a5c',
        ],
        optionStyle: 'outlined',
        cloudFont: "'Playfair Display Variable'",
        darkInk: '#161616',
        lightInk: '#fff',
    },
    {
        key: 'bauhaus',
        options: [
            '#1f4fa8',
            '#e63a2e',
            '#f2b705',
            '#141414',
            '#2f8f5b',
            '#ef7d00',
            '#6b4fa0',
            '#00838f',
        ],
        optionStyle: 'filled',
        cloudFont: "'Jost Variable'",
        darkInk: '#141414',
        lightInk: '#fff',
    },
    {
        key: 'klar',
        options: [
            '#000000',
            '#0050c8',
            '#b00020',
            '#00704a',
            '#5b2a86',
            '#8a4b00',
            '#004d61',
            '#333333',
        ],
        optionStyle: 'card',
        cloudFont: "'Atkinson Hyperlegible'",
        darkInk: '#000',
        lightInk: '#fff',
    },
];

export const DEFAULT_THEME: ThemeKey = 'lekfullt';

export function getTheme(key: string | null | undefined): Theme {
    return THEMES.find((theme) => theme.key === key) ?? THEMES[0];
}

export function themeColor(theme: Theme, index: number): string {
    return theme.options[index % theme.options.length];
}

function luminance(hex: string): number {
    const short = hex.replace('#', '');
    // Både "#fff" och "#ffffff" förekommer.
    const value =
        short.length === 3
            ? short
                  .split('')
                  .map((digit) => digit + digit)
                  .join('')
            : short;
    const channels = [0, 2, 4].map((start) => {
        const channel = parseInt(value.slice(start, start + 2), 16) / 255;
        return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Den av temats mörka och ljusa textfärg som syns bäst på färgen. */
export function readableInk(theme: Theme, background: string): string {
    const bg = luminance(background);
    const contrast = (ink: string) => {
        const fg = luminance(ink);
        return (Math.max(bg, fg) + 0.05) / (Math.min(bg, fg) + 0.05);
    };
    return contrast(theme.darkInk) >= contrast(theme.lightInk)
        ? theme.darkInk
        : theme.lightInk;
}

/** Stil för ett svarsalternativ i elevvyn, utifrån temats knappstil. */
export function optionButtonStyle(
    theme: Theme,
    index: number,
    selected: boolean,
): { button: CSSProperties; letter: CSSProperties } {
    const color = themeColor(theme, index);
    const onColor = readableInk(theme, color);

    if (theme.optionStyle === 'filled') {
        return {
            button: {
                '--toy': color,
                '--toy-text': onColor,
            } as CSSProperties,
            // Bokstaven får knappens textfärg som bakgrund, så den syns i alla teman.
            letter: {
                backgroundColor: onColor,
                color,
                borderColor: 'var(--line)',
            },
        };
    }

    // Konturer och kort visar texten i temats egen färg, och färgen i bokstaven.
    return {
        button: {
            '--toy': selected ? `${color}33` : 'var(--card)',
            '--toy-text': 'var(--ink)',
            ...(theme.optionStyle === 'outlined'
                ? { '--toy-line': color }
                : {}),
        } as CSSProperties,
        letter: {
            backgroundColor: color,
            color: onColor,
            borderColor:
                theme.optionStyle === 'outlined' ? color : 'var(--line)',
        },
    };
}
