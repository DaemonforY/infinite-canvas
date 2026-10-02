import type { CSSProperties } from "react";
import { Dropdown, type MenuProps } from "antd";
import { BookOpen, Check, Ellipsis, Home, Keyboard, Languages, Palette, Puzzle, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";

import { swatchStyle } from "@/components/layout/skin-picker";
import { VersionReleaseDialog } from "@/components/layout/version-release-modal";
import { APP_VERSION, DOCS_URL } from "@/constant/env";
import { MAIN_SITE_NAME, mainSiteLink } from "@/constant/runtime-config";
import { useVersionCheck } from "@/hooks/use-version-check";
import { changeAppLocale, type AppLocale } from "@/i18n";
import { SKIN_NAMES } from "@/lib/skins";
import { useThemeStore } from "@/stores/use-theme-store";

type MoreActionsMenuProps = {
    className?: string;
    style?: CSSProperties;
    /** "canvas-nav" on the canvas page, "top-nav" elsewhere (UTM medium of the main-site link). */
    medium: string;
    onOpenShortcuts?: () => void;
    onOpenPlugins?: () => void;
};

/** 「更多」: the less frequent top-bar actions, with labels, behind one button. */
export function MoreActionsMenu({ className, style, medium, onOpenShortcuts, onOpenPlugins }: MoreActionsMenuProps) {
    const { i18n, t } = useTranslation();
    const skin = useThemeStore((state) => state.skin);
    const setSkin = useThemeStore((state) => state.setSkin);
    const version = useVersionCheck();
    const locale = i18n.resolvedLanguage as AppLocale;
    const nextLocale = locale === "zh-CN" ? "en-US" : "zh-CN";
    const icon = (Icon: typeof BookOpen) => <Icon className="size-4" />;

    const items: MenuProps["items"] = [
        ...(onOpenPlugins ? [{ key: "plugins", icon: icon(Puzzle), label: t("topNav.plugins"), onClick: onOpenPlugins }] : []),
        ...(onOpenShortcuts ? [{ key: "shortcuts", icon: icon(Keyboard), label: t("topNav.shortcuts"), onClick: onOpenShortcuts }] : []),
        ...(onOpenPlugins || onOpenShortcuts ? [{ type: "divider" as const }] : []),
        {
            key: "skin",
            icon: icon(Palette),
            label: t("skins.title"),
            children: SKIN_NAMES.map((name) => ({
                key: `skin:${name}`,
                label: (
                    <span className="flex items-center gap-2">
                        <span className="shrink-0 rounded-full ring-1 ring-black/10" style={{ ...swatchStyle(name), display: "inline-block", width: 14, height: 14 }} />
                        <span className="flex-1">{t(`skins.names.${name}`)}</span>
                        {name === skin ? <Check className="size-3.5" /> : <span className="w-3.5" />}
                    </span>
                ),
                onClick: () => setSkin(name),
            })),
        },
        { key: "language", icon: icon(Languages), label: t("topNav.switchLanguage", { language: t(nextLocale === "zh-CN" ? "locale.zhCN" : "locale.enUS") }), onClick: () => void changeAppLocale(nextLocale) },
        { type: "divider" },
        {
            key: "docs",
            icon: icon(BookOpen),
            label: (
                <a href={DOCS_URL} target="_blank" rel="noopener noreferrer">
                    {t("topNav.docs")}
                </a>
            ),
        },
        {
            key: "main-site",
            icon: icon(Home),
            label: (
                <a href={mainSiteLink("/", medium)} target="_blank" rel="noopener noreferrer">
                    {t("topNav.mainSite", { site: MAIN_SITE_NAME })}
                </a>
            ),
        },
        {
            key: "version",
            icon: icon(Sparkles),
            label: (
                <span className="flex items-center gap-2">
                    {t("topNav.whatsNew")}
                    <span className="text-xs opacity-50">{APP_VERSION}</span>
                    {version.hasNewVersion ? <span className="size-1.5 rounded-full bg-green-500" /> : null}
                </span>
            ),
            onClick: version.openReleaseModal,
        },
    ];

    return (
        <>
            <Dropdown trigger={["click"]} placement="bottomRight" menu={{ items }}>
                <button type="button" className={className} style={style} aria-label={t("topNav.more")} title={t("topNav.more")} data-testid="top-nav-more">
                    <span className="relative inline-flex">
                        <Ellipsis className="size-4" />
                        {version.hasNewVersion ? <span className="absolute -right-1 -top-1 size-1.5 rounded-full bg-green-500" /> : null}
                    </span>
                </button>
            </Dropdown>
            <VersionReleaseDialog state={version} />
        </>
    );
}
