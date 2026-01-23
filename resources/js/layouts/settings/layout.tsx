import { type PropsWithChildren } from 'react';

import Heading from '@/components/heading';
import { useT } from '@/lib/i18n';

export default function SettingsLayout({ children }: PropsWithChildren) {
    const t = useT();

    // When server-side rendering, we only render the layout on the client...
    if (typeof window === 'undefined') {
        return null;
    }

    return (
        <div className="px-4 py-6">
            <Heading
                title={t('settings.appearance.title')}
                description={t('settings.appearance.description')}
            />

            <div className="flex flex-col">
                <div className="flex-1 md:max-w-2xl">
                    <section className="max-w-xl space-y-12">{children}</section>
                </div>
            </div>
        </div>
    );
}
