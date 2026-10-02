import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";

import { useAssetStore } from "@/stores/use-asset-store";
import { useCanvasStore } from "@/stores/canvas/use-canvas-store";
import { useCloudSyncEnabled, useCloudSyncStore } from "@/stores/use-cloud-sync-store";

const CHANGED_INTERVAL_MS = 10 * 60 * 1000;
const IDLE_INTERVAL_MS = 30 * 60 * 1000;

/**
 * Automatic cloud sync for users who turned it on: when the app opens, when leaving a canvas, every
 * 10 minutes if something changed here and every 30 minutes anyway (to pick up other devices). Never
 * while a canvas is open — the editor holds its own copy of that canvas.
 */
export function CloudAutoSync() {
    const enabled = useCloudSyncEnabled();
    const { pathname } = useLocation();
    const inCanvas = /^\/canvas\/[^/]+/.test(pathname);
    const inCanvasRef = useRef(inCanvas);
    const lastRunRef = useRef(0);
    const dirtyRef = useRef(false);

    useEffect(() => {
        const markDirty = () => {
            dirtyRef.current = true;
        };
        const offCanvas = useCanvasStore.subscribe((state, prev) => state.projects !== prev.projects && markDirty());
        const offAssets = useAssetStore.subscribe((state, prev) => state.assets !== prev.assets && markDirty());
        return () => {
            offCanvas();
            offAssets();
        };
    }, []);

    useEffect(() => {
        if (!enabled) return;
        const run = () => {
            if (inCanvasRef.current || useCloudSyncStore.getState().syncing) return;
            lastRunRef.current = Date.now();
            dirtyRef.current = false;
            // Failures show in the sync panel; the next run retries.
            void useCloudSyncStore
                .getState()
                .sync()
                .catch(() => undefined);
        };
        const leftCanvas = inCanvasRef.current && !inCanvas;
        inCanvasRef.current = inCanvas;
        if (!inCanvas && (lastRunRef.current === 0 || leftCanvas)) run();
        const timer = window.setInterval(() => {
            const since = Date.now() - lastRunRef.current;
            if ((dirtyRef.current && since >= CHANGED_INTERVAL_MS) || since >= IDLE_INTERVAL_MS) run();
        }, 60 * 1000);
        return () => window.clearInterval(timer);
    }, [enabled, inCanvas]);

    return null;
}
