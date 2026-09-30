import { useState } from "react";
import { KeyRound, X } from "lucide-react";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { hasAnyApiKey, useConfigStore } from "@/stores/use-config-store";

const DISMISS_KEY = "canvas-setup-banner-dismissed";

/** Slim reminder under the top nav until the user has connected a key (dismissible per session). */
export function SetupBanner() {
    const { t } = useTranslation();
    const config = useConfigStore((state) => state.config);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const [dismissed, setDismissed] = useState(() => typeof sessionStorage !== "undefined" && sessionStorage.getItem(DISMISS_KEY) === "1");

    if (dismissed || hasAnyApiKey(config)) return null;

    return (
        <div className="shrink-0 border-b border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100" data-testid="setup-banner">
            <div className="mx-auto flex max-w-7xl items-center gap-3 px-6 py-2 text-sm">
                <KeyRound className="size-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate">{t("quickStart.bannerText", { site: MAIN_SITE_NAME })}</span>
                <button type="button" className="shrink-0 rounded-md bg-amber-900 px-3 py-1 text-xs font-medium text-amber-50 hover:bg-amber-800 dark:bg-amber-200 dark:text-amber-950" onClick={() => openConfigDialog(false)}>
                    {t("quickStart.bannerCta")}
                </button>
                <button
                    type="button"
                    className="shrink-0 rounded p-1 opacity-60 hover:opacity-100"
                    aria-label={t("quickStart.bannerDismiss")}
                    onClick={() => {
                        sessionStorage.setItem(DISMISS_KEY, "1");
                        setDismissed(true);
                    }}
                >
                    <X className="size-3.5" />
                </button>
            </div>
        </div>
    );
}
