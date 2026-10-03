import localforage from "localforage";

import { previewUrlFor, resolveImageUrl } from "@/services/image-storage";
import { useAssetStore, type ImageAsset } from "@/stores/use-asset-store";

// Images already on this site, for the publish dialog's "从站内选择" picker: the image
// workbench's generation history and the image assets. Each keeps the prompt / model it was made
// with, so a batch publish can give every work its own.

export type SiteImage = {
    id: string;
    src: string;
    /** Small preview for the picker grid (falls back to src). */
    thumb: string;
    prompt: string;
    model: string;
    params: Record<string, unknown>;
    createdAt: number;
    source: "image_workbench" | "asset";
};

type StoredLogImage = { id?: string; dataUrl?: string; storageKey?: string };
type StoredLog = {
    id?: string;
    createdAt?: number;
    prompt?: string;
    title?: string;
    model?: string;
    size?: string;
    quality?: string;
    config?: { imageModel?: string; model?: string; size?: string; quality?: string };
    images?: StoredLogImage[];
};

// Same database as the image workbench (pages/image).
const logStore = localforage.createInstance({ name: "infinite-canvas", storeName: "image_generation_logs" });

/** Generation history of the image workbench, newest first, one entry per image. */
export async function loadWorkbenchImages(): Promise<SiteImage[]> {
    const logs: StoredLog[] = [];
    try {
        await logStore.iterate<StoredLog, void>((value) => {
            logs.push(value);
        });
    } catch {
        return [];
    }
    const out: SiteImage[] = [];
    for (const log of logs) {
        const size = log.size || log.config?.size;
        const quality = log.quality || log.config?.quality;
        for (const [i, image] of (log.images || []).entries()) {
            if (!image.dataUrl && !image.storageKey) continue;
            const src = await resolveImageUrl(image.storageKey, image.dataUrl || "");
            if (!src) continue;
            out.push({
                id: `log:${log.id || ""}:${image.id || i}`,
                src,
                thumb: previewUrlFor(image.storageKey) || src,
                prompt: log.prompt || log.title || "",
                model: log.model || log.config?.imageModel || log.config?.model || "",
                params: { ...(size ? { size } : {}), ...(quality ? { quality } : {}) },
                createdAt: log.createdAt || 0,
                source: "image_workbench",
            });
        }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt);
}

/** Image assets (我的资产), newest first. */
export function loadAssetImages(): SiteImage[] {
    return useAssetStore
        .getState()
        .assets.filter((asset): asset is ImageAsset => asset.kind === "image" && Boolean(asset.data.dataUrl))
        .map((asset) => ({
            id: `asset:${asset.id}`,
            src: asset.data.dataUrl,
            thumb: previewUrlFor(asset.data.storageKey) || asset.data.dataUrl,
            prompt: typeof asset.metadata?.prompt === "string" ? asset.metadata.prompt : asset.note || "",
            model: typeof asset.metadata?.model === "string" ? asset.metadata.model : "",
            params: {},
            createdAt: Date.parse(asset.createdAt) || 0,
            source: "asset" as const,
        }))
        .sort((a, b) => b.createdAt - a.createdAt);
}
