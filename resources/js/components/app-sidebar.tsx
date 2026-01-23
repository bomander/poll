import { Link, usePage } from '@inertiajs/react';
import { BarChart3, LayoutGrid, Radio, Shield } from 'lucide-react';

import { NavMain } from '@/components/nav-main';
import { NavUser } from '@/components/nav-user';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
} from '@/components/ui/sidebar';
import { type NavItem } from '@/types';

import AppLogo from './app-logo';

type PageProps = {
    basePath: string;
    auth: { user: { is_admin?: boolean } | null };
};

export function AppSidebar() {
    const { basePath, auth } = usePage<PageProps>().props;

    const mainNavItems: NavItem[] = [
        {
            title: 'Dashboard',
            href: `${basePath}/dashboard`,
            icon: LayoutGrid,
        },
        {
            title: 'Mina polls',
            href: `${basePath}/polls`,
            icon: BarChart3,
        },
        {
            title: 'Sessions',
            href: `${basePath}/sessions`,
            icon: Radio,
        },
    ];

    if (auth.user?.is_admin) {
        mainNavItems.push({
            title: 'Admin',
            href: `${basePath}/admin`,
            icon: Shield,
        });
    }

    return (
        <Sidebar collapsible="icon" variant="inset">
            <SidebarHeader>
                <SidebarMenu>
                    <SidebarMenuItem>
                        <SidebarMenuButton size="lg" asChild>
                            <Link href={`${basePath}/dashboard`} prefetch>
                                <AppLogo />
                            </Link>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarHeader>

            <SidebarContent>
                <NavMain items={mainNavItems} />
            </SidebarContent>

            <SidebarFooter>
                <NavUser />
            </SidebarFooter>
        </Sidebar>
    );
}
