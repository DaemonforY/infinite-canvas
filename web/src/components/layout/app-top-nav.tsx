import { Bot, ChevronDown, Menu } from "lucide-react";
import { Button, Dropdown, Tooltip } from "antd";
import { Link, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { AppConfigModal } from "@/components/layout/app-config-modal";
import { ContestSubmitModal } from "@/components/contest/contest-submit-modal";
import { PublishWorkDialog } from "@/components/community/publish-work-dialog";
import { MyPromptDialog } from "@/components/prompts/my-prompt-dialog";
import { QuickStartDialog } from "@/components/onboarding/quick-start-dialog";
import { SetupBanner } from "@/components/onboarding/setup-banner";
import { MobileNavDrawer } from "@/components/layout/mobile-nav-drawer";
import { UserStatusActions } from "@/components/layout/user-status-actions";
import { cn } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { useAgentStore } from "@/stores/use-agent-store";

export function AppTopNav() {
    const { t } = useTranslation();
    const { pathname } = useLocation();
    const [mobileNavOpen, setMobileNavOpen] = useState(false);
    const autoConnectRef = useRef(false);
    const agentToken = useAgentStore((state) => state.token);
    const agentEnabled = useAgentStore((state) => state.enabled);
    const agentConnected = useAgentStore((state) => state.connected);
    const connectAgent = useAgentStore((state) => state.connectAgent);
    const togglePanel = useAgentStore((state) => state.togglePanel);
    const panelOpen = useAgentStore((state) => state.panelOpen);
    const hideHeader = /^\/canvas\/[^/]+/.test(pathname);
    const slug = pathname.split("/").filter(Boolean)[0];
    const activeToolSlug = navigationTools.some((tool) => tool.slug === slug) ? (slug as NavigationToolSlug) : undefined;
    const moreActive = navigationTools.some((tool) => !tool.primary && tool.slug === activeToolSlug);

    useEffect(() => {
        if (autoConnectRef.current || agentEnabled || agentConnected || !agentToken.trim()) return;
        autoConnectRef.current = true;
        connectAgent({ silent: true });
    }, [agentConnected, agentEnabled, agentToken, connectAgent]);

    return (
        <>
            {!hideHeader ? (
                <header className="sticky top-0 z-20 h-14 shrink-0 border-b border-stone-200 bg-background/90 backdrop-blur-xl dark:border-stone-800">
                    <div className="mx-auto flex h-full max-w-7xl items-stretch justify-between gap-2 px-3 sm:gap-5 sm:px-6">
                        <div className="flex min-w-0 items-center">
                            <Link to="/" className="flex h-full shrink-0 items-center gap-2 text-sm font-semibold leading-none tracking-tight text-stone-950 transition hover:text-stone-600 dark:text-stone-100 dark:hover:text-stone-300">
                                <span
                                    className="size-5 shrink-0 bg-current"
                                    style={{
                                        mask: "url(/logo.svg) center / contain no-repeat",
                                        WebkitMask: "url(/logo.svg) center / contain no-repeat",
                                    }}
                                />
                                <span className="text-base font-medium">{t("meta.title")}</span>
                            </Link>

                            <button
                                type="button"
                                className="ml-1.5 inline-flex size-8 shrink-0 items-center justify-center text-stone-600 transition hover:text-stone-950 md:hidden dark:text-stone-300 dark:hover:text-white"
                                onClick={() => setMobileNavOpen(true)}
                                aria-label={t("topNav.openMenu")}
                                title={t("topNav.menu")}
                            >
                                <Menu className="size-5" />
                            </button>

                            <nav className="hide-scrollbar ml-8 hidden h-14 min-w-0 items-center gap-7 overflow-x-auto md:flex">
                                {navigationTools
                                    .filter((tool) => tool.primary)
                                    .map((tool) => {
                                        const Icon = tool.icon;
                                        const active = tool.slug === activeToolSlug;
                                        return (
                                            <Link key={tool.slug} to={`/${tool.slug}`} className={navItemClass(active)}>
                                                <Icon className="size-4" />
                                                <span className="truncate">{t(`navigation.${tool.slug}`)}</span>
                                            </Link>
                                        );
                                    })}
                                <Dropdown
                                    trigger={["click", "hover"]}
                                    menu={{
                                        selectedKeys: activeToolSlug ? [activeToolSlug] : [],
                                        items: navigationTools
                                            .filter((tool) => !tool.primary)
                                            .map((tool) => {
                                                const Icon = tool.icon;
                                                return { key: tool.slug, icon: <Icon className="size-4" />, label: <Link to={`/${tool.slug}`}>{t(`navigation.${tool.slug}`)}</Link> };
                                            }),
                                    }}
                                >
                                    <button type="button" className={navItemClass(moreActive)} data-testid="nav-more">
                                        <span>{t("topNav.more")}</span>
                                        <ChevronDown className="size-3.5" />
                                    </button>
                                </Dropdown>
                            </nav>
                        </div>

                        <div className="my-auto flex h-9 shrink-0 items-center justify-end gap-1 justify-self-end whitespace-nowrap sm:gap-2">
                            <Tooltip title={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")}>
                                <Button type="text" shape="circle" className="!h-8 !w-8 !min-w-8" icon={<Bot className="size-4" />} onClick={togglePanel} aria-label={t(panelOpen ? "topNav.closeAgent" : "topNav.openAgent")} />
                            </Tooltip>
                            <UserStatusActions collapseOnMobile />
                        </div>
                    </div>
                </header>
            ) : null}
            {!hideHeader ? <SetupBanner /> : null}

            <MobileNavDrawer open={mobileNavOpen} activeToolSlug={activeToolSlug} onClose={() => setMobileNavOpen(false)} />
            <AppConfigModal />
            <ContestSubmitModal />
            <PublishWorkDialog />
            <MyPromptDialog />
            <QuickStartDialog />
        </>
    );
}

function navItemClass(active: boolean) {
    return cn(
        "relative flex h-14 shrink-0 items-center gap-2 text-sm leading-6 transition after:absolute after:inset-x-0 after:bottom-0 after:h-px",
        active ? "font-medium text-stone-950 after:bg-stone-950 dark:text-stone-100 dark:after:bg-stone-100" : "text-stone-500 after:bg-transparent hover:text-stone-950 dark:text-stone-400 dark:hover:text-stone-100",
    );
}
