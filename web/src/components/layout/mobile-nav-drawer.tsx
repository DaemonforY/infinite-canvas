import { Drawer } from "antd";
import { Home } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { navigationTools, type NavigationToolSlug } from "@/constant/navigation-tools";
import { MAIN_SITE_NAME, PARTNER_SITES, mainSiteLink, partnerSiteLink } from "@/constant/runtime-config";
import { cn } from "@/lib/utils";
import { UserStatusActions } from "./user-status-actions";

type MobileNavDrawerProps = {
    open: boolean;
    activeToolSlug?: NavigationToolSlug;
    onClose: () => void;
};

export function MobileNavDrawer({ open, activeToolSlug, onClose }: MobileNavDrawerProps) {
    const { t } = useTranslation();

    return (
        <Drawer title={t("topNav.navigation")} placement="left" size={280} open={open} onClose={onClose} className="md:hidden">
            <div className="space-y-1">
                {navigationTools.map((tool, index) => {
                    const Icon = tool.icon;
                    const active = tool.slug === activeToolSlug;
                    const firstMore = !tool.primary && navigationTools[index - 1]?.primary;
                    return (
                        <Link
                            key={tool.slug}
                            to={`/${tool.slug}`}
                            onClick={onClose}
                            className={cn(
                                "flex items-center gap-3 rounded-lg px-3 py-3 text-base transition",
                                firstMore && "mt-2 border-t border-stone-200 pt-4 dark:border-stone-800",
                                active ? "bg-stone-100 font-medium text-stone-950 dark:bg-stone-800 dark:text-stone-100" : "text-stone-600 hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100",
                            )}
                        >
                            <Icon className="size-5" />
                            <span>{t(`navigation.${tool.slug}`)}</span>
                        </Link>
                    );
                })}
                <a
                    href={mainSiteLink("/", "mobile-nav")}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onClose}
                    className="mt-2 flex items-center gap-3 rounded-lg border-t border-stone-200 px-3 pt-4 pb-3 text-base text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                >
                    <Home className="size-5" />
                    <span>{t("topNav.mainSite", { site: MAIN_SITE_NAME })}</span>
                </a>
                {PARTNER_SITES.map((site) => (
                    <a
                        key={site.url}
                        href={partnerSiteLink(site, "/", "mobile-nav")}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={onClose}
                        className="flex items-center gap-3 rounded-lg px-3 py-3 text-base text-stone-600 transition hover:bg-stone-100 hover:text-stone-950 dark:text-stone-300 dark:hover:bg-stone-800 dark:hover:text-stone-100"
                    >
                        <Home className="size-5 opacity-60" />
                        <span>{t("topNav.partnerSite", { site: site.name })}</span>
                    </a>
                ))}
            </div>
            {/* Docs, language, skin, theme, version: collapsed out of the phone top bar. */}
            <div className="mt-4 border-t border-stone-200 px-2 pt-4 dark:border-stone-800" data-testid="mobile-nav-actions">
                <UserStatusActions showConfig={false} expanded />
            </div>
        </Drawer>
    );
}
