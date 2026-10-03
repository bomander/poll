import { Head, usePage } from '@inertiajs/react';

export default function PublicSeo() {
    const { seo } = usePage<{
        seo?: { title: string; description: string; canonical: string };
    }>().props;
    if (!seo) return null;

    return (
        <Head title={seo.title}>
            <meta
                name="description"
                content={seo.description}
                head-key="description"
            />
            <link rel="canonical" href={seo.canonical} head-key="canonical" />
        </Head>
    );
}
