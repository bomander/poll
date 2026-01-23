import { Head, usePage } from '@inertiajs/react';

import AppearanceTabs from '@/components/appearance-tabs';
import HeadingSmall from '@/components/heading-small';
import AppLayout from '@/layouts/app-layout';
import SettingsLayout from '@/layouts/settings/layout';
import { useT } from '@/lib/i18n';
import { type BreadcrumbItem, type SharedData } from '@/types';

type PageProps = SharedData & { basePath: string };

export default function SettingsIndex() {
    const { basePath } = usePage<PageProps>().props;
    const t = useT();

    const breadcrumbs: BreadcrumbItem[] = [
        {
            title: t('settings.app.breadcrumb'),
            href: `${basePath}/settings`,
        },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={t('settings.app.head')} />

            <h1 className="sr-only">{t('settings.app.sr_title')}</h1>

            <SettingsLayout>
                <div className="space-y-10">
                    <HeadingSmall
                        title={t('settings.app.title')}
                        description={t('settings.app.description')}
                    />

                    <div className="space-y-6">
                        <HeadingSmall
                            title={t('settings.appearance.title')}
                            description={t('settings.appearance.description')}
                        />
                        <AppearanceTabs />
                    </div>

                    <div className="space-y-2 text-sm text-muted-foreground">
                        <p>{t('settings.app.poll_defaults_placeholder')}</p>
                    </div>
                </div>
            </SettingsLayout>
        </AppLayout>
    );
}

