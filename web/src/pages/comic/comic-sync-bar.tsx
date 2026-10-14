import { App, Button } from "antd";
import { Cloud, LogIn, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useMainSiteSignIn } from "@/components/layout/use-main-site-sign-in";
import { useCloudSyncEnabled, useCloudSyncStore } from "@/stores/use-cloud-sync-store";
import { useMainAccountStore } from "@/stores/use-main-account-store";

/** 画漫画 on another device: comics and 我的角色 ride along with the canvas cloud sync (opt-in per account). */
export function ComicSyncBar() {
    const { t, i18n } = useTranslation();
    const { message, modal } = App.useApp();
    const { signIn } = useMainSiteSignIn();
    const userId = useMainAccountStore((state) => (state.status === "signedIn" ? state.account?.user_id || 0 : 0));
    const enabled = useCloudSyncEnabled();
    const { syncing, error, lastSyncedAt, lastUserId, setEnabled, sync } = useCloudSyncStore();
    const last = userId ? lastSyncedAt[userId] : "";

    const runSync = async () => {
        try {
            const result = await sync();
            if (result) message.success(t("comic.sync.done", { count: result.comics }));
        } catch (err) {
            message.error((err as Error).message || t("config.cloud.failed"));
        }
    };

    const enable = () => {
        const apply = () => {
            setEnabled(userId, true);
            void runSync();
        };
        // This device last synced with another account: merging its data into this one needs a yes.
        if (lastUserId && lastUserId !== userId) {
            modal.confirm({ title: t("config.cloud.otherAccountTitle"), content: t("config.cloud.otherAccount"), okText: t("config.cloud.enable"), cancelText: t("common.cancel"), onOk: apply });
            return;
        }
        apply();
    };

    const time = last ? new Date(last).toLocaleString(i18n.resolvedLanguage, { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "";

    return (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl bg-violet-50 px-3 py-2 text-xs text-stone-600 dark:bg-violet-950/30 dark:text-stone-300" data-testid="comic-sync-bar">
            <Cloud className="size-4 shrink-0 text-violet-500" />
            <span className="min-w-0 flex-1">
                {!userId ? t("comic.sync.signInHint") : !enabled ? t("comic.sync.offHint") : syncing ? t("comic.sync.syncing") : error ? <span className="text-red-500">{error}</span> : time ? t("comic.sync.on", { time }) : t("comic.sync.onNever")}
            </span>
            {!userId ? (
                <Button size="small" type="primary" icon={<LogIn className="size-3.5" />} onClick={signIn}>
                    {t("comic.sync.signIn")}
                </Button>
            ) : !enabled ? (
                <Button size="small" type="primary" icon={<Cloud className="size-3.5" />} onClick={enable} data-testid="comic-sync-enable">
                    {t("comic.sync.enable")}
                </Button>
            ) : (
                <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={syncing} onClick={() => void runSync()} data-testid="comic-sync-now">
                    {t("comic.sync.now")}
                </Button>
            )}
        </div>
    );
}
