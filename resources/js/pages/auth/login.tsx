import { Head } from '@inertiajs/react';
import AuthLayout from '@/layouts/auth-layout';
import { register } from '@/routes';

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
    return (
        <AuthLayout title="Log in to your account" description="Use Basen to authenticate">
            <Head title="Log in" />

            <div className="mb-4">
                <a
                    href="/auth/basen/redirect"
                    className="block w-full rounded-md bg-black px-4 py-2 text-center text-white"
                >
                    Sign in with Basen
                </a>
            </div>
            {canRegister && (
                <div className="text-center text-sm text-muted-foreground">
                    Don't have an account?{' '}
                    <a className="underline" href={register()}>
                        Sign up
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
