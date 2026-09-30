import { useEffect, useMemo } from "react";

import { canonicalJson, DRAFTS_NAMESPACE, FAVORITES_NAMESPACE, mergeDraftsDocs, mergeFavoritesDocs, readDraftsDoc, readFavoritesDoc, type DraftsDoc, type FavoritesDoc } from "@/lib/account-sync";
import { APP_BLOB_MAX_BYTES, downloadAppBlob, getAppState, putAppState, uploadAppBlob } from "@/services/api/main-site-app-state";
import { getImageBlob, uploadImage } from "@/services/image-storage";
import type { DraftReference } from "@/lib/workbench-drafts";
import { findMainSiteApiKey } from "@/services/api/main-site-contests";
import type { Prompt } from "@/services/api/prompts";
import { useAccountSyncStore } from "@/stores/use-account-sync-store";
import { useConfigStore } from "@/stores/use-config-store";
import { usePromptLibraryStore } from "@/stores/use-prompt-library-store";
import { localNewDraftEntry, pendingReferenceUploads, useWorkbenchDraftStore, type WorkbenchKind } from "@/stores/use-workbench-draft-store";

const KINDS = ["image", "video"] as const;
const PERIODIC_MS = 2 * 60 * 1000;
const FOCUS_MIN_GAP_MS = 20 * 1000;

/**
 * Keeps prompt favorites and the workbench new-session drafts in sync with the main-site account
 * (when a main-site API key is configured). Runs on load, on window focus, every two minutes and
 * shortly after local changes. Renders nothing.
 */
export function AccountSync() {
    const config = useConfigStore((state) => state.config);
    const apiKey = useMemo(() => findMainSiteApiKey(config), [config]);

    useEffect(() => {
        const status = useAccountSyncStore.getState().set;
        if (!apiKey) {
            status({ status: "off", error: "" });
            return;
        }
        const engine = createSyncEngine(apiKey);
        engine.schedule(0);
        const onFocus = () => {
            if (Date.now() - useAccountSyncStore.getState().lastSyncedAt > FOCUS_MIN_GAP_MS) engine.schedule(0);
        };
        window.addEventListener("focus", onFocus);
        const interval = window.setInterval(() => engine.schedule(0), PERIODIC_MS);
        const unsubscribeFavorites = usePromptLibraryStore.subscribe((state, previous) => {
            if (state.favoriteDoc !== previous.favoriteDoc && !engine.applying) engine.schedule(1500);
        });
        const unsubscribeDrafts = useWorkbenchDraftStore.subscribe((state, previous) => {
            const changed = KINDS.some((kind) => canonicalJson(localNewDraftEntry(state, kind)) !== canonicalJson(localNewDraftEntry(previous, kind)));
            if (changed && !engine.applying) engine.schedule(3000);
        });
        return () => {
            engine.dispose();
            window.removeEventListener("focus", onFocus);
            window.clearInterval(interval);
            unsubscribeFavorites();
            unsubscribeDrafts();
        };
    }, [apiKey]);

    return null;
}

function createSyncEngine(apiKey: string) {
    let running = false;
    let again = false;
    let disposed = false;
    let timer: number | undefined;
    const controller = new AbortController();
    const engine = {
        /** True while merged data is being written into the local stores (not a user change). */
        applying: false,
        schedule(delay: number) {
            if (disposed) return;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => void run(), delay);
        },
        dispose() {
            disposed = true;
            window.clearTimeout(timer);
            controller.abort();
        },
    };

    const applyLocally = (fn: () => void) => {
        engine.applying = true;
        try {
            fn();
        } finally {
            engine.applying = false;
        }
    };

    async function syncFavorites() {
        const localDoc = () => usePromptLibraryStore.getState().favoriteDoc;
        let remote = await getAppState(FAVORITES_NAMESPACE, apiKey, controller.signal);
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const remoteDoc = readFavoritesDoc<Prompt>(remote.value);
            const merged: FavoritesDoc<Prompt> = mergeFavoritesDocs(localDoc(), remoteDoc);
            if (canonicalJson(merged) !== canonicalJson(localDoc())) applyLocally(() => usePromptLibraryStore.getState().applyFavoriteDoc(merged));
            const nothingToStore = remote.version === 0 && Object.keys(merged.items).length === 0;
            if (nothingToStore || canonicalJson(merged) === canonicalJson(remoteDoc)) return;
            const result = await putAppState(FAVORITES_NAMESPACE, apiKey, merged, remote.version, controller.signal);
            if (!result.conflict) return;
            remote = result; // another device wrote first: merge with its copy and try again
        }
    }

    /** Gives every new-session reference image an account copy before the draft is pushed. */
    async function uploadPendingReferences(kind: WorkbenchKind) {
        const pending = pendingReferenceUploads(useWorkbenchDraftStore.getState(), kind);
        if (!pending.length) return;
        const blobIds: Record<string, string> = {};
        for (const ref of pending) {
            const blob = await readLocalReference(ref);
            if (!blob) continue;
            if (blob.size > APP_BLOB_MAX_BYTES) {
                blobIds[ref.id] = "-"; // stays on this device only
                continue;
            }
            blobIds[ref.id] = (await uploadAppBlob(apiKey, blob, controller.signal)).id;
        }
        applyLocally(() => useWorkbenchDraftStore.getState().setReferenceBlobIds(kind, blobIds));
    }

    /** Local copies of a remote draft's images: reuse what this device has, download the rest. */
    async function localizeReferences(kind: WorkbenchKind, refs: NonNullable<ReturnType<typeof readDraftsDoc>["image"]>["references"]): Promise<DraftReference[]> {
        const local = useWorkbenchDraftStore.getState().drafts[kind].new?.references || [];
        const out: DraftReference[] = [];
        for (const ref of refs || []) {
            const existing = local.find((item) => item.blobId === ref.blobId);
            if (existing) {
                out.push({ ...existing, id: ref.id });
                continue;
            }
            try {
                const blob = await downloadAppBlob(apiKey, ref.blobId, controller.signal);
                const stored = await uploadImage(blob);
                out.push({ id: ref.id, name: ref.name, type: stored.mimeType || ref.type, dataUrl: "", storageKey: stored.storageKey, blobId: ref.blobId });
            } catch {
                // Evicted from the account (quota) or unreadable: keep the text, skip the image.
            }
        }
        return out;
    }

    async function syncDrafts() {
        for (const kind of KINDS) await uploadPendingReferences(kind);
        let remote = await getAppState(DRAFTS_NAMESPACE, apiKey, controller.signal);
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const remoteDoc = readDraftsDoc(remote.value);
            for (const kind of KINDS) {
                const entry = remoteDoc[kind];
                if (!entry || entry.at <= localNewDraftEntry(useWorkbenchDraftStore.getState(), kind).at) continue;
                const references = await localizeReferences(kind, entry.references);
                applyLocally(() => useWorkbenchDraftStore.getState().applyRemoteNewDraft(kind, entry, references));
            }
            const state = useWorkbenchDraftStore.getState();
            const localDoc: DraftsDoc = { v: 1 };
            for (const kind of KINDS) {
                const entry = localNewDraftEntry(state, kind);
                if (entry.at > 0) localDoc[kind] = entry;
            }
            const merged = mergeDraftsDocs(remoteDoc, localDoc);
            const nothingToStore = remote.version === 0 && !merged.image && !merged.video;
            if (nothingToStore || canonicalJson(merged) === canonicalJson(remoteDoc)) return;
            const result = await putAppState(DRAFTS_NAMESPACE, apiKey, merged, remote.version, controller.signal);
            if (!result.conflict) return;
            remote = result;
        }
    }

    async function run() {
        if (disposed) return;
        if (running) {
            again = true;
            return;
        }
        running = true;
        const status = useAccountSyncStore.getState().set;
        status({ status: "syncing" });
        try {
            await syncFavorites();
            await syncDrafts();
            if (!disposed) status({ status: "synced", lastSyncedAt: Date.now(), error: "" });
        } catch (error) {
            if (!disposed && !controller.signal.aborted) status({ status: "error", error: error instanceof Error ? error.message : String(error) });
        } finally {
            running = false;
            if (again && !disposed) {
                again = false;
                void run();
            }
        }
    }

    return engine;
}

async function readLocalReference(ref: DraftReference): Promise<Blob | undefined> {
    try {
        if (ref.storageKey) {
            const blob = await getImageBlob(ref.storageKey);
            if (blob) return blob;
        }
        if (ref.dataUrl) return await (await fetch(ref.dataUrl)).blob();
    } catch {
        // Unreadable locally: nothing to upload.
    }
    return undefined;
}
