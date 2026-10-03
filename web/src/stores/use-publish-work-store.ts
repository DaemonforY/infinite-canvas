import { create } from "zustand";

import type { PublishSource } from "@/services/api/community";

export type PublishWorkPayload = {
    /** Images to publish: any URL the canvas can fetch (data:, blob:, remote). Empty: pick files. */
    images?: string[];
    prompt?: string;
    model?: string;
    params?: Record<string, unknown>;
    title?: string;
    source: PublishSource;
    remixOf?: number;
    /** A web-page work: the site it presents; html (when known) draws the cover. */
    site?: PublishSite;
    html?: string;
    /** A video work: the clip to publish (its cover is drawn from a frame). */
    video?: PublishVideo;
};

export type PublishVideo = { src: string; durationMs?: number };

export type PublishSite = { id: number; title: string; url: string };

type PublishWorkStore = {
    payload: PublishWorkPayload | null;
    open: (payload: PublishWorkPayload) => void;
    close: () => void;
};

/** Opens the shared "发布作品" dialog from any image surface. */
export const usePublishWorkStore = create<PublishWorkStore>()((set) => ({
    payload: null,
    open: (payload) => set({ payload }),
    close: () => set({ payload: null }),
}));
