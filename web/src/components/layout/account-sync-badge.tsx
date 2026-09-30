import { Cloud, CloudOff, LoaderCircle, TriangleAlert } from "lucide-react";
import { Tooltip } from "antd";
import { useTranslation } from "react-i18next";

import { MAIN_SITE_NAME } from "@/constant/runtime-config";
import { cn } from "@/lib/utils";
import { useAccountSyncStore } from "@/stores/use-account-sync-store";
import { useConfigStore } from "@/stores/use-config-store";

/** One-line status of syncing favorites / drafts with the main-site account. */
export function AccountSyncBadge({ className }: { className?: string }) {
    const { t } = useTranslation();
    const status = useAccountSyncStore((state) => state.status);
    const error = useAccountSyncStore((state) => state.error);
    const openConfigDialog = useConfigStore((state) => state.openConfigDialog);
    const base = cn("inline-flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400", className);

    if (status === "off") {
        return (
            <button type="button" className={cn(base, "hover:text-stone-800 dark:hover:text-stone-200")} onClick={() => openConfigDialog(false)} data-testid="account-sync-badge">
                <CloudOff className="size-3.5" />
                {t("accountSync.off", { site: MAIN_SITE_NAME })}
            </button>
        );
    }
    if (status === "error") {
        return (
            <Tooltip title={error}>
                <span className={cn(base, "text-amber-600 dark:text-amber-400")} data-testid="account-sync-badge">
                    <TriangleAlert className="size-3.5" />
                    {t("accountSync.error")}
                </span>
            </Tooltip>
        );
    }
    return (
        <span className={base} data-testid="account-sync-badge">
            {status === "syncing" ? <LoaderCircle className="size-3.5 animate-spin" /> : <Cloud className="size-3.5" />}
            {status === "syncing" ? t("accountSync.syncing") : t("accountSync.synced", { site: MAIN_SITE_NAME })}
        </span>
    );
}
