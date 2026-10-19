import '../../css/playful.css';

import { type ReactNode } from 'react';

/** Ram för elevernas sidor: krämvit bakgrund med stora färgade former. */
export function PlayfulPage({ children }: { children: ReactNode }) {
    return (
        <div className="playful relative min-h-dvh px-4 py-8 sm:py-12">
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
