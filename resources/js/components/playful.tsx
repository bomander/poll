import '../../css/playful.css';

import { type ReactNode } from 'react';

/** Ram för elevernas sidor i det tema läraren har valt för enkäten. */
export function PlayfulPage({
    theme,
    children,
}: {
    theme?: string | null;
    children: ReactNode;
}) {
    return (
        <div
            className="playful relative min-h-dvh px-4 py-8 sm:py-12"
            data-theme={theme ?? undefined}
        >
            <div className="playful-shapes" aria-hidden>
                <span />
                <span />
                <span />
                <span />
            </div>
            <div className="relative z-10 mx-auto max-w-lg">{children}</div>
        </div>
    );
}

/** Tre studsande prickar medan eleven väntar på läraren. */
export function WaitingDots() {
    return (
        <div className="toy-dots" aria-hidden>
            <span />
            <span />
            <span />
        </div>
    );
}
