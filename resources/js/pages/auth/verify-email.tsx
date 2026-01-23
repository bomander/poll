// Components
import { Form, Head } from '@inertiajs/react';

import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import AuthLayout from '@/layouts/auth-layout';
import { logout } from '@/routes';
import { send } from '@/routes/verification';
import { useT } from '@/lib/i18n';

export default function VerifyEmail({ status }: { status?: string }) {
    const t = useT();

    return (
        <AuthLayout
            title={t('auth.verify_email.title')}
            description={t('auth.verify_email.description')}
        >
            <Head title={t('auth.verify_email.head')} />

            {status === 'verification-link-sent' && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {t('auth.verify_email.sent_notice')}
                </div>
            )}

            <Form {...send.form()} className="space-y-6 text-center">
                {({ processing }) => (
                    <>
                        <Button disabled={processing} variant="secondary">
                            {processing && <Spinner />}
                            {t('auth.verify_email.resend')}
                        </Button>

                        <TextLink
                            href={logout.url()}
                            method="post"
                            as="button"
                            className="mx-auto block text-sm"
                        >
                            {t('auth.verify_email.log_out')}
                        </TextLink>
                    </>
                )}
            </Form>
        </AuthLayout>
    );
}
