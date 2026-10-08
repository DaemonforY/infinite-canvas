import { useEffect, useRef } from "react";
import { App, Button } from "antd";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";

import { pollAnimationJobs, syncAnimationJobs, useAnimationStore, type JobOutcome } from "@/stores/use-animation-store";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import { useConfigStore } from "@/stores/use-config-store";

const POLL_MS = 3000;

/**
 * Keeps AI 动画 server jobs moving on every page: files results that finished while the canvas was
 * closed, polls the ones still running and says so when one ends while the user is elsewhere.
 */
export function AnimationJobWatcher() {
    const { notification } = App.useApp();
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { pathname } = useLocation();
    const pathnameRef = useRef(pathname);
    pathnameRef.current = pathname;
    const hasKey = useConfigStore((state) => Boolean(findMainSiteApiKey(state.config)));
    const waiting = useAnimationStore((state) => state.logs.some((log) => log.pending?.jobId));

    const announce = (outcomes: JobOutcome[]) => {
        if (pathnameRef.current.startsWith("/animation")) return;
        for (const { log, status } of outcomes) {
            if (status === "canceled") continue;
            const key = `animation-${log.id}`;
            notification[status === "succeeded" ? "success" : "error"]({
                key,
                message: status === "succeeded" ? t("animation.notifyDone") : t("animation.notifyFailed"),
                description: log.title,
                actions: (
                    <Button
                        type="primary"
                        size="small"
                        onClick={() => {
                            notification.destroy(key);
                            navigate(`/animation?log=${encodeURIComponent(log.id)}`);
                        }}
                    >
                        {t("animation.notifyOpen")}
                    </Button>
                ),
                duration: 8,
            });
        }
    };
    const announceRef = useRef(announce);
    announceRef.current = announce;
    const mountedRef = useRef(true);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    // On start, when the key changes and when the tab comes back: pick up jobs from other sessions.
    useEffect(() => {
        void useAnimationStore.getState().load();
        if (!hasKey) return;
        const sync = () =>
            void syncAnimationJobs()
                .then((outcomes) => announceRef.current(outcomes))
                .catch(() => undefined);
        sync();
        const onVisible = () => document.visibilityState === "visible" && sync();
        document.addEventListener("visibilitychange", onVisible);
        return () => document.removeEventListener("visibilitychange", onVisible);
    }, [hasKey]);

    useEffect(() => {
        if (!waiting) return;
        let stopped = false;
        let timer = 0;
        const tick = async () => {
            if (document.visibilityState === "visible") {
                const outcomes = await pollAnimationJobs().catch(() => []);
                // Filing the last result ends this effect (nothing is waiting any more) before we get
                // here, so only an unmounted watcher stays quiet.
                if (mountedRef.current) announceRef.current(outcomes);
            }
            if (!stopped) timer = window.setTimeout(() => void tick(), POLL_MS);
        };
        timer = window.setTimeout(() => void tick(), POLL_MS);
        return () => {
            stopped = true;
            window.clearTimeout(timer);
        };
    }, [waiting]);

    return null;
}
