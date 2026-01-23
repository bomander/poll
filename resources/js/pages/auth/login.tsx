import { Head } from '@inertiajs/react';
import AuthLayout from '@/layouts/auth-layout';
import { register } from '@/routes';
import { useT } from '@/lib/i18n';

interface LoginProps {
    status?: string;
    canResetPassword: boolean;
    canRegister: boolean;
}

export default function Login({
    status,
    canResetPassword,
    canRegister,
}: LoginProps) {
    const t = useT();

    return (
        <AuthLayout
            title={t('auth.login.title')}
            description={t('auth.login.description')}
        >
            <Head title={t('auth.login.head')} />

            <div className="mb-4">
                <a
                    href="/auth/basen/redirect"
                    className="block w-full rounded-md bg-black px-4 py-2 text-center text-white"
                >
                    {t('auth.login.sign_in_with_basen')}
                </a>
            </div>
            {canRegister && (
                <div className="text-center text-sm text-muted-foreground">
                    {t('auth.login.no_account')}{' '}
                    <a className="underline" href={register.url()}>
                        {t('auth.login.sign_up')}
                    </a>
                </div>
            )}

            {status && (
                <div className="mb-4 text-center text-sm font-medium text-green-600">
                    {status}
                </div>
            )}
        </AuthLayout>
    );
}
