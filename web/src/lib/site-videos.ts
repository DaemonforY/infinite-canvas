import localforage from "localforage";

import { getMediaBlob, resolveMediaUrl } from "@/services/file-storage";
import { useAssetStore, type VideoAsset } from "@/stores/use-asset-store";
import { withLocalProxy } from "@/stores/use-config-store";

// Videos already on this site, for publishing a video work: the video workbench's generation
// history and the video assets, each with the prompt / model it was made with.

export type SiteVideo = {
    id: string;
    src: string;
    /** Set when the clip is stored in this browser (no download needed). */
    storageKey?: string;
    prompt: string;
    model: string;
    params: Record<string, unknown>;
    durationMs: number;
    width: number;
    height: number;
    createdAt: number;
    source: "video_workbench" | "asset";
};

type StoredVideo = { url?: string; storageKey?: string; durationMs?: number; width?: number; height?: number };
type StoredLog = {
    id?: string;
    createdAt?: number;
    prompt?: string;
    title?: string;
    model?: string;
    size?: string;
    resolution?: string;
    seconds?: string;
    status?: string;
    config?: { videoModel?: string; model?: string };
    video?: StoredVideo;
};

// Same database as the video workbench (pages/video).
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "video_generation_logs" });

/** Finished clips of the video workbench, newest first. */
export async function loadWorkbenchVideos(): Promise<SiteVideo[]> {
    const logs: StoredLog[] = [];
    try {
        await logStore.iterate<StoredLog, void>((value) => {
            logs.push(value);
        });
    } catch {
        return [];
    }
    const out: SiteVideo[] = [];
    for (const log of logs) {
        const video = log.video;
        if (log.status === "failed" || !video || (!video.storageKey && !video.url)) continue;
        const src = await resolveMediaUrl(video.storageKey, video.url || "");
        if (!src) continue;
        out.push({
            id: `vlog:${log.id || out.length}`,
            src,
            storageKey: video.storageKey || undefined,
            prompt: log.prompt || log.title || "",
            model: log.model || log.config?.videoModel || log.config?.model || "",
            params: { ...(log.size ? { size: log.size } : {}), ...(log.resolution ? { resolution: log.resolution } : {}), ...(log.seconds ? { seconds: log.seconds } : {}) },
            durationMs: video.durationMs || 0,
            width: video.width || 0,
            height: video.height || 0,
            createdAt: log.createdAt || 0,
            source: "video_workbench",
        });
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Video assets (我的资产), newest first. */
export function loadAssetVideos(): SiteVideo[] {
    return useAssetStore
        .getState()
        .assets.filter((asset): asset is VideoAsset => asset.kind === "video" && Boolean(asset.data.url || asset.data.storageKey))
        .map((asset) => ({
            id: `vasset:${asset.id}`,
            src: asset.data.url,
            storageKey: asset.data.storageKey,
            prompt: typeof asset.metadata?.prompt === "string" ? asset.metadata.prompt : asset.note || "",
            model: typeof asset.metadata?.model === "string" ? asset.metadata.model : "",
            params: {},
            durationMs: 0,
            width: asset.data.width,
            height: asset.data.height,
            createdAt: Date.parse(asset.createdAt) || 0,
            source: "asset" as const,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
}

/** The clip as a Blob: from this browser's storage when kept here, else downloaded. */
export async function loadVideoBlob(src: string, storageKey?: string): Promise<Blob> {
    if (storageKey) {
        const stored = await getMediaBlob(storageKey);
        if (stored) return stored;
    }
    const res = await fetch(withLocalProxy(src));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.blob();
}

/**
 * Draws a cover from a frame of the clip (a local Blob, so the canvas is not tainted): at ~1s, or
 * a tenth of the way in for short clips. Also reports the clip's duration and size.
 */
export function captureVideoFrame(blob: Blob, maxWidth = 1280): Promise<{ cover: Blob; durationMs: number; width: number; height: number }> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(blob);
        const video = document.createElement("video");
        let settled = false;
        const finish = (error?: Error, value?: { cover: Blob; durationMs: number; width: number; height: number }) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            URL.revokeObjectURL(url);
            if (error || !value) reject(error || new Error("frame"));
            else resolve(value);
        };
        const timer = setTimeout(() => finish(new Error("timeout")), 15000);
        video.muted = true;
        video.playsInline = true;
        video.preload = "auto";
        video.onerror = () => finish(new Error("decode"));
        video.onloadedmetadata = () => {
            const duration = Number.isFinite(video.duration) ? video.duration : 0;
            video.currentTime = duration > 0 ? Math.min(1, duration / 10) : 0;
        };
        video.onseeked = () => {
            const width = video.videoWidth;
            const height = video.videoHeight;
            if (!width || !height) return finish(new Error("size"));
            const scale = Math.min(1, maxWidth / width);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(width * scale);
            canvas.height = Math.round(height * scale);
            const ctx = canvas.getContext("2d");
            if (!ctx) return finish(new Error("canvas"));
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            canvas.toBlob((cover) => (cover ? finish(undefined, { cover, durationMs: Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : 0, width, height }) : finish(new Error("encode"))), "image/jpeg", 0.88);
        };
        video.src = url;
    });
}

/** "0:05", "1:23". */
export function formatClipDuration(ms: number): string {
    const total = Math.max(0, Math.round(ms / 1000));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
